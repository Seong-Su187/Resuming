"""
RAG(이력서 기반 면접 질문 생성) 정량 평가: AI휴먼_정량평가_실행가이드 9.1항목.

backend/routers/interviews.py의 _generate_rag_questions와 동일한 로직(청크 분할 →
임베딩 → 세션 격리 벡터 검색 top-3 → 질문 생성)을 재현하되, 실제 DB에 테스트 데이터를
쓰지 않기 위해 벡터 검색만 numpy 코사인 유사도로 인메모리 재현한다 (pgvector의
`ORDER BY embedding <=> ... LIMIT 3`와 동일한 순서를 보장).

평가 지표 (ragas 라이브러리):
- Context Precision / Recall (ID 기반, LLM 불필요): 검색된 청크가 미리 라벨링한
  정답 청크와 얼마나 겹치는지.
- Faithfulness: 생성된 면접 질문이 검색된 청크에 없는 내용을 지어내지 않았는지
  (일반적인 "답변의 환각 여부" 대신, 이 프로젝트는 질문 생성 태스크라 이렇게 응용함).
- Answer Relevancy: 생성된 질문이 검색 의도(요청한 주제)와 실제로 맞아떨어지는지.

실행: backend 가상환경 활성화 후, 프로젝트 루트에서
    python evaluation/rag_eval.py
"""
import asyncio
import datetime
import json
import os
import sys

import numpy as np
from openai import AsyncOpenAI

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from llm import split_resume_text, get_embedding, generate_single_question  # noqa: E402

from ragas import SingleTurnSample
from ragas.embeddings.base import embedding_factory
from ragas.llms import llm_factory
from ragas.metrics import IDBasedContextPrecision, IDBasedContextRecall
from ragas.metrics.collections import Faithfulness, AnswerRelevancy

RESULT_JSON_PATH = os.path.join(os.path.dirname(__file__), "rag_eval_results.json")
RESULT_MD_PATH = os.path.join(os.path.dirname(__file__), "rag_eval_results.md")

# interviews.py의 _generate_rag_questions와 동일한 5개 검색 의도
SEARCH_QUERIES = [
    ("지원자의 기술 스택과 주요 개발 경험", "technical", "middle_aged"),
    ("지원자가 주도적으로 수행한 프로젝트와 기술적 문제 해결 과정", "technical", "middle_aged"),
    ("지원 직무와 관련된 기술적 역량과 딥다이브 꼬리 질문", "technical", "middle_aged"),
    ("이 회사에 지원하게 된 구체적인 이유와 입사 후 이뤄내고 싶은 목표 (지원 동기 및 포부)", "hr", "young"),
    ("팀원과의 협업 경험, 갈등 해결 방식, 또는 본인만의 장단점 (인성 및 컬처핏)", "hr", "young"),
]

# 각 테스트 이력서에서, 검색 의도(인덱스)별로 실제 사람이 보기에 "정답"인 청크 인덱스.
# split_resume_text(chunk_size=500)로 실제 분할해본 결과를 보고 직접 라벨링했다.
RESUME_TEST_CASES = [
    {
        "name": "backend_developer",
        "path": os.path.join(os.path.dirname(__file__), "rag_resume_1.txt"),
        "job_category": "백엔드 개발자",
        "ground_truth": {0: [0], 1: [1], 2: [0, 1], 3: [2], 4: [2, 3]},
    },
    {
        "name": "marketing_planner",
        "path": os.path.join(os.path.dirname(__file__), "rag_resume_2.txt"),
        "job_category": "마케팅 기획",
        "ground_truth": {0: [0], 1: [1], 2: [0, 1], 3: [2], 4: [1, 2]},
    },
]

JUDGE_MODEL = "gpt-4.1-mini"  # 질문 생성(gpt-4o-mini)과 다른 계열 모델. 속도를 위해 mini급으로 선택.

# 10개를 전부 동시에 쏘면 OpenAI 레이트리밋에 걸려 재시도 대기가 길어질 수 있어 동시 실행 수를 제한합니다.
CONCURRENCY_LIMIT = 3
_semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)

# 10개를 전부 동시에 쏘면 OpenAI 레이트리밋에 걸려 재시도 대기가 길어질 수 있어 동시 실행 수를 제한합니다.
CONCURRENCY_LIMIT = 3
_semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)


