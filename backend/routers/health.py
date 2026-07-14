from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db

router = APIRouter(
    prefix="/health",
    tags=["Health Check"]
)

@router.get("/")
def health_check(db: Session = Depends(get_db)):
    """서버 가동 상태 및 직접 연결된 DB 커넥션 신뢰성 체크 엔드포인트"""
    try:
        # 데이터베이스에 단순 쿼리를 날려 실제 연결 상태 확인
        db.execute(text("SELECT 1"))
        return {
            "status": "active",
            "database_connection": "connected",
            "message": "AI 면접 도우미 백엔드 엔진 및 PostgreSQL 다이렉트 연결이 성공적으로 작동 중입니다."
        }
    except Exception as e:
        return {
            "status": "warning",
            "database_connection": "failed",
            "error_detail": str(e),
            "message": "서버는 켜져 있으나 데이터베이스 직접 연결에 실패했습니다."
        }