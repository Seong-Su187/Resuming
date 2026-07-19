import os
import json
import random
from openai import OpenAI
from dotenv import load_dotenv

# .env 환경 변수 파일 로드
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise ValueError("Error: .env 파일에 OPENAI_API_KEY가 설정되지 않았습니다.")

client = OpenAI(api_key=OPENAI_API_KEY)

def generate_resume_based_questions(job_category: str, resume_text: str) -> list:
    """
    이력서 기반 맞춤형 면접 질문 5개 생성 (전문 지식 / 인사 담당 면접관 랜덤 분리)
    각 질문마다 어떤 아바타(목소리)를 사용할지 JSON 형태로 매핑하여 반환합니다.
    """
    try:
        truncated_resume = resume_text[:4000] if resume_text else "이력서 정보 없음"
        prompt_system = (
            "당신은 10년 차 채용 전문가입니다. "
            "제공된 지원자의 이력서를 분석하여 총 5개의 맞춤형 면접 질문을 생성하세요.\n"
            "면접에는 2명의 면접관이 참여하며, 각자의 역할에 맞는 질문을 분리해서 작성해야 합니다:\n"
            "1. 'technical' (전문 지식 면접관): 이력서 기반의 실무, 기술 깊이, 프로젝트 경험, 문제 해결 과정을 묻습니다. (avatar: 'middle_aged')\n"
            "2. 'hr' (인사 담당 면접관): 회사 지원 동기, 입사 후 우리 회사에서 해내고 싶은 목표, 팀워크, 인성 및 컬처핏을 묻습니다. (avatar: 'young')\n\n"
            "5개의 질문 중 3개는 'technical', 2개는 'hr' 유형으로 구성하세요.\n"
            "반드시 아래의 JSON 형식으로만 응답해야 합니다.\n"
            "{\n"
            '  "questions": [\n'
            '    {"question": "지원하신 직무와 관련하여...", "type": "technical", "avatar": "middle_aged"},\n'
            '    {"question": "우리 회사에 지원하게 된 구체적인 동기는...", "type": "hr", "avatar": "young"}\n'
            "  ]\n"
            "}"
        )
        prompt_user = f"[지원 직무]: {job_category}\n\n[이력서 내용]:\n{truncated_resume}"

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt_system},
                {"role": "user", "content": prompt_user}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        result_json = json.loads(response.choices[0].message.content)
        questions = result_json.get("questions", [])
        
        if len(questions) < 5:
            questions.extend([
                {"question": "추가로 본인의 강점을 설명해 주실 수 있나요?", "type": "hr", "avatar": "young"}
            ] * (5 - len(questions)))
            
        questions = questions[:5]
        
        # 질문 순서를 랜덤하게 섞어서 매번 면접의 흐름을 다이나믹하게 만듭니다.
        random.shuffle(questions)
        
        return questions
    except Exception as e:
        print(f"LLM Generation Error: {str(e)}")
        fallback = [
            {"question": "간단한 자기소개와 함께 지원 동기를 말씀해 주세요.", "type": "hr", "avatar": "young"},
            {"question": "이력서에 적힌 프로젝트 중 가장 기술적으로 어려웠던 부분은 무엇인가요?", "type": "technical", "avatar": "middle_aged"},
            {"question": "팀원과 의견 충돌이 발생했을 때 어떻게 해결하시나요?", "type": "hr", "avatar": "young"},
            {"question": "지원 직무와 관련된 본인만의 강점은 무엇인가요?", "type": "technical", "avatar": "middle_aged"},
            {"question": "입사 후 3년 뒤, 우리 회사에서 어떤 역할을 해내고 싶으신가요?", "type": "hr", "avatar": "young"}
        ]
        random.shuffle(fallback)
        return fallback

def evaluate_answer_with_llm(question: str, user_answer: str, ideal_answer: str = "") -> dict:
    """
    사용자의 답변을 채점하고 피드백을 생성합니다. (동문서답 예외 처리 포함)
    반드시 JSON 형태로 score와 feedback을 반환하도록 강제합니다.
    """
    try:
        system_prompt = (
            "당신은 매우 엄격한 기술 면접 평가관입니다. "
            "지원자의 답변을 문장이 자연스럽다는 이유만으로 높게 평가하지 마세요.\n\n"

            "[평가 항목 및 배점]\n"
            "1. 질문 의도 파악 및 직무 연관성: 20점\n"
            "2. 상황 또는 문제 설명의 구체성: 15점\n"
            "3. 본인의 역할과 책임의 명확성: 15점\n"
            "4. 실제 행동 및 기술적 해결 과정: 25점\n"
            "5. 결과 및 성과의 구체성: 15점\n"
            "6. 배운 점 및 개선 방향: 10점\n\n"

            "[채점 원칙]\n"
            "- 평가 항목별 점수를 내부적으로 각각 계산한 뒤 합산하여 최종 score를 정하세요.\n"
            "- 항목별 점수는 응답에 출력하지 마세요.\n"
            "- 최종 점수를 먼저 정해 놓고 피드백을 맞추지 말고, 각 항목의 충족 여부에 따라 점수를 계산하세요.\n"
            "- 답변에 언급되지 않은 내용은 추측해서 점수를 주지 마세요.\n"
            "- 구체적인 사례, 본인 역할, 실제 행동, 기술적 근거, 결과가 부족하면 높은 점수를 주지 마세요.\n"
            "- 단순히 질문과 관련된 말을 했다는 이유만으로 70점 이상을 주지 마세요.\n"
            "- 경험이 없는 일반론만 말한 경우 최대 49점입니다.\n"
            "- 본인의 역할이나 행동이 불명확한 경우 최대 69점입니다.\n"
            "- 구체적인 결과나 성과가 없는 경우 최대 79점입니다.\n"
            "- 상황, 역할, 행동, 결과, 회고가 모두 구체적이어야 90점 이상을 줄 수 있습니다.\n\n"

            "[점수 구간]\n"
            "- 90~100점: 실제 사례, 역할, 행동, 기술적 해결 과정, 결과, 회고가 모두 구체적임\n"
            "- 70~89점: 전반적으로 적절하지만 일부 구체성, 결과 또는 기술 설명이 부족함\n"
            "- 50~69점: 질문에는 답하지만 경험과 행동 과정이 추상적이거나 일부만 설명됨\n"
            "- 20~49점: 관련 내용은 있으나 일반론 중심이며 실제 경험과 해결 과정이 거의 없음\n"
            "- 1~19점: 질문과 일부 관련된 단어나 짧은 의견만 제시함\n"
            "- 0점: 동문서답, 답변 거부, 모르겠다는 회피, 비속어 또는 의미 없는 단어 나열\n\n"

            "[0점 예외 처리]\n"
            "지원자의 답변이 질문과 전혀 상관없거나, 답변을 회피하거나, "
            "비속어 또는 의미 없는 단어의 나열인 경우 모든 세부 점수를 0점으로 처리하세요.\n"
            "이 경우 feedback에는 반드시 "
            "'질문의 의도를 파악하지 못한 것 같습니다. 질문에 집중해서 다시 답변해 주시기 바랍니다.'"
            "라고 작성하세요.\n\n"

            "반드시 다음 두 필드만 포함한 JSON 객체로 응답하세요.\n"
            "- score: 평가 결과에 따른 0부터 100 사이의 정수\n"
            "- feedback: 점수의 구체적인 근거와 개선점을 설명한 문자열\n"
            "다른 필드는 추가하지 마세요."
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

# 아바타 캐릭터별 목소리 매핑 (20대: echo, 40대: onyx)
AVATAR_VOICE_MAP = {
    "young": "echo",
    "middle_aged": "onyx",
}

def generate_text_to_speech(text: str, output_path: str, voice: str = "onyx"):
    """OpenAI TTS API를 활용한 텍스트 -> 음성 생성"""
    try:
        response = client.audio.speech.create(
            model="tts-1",
            voice=voice,
            input=text
        )
        response.stream_to_file(output_path)

        return output_path
    except Exception as e:
        print(f"TTS Error: {str(e)}")
        return None

def generate_candidate_answer_with_llm(
    question: str,
    candidate_name: str,
    candidate_description: str,
) -> str:
    """지원자 성향을 반영해 면접 답변을 생성합니다."""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.75,
            max_tokens=500,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "당신은 실제 다대일 면접에 참여한 지원자입니다. "
                        "한국어 존댓말로 답변하세요. "
                        "설정된 지원자의 역량보다 지나치게 잘하거나 못하지 마세요. "
                        "답변은 3~6문장으로 작성하세요. "
                        "지원자의 이름이나 설정을 직접 언급하지 마세요. "
                        "면접 답변만 출력하세요."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"[지원자 이름]\n{candidate_name}\n\n"
                        f"[지원자 특성]\n{candidate_description}\n\n"
                        f"[면접 질문]\n{question}\n\n"
                        "위 특성에 맞는 실제 면접 답변을 작성하세요."
                    ),
                },
            ],
        )

        answer = response.choices[0].message.content

        return answer.strip() if answer else ""

    except Exception as e:
        print(
            f"Candidate Answer Generation Error "
            f"({candidate_name}): {str(e)}"
        )

        return "죄송하지만 질문에 대한 답변을 바로 정리하지 못했습니다."