def cosine_top_k(query_emb, chunk_embs, k=3):
    q = np.array(query_emb)
    c = np.array(chunk_embs)
    sims = c @ q / (np.linalg.norm(c, axis=1) * np.linalg.norm(q) + 1e-10)
    order = np.argsort(-sims)  # 코사인 유사도 내림차순 = pgvector 코사인 거리(<=>) 오름차순과 동일 순서
    return order[:k].tolist()


async def prepare_resume(case):
    """이력서 청크 분할 + 청크별 임베딩을 준비한다 (get_embedding은 동기 함수라 to_thread로 병렬화)."""
    with open(case["path"], encoding="utf-8") as f:
        resume_text = f.read()

    chunks = split_resume_text(resume_text)
    print(f"[rag_eval] [{case['name']}] {len(chunks)}개 청크로 분할", flush=True)

    chunk_embs = await asyncio.gather(
        *[asyncio.to_thread(get_embedding, c) for c in chunks]
    )
    return chunks, list(chunk_embs)


async def evaluate_one(case, chunks, chunk_embs, intent_idx, faithfulness_scorer, relevancy_scorer):
    """검색 의도 하나(=한 항목)에 대한 검색+생성+채점을 전부 수행한다."""
    tag = f"[{case['name']}] 의도{intent_idx + 1}"

    async with _semaphore:
        t0 = asyncio.get_event_loop().time()
        print(f"[rag_eval] {tag} 시작 (동시 실행 {CONCURRENCY_LIMIT}개 제한)", flush=True)

        intent, q_type, avatar = SEARCH_QUERIES[intent_idx]

        q_emb = await asyncio.to_thread(get_embedding, intent)
        top_ids = cosine_top_k(q_emb, chunk_embs, k=3)
        retrieved_texts = [chunks[i] for i in top_ids]
        context = "\n\n".join(retrieved_texts)

        question_data = await asyncio.to_thread(
            generate_single_question, case["job_category"], intent, context, q_type, avatar
        )
        generated_question = question_data.get("question", "")
        print(f"[rag_eval] {tag} 질문 생성 완료 ({asyncio.get_event_loop().time() - t0:.1f}초 경과)", flush=True)

        reference_ids = case["ground_truth"].get(intent_idx, [])

        id_sample = SingleTurnSample(
            retrieved_context_ids=[str(i) for i in top_ids],
            reference_context_ids=[str(i) for i in reference_ids],
        )

        print(f"[rag_eval] {tag} RAGAS 판정 시작 (faithfulness + relevancy)", flush=True)
        precision, recall, faithfulness_result, relevancy_result = await asyncio.gather(
            IDBasedContextPrecision().single_turn_ascore(id_sample),
            IDBasedContextRecall().single_turn_ascore(id_sample),
            faithfulness_scorer.ascore(
                user_input=intent,
                response=generated_question,
                retrieved_contexts=retrieved_texts,
            ),
            relevancy_scorer.ascore(
                user_input=intent,
                response=generated_question,
            ),
        )

        print(
            f"[rag_eval] {tag} 완료 ({asyncio.get_event_loop().time() - t0:.1f}초) "
            f"precision={precision:.2f} recall={recall:.2f} "
            f"faithfulness={faithfulness_result.value:.2f} relevancy={relevancy_result.value:.2f}",
            flush=True,
        )

    return {
        "resume": case["name"],
        "intent_index": intent_idx,
        "intent": intent,
        "retrieved_chunk_ids": top_ids,
        "reference_chunk_ids": reference_ids,
        "generated_question": generated_question,
        "context_precision": float(precision),
        "context_recall": float(recall),
        "faithfulness": float(faithfulness_result.value),
        "answer_relevancy": float(relevancy_result.value),
    }


async def main():
    api_key = os.environ.get("OPENAI_API_KEY")
    client = AsyncOpenAI(api_key=api_key)
    # AnswerRelevancy는 응답에서 여러 개의 가상 질문을 역으로 생성하는데, 기본 max_tokens로는
    # 구조화 출력이 중간에 잘려서(IncompleteOutputException) 실패하는 경우가 있어 넉넉히 늘립니다.
    judge_llm = llm_factory(JUDGE_MODEL, client=client, max_tokens=2000)
    judge_embeddings = embedding_factory("openai", model="text-embedding-3-small", client=client)

    faithfulness_scorer = Faithfulness(llm=judge_llm)
    relevancy_scorer = AnswerRelevancy(llm=judge_llm, embeddings=judge_embeddings)

    # 이력서별 청크/임베딩 준비도 동시에 진행
    prepared = await asyncio.gather(
        *[prepare_resume(case) for case in RESUME_TEST_CASES]
    )

    # (이력서 x 검색의도) 10개 항목을 전부 동시에 평가
    tasks = []
    for case, (chunks, chunk_embs) in zip(RESUME_TEST_CASES, prepared):
        for intent_idx in range(len(SEARCH_QUERIES)):
            tasks.append(
                evaluate_one(case, chunks, chunk_embs, intent_idx, faithfulness_scorer, relevancy_scorer)
            )

    all_results = await asyncio.gather(*tasks)
    all_results = list(all_results)

    if not all_results:
        print("[rag_eval] 평가 결과가 없습니다.")
        return

    def avg(key):
        return sum(r[key] for r in all_results) / len(all_results)

    summary = {
        "count": len(all_results),
        "avg_context_precision": avg("context_precision"),
        "avg_context_recall": avg("context_recall"),
        "avg_faithfulness": avg("faithfulness"),
        "avg_answer_relevancy": avg("answer_relevancy"),
        "비고": (
            "테스트 이력서 청크 수가 3~4개로 적어(짧은 샘플 이력서 기준) Top-3 검색이 "
            "전체 청크 대부분을 가져오는 경우가 많아 Context Precision/Recall의 변별력이 "
            "제한적임. Faithfulness/Answer Relevancy는 RAGAS 원래 취지(사실 기반 답변 검증)를 "
            "질문 생성 태스크에 맞게 응용한 지표임."
        ),
        "details": all_results,
    }

    with open(RESULT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    write_markdown_report(summary)

    print("\n=== RAG(이력서 질문 생성) 정량 평가 요약 ===")
    print(f"평가 항목 수: {summary['count']}")
    print(f"평균 Context Precision: {summary['avg_context_precision']:.3f}")
    print(f"평균 Context Recall: {summary['avg_context_recall']:.3f}")
    print(f"평균 Faithfulness: {summary['avg_faithfulness']:.3f}")
    print(f"평균 Answer Relevancy: {summary['avg_answer_relevancy']:.3f}")
    print(f"JSON 저장: {RESULT_JSON_PATH}")
    print(f"MD 저장: {RESULT_MD_PATH}")


def write_markdown_report(summary: dict) -> None:
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    lines = [
        "# RAG(이력서 기반 면접 질문 생성) 정량 평가 결과",
        "",
        f"측정 일시: {now}",
        f"평가 항목 수: {summary['count']} (테스트 이력서 2개 x 검색 의도 5개)",
        "",
        "## 요약",
        "",
        "| 지표 | 결과 |",
        "|---|---|",
        f"| Context Precision | {summary['avg_context_precision']:.3f} |",
        f"| Context Recall | {summary['avg_context_recall']:.3f} |",
        f"| Faithfulness (응용) | {summary['avg_faithfulness']:.3f} |",
        f"| Answer Relevancy (응용) | {summary['avg_answer_relevancy']:.3f} |",
        "",
        f"**비고:** {summary['비고']}",
        "",
        "## 항목별 상세",
        "",
        "| 이력서 | 검색 의도 | 검색된 청크 | 정답 청크 | 생성된 질문 | Precision | Recall | Faithfulness | Relevancy |",
        "|---|---|---|---|---|---|---|---|---|",
    ]

    for r in summary["details"]:
        intent = r["intent"].replace("|", "\\|")
        question = r["generated_question"].replace("|", "\\|")
        lines.append(
            f"| {r['resume']} | {intent} | {r['retrieved_chunk_ids']} | {r['reference_chunk_ids']} | "
            f"{question} | {r['context_precision']:.2f} | {r['context_recall']:.2f} | "
            f"{r['faithfulness']:.2f} | {r['answer_relevancy']:.2f} |"
        )

    with open(RESULT_MD_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    asyncio.run(main())
