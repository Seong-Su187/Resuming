"""
음성(TTS) 품질 평가: AI휴먼_정량평가_실행가이드 4번 항목.
testset.json의 질문 텍스트를 TTS로 변환한 뒤, Whisper STT로 다시 텍스트화해서
원문과 비교해 CER/WER을 계산한다. (한국어는 CER이 주지표)

실행: backend 가상환경 활성화 후, 프로젝트 루트에서
    python evaluation/voice_eval.py
"""
import datetime
import json
import os
import sys

from jiwer import cer, wer

# backend/llm.py의 실제 프로덕션 TTS/STT 함수를 그대로 재사용한다
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from llm import generate_text_to_speech, process_audio_to_text  # noqa: E402

TESTSET_PATH = os.path.join(os.path.dirname(__file__), "testset.json")
RESULT_JSON_PATH = os.path.join(os.path.dirname(__file__), "voice_eval_results.json")
RESULT_MD_PATH = os.path.join(os.path.dirname(__file__), "voice_eval_results.md")
TEMP_AUDIO_PATH = os.path.join(os.path.dirname(__file__), "_tmp_voice_eval.mp3")

CER_TARGET = 0.10  # 가이드 예시 목표치


def load_unique_questions() -> list[str]:
    with open(TESTSET_PATH, encoding="utf-8") as f:
        data = json.load(f)
    seen = set()
    questions = []
    for item in data:
        q = item["question"]
        if q not in seen:
            seen.add(q)
            questions.append(q)
    return questions


def evaluate_question(question: str) -> dict:
    generate_text_to_speech(question, TEMP_AUDIO_PATH)
    heard = process_audio_to_text(TEMP_AUDIO_PATH)

    return {
        "question": question,
        "heard": heard,
        "CER": cer(question, heard),
        "WER": wer(question, heard),
    }


def main():
    questions = load_unique_questions()
    print(f"[voice_eval] 평가 대상 질문 {len(questions)}개")

    results = []
    for i, question in enumerate(questions, start=1):
        try:
            result = evaluate_question(question)
            results.append(result)
            print(
                f"[voice_eval] ({i}/{len(questions)}) CER={result['CER']:.3f} "
                f"WER={result['WER']:.3f} | {question[:30]}..."
            )
        except Exception as error:
            print(f"[voice_eval] ({i}/{len(questions)}) 오류: {error} | {question[:30]}...")
        finally:
            if os.path.exists(TEMP_AUDIO_PATH):
                os.remove(TEMP_AUDIO_PATH)

    if not results:
        print("[voice_eval] 평가 결과가 없습니다.")
        return

    avg_cer = sum(r["CER"] for r in results) / len(results)
    avg_wer = sum(r["WER"] for r in results) / len(results)

    verdict = "PASS" if avg_cer <= CER_TARGET else "FAIL"
    summary = {
        "count": len(results),
        "avg_CER": avg_cer,
        "avg_WER": avg_wer,
        "target_CER": CER_TARGET,
        "판정": verdict,
        "details": results,
    }

    with open(RESULT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    write_markdown_report(summary)

    print("\n=== 음성(TTS) 품질 평가 요약 ===")
    print(f"평가 문장 수: {len(results)}")
    print(f"평균 CER: {avg_cer:.4f} (목표 ≤ {CER_TARGET})")
    print(f"평균 WER: {avg_wer:.4f} (참고용)")
    print(f"판정: {verdict}")
    print(f"JSON 저장: {RESULT_JSON_PATH}")
    print(f"MD 저장: {RESULT_MD_PATH}")


def write_markdown_report(summary: dict) -> None:
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    verdict_mark = "✅" if summary["판정"] == "PASS" else "⚠️"

    lines = [
        "# 음성(TTS) 품질 평가 결과",
        "",
        f"측정 일시: {now}",
        f"평가 문장 수: {summary['count']}",
        "",
        "## 요약",
        "",
        "| 레이어 | 지표 | 결과 | 목표 | 판정 |",
        "|---|---|---|---|---|",
        f"| 음성 | CER | {summary['avg_CER']:.4f} | ≤ {summary['target_CER']} | {verdict_mark} |",
        f"| 음성 | WER (참고) | {summary['avg_WER']:.4f} | - | - |",
        "",
        "## 문장별 상세",
        "",
        "| # | 질문(원문) | STT 인식 결과 | CER | WER |",
        "|---|---|---|---|---|",
    ]

    for i, item in enumerate(summary["details"], start=1):
        question = item["question"].replace("|", "\\|")
        heard = item["heard"].replace("|", "\\|").replace("\n", " ")
        lines.append(
            f"| {i} | {question} | {heard} | {item['CER']:.3f} | {item['WER']:.3f} |"
        )

    with open(RESULT_MD_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
