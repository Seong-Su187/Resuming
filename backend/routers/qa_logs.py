# backend/routers/qa_logs.py

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db

router = APIRouter(
    prefix="/qa-logs",
    tags=["QA Logs"],
)


@router.get("/user/{user_id}")
def get_user_qa_logs(
    user_id: UUID,
    db: Session = Depends(get_db),
):
    try:
        query = text("""
            SELECT
                q.id,
                q.session_id,
                q.question,
                q.transcribed_text,
                q.jitter_shaken_percentage,
                q.shimmer_shaken_percentage,
                q.speed_difference_wpm,
                q.score,
                q.feedback,
                q.created_at,
                s.job_category,
                s.overall_score,
                s.overall_feedback,
                s.created_at AS session_created_at
            FROM qa_logs q
            INNER JOIN interview_sessions s
                ON q.session_id = s.id
            WHERE s.user_id = :user_id
            ORDER BY
                s.created_at DESC,
                q.created_at ASC
        """)

        result = db.execute(
            query,
            {
                "user_id": str(user_id),
            },
        )

        rows = result.mappings().all()

        return [
            {
                "id": str(row["id"]),
                "session_id": str(row["session_id"]),
                "question": row["question"],
                "transcribed_text": row["transcribed_text"],
                "jitter_shaken_percentage": row[
                    "jitter_shaken_percentage"
                ],
                "shimmer_shaken_percentage": row[
                    "shimmer_shaken_percentage"
                ],
                "speed_difference_wpm": row[
                    "speed_difference_wpm"
                ],
                "score": row["score"],
                "feedback": row["feedback"],
                "created_at": row["created_at"],
                "job_category": row["job_category"],
                "overall_score": row["overall_score"],
                "overall_feedback": row["overall_feedback"],
                "session_created_at": row["session_created_at"],
            }
            for row in rows
        ]

    except Exception as error:
        print("QA 로그 조회 오류:", error)

        raise HTTPException(
            status_code=500,
            detail=f"면접 기록 조회 실패: {str(error)}",
        )