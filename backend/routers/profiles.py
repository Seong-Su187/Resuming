from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from schemas import BaselineRequest
from database import get_db

router = APIRouter(
    prefix="/profiles",
    tags=["Profiles"]
)

@router.post("/baseline")
def register_user_baseline(data: BaselineRequest, db: Session = Depends(get_db)):
    """회원 가입 단계에서 수집한 유저 고유의 오디오 기본 지표 저장 API"""
    try:
        # PostgreSQL 네이티브 Upsert 쿼리 직접 실행
        query = text("""
            INSERT INTO profiles (id, email, baseline_jitter, baseline_shimmer, baseline_wpm)
            VALUES (:id, :email, :jitter, :shimmer, :wpm)
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                baseline_jitter = EXCLUDED.baseline_jitter,
                baseline_shimmer = EXCLUDED.baseline_shimmer,
                baseline_wpm = EXCLUDED.baseline_wpm
            RETURNING id;
        """)
        
        db.execute(query, {
            "id": data.user_id,
            "email": data.email,
            "jitter": data.baseline_jitter,
            "shimmer": data.baseline_shimmer,
            "wpm": data.baseline_wpm
        })
        db.commit()
        
        return {
            "status": "success",
            "message": f"유저 {data.user_id}의 음성 베이스라인 데이터 등록이 완료되었습니다."
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"프로필 데이터베이스 적재 실패: {str(e)}")