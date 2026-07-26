"""
RAG(성장 피드백: 과거 답변 임베딩 검색) 정량 평가.

backend/routers/interviews.py의 submit_answer 핸들러가 쓰는 것과 동일한 로직
(현재 답변 임베딩 → 같은 지원자의 "다른 세션" 과거 답변들과 코사인 유사도 top-1 검색 →
evaluate_answer_with_llm에 past_record로 전달해 growth_feedback 생성)을 재현하되,
실제 DB에 테스트 데이터를 쓰지 않고 벡터 검색만 numpy 코사인 유사도로 인메모리
재현한다 (pgvector의 `ORDER BY answer_embedding <=> ... LIMIT 1`와 동일한 순서를 보장).

평가 지표:
- Retrieval Accuracy (top-1, 직접 계산): 검색된 과거 답변이 미리 라벨링한 정답과
  일치하는 비율. RAGAS의 ID 기반 지표를 top-1 케이스에 맞게 정확도로 단순화한 것.
- Faithfulness (ragas): 생성된 growth_feedback이 실제로 제공된 과거 기록/현재
  지표에 없는 내용을 지어내지 않았는지.

실행: backend 가상환경 활성화 후, 프로젝트 루트에서
    python evaluation/growth_feedback_eval.py
"""
import asyncio
import datetime
import json
import os
import sys

import numpy as np
from openai import AsyncOpenAI

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from llm import get_embedding, evaluate_answer_with_llm  # noqa: E402

from ragas.llms import llm_factory
from ragas.metrics.collections import Faithfulness

RESULT_JSON_PATH = os.path.join(os.path.dirname(__file__), "growth_feedback_eval_results.json")
RESULT_MD_PATH = os.path.join(os.path.dirname(__file__), "growth_feedback_eval_results.md")

JUDGE_MODEL = "gpt-4o-mini"  # gpt-4.1-mini는 growth_feedback처럼 길고 복잡한 한국어 텍스트를
# 구조화된 형식(statement 분해)으로 처리할 때 원문과 무관한 내용을 만들어내는 문제가 있어 교체함.

# 6개를 전부 동시에 쏘면 OpenAI 레이트리밋에 걸려 재시도 대기가 길어질 수 있어 동시 실행 수를 제한합니다.
CONCURRENCY_LIMIT = 2
_semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)


def cosine_top1(query_emb, pool_embs):
    q = np.array(query_emb)
    c = np.array(pool_embs)
    sims = c @ q / (np.linalg.norm(c, axis=1) * np.linalg.norm(q) + 1e-10)
    return int(np.argmax(sims))  # 코사인 유사도 최댓값 = pgvector 코사인 거리(<=>) 최솟값과 동일 순위


# 가상 지원자 2명. 각자 "과거 세션 답변 풀"(다른 주제 4개)과 "현재 세션 답변"(3개)을 두고,
# 현재 답변마다 과거 풀 중 의미상 가장 비슷해야 하는 인덱스를 직접 라벨링했다.
CANDIDATES = [
    {
        "name": "박지훈(백엔드 개발자 지망)",
        "past_pool": [
            {
                "question": "팀원과 협업하면서 의견 차이가 있었던 경험을 말씀해주세요.",
                "answer": (
                    "프론트엔드 팀과 API 응답 형식을 두고 의견이 갈린 적이 있습니다. "
                    "저는 페이지네이션을 커서 기반으로 하자고 했고, 상대 팀은 오프셋 방식을 원했습니다. "
                    "결국 회의를 잡아서 각자 방식의 장단점을 데이터로 정리해 보여드렸고, "
                    "트래픽이 늘어날 경우의 성능 차이를 근거로 커서 기반으로 합의했습니다."
                ),
                "score": 65, "jitter": 15.0, "shimmer": 10.0, "filler": 3, "gaze": 2,
            },
            {
                "question": "기술적으로 어려웠던 문제를 해결한 경험을 말씀해주세요.",
                "answer": (
                    "레거시 시스템에서 특정 목록 조회 API가 느려지는 문제가 있었는데, "
                    "확인해보니 N+1 쿼리 문제였습니다. JPA의 fetch join을 적용해서 "
                    "쿼리 수를 200개에서 1개로 줄였고, 응답 시간이 3초에서 200ms로 단축됐습니다."
                ),
                "score": 82, "jitter": 8.0, "shimmer": 5.0, "filler": 1, "gaze": 0,
            },
            {
                "question": "실패했던 경험과 그로부터 배운 점을 말씀해주세요.",
                "answer": (
                    "배포 자동화 스크립트를 급하게 작성하다가 스테이징 환경의 DB를 초기화해버린 적이 있습니다. "
                    "그때부터 배포 스크립트에는 반드시 dry-run 옵션을 넣고, 되돌릴 수 없는 명령 전에는 "
                    "확인 단계를 거치도록 습관을 들였습니다."
                ),
                "score": 55, "jitter": 20.0, "shimmer": 15.0, "filler": 5, "gaze": 3,
            },
            {
                "question": "주도적으로 무언가를 이끌었던 경험이 있나요?",
                "answer": (
                    "인턴 시절 사내 프로젝트에서 팀장 역할을 맡아 일정 관리를 했습니다. "
                    "매주 스프린트 회의를 잡고 진행 상황을 정리해서 공유했고, "
                    "덕분에 예정보다 하루 일찍 프로젝트를 마무리할 수 있었습니다."
                ),
                "score": 70, "jitter": 12.0, "shimmer": 8.0, "filler": 2, "gaze": 1,
            },
        ],
        "current_cases": [
            {
                "question": "팀원과 협업 과정에서 갈등을 해결했던 경험이 있나요?",
                "answer": (
                    "디자이너와 화면 구성 방식을 두고 의견이 달랐던 적이 있습니다. "
                    "저는 컴포넌트 재사용을 위해 통일된 레이아웃을 원했고, 디자이너는 화면마다 "
                    "다른 톤을 원했습니다. 실제 사용자 테스트 데이터를 같이 검토하면서 "
                    "핵심 화면만 커스텀하고 나머지는 통일하는 절충안으로 합의했습니다."
                ),
                "jitter": 8.0, "shimmer": 5.0, "filler": 1, "gaze": 0,
                "ground_truth_index": 0,
            },
            {
                "question": "성능 문제를 해결했던 경험을 자세히 설명해주세요.",
                "answer": (
                    "상품 검색 API의 응답이 느려서 확인해보니, 매 요청마다 전체 상품을 스캔하고 "
                    "있었습니다. Elasticsearch로 인덱스를 구성해서 검색 방식을 바꿨고, "
                    "평균 응답 시간을 1.5초에서 100ms 이하로 줄였습니다."
                ),
                "jitter": 6.0, "shimmer": 4.0, "filler": 0, "gaze": 0,
                "ground_truth_index": 1,
            },
            {
                "question": "일이 뜻대로 되지 않았던 경험과 극복 방법을 말씀해주세요.",
                "answer": (
                    "출시 직전에 결제 모듈 연동 테스트를 충분히 안 해서, 실서비스에서 결제 실패가 "
                    "여러 건 발생한 적이 있습니다. 그 이후로는 결제처럼 되돌리기 어려운 기능은 "
                    "반드시 스테이징에서 실제 결제 시나리오로 여러 번 검증하는 절차를 만들었습니다."
                ),
                "jitter": 14.0, "shimmer": 9.0, "filler": 2, "gaze": 1,
                "ground_truth_index": 2,
            },
        ],
    },
    {
        "name": "이서연(마케팅 기획자 지망)",
        "past_pool": [
            {
                "question": "팀원과 의견이 달랐던 경험을 말씀해주세요.",
                "answer": (
                    "신제품 캠페인 컨셉을 두고 디자인팀과 의견이 갈렸습니다. "
                    "저는 젊은 층을 겨냥한 파격적인 톤을 원했고, 디자인팀은 브랜드 일관성을 "
                    "우선했습니다. 타깃 고객 설문 데이터를 근거로 절충안을 만들어 설득했습니다."
                ),
                "score": 60, "jitter": 18.0, "shimmer": 12.0, "filler": 4, "gaze": 2,
            },
            {
                "question": "데이터를 활용해 성과를 낸 경험이 있나요?",
                "answer": (
                    "인스타그램 광고 소재별 전환율을 분석해서, 텍스트가 적은 이미지형 소재가 "
                    "전환율이 2배 높다는 걸 발견했습니다. 이후 소재 비중을 조정해서 "
                    "같은 예산으로 전환 수를 40% 늘렸습니다."
                ),
                "score": 85, "jitter": 7.0, "shimmer": 5.0, "filler": 1, "gaze": 0,
            },
            {
                "question": "실패한 캠페인 경험과 배운 점을 말씀해주세요.",
                "answer": (
                    "이벤트 응모 페이지를 급하게 오픈했다가 모바일 환경에서 버튼이 안 눌리는 "
                    "오류가 있었습니다. 그 뒤로는 오픈 전에 반드시 실제 기기로 모바일 QA를 "
                    "거치는 걸 체크리스트에 넣었습니다."
                ),
                "score": 50, "jitter": 22.0, "shimmer": 16.0, "filler": 6, "gaze": 3,
            },
            {
                "question": "주도적으로 프로젝트를 이끈 경험이 있나요?",
                "answer": (
                    "대학 시절 동아리 홍보 프로젝트를 처음부터 끝까지 기획했습니다. "
                    "예산이 없어서 SNS 챌린지 형식으로 진행했고, 목표했던 신입 부원 수를 "
                    "1.5배 초과 달성했습니다."
                ),
                "score": 72, "jitter": 11.0, "shimmer": 7.0, "filler": 2, "gaze": 1,
            },
        ],
        "current_cases": [
            {
                "question": "다른 부서와 협업하며 갈등을 조율했던 경험이 있나요?",
                "answer": (
                    "영업팀과 프로모션 할인율을 두고 이견이 있었습니다. 저는 마진을 고려해 "
                    "낮은 할인율을 원했고, 영업팀은 매출 확대를 위해 높은 할인율을 원했습니다. "
                    "지난 프로모션 데이터를 같이 분석해서 중간 할인율에 사은품을 더하는 "
                    "방식으로 합의를 이끌어냈습니다."
                ),
                "jitter": 10.0, "shimmer": 6.0, "filler": 1, "gaze": 0,
                "ground_truth_index": 0,
            },
            {
                "question": "데이터 분석으로 마케팅 성과를 개선한 경험을 말씀해주세요.",
                "answer": (
                    "이메일 뉴스레터 오픈율을 분석해보니 발송 요일에 따라 차이가 컸습니다. "
                    "화요일 오전 발송으로 바꾸고 제목도 A/B 테스트를 거쳐서, "
                    "오픈율을 15%에서 28%까지 끌어올렸습니다."
                ),
                "jitter": 6.5, "shimmer": 4.5, "filler": 0, "gaze": 0,
                "ground_truth_index": 1,
            },
            {
                "question": "계획대로 되지 않았던 프로젝트 경험을 말씀해주세요.",
                "answer": (
                    "팝업스토어 행사를 준비하면서 재고 수량을 잘못 계산해서 초반에 물량이 "
                    "동나버린 적이 있습니다. 이후로는 예상 방문자 수에 여유분을 더해 "
                    "재고를 계산하고, 실시간으로 재고를 확인하는 담당자를 따로 두게 됐습니다."
                ),
                "jitter": 16.0, "shimmer": 10.0, "filler": 3, "gaze": 2,
                "ground_truth_index": 2,
            },
        ],
    },
]


async def prepare_candidate(candidate):
    """과거 답변 풀 임베딩을 준비한다 (get_embedding은 동기 함수라 to_thread로 병렬화)."""
    pool_embs = await asyncio.gather(
        *[asyncio.to_thread(get_embedding, item["answer"]) for item in candidate["past_pool"]]
    )
    print(f"[growth_eval] [{candidate['name']}] 과거 답변 {len(pool_embs)}개 임베딩 준비 완료", flush=True)
    return list(pool_embs)


async def evaluate_one(candidate, pool_embs, case_idx, faithfulness_scorer):
    """현재 답변 하나(=한 항목)에 대한 검색+생성+채점을 전부 수행한다."""
    case = candidate["current_cases"][case_idx]
    tag = f"[{candidate['name']}] 현재답변{case_idx + 1}"

    async with _semaphore:
        t0 = asyncio.get_event_loop().time()
        print(f"[growth_eval] {tag} 시작 (동시 실행 {CONCURRENCY_LIMIT}개 제한)", flush=True)

        current_emb = await asyncio.to_thread(get_embedding, case["answer"])
        retrieved_idx = cosine_top1(current_emb, pool_embs)
        retrieved = candidate["past_pool"][retrieved_idx]

        current_metrics = {
            "jitter": case["jitter"], "shimmer": case["shimmer"],
            "filler": case["filler"], "gaze": case["gaze"],
        }
        past_record = {
            "past_question": retrieved["question"],
            "past_answer": retrieved["answer"],
            "past_score": retrieved["score"],
            "past_jitter": retrieved["jitter"],
            "past_shimmer": retrieved["shimmer"],
            "past_filler": retrieved["filler"],
            "past_gaze": retrieved["gaze"],
        }

        evaluation = await asyncio.to_thread(
            evaluate_answer_with_llm,
            case["question"], case["answer"], "",
            current_metrics, past_record,
        )
        growth_feedback = evaluation.get("growth_feedback", "")
        print(f"[growth_eval] {tag} 평가 생성 완료 ({asyncio.get_event_loop().time() - t0:.1f}초 경과)", flush=True)

        retrieval_hit = int(retrieved_idx == case["ground_truth_index"])

        # Faithfulness: growth_feedback이 실제 제공된 과거/현재 기록에 근거하는지 검증
        context_text = (
            f"과거 답변: {retrieved['answer']} "
            f"(점수 {retrieved['score']}, jitter {retrieved['jitter']}%, shimmer {retrieved['shimmer']}%, "
            f"습관어 {retrieved['filler']}회, 시선이탈 {retrieved['gaze']}회)\n"
            f"현재 답변: {case['answer']} "
            f"(jitter {case['jitter']}%, shimmer {case['shimmer']}%, "
            f"습관어 {case['filler']}회, 시선이탈 {case['gaze']}회)"
        )

        print(f"[growth_eval] {tag} RAGAS Faithfulness 판정 시작", flush=True)
        faithfulness_result = await faithfulness_scorer.ascore(
            # RAGAS의 statement 생성 프롬프트는 few-shot 예시가 전부 일반 의문문(WH-question) 형태라,
            # 명령문("~분석해줘")을 넣으면 문장 분해 단계가 엉뚱한 내용을 만들어내는 문제가 있었음.
            # 예시와 같은 질문 형태로 바꿔서 이 문제를 회피함.
            user_input="과거 답변과 비교했을 때 현재 답변에서 어떤 점이 성장했나요?",
            response=growth_feedback if growth_feedback else "(성장 피드백 없음)",
            retrieved_contexts=[context_text],
        )

        print(
            f"[growth_eval] {tag} 완료 ({asyncio.get_event_loop().time() - t0:.1f}초) "
            f"retrieval_hit={retrieval_hit} faithfulness={faithfulness_result.value:.2f}",
            flush=True,
        )

    return {
        "candidate": candidate["name"],
        "case_index": case_idx,
        "current_question": case["question"],
        "retrieved_index": retrieved_idx,
        "ground_truth_index": case["ground_truth_index"],
        "retrieval_hit": retrieval_hit,
        "growth_feedback": growth_feedback,
        "faithfulness": float(faithfulness_result.value),
    }


async def main():
    api_key = os.environ.get("OPENAI_API_KEY")
    client = AsyncOpenAI(api_key=api_key)
    # Faithfulness는 응답에서 여러 개의 주장(claim)을 추출하는데, 기본 max_tokens로는
    # 구조화 출력이 중간에 잘려서(IncompleteOutputException) 실패하는 경우가 있어 넉넉히 늘립니다.
    judge_llm = llm_factory(JUDGE_MODEL, client=client, max_tokens=2000)
    faithfulness_scorer = Faithfulness(llm=judge_llm)

    # 지원자별 과거 답변 풀 임베딩 준비도 동시에 진행
    prepared = await asyncio.gather(
        *[prepare_candidate(c) for c in CANDIDATES]
    )

    # (지원자 x 현재답변) 6개 항목을 전부 동시에 평가
    tasks = []
    for candidate, pool_embs in zip(CANDIDATES, prepared):
        for case_idx in range(len(candidate["current_cases"])):
            tasks.append(evaluate_one(candidate, pool_embs, case_idx, faithfulness_scorer))

    all_results = await asyncio.gather(*tasks)
    all_results = list(all_results)

    if not all_results:
        print("[growth_eval] 평가 결과가 없습니다.")
        return

    def avg(key):
        return sum(r[key] for r in all_results) / len(all_results)

    summary = {
        "count": len(all_results),
        "retrieval_accuracy": avg("retrieval_hit"),
        "avg_faithfulness": avg("faithfulness"),
        "비고": (
            "top-1 검색만 사용하는 태스크라 Context Precision/Recall 대신 검색 정확도(hit rate)로 "
            "단순화해 계산함. Faithfulness는 growth_feedback이 실제 제공된 과거/현재 기록 범위를 "
            "벗어나 근거 없는 성장 서사를 지어내지 않는지를 검증하는 데 씀."
        ),
        "details": all_results,
    }

    with open(RESULT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    write_markdown_report(summary)

    print("\n=== 성장 피드백 RAG 정량 평가 요약 ===")
    print(f"평가 항목 수: {summary['count']}")
    print(f"검색 정확도(top-1): {summary['retrieval_accuracy']:.3f}")
    print(f"평균 Faithfulness: {summary['avg_faithfulness']:.3f}")
    print(f"JSON 저장: {RESULT_JSON_PATH}")
    print(f"MD 저장: {RESULT_MD_PATH}")


def write_markdown_report(summary: dict) -> None:
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    lines = [
        "# RAG(성장 피드백 - 과거 답변 임베딩 검색) 정량 평가 결과",
        "",
        f"측정 일시: {now}",
        f"평가 항목 수: {summary['count']} (가상 지원자 2명 x 현재 답변 3개)",
        "",
        "## 요약",
        "",
        "| 지표 | 결과 |",
        "|---|---|",
        f"| 검색 정확도 (top-1) | {summary['retrieval_accuracy']:.3f} |",
        f"| Faithfulness | {summary['avg_faithfulness']:.3f} |",
        "",
        f"**비고:** {summary['비고']}",
        "",
        "## 항목별 상세",
        "",
        "| 지원자 | 현재 질문 | 검색된 과거 답변 idx | 정답 idx | 일치 | Faithfulness | 생성된 성장 피드백 |",
        "|---|---|---|---|---|---|---|",
    ]

    for r in summary["details"]:
        question = r["current_question"].replace("|", "\\|")
        feedback = r["growth_feedback"].replace("|", "\\|").replace("\n", " ")
        lines.append(
            f"| {r['candidate']} | {question} | {r['retrieved_index']} | {r['ground_truth_index']} | "
            f"{'O' if r['retrieval_hit'] else 'X'} | {r['faithfulness']:.2f} | {feedback} |"
        )

    with open(RESULT_MD_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    asyncio.run(main())
