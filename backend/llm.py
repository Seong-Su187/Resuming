import os
import json
from openai import OpenAI
from dotenv import load_dotenv

# .env 환경 변수 파일 로드
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise ValueError("Error: .env 파일에 OPENAI_API_KEY가 설정되지 않았습니다.")

client = OpenAI(api_key=OPENAI_API_KEY)

def generate_resume_based_questions(job_category: str, resume_text: str) -> list[str]:
    """이력서 기반 맞춤형 면접 질문 5개 생성"""
    try:
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
        
        content = response.choices[0].message.content
        questions = [q.strip() for q in content.split('\n') if q.strip()]
        
        if len(questions) < 5:
            questions.extend(["추가로 본인의 강점을 설명해 주실 수 있나요?"] * (5 - len(questions)))
            
        return questions[:5]
    except Exception as e:
        print(f"LLM Generation Error: {str(e)}")
        return [
            "간단한 자기소개 부탁드립니다.",
            "지원 직무를 선택한 동기는 무엇인가요?",
            "이력서에 적힌 프로젝트 중 가장 기억에 남는 것은 무엇인가요?",
            "팀원과 갈등이 있었을 때 어떻게 해결하셨나요?",
            "마지막으로 하고 싶은 말이 있으신가요?"
        ]

def evaluate_answer_with_llm(question: str, user_answer: str, ideal_answer: str = "") -> dict:
    """
    사용자의 답변을 채점하고 피드백을 생성합니다. (동문서답 예외 처리 포함)
    반드시 JSON 형태로 score와 feedback을 반환하도록 강제합니다.
    """
    try:
        system_prompt = (
            "당신은 엄격하고 공정한 면접관입니다. 면접관의 질문에 대한 지원자의 답변을 평가하세요.\n"
            "평가 기준:\n"
            "1. 직무 연관성 및 STAR 기법 논리성 (0~100점)\n"
            "2. [예외 처리]: 만약 지원자의 답변이 질문과 전혀 상관없는 동문서답이거나, 모르겠다는 식의 회피, "
            "또는 비속어/의미 없는 단어의 나열일 경우 점수(score)를 무조건 0점으로 처리하고, "
            "피드백(feedback)에 '질문의 의도를 파악하지 못한 것 같습니다. 질문에 집중해서 다시 답변해 주시기 바랍니다.'라고 작성하세요.\n\n"
            "반드시 아래 JSON 형식으로만 응답하세요:\n"
            '{"score": 85, "feedback": "여기에 구체적인 피드백 작성"}'
        )
        
        user_prompt = f"[질문]: {question}\n[모범 RAG 답변 가이드]: {ideal_answer}\n[지원자 답변]: {user_answer}"

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        result_json = json.loads(response.choices[0].message.content)
        return result_json

    except Exception as e:
        print(f"Evaluation Error: {str(e)}")
        return {"score": 50, "feedback": "답변 평가 중 오류가 발생했습니다. 다음 질문으로 넘어갑니다."}

def process_audio_to_text(audio_file_path: str) -> str:
    """OpenAI Whisper API를 활용한 STT (음성 -> 텍스트)"""
    try:
        with open(audio_file_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-1", 
                file=audio_file
            )
        return transcription.text
    except Exception as e:
        print(f"STT Error: {str(e)}")
        return "음성을 인식하지 못했습니다."

def generate_text_to_speech(text: str, output_path: str):
    """OpenAI TTS API를 활용한 텍스트 -> 음성 생성"""
    try:
        response = client.audio.speech.create(
            model="tts-1",
            voice="onyx",
            input=text
        )
        response.stream_to_file(output_path)
        return output_path
    except Exception as e:
        print(f"TTS Error: {str(e)}")
        return None