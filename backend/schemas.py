from pydantic import BaseModel

class BaselineRequest(BaseModel):
    user_id: str
    email: str
    baseline_jitter: float
    baseline_shimmer: float
    baseline_wpm: float

class SessionCreateRequest(BaseModel):
    user_id: str
    job_category: str

# LLM 질문 생성 요청을 위한 DTO 추가
class QuestionGenerateRequest(BaseModel):
    job_category: str