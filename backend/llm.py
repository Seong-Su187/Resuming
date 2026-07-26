import os
import re
import json
import random
import subprocess
import tempfile
import wave
import audioop
from openai import OpenAI
from dotenv import load_dotenv

from logger_config import log_execution_time

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise ValueError("Error: .env 파일에 OPENAI_API_KEY가 설정되지 않았습니다.")

client = OpenAI(api_key=OPENAI_API_KEY)


def get_embedding(text: str) -> list[float]:
    try:
        response = client.embeddings.create(
            input=text,
            model="text-embedding-3-small"
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"[LLM Error] 임베딩 생성 실패: {str(e)}")
        raise e


def split_resume_text(text: str, chunk_size: int = 500) -> list[str]:
    chunks = []
    for i in range(0, len(text), chunk_size):
        chunk = text[i:i + chunk_size].strip()
        if chunk:
            chunks.append(chunk)
    return chunks


@log_execution_time("LLM 맞춤 면접 질문 단건 생성 (generate_single_question)")
def generate_single_question(job_category: str, intent: str, context: str, q_type: str, avatar: str) -> dict:
    try:
        if q_type == "hr":
            system_prompt = (
                f"당신은 10년 차 '{job_category}' 인사 담당 면접관입니다.\n"
                f"지원자의 이력서 중 다음 [검색된 정보]를 참고하여, '{intent}'에 관한 인성/HR 면접 질문 1개를 생성하세요.\n"
                f"기술적인 내용보다는 지원 동기, 입사 후 이뤄내고 싶은 목표, 커뮤니케이션 방식 등 지원자의 '성향과 포부'를 파악하는 데 집중하세요.\n"
                f"이력서에 관련 내용이 부족하더라도 억지로 기술을 묻지 말고, 일반적이고 포괄적인 인성 면접 질문(예: 우리 회사에 지원한 구체적인 이유는 무엇인가요?)을 자연스럽게 생성하세요.\n"
                "반드시 아래의 JSON 형식으로만 응답해야 합니다.\n"
                "{\n"
                f'  "question": "우리 회사에 지원하게 된 구체적인 동기와 이뤄내고 싶은 목표는 무엇인가요?",\n'
                f'  "type": "{q_type}",\n'
                f'  "avatar": "{avatar}"\n'
                "}"
            )
        else:
            system_prompt = (
                f"당신은 10년 차 '{job_category}' 기술 면접 평가관입니다.\n"
                f"지원자의 이력서 중 다음 [검색된 정보]를 바탕으로 '{intent}'에 관한 기술 면접 질문 1개를 생성하세요.\n"
                f"질문은 단순한 확인이 아니라, 지원자의 실제 프로젝트 경험에 기반하여 구체적이고 날카롭게 꼬리를 무는 형식으로 작성해야 합니다.\n"
                "반드시 아래의 JSON 형식으로만 응답해야 합니다.\n"
                "{\n"
                f'  "question": "이력서에 작성하신 OOO 프로젝트에서 겪은 기술적 문제를 어떻게 해결하셨나요?",\n'
                f'  "type": "{q_type}",\n'
                f'  "avatar": "{avatar}"\n'
                "}"
            )

        user_prompt = f"[검색된 정보]\n{context if context else '관련 이력서 내용 없음'}"

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.6,
            response_format={"type": "json_object"}
        )
        
        return json.loads(response.choices[0].message.content)
        
    except Exception as e:
        print(f"[LLM Error] 질문 생성 실패: {str(e)}")
        return {
            "question": f"{intent}에 대해 구체적인 사례를 들어 설명해 주실 수 있나요?",
            "type": q_type,
            "avatar": avatar
        }


# 🚀 수정: 과거 기록(past_record)과 현재 분석 지표(current_metrics) 파라미터 추가
@log_execution_time("LLM 지원자 답변 채점 및 피드백 생성 (evaluate_answer_with_llm)")
def evaluate_answer_with_llm(question: str, user_answer: str, ideal_answer: str = "", current_metrics: dict = None, past_record: dict = None) -> dict:
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

            "[0점 예외 처리]\n"
            "지원자의 답변이 질문과 전혀 상관없거나, 답변을 회피하거나, "
            "비속어 또는 의미 없는 단어의 나열인 경우 모든 세부 점수를 0점으로 처리하세요.\n"
            "이 경우 feedback에는 반드시 "
            "'질문의 의도를 파악하지 못한 것 같습니다. 질문에 집중해서 다시 답변해 주시기 바랍니다.'"
            "라고 작성하세요.\n\n"
            
            # 🚀 신규 추가: 과거 답변과의 비교 분석 로직 추가
            "[성장 추이 분석 (선택 사항)]\n"
            "만약 지원자의 '의미상 가장 유사했던 과거 답변 및 지표'와 '현재 지표'가 제공된다면, 과거와 비교하여 어떤 점이 개선되었는지 분석하세요.\n"
            "비언어적 지표(시선 이탈 감소, 습관어 감소, 목소리 떨림 감소 등)와 답변 내용의 구체성을 비교하여 긍정적인 성장을 칭찬해 주세요.\n\n"

            "반드시 다음 필드만 포함한 JSON 객체로 응답하세요.\n"
            "- score: 평가 결과에 따른 0부터 100 사이의 정수\n"
            "- feedback: 점수의 구체적인 근거와 개선점을 설명한 문자열\n"
            "- ack_phrase: 지원자의 답변을 듣고 면접관이 다음 질문으로 넘어가기 전 할 법한 짧고 자연스러운 리액션 한 마디 (예: '네, 잘 알겠습니다.', '구체적인 설명 감사합니다.', '흥미로운 경험이군요.')\n"
            "- growth_feedback: (과거 기록이 제공된 경우에만) 과거 답변/지표와 현재를 비교하여 나아진 점을 분석하고 칭찬하는 문자열. 제공되지 않으면 빈 문자열 처리.\n"
            "다른 필드는 추가하지 마세요."
        )
        
        user_prompt = f"[질문]: {question}\n[모범 RAG 답변 가이드]: {ideal_answer}\n[지원자 답변]: {user_answer}\n"
        
        # 과거 기록과 현재 지표가 존재하면 프롬프트에 제공
        if current_metrics:
            user_prompt += f"\n[지원자 현재 지표]: {json.dumps(current_metrics, ensure_ascii=False)}"
        if past_record:
            user_prompt += f"\n[과거 의미적으로 가장 유사했던 답변 및 지표]: {json.dumps(past_record, ensure_ascii=False)}"

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

def preprocess_audio(input_path: str, output_path: str) -> bool:
    try:
        command = [
            "ffmpeg",
            "-y",
            "-i", input_path,

            "-ac", "1",
            "-ar", "16000",

            "-af",
            (
                "highpass=f=80,"
                "lowpass=f=8000,"
                "afftdn=nf=-25,"
                "silenceremove="
                "start_periods=1:"
                "start_duration=0.2:"
                "start_threshold=-40dB:"
                "stop_periods=-1:"
                "stop_duration=0.5:"
                "stop_threshold=-40dB,"
                "dynaudnorm"
            ),
            "-c:a", "pcm_s16le",
            output_path,
        ]

        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        if result.returncode != 0:
            print(
                "Audio Preprocessing Error:",
                result.stderr.decode("utf-8", errors="ignore"),
            )
            return False

        return os.path.exists(output_path)

    except Exception as e:
        print(f"Audio Preprocessing Error: {str(e)}")
        return False


def has_meaningful_voice(
    audio_path: str,
    rms_threshold: int = 500,
    minimum_active_ratio: float = 0.05,
) -> bool:
    try:
        with wave.open(audio_path, "rb") as wav_file:
            sample_width = wav_file.getsampwidth()
            frame_rate = wav_file.getframerate()

            if wav_file.getnchannels() != 1:
                print("Voice Detection Error: mono WAV 파일이 아닙니다.")
                return False

            chunk_size = max(1, int(frame_rate * 0.1))

            total_chunks = 0
            active_chunks = 0
            maximum_rms = 0

            while True:
                frames = wav_file.readframes(chunk_size)

                if not frames:
                    break

                total_chunks += 1
                rms = audioop.rms(frames, sample_width)
                maximum_rms = max(maximum_rms, rms)

                if rms >= rms_threshold:
                    active_chunks += 1

            if total_chunks == 0:
                return False

            active_ratio = active_chunks / total_chunks

            print(
                "[음성 감지 결과]",
                f"최대 RMS: {maximum_rms},",
                f"활성 구간 비율: {active_ratio:.2%}",
            )

            return (
                maximum_rms >= rms_threshold
                and active_ratio >= minimum_active_ratio
            )

    except Exception as e:
        print(f"Voice Detection Error: {str(e)}")
        return False


@log_execution_time("Whisper API 기반 음성 텍스트 변환 (process_audio_to_text)")
def process_audio_to_text(audio_file_path: str) -> str:
    processed_audio_path = None

    try:
        if not os.path.exists(audio_file_path):
            print(
                f"STT Error: 파일을 찾을 수 없습니다. "
                f"{audio_file_path}"
            )
            return ""

        with tempfile.NamedTemporaryFile(
            suffix=".wav",
            delete=False,
        ) as temporary_file:
            processed_audio_path = temporary_file.name

        preprocessing_success = preprocess_audio(
            input_path=audio_file_path,
            output_path=processed_audio_path,
        )

        if not preprocessing_success:
            return ""

        if not has_meaningful_voice(processed_audio_path):
            print(
                "STT Skip: 일정 크기 이상의 소리가 "
                "감지되지 않았습니다."
            )
            return ""

        with open(processed_audio_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="ko",
            )

        text = (transcription.text or "").strip()

        if not text:
            print("STT Skip: 전사 결과가 비어 있습니다.")
            return ""

        normalized_text = re.sub(
            r"[^a-zA-Z가-힣0-9]",
            "",
            text,
        ).lower()

        hallucination_phrases = (
            "시청해주셔서감사합니다",
            "구독해주세요",
            "좋아요와구독",
            "구독과좋아요",
            "좋아요부탁드려요",
            "다음영상에서만나요",
            "네감사합니다",
            "여러분감사합니다",
            "오늘도시청해주셔서감사합니다",
            "mbc뉴스",
            "kbs뉴스",
            "sbs뉴스",
            "자막제공",
            "자막제작byuptitle",
            "자막제작byuntitle",
            "먹방끝빠이빠이",
            "mbc뉴스이덕영입니다",
            "uptitle",
            "untitle",
        )

        cleaned_text = text

        for phrase in hallucination_phrases:
            phrase_pattern = r"[\s\W_]*".join(
                re.escape(char)
                for char in phrase
            )

            cleaned_text = re.sub(
                phrase_pattern,
                "",
                cleaned_text,
                flags=re.IGNORECASE,
            )

        cleaned_text = re.sub(r"\s+", " ", cleaned_text).strip()
        cleaned_text = cleaned_text.strip(".,!?~·- ")

        if not cleaned_text:
            print(
                "STT Skip: 환각 문구 제거 후 남은 답변이 없습니다. "
                f"원본 결과={text}"
            )
            return ""

        print(f"[STT 원본] {text}")
        print(f"[STT 정제 결과] {cleaned_text}")

        return cleaned_text

    except Exception as e:
        print(f"STT Error: {str(e)}")
        return ""

    finally:
        if (
            processed_audio_path
            and os.path.exists(processed_audio_path)
        ):
            try:
                os.remove(processed_audio_path)
            except OSError as e:
                print(
                    f"Temporary File Delete Error: {str(e)}"
                )


AVATAR_VOICE_MAP = {
    "young": "echo",
    "middle_aged": "onyx",
}

@log_execution_time("OpenAI TTS 음성 합성 요청 (generate_text_to_speech)")
def generate_text_to_speech(text: str, output_path: str, voice: str = "onyx"):
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

@log_execution_time("LLM 타 지원자 가상 답변 생성 (generate_candidate_answer_with_llm)")
def generate_candidate_answer_with_llm(
    question: str,
    candidate_name: str,
    candidate_description: str,
) -> str:
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