"""
아바타 립싱크 품질 평가: AI휴먼_정량평가_실행가이드 5-A(SyncNet, LSE-C/LSE-D) 결과 집계.

SyncNet 자체는 Colab GPU에서만 돌릴 수 있어(colab/musetalk_duo_avatar_server.ipynb
16~19번 셀), 이 스크립트는 Colab에서 얻은 원시 결과(트랙별 dist/conf)를 로컬에서
집계 + 리포트(JSON/MD)로 정리하는 용도다.

duo 프레임에는 두 아바타(인성/기술)가 항상 같이 나오기 때문에 SyncNet 얼굴 검출이
매 영상마다 트랙을 2개(말하는 아바타 + 옆에서 가만히 있는 아바타) 잡는다. 가만히
있는 아바타는 음성과 입 모양이 맞을 이유가 없어 LSE-C가 0에 가깝게 나오므로,
트랙 중 LSE-C(conf)가 더 높은 쪽을 "말하는 아바타" 트랙으로 자동 선택해서 집계한다.

실행: python evaluation/avatar_eval.py
"""
import datetime
import json
import os

RESULT_JSON_PATH = os.path.join(os.path.dirname(__file__), "avatar_eval_results.json")
RESULT_MD_PATH = os.path.join(os.path.dirname(__file__), "avatar_eval_results.md")

LSE_C_TARGET = 6.0  # 가이드 기준: 잘 만든 영상은 6~7 이상

# Colab에서 실제로 서버(시간축 스무딩 ON = 배포 설정)를 돌려 얻은 SyncNet 원시 결과.
# 트랙 순서는 얼굴 검출 순서라 좌/우와 무관하며, avatar_type과 무관하게 해당 영상에
# 나온 두 아바타(말하는 쪽 + 옆에서 대기 중인 쪽) 각각의 트랙 점수다.
RAW_RESULTS = [
    {
        "name": "eval_technical_0",
        "avatar_type": "technical",
        "question": "FastAPI로 PostgreSQL을 사용하여 백엔드 서비스에서 가장 큰 도전 과제는 무엇이었나요?",
        "tracks": [
            {"LSE_D": 9.602, "LSE_C": 4.671},
            {"LSE_D": 15.542, "LSE_C": 0.333},
        ],
    },
    {
        "name": "eval_technical_1",
        "avatar_type": "technical",
        "question": "데이터베이스 인덱싱 성능을 어떻게 개선하시겠어요?",
        "tracks": [
            {"LSE_D": 8.469, "LSE_C": 5.083},
            {"LSE_D": 14.370, "LSE_C": 0.603},
        ],
    },
    {
        "name": "eval_technical_2",
        "avatar_type": "technical",
        "question": "야근이 발생했을 때 어떻게 대처하시나요?",
        "tracks": [
            {"LSE_D": 9.705, "LSE_C": 4.183},
            {"LSE_D": 14.145, "LSE_C": 0.630},
        ],
    },
    {
        "name": "eval_personality_3",
        "avatar_type": "personality",
        "question": "동료와 의견 충돌이 발생했을 때 어떻게 해결하시나요?",
        "tracks": [
            {"LSE_D": 15.642, "LSE_C": 0.441},
            {"LSE_D": 9.157, "LSE_C": 4.211},
        ],
    },
    {
        "name": "eval_personality_4",
        "avatar_type": "personality",
        "question": "자신의 장점과 단점을 각각 말씀해 주세요.",
        "tracks": [
            {"LSE_D": 16.480, "LSE_C": 0.228},
            {"LSE_D": 8.431, "LSE_C": 5.271},
        ],
    },
]


def select_speaking_track(tracks: list[dict]) -> dict:
    return max(tracks, key=lambda t: t["LSE_C"])


def main():
    results = []
    for item in RAW_RESULTS:
        speaking = select_speaking_track(item["tracks"])
        results.append({
            "name": item["name"],
            "avatar_type": item["avatar_type"],
            "question": item["question"],
            "LSE_D": speaking["LSE_D"],
            "LSE_C": speaking["LSE_C"],
            "all_tracks": item["tracks"],
        })
        print(
            f"[avatar_eval] {item['name']} ({item['avatar_type']}) "
            f"LSE-D={speaking['LSE_D']:.3f} LSE-C={speaking['LSE_C']:.3f}"
        )

    avg_lse_c = sum(r["LSE_C"] for r in results) / len(results)
    avg_lse_d = sum(r["LSE_D"] for r in results) / len(results)
    verdict = "PASS" if avg_lse_c >= LSE_C_TARGET else "FAIL"

    summary = {
        "count": len(results),
        "avg_LSE_C": avg_lse_c,
        "avg_LSE_D": avg_lse_d,
        "target_LSE_C": LSE_C_TARGET,
        "판정": verdict,
        "비고": (
            "시간축 스무딩(픽셀 블렌딩 + 좌표/마스크 이동평균) ON/OFF 비교 테스트 결과 "
            "LSE-C 차이가 0.2 미만으로 스무딩은 원인이 아님을 확인. "
            "MuseTalk 자체가 Wav2Lip 계열보다 LSE-C가 낮게 나오는 구조적 경향과 "
            "입 영역 해상도가 주된 요인으로 추정됨."
        ),
        "details": results,
    }

    with open(RESULT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    write_markdown_report(summary)

    print("\n=== 아바타 립싱크(LSE-C/LSE-D) 평가 요약 ===")
    print(f"평가 영상 수: {len(results)}")
    print(f"평균 LSE-C: {avg_lse_c:.3f} (목표 ≥ {LSE_C_TARGET})")
    print(f"평균 LSE-D: {avg_lse_d:.3f} (참고용, 낮을수록 좋음)")
    print(f"판정: {verdict}")
    print(f"JSON 저장: {RESULT_JSON_PATH}")
    print(f"MD 저장: {RESULT_MD_PATH}")


def write_markdown_report(summary: dict) -> None:
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    verdict_mark = "✅" if summary["판정"] == "PASS" else "⚠️"

    lines = [
        "# 아바타 립싱크(SyncNet LSE-C/LSE-D) 평가 결과",
        "",
        f"측정 일시: {now}",
        f"평가 영상 수: {summary['count']}",
        "",
        "## 요약",
        "",
        "| 레이어 | 지표 | 결과 | 목표 | 판정 |",
        "|---|---|---|---|---|",
        f"| 영상 | LSE-C | {summary['avg_LSE_C']:.3f} | ≥ {summary['target_LSE_C']} | {verdict_mark} |",
        f"| 영상 | LSE-D (참고) | {summary['avg_LSE_D']:.3f} | 낮을수록 좋음 | - |",
        "",
        f"**비고:** {summary['비고']}",
        "",
        "## 영상별 상세 (말하는 아바타 트랙 기준)",
        "",
        "| # | 영상 | 아바타 | 질문 | LSE-D | LSE-C |",
        "|---|---|---|---|---|---|",
    ]

    for i, item in enumerate(summary["details"], start=1):
        question = item["question"].replace("|", "\\|")
        lines.append(
            f"| {i} | {item['name']} | {item['avatar_type']} | {question} "
            f"| {item['LSE_D']:.3f} | {item['LSE_C']:.3f} |"
        )

    lines += [
        "",
        "## 참고: 옆에 대기 중인(비발화) 아바타 트랙 (품질과 무관, 정상적으로 낮게 나옴)",
        "",
        "| # | 영상 | LSE-D | LSE-C |",
        "|---|---|---|---|",
    ]
    for i, item in enumerate(summary["details"], start=1):
        idle_tracks = [t for t in item["all_tracks"] if t["LSE_C"] != item["LSE_C"]]
        for t in idle_tracks:
            lines.append(f"| {i} | {item['name']} | {t['LSE_D']:.3f} | {t['LSE_C']:.3f} |")

    with open(RESULT_MD_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
