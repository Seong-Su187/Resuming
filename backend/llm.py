import os
from openai import OpenAI
from dotenv import load_dotenv

# .env 환경 변수 파일 로드
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# 환경 변수 유효성 검증
if not OPENAI_API_KEY:
    raise ValueError("Error: .env 파일에 OPENAI_API_KEY가 설정되지 않았습니다.")

# OpenAI 최신 1.x 버전 클라이언트 초기화
client = OpenAI(api_key=OPENAI_API_KEY)

def generate_interview_questions(job_category: str) -> list[str]:
    """
    주어진 직무(job_category)에 맞춘 면접 질문 5개를 생성합니다.
    """
    try:
        # GPT-4o-mini (사용자가 의도한 최신 경량 고성능 모델)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system", 
                    "content": "당신은 10년 차 전문 면접관입니다. 지원자의 직무에 맞는 실무 및 인성 면접 질문 5개를 작성해주세요. 부가적인 인사말 없이 질문만 줄바꿈으로 구분해서 출력해주세요."
                },
                {
                    "role": "user", 
                    "content": f"지원 직무: {job_category}"
                }
            ],
            temperature=0.7,
            max_tokens=500
        )
        
        # 결과 텍스트 파싱 및 리스트 변환
        content = response.choices[0].message.content
        questions = [q.strip() for q in content.split('\n') if q.strip()]
        
        return questions
        
    except Exception as e:
        print(f"LLM Generation Error: {str(e)}")
        # 에러 발생 시 예외 처리용 기본 질문 반환
        return ["LLM 질문 생성 중 네트워크 오류가 발생했습니다. 직무 지원 동기를 말씀해 주세요."]