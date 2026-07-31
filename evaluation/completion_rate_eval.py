"""
완료율(Task Completion Rate) 측정: AI휴먼_정량평가_실행가이드 2-3번 항목.

완료율(%) = (끝까지 완료된 세션 수 / 전체 세션 수) × 100

`interview_sessions` 테이블은 세션이 시작될 때 행이 하나 생기고(POST /interviews/session),
마지막 질문까지 다 끝나야만 `overall_score`가 채워진다(backend/routers/interviews.py의
submit_answer 핸들러 마지막 분기: `UPDATE interview_sessions SET overall_score = ...`).
중간에 이탈한 세션은 이 값이 계속 NULL로 남기 때문에, "overall_score IS NOT NULL"이
곧 "끝까지 완료됨"과 동일하다 - 별도 status 컬럼이 없어도 이 값만으로 정확히 집계 가능하다.

다른 평가와 달리 API 호출(OpenAI/콜랩)이 전혀 없는 순수 DB 집계라 즉시, 몇 번이든
다시 돌려도 비용 없이 실행 가능하다.

실행: backend 가상환경 활성화 후, 프로젝트 루트에서
    python evaluation/completion_rate_eval.py
"""
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from sqlalchemy import text  # noqa: E402
from database import engine  # noqa: E402

RESULT_JSON_PATH = os.path.join(os.path.dirname(__file__), "completion_rate_eval_results.json")
RESULT_MD_PATH = os.path.join(os.path.dirname(__file__), "completion_rate_eval_results.md")

TARGET_COMPLETION_RATE = 80.0  # 가이드 7번 최종 평가표 예시 기준(참고치)


def main():
    with engine.connect() as conn:
        summary_row = conn.execute(text("""
            SELECT
                COUNT(*) AS total_sessions,
                COUNT(*) FILTER (WHERE overall_score IS NOT NULL) AS completed_sessions
            FROM interview_sessions
        """)).fetchone()

        by_category_rows = conn.execute(text("""
            SELECT
                job_category,
                COUNT(*) AS total_sessions,
                COUNT(*) FILTER (WHERE overall_score IS NOT NULL) AS completed_sessions
            FROM interview_sessions
            GROUP BY job_category
            ORDER BY total_sessions DESC
        """)).fetchall()

        incomplete_rows = conn.execute(text("""
            SELECT id, user_id, job_category, created_at
            FROM interview_sessions
            WHERE overall_score IS NULL
            ORDER BY created_at DESC
        """)).fetchall()

    total_sessions = summary_row[0]
    completed_sessions = summary_row[1]
    completion_rate = (
        round(100.0 * completed_sessions / total_sessions, 1)
        if total_sessions > 0
        else 0.0
    )

    by_category = []
    for row in by_category_rows:
        cat_total, cat_completed = row[1], row[2]
        cat_rate = round(100.0 * cat_completed / cat_total, 1) if cat_total > 0 else 0.0
        by_category.append({
            "job_category": row[0],
            "total_sessions": cat_total,
            "completed_sessions": cat_completed,
            "completion_rate": cat_rate,
        })

    summary = {
        "total_sessions": total_sessions,
        "completed_sessions": completed_sessions,
        "incomplete_sessions": total_sessions - completed_sessions,
        "completion_rate": completion_rate,
        "target": TARGET_COMPLETION_RATE,
        "by_category": by_category,
        "비고": (
            "완료 판정 기준은 interview_sessions.overall_score IS NOT NULL - 이 값은 마지막 질문까지 "
            "답변을 제출해야만 채워지므로(submit_answer의 마지막 질문 분기), 중간 이탈 세션과 정확히 "
            "구분된다. 별도의 세션 status 컬럼 없이도 신뢰 가능한 집계."
        ),
    }

    with open(RESULT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    write_markdown_report(summary, incomplete_rows)

    print("\n=== 완료율(Task Completion Rate) 측정 요약 ===")
    print(f"전체 세션 수: {total_sessions}")
    print(f"완료된 세션 수: {completed_sessions}")
    print(f"완료율: {completion_rate}% (목표: {TARGET_COMPLETION_RATE}% 이상)")
    for cat in by_category:
        print(f"  [{cat['job_category']}] {cat['completed_sessions']}/{cat['total_sessions']} ({cat['completion_rate']}%)")
    print(f"JSON 저장: {RESULT_JSON_PATH}")
    print(f"MD 저장: {RESULT_MD_PATH}")


def write_markdown_report(summary: dict, incomplete_rows) -> None:
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    lines = [
        "# 완료율(Task Completion Rate) 측정 결과",
        "",
        f"측정 일시: {now}",
        "",
        "## 요약",
        "",
        "| 지표 | 결과 |",
        "|---|---|",
        f"| 전체 세션 수 | {summary['total_sessions']} |",
        f"| 완료된 세션 수 | {summary['completed_sessions']} |",
        f"| 미완료(중간 이탈) 세션 수 | {summary['incomplete_sessions']} |",
        f"| 완료율 | {summary['completion_rate']}% (목표 {summary['target']}% 이상) |",
        "",
        f"**비고:** {summary['비고']}",
        "",
        "## 직무 카테고리별",
        "",
        "| 직무 카테고리 | 완료 / 전체 | 완료율 |",
        "|---|---|---|",
    ]

    for cat in summary["by_category"]:
        lines.append(
            f"| {cat['job_category']} | {cat['completed_sessions']} / {cat['total_sessions']} | {cat['completion_rate']}% |"
        )

    lines += [
        "",
        "## 미완료 세션 목록 (최신순)",
        "",
        "| session_id | user_id | job_category | 시작 시각 |",
        "|---|---|---|---|",
    ]

    if incomplete_rows:
        for row in incomplete_rows:
            lines.append(f"| {row[0]} | {row[1]} | {row[2]} | {row[3]} |")
    else:
        lines.append("| (없음 - 모든 세션이 완료됨) | | | |")

    with open(RESULT_MD_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
