import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import health, profiles, interviews, auth, qa_logs

app = FastAPI(
    title="AI 면접 도우미 백엔드 API",
    description="데스크톱 웹 환경을 위한 FastAPI 비동기 백엔드 서버 엔진",
    version="1.0.0"
)

# CORS 설정 (데스크톱 로컬 웹 브라우저 호환성 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 세분화된 도메인별 라우터 등록 (Controller 연결)
app.include_router(health.router)
app.include_router(auth.router)       # 로그인/회원가입 라우터 추가
app.include_router(profiles.router)
app.include_router(interviews.router)
app.include_router(qa_logs.router)


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True
    )