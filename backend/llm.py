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

def generate_resume_based_questions(job_category: str, resume_text: str) -> list[str]:
    """
    지원자의 직무(job_category)와 이력서 텍스트(resume_text)를 분석하여
    실무 및 경험 기반의 맞춤형 면접 질문 5개를 생성합니다.
    """
    try:
        # 이력서가 너무 길 경우를 대비해 적정 길이로 토큰 자르기 (약 4000자)
        truncated_resume = resume_text[:4000] if resume_text else "이력서 정보 없음"

        prompt_system = (
            "당신은 10년 차 전문 채용 면접관입니다. "
            "제공된 지원자의 이력서를 꼼꼼히 분석하고, 지원 직무에 맞춘 날카롭고 구체적인 실무/경험 기반 면접 질문 딱 5개를 작성해주세요. "
            "부가적인 인사말이나 번호 매기기 없이, 오직 질문만 줄바꿈(Enter)으로 구분해서 출력해주세요."
        )

        prompt_user = f"[지원 직무]: {job_category}\n\n[이력서 내용]:\n{truncated_resume}"

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt_system},
                {"role": "user", "content": prompt_user}
            ],
            temperature=0.7,
            max_tokens=800
        )
        
        # 결과 텍스트 파싱 및 리스트 변환
        content = response.choices[0].message.content
        questions = [q.strip() for q in content.split('\n') if q.strip()]
        
        # 만약 파싱된 질문이 5개가 안 되거나 넘치면 최소한의 방어 코드 적용
        if len(questions) < 5:
            questions.extend(["추가로 본인의 강점을 설명해 주실 수 있나요?"] * (5 - len(questions)))
            
        return questions[:5] # 정확히 5개만 반환
        
    except Exception as e:
        print(f"LLM Generation Error: {str(e)}")
        # 에러 발생 시 예외 처리용 기본 질문 반환
        return [
            "간단한 자기소개 부탁드립니다.",
            "지원 직무를 선택한 동기는 무엇인가요?",
            "이력서에 적힌 프로젝트 중 가장 기억에 남는 것은 무엇인가요?",
            "팀원과 갈등이 있었을 때 어떻게 해결하셨나요?",
            "마지막으로 하고 싶은 말이 있으신가요?"
        ]