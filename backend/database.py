import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# .env 환경 변수 파일 로드
load_dotenv()

# postgresql:// 로 시작하는 다이렉트 연결 주소
DATABASE_URL = os.getenv("DATABASE_URL")

# 환경 변수 유효성 검증
if not DATABASE_URL:
    raise ValueError("Error: .env 파일에 DATABASE_URL이 설정되지 않았습니다.")

# SQLAlchemy 데이터베이스 엔진 생성
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# 데이터베이스 세션 팩토리 생성
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """
    요청(Request)마다 독립적인 데이터베이스 세션을 생성하고,
    작업이 끝나면 안전하게 연결을 반환(종료)하는 제너레이터 함수입니다.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()