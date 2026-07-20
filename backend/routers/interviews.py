import asyncio
import base64
import io
import json
import os
import time
import uuid
import httpx
import subprocess
from datetime import datetime
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends, UploadFile, File, Form, Body
from fastapi.responses import FileResponse, StreamingResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import text
from PyPDF2 import PdfReader
import pdfkit # 🚀 WeasyPrint를 대체하는 가장 안정적인 모듈

from schemas import SessionCreateRequest
from database import get_db
from audio_analyzer import extract_voice_metrics, calculate_delta
from filler_analyzer import count_filler_words
from vision_analyzer import check_gaze_loss
from llm import (
    generate_resume_based_questions,
    evaluate_answer_with_llm,
    process_audio_to_text,
    generate_text_to_speech,
    generate_candidate_answer_with_llm,
    AVATAR_VOICE_MAP
)

def convert_audio_to_wav(
    input_path: str,
    output_path: str,
) -> None:
    """
    브라우저에서 녹음된 WebM/Opus 음성을
    분석 가능한 mono 16-bit PCM WAV로 변환합니다.
    """
    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                input_path,
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                output_path,
            ],
            capture_output=True,
            text=True,
            check=False,
        )

    except FileNotFoundError as error:
        raise RuntimeError(
            "FFmpeg를 찾을 수 없습니다. "
            "FFmpeg 설치와 PATH 설정을 확인해주세요."
        ) from error

    if result.returncode != 0:
        raise RuntimeError(
            f"오디오 WAV 변환 실패: {result.stderr}"
        )

    if not os.path.exists(output_path):
        raise RuntimeError(
            "변환된 WAV 파일이 생성되지 않았습니다."
        )

    if os.path.getsize(output_path) == 0:
        raise RuntimeError(
            "변환된 WAV 파일이 비어 있습니다."
        )

router = APIRouter(
    prefix="/interviews",
    tags=["Interviews"]
)

async def build_candidate_answers(
    question_text: str,
    selected_candidates: list[dict],
) -> list[dict]:
    """
    선택된 지원자별 성향을 반영한 답변을 병렬로 생성합니다.
    특정 지원자의 생성이 실패해도 나머지 지원자의 면접은 계속 진행합니다.
    """
    async def generate_one(candidate: dict) -> dict:
        candidate_id = candidate.get("id")
        candidate_name = candidate.get("name", "지원자")
        description = candidate.get("description", "")

        try:
            answer = await asyncio.to_thread(
                generate_candidate_answer_with_llm,
                question_text,
                candidate_name,
                description,
            )
        except Exception as error:
            print(
                f"[interviews] {candidate_name} 답변 생성 오류: {error}"
            )
            answer = (
                "죄송합니다. 잠시 긴장해서 답변을 정리하지 못했습니다."
            )

        return {
            "candidate_id": candidate_id,
            "name": candidate_name,
            "answer": answer.strip(),
        }

    if not selected_candidates:
        return []

    return await asyncio.gather(
        *(generate_one(candidate) for candidate in selected_candidates)
    )


async def _generate_tts_fallback_base64(text: str, voice: str) -> str | None:
    """
    아바타 영상 스트리밍이 실패했을 때 프론트가 대신 재생할 음성만 미리 만들어둡니다.
    """
    tts_path = f"temp_fallback_tts_{uuid.uuid4()}.mp3"
    try:
        await asyncio.to_thread(generate_text_to_speech, text, tts_path, voice)
        if not os.path.exists(tts_path):
            return None
        with open(tts_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    except Exception as error:
        print(f"[interviews] fallback 음성 생성 오류: {error}")
        return None
    finally:
        if os.path.exists(tts_path):
            os.remove(tts_path)


async def send_next_question(
    websocket: WebSocket,
    question_data: dict | str,
    current_index: int,
    total_questions: int,
    selected_candidates: list[dict],
):
    """
    질문 영상과 선택된 지원자들의 질문별 답변을 함께 전송합니다.
    프론트엔드는 candidate_answers를 무작위 순서와 간격으로 재생합니다.
    """
    # 과거 호환성 및 객체형 데이터 분기 처리
    question_text = question_data if isinstance(question_data, str) else question_data.get("question", "")
    q_type = "technical" if isinstance(question_data, str) else question_data.get("type", "technical")
    avatar = "middle_aged" if isinstance(question_data, str) else question_data.get("avatar", "middle_aged")
    voice = AVATAR_VOICE_MAP.get(avatar, "onyx")

    candidate_answers_task = asyncio.create_task(
        build_candidate_answers(
            question_text,
            selected_candidates,
        )
    )
    tts_fallback_task = asyncio.create_task(
        _generate_tts_fallback_base64(question_text, voice)
    )

    # 듀오 서버 테스트용 임시 매핑: 백엔드의 "hr" 타입 = 듀오 노트북의 "personality" 아바타
    duo_avatar_type = "personality" if q_type == "hr" else q_type

    payload = {
        "type": "next_question",
        "current_index": current_index,
        "total_questions": total_questions,
        "question_text": question_text,
        "interviewer_type": q_type,
        "avatar": avatar,
        "duo_avatar_type": duo_avatar_type,
        "tts_audio_base64": None,  # 아바타 영상 스트리밍 실패 대비 음성만이라도 재생하기 위한 fallback
        "candidate_answers": [],
    }

    # 아바타 영상은 더 이상 여기서 만들어 기다렸다가 통째로 보내지 않습니다.
    # 프론트가 질문 텍스트를 받는 즉시 /interviews/avatar-video-stream을 직접 호출해서
    # MuseTalk 스트리밍 응답을 받아 재생합니다 (완성될 때까지 기다리지 않아도 됨).
    # tts_audio_base64는 그 스트리밍이 실패했을 때만 프론트가 대신 재생할 fallback이라,
    # candidate_answers와 마찬가지로 텍스트 전송과 병렬로 준비해서 지연을 최소화합니다.
    payload["tts_audio_base64"] = await tts_fallback_task
    payload["candidate_answers"] = await candidate_answers_task

    await websocket.send_json(payload)


@router.post("/avatar-video-stream")
async def avatar_video_stream(payload: dict = Body(...)):
    """
    질문 텍스트를 TTS로 변환해서 Colab 듀오 서버의 실시간 스트리밍 엔드포인트로 보내고,
    그 응답(fMP4 청크 스트림)을 그대로 프론트로 중계합니다.
    프론트는 전체 영상이 완성되길 기다리지 않고 MediaSource로 도착하는 대로 재생합니다.
    """
    question_text = payload.get("text", "")
    avatar = payload.get("avatar", "middle_aged")
    duo_avatar_type = payload.get("duo_avatar_type", "technical")

    if not question_text:
        raise HTTPException(status_code=400, detail="text가 필요합니다.")

    duo_stream_url = os.getenv("MUSETALK_DUO_STREAM_URL")
    if not duo_stream_url:
        raise HTTPException(status_code=503, detail="MUSETALK_DUO_STREAM_URL이 설정되지 않았습니다 (.env 확인).")

    t0 = time.time()
    voice = AVATAR_VOICE_MAP.get(avatar, "onyx")
    tts_path = f"temp_stream_tts_{uuid.uuid4()}.mp3"
    generate_text_to_speech(question_text, tts_path, voice=voice)
    print(f"[stream-timing] TTS 완료: {time.time() - t0:.2f}초", flush=True)

    try:
        with open(tts_path, "rb") as f:
            audio_base64 = base64.b64encode(f.read()).decode("utf-8")
    finally:
        if os.path.exists(tts_path):
            os.remove(tts_path)

    async def proxy_stream():
        first_chunk_logged = False
        async with httpx.AsyncClient(timeout=None) as client:
            print(f"[stream-timing] 코랩에 요청 전송: {time.time() - t0:.2f}초", flush=True)
            async with client.stream(
                "POST",
                duo_stream_url,
                json={"avatar_type": duo_avatar_type, "audio_base64": audio_base64},
            ) as response:
                async for chunk in response.aiter_bytes():
                    if not first_chunk_logged:
                        print(f"[stream-timing] 코랩에서 첫 청크 수신: {time.time() - t0:.2f}초", flush=True)
                        first_chunk_logged = True
                    yield chunk

    return StreamingResponse(proxy_stream(), media_type="video/mp4")


# 🚀 신규: 영점 조절 프레임 분석 엔드포인트
@router.post("/calibrate-vision")
async def calibrate_vision_endpoint(payload: dict = Body(...)):
    """
    웹캠 영점 조절(Calibration)을 위해 캡처된 프레임들을 받아 분석합니다.
    분석을 통해 사용자의 고유한 코(Nose)와 홍채(Iris) 기준점 위치를 반환합니다.
    """
    frames = payload.get("frames", [])
    
    if not frames:
        return {"baseline_nose": 0.5, "baseline_iris": 0.5}

    try:
        # vision_analyzer에 calculate_baselines가 새로 추가되었다고 가정하고 임포트
        from vision_analyzer import calculate_baselines
        nose, iris = calculate_baselines(frames)
        return {
            "baseline_nose": nose, 
            "baseline_iris": iris
        }
    except ImportError:
        # 아직 vision_analyzer.py에 구현이 안되어 있을 경우 기본 중앙값으로 Fallback 처리
        return {"baseline_nose": 0.5, "baseline_iris": 0.5}
    except Exception as e:
        print(f"[Calibration Error] 영점 조절 분석 중 오류: {e}")
        return {"baseline_nose": 0.5, "baseline_iris": 0.5}


@router.post("/session")
def create_interview_session(data: SessionCreateRequest, db: Session = Depends(get_db)):
    """신규 모의 면접 세션을 생성하고 고유 세션 ID 반환 API"""
    try:
        query = text("""
            INSERT INTO interview_sessions (user_id, job_category)
            VALUES (:user_id, :job_category)
            RETURNING id;
        """)
        
        result = db.execute(query, {
            "user_id": data.user_id,
            "job_category": data.job_category
        }).fetchone()
        
        db.commit()
        
        return {
            "status": "success",
            "session_id": str(result[0])
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"인터뷰 세션 데이터베이스 셋업 실패: {str(e)}")


@router.post("/{session_id}/upload-resume")
async def upload_resume_and_generate_questions(session_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """PDF 이력서를 업로드받아 텍스트를 추출하고 5개의 맞춤 질문을 생성하여 DB에 저장합니다."""
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드 가능합니다.")

    try:
        # 1. PDF 텍스트 추출
        file_content = await file.read()
        pdf_reader = PdfReader(io.BytesIO(file_content))
        resume_text = ""
        for page in pdf_reader.pages:
            extracted = page.extract_text()
            if extracted:
                resume_text += extracted + "\n"

        # 2. 세션 정보 조회하여 직무(job_category) 가져오기
        session_query = text("SELECT job_category FROM interview_sessions WHERE id = :id")
        session_info = db.execute(session_query, {"id": session_id}).fetchone()
        if not session_info:
            raise HTTPException(status_code=404, detail="해당 인터뷰 세션을 찾을 수 없습니다.")
            
        job_category = session_info[0]

        # 3. LLM을 통한 맞춤형 5가지 질문 생성 (객체 형태)
        generated_questions = generate_resume_based_questions(job_category, resume_text)

        # 4. 추출된 이력서와 생성된 질문 배열을 DB에 저장
        update_query = text("""
            UPDATE interview_sessions 
            SET resume_text = :resume_text, questions = :questions 
            WHERE id = :id
        """)
        db.execute(update_query, {
            "resume_text": resume_text,
            "questions": json.dumps(generated_questions),
            "id": session_id
        })
        db.commit()

        return {
            "status": "success",
            "message": "이력서 분석 및 면접 질문 생성이 완료되었습니다.",
            "question_count": len(generated_questions)
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"이력서 처리 중 오류 발생: {str(e)}")


@router.get("/resume/{user_id}")
def get_latest_resume(user_id: str, db: Session = Depends(get_db)):
    """사용자가 이전에 등록한 최근 이력서 조회"""
    try:
        query = text("""
            SELECT resume_text
            FROM interview_sessions
            WHERE user_id = :user_id
              AND resume_text IS NOT NULL
              AND resume_text != ''
            ORDER BY created_at DESC
            LIMIT 1
        """)

        result = db.execute(
            query,
            {"user_id": user_id}
        ).fetchone()

        if not result:
            return {
                "status": "success",
                "has_resume": False,
                "resume_text": None
            }

        return {
            "status": "success",
            "has_resume": True,
            "resume_text": result[0]
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"기존 이력서 조회 중 오류 발생: {str(e)}"
        )


@router.post("/{session_id}/use-existing-resume")
def use_existing_resume(
    session_id: str,
    user_id: str,
    db: Session = Depends(get_db)
):
    """사용자의 최근 이력서를 현재 면접 세션에서 재사용"""
    try:
        resume_query = text("""
            SELECT resume_text
            FROM interview_sessions
            WHERE user_id = :user_id
              AND resume_text IS NOT NULL
              AND resume_text != ''
            ORDER BY created_at DESC
            LIMIT 1
        """)

        resume_result = db.execute(
            resume_query,
            {"user_id": user_id}
        ).fetchone()

        if not resume_result:
            raise HTTPException(
                status_code=404,
                detail="기존에 등록한 이력서가 없습니다."
            )

        resume_text = resume_result[0]

        session_query = text("""
            SELECT job_category
            FROM interview_sessions
            WHERE id = :session_id
        """)

        session_result = db.execute(
            session_query,
            {"session_id": session_id}
        ).fetchone()

        if not session_result:
            raise HTTPException(
                status_code=404,
                detail="면접 세션을 찾을 수 없습니다."
            )

        job_category = session_result[0]

        generated_questions = generate_resume_based_questions(
            job_category,
            resume_text
        )

        update_query = text("""
            UPDATE interview_sessions
            SET resume_text = :resume_text,
                questions = :questions
            WHERE id = :session_id
        """)

        db.execute(
            update_query,
            {
                "resume_text": resume_text,
                "questions": json.dumps(generated_questions),
                "session_id": session_id
            }
        )

        db.commit()

        return {
            "status": "success",
            "message": "기존 이력서로 면접 질문을 생성했습니다.",
            "question_count": len(generated_questions)
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"기존 이력서 사용 중 오류 발생: {str(e)}"
        )
    

@router.get("/baseline-voice/{user_id}")
def get_baseline_voice(
    user_id: str,
    db: Session = Depends(get_db),
):
    """사용자의 기존 기본 음성 분석 정보 조회"""
    try:
        query = text("""
            SELECT
                baseline_jitter,
                baseline_shimmer,
                baseline_wpm
            FROM profiles
            WHERE id = :user_id
        """)

        result = db.execute(
            query,
            {"user_id": user_id},
        ).fetchone()

        if not result:
            return {
                "status": "success",
                "has_baseline": False,
                "metrics": None,
            }

        baseline_jitter = result[0]
        baseline_shimmer = result[1]
        baseline_wpm = result[2]

        has_baseline = (
            baseline_jitter is not None
            and baseline_shimmer is not None
            and baseline_wpm is not None
        )

        if not has_baseline:
            return {
                "status": "success",
                "has_baseline": False,
                "metrics": None,
            }

        return {
            "status": "success",
            "has_baseline": True,
            "metrics": {
                "jitter": float(baseline_jitter),
                "shimmer": float(baseline_shimmer),
                "wpm": float(baseline_wpm),
            },
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"기존 음성 조회 중 오류가 발생했습니다: {str(e)}",
        )
    
@router.post("/baseline-voice")
async def save_baseline_voice(
    user_id: str = Form(...),
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    사용자의 평상시 음성을 분석하고
    jitter, shimmer, wpm을 profiles 테이블에 저장합니다.
    """
    file_id = uuid.uuid4()

    temp_webm_path = f"temp_baseline_{file_id}.webm"
    temp_wav_path = f"temp_baseline_{file_id}.wav"

    try:
        audio_content = await audio_file.read()

        if not audio_content:
            raise HTTPException(
                status_code=400,
                detail="녹음된 음성 파일이 비어 있습니다.",
            )

        with open(temp_webm_path, "wb") as buffer:
            buffer.write(audio_content)

        # WebM/Opus → WAV 변환
        convert_audio_to_wav(
            temp_webm_path,
            temp_wav_path,
        )

        # 변환된 WAV 파일로 STT 수행
        transcribed_text = process_audio_to_text(
            temp_wav_path,
        )

        if not transcribed_text or not transcribed_text.strip():
            raise HTTPException(
                status_code=400,
                detail="음성을 인식하지 못했습니다. 조금 더 크게 다시 읽어주세요.",
            )

        # WAV 파일로 음성 지표 분석
        metrics = extract_voice_metrics(
            temp_wav_path,
            transcribed_text,
        )

        baseline_jitter = float(metrics.get("jitter", 0.0))
        baseline_shimmer = float(metrics.get("shimmer", 0.0))
        baseline_wpm = float(metrics.get("wpm", 0.0))

        profile_query = text("""
            SELECT id
            FROM profiles
            WHERE id = :user_id
        """)

        profile = db.execute(
            profile_query,
            {"user_id": user_id},
        ).fetchone()

        if profile:
            update_query = text("""
                UPDATE profiles
                SET baseline_jitter = :baseline_jitter,
                    baseline_shimmer = :baseline_shimmer,
                    baseline_wpm = :baseline_wpm
                WHERE id = :user_id
            """)

            db.execute(
                update_query,
                {
                    "user_id": user_id,
                    "baseline_jitter": baseline_jitter,
                    "baseline_shimmer": baseline_shimmer,
                    "baseline_wpm": baseline_wpm,
                },
            )
        else:
            insert_query = text("""
                INSERT INTO profiles (
                    id,
                    baseline_jitter,
                    baseline_shimmer,
                    baseline_wpm
                )
                VALUES (
                    :user_id,
                    :baseline_jitter,
                    :baseline_shimmer,
                    :baseline_wpm
                )
            """)

            db.execute(
                insert_query,
                {
                    "user_id": user_id,
                    "baseline_jitter": baseline_jitter,
                    "baseline_shimmer": baseline_shimmer,
                    "baseline_wpm": baseline_wpm,
                },
            )

        db.commit()

        return {
            "status": "success",
            "message": "기본 음성 정보가 저장되었습니다.",
            "transcribed_text": transcribed_text,
            "metrics": {
                "jitter": baseline_jitter,
                "shimmer": baseline_shimmer,
                "wpm": baseline_wpm,
            },
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as e:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=f"기본 음성 처리 중 오류가 발생했습니다: {str(e)}",
        )

    finally:
        if os.path.exists(temp_webm_path):
            os.remove(temp_webm_path)
        if os.path.exists(temp_wav_path):
            os.remove(temp_wav_path)


@router.post("/{session_id}/process-audio")
async def process_interview_audio(
    session_id: str,
    user_id: str = Form(...),
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """면접관 질문에 대한 사용자 답변 오디오를 받아 STT 및 평음 대조 떨림 분석"""
    file_id = uuid.uuid4()
    temp_webm_path = f"temp_answer_{file_id}.webm"
    temp_wav_path = f"temp_answer_{file_id}.wav"
    try:
        audio_content = await audio_file.read()

        if not audio_content:
            raise HTTPException(
                status_code=400,
                detail="녹음된 답변 파일이 비어 있습니다.",
            )

        with open(temp_webm_path, "wb") as buffer:
            buffer.write(audio_content)
            
        convert_audio_to_wav(temp_webm_path, temp_wav_path)
        transcribed_text = process_audio_to_text(temp_wav_path)
        current_metrics = extract_voice_metrics(temp_wav_path, transcribed_text)
        
        profile_query = text("SELECT baseline_jitter, baseline_shimmer, baseline_wpm FROM profiles WHERE id = :user_id")
        profile = db.execute(profile_query, {"user_id": user_id}).fetchone()
        
        if not profile:
            raise HTTPException(status_code=404, detail="유저 평음 데이터 없음")
            
        base_jitter, base_shimmer, base_wpm = profile[0], profile[1], profile[2]
        
        delta_jitter = calculate_delta(base_jitter, current_metrics["jitter"])
        delta_shimmer = calculate_delta(base_shimmer, current_metrics["shimmer"])
        delta_wpm = current_metrics["wpm"] - base_wpm
        
        return {
            "status": "success",
            "transcribed_text": transcribed_text,
            "jitter_shaken_percentage": delta_jitter,
            "shimmer_shaken_percentage": delta_shimmer,
            "speed_difference_wpm": delta_wpm
        }
    finally:
        if os.path.exists(temp_webm_path):
            os.remove(temp_webm_path)
        if os.path.exists(temp_wav_path):
            os.remove(temp_wav_path)


@router.post("/tts")
async def text_to_speech(text_payload: dict):
    """텍스트와 아바타 종류("young" | "middle_aged")를 받아 그에 맞는 목소리의 음성 파일(mp3)로 반환"""
    text = text_payload.get("text", "")
    avatar = text_payload.get("avatar", "middle_aged")
    voice = AVATAR_VOICE_MAP.get(avatar, "onyx")
    file_id = uuid.uuid4()
    temp_path = f"temp_tts_{file_id}.mp3"
    try:
        output_file = generate_text_to_speech(text, temp_path, voice=voice)
        return FileResponse(output_file, media_type="audio/mpeg", filename="avatar.mp3")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{session_id}/result")
def get_interview_results(session_id: str, db: Session = Depends(get_db)):
    """최종 결과 조회 및 과거 면접 기록과 비교한 성장 추이 반환"""
    try:
        # 1. 현재 세션 정보 조회
        session_query = text("SELECT user_id, overall_score, overall_feedback, created_at FROM interview_sessions WHERE id = :id")
        current_session = db.execute(session_query, {"id": session_id}).fetchone()
        
        if not current_session:
            raise HTTPException(status_code=404, detail="결과를 찾을 수 없습니다.")
            
        user_id = current_session[0]
        curr_score = current_session[1]
        curr_feedback = current_session[2]
        curr_date = current_session[3]

        # 2. 현재 세션의 상세 로그 조회 (습관어, 시선 이탈 컬럼 추가)
        logs = db.execute(
            text("SELECT question, transcribed_text, score, feedback, jitter_shaken_percentage, shimmer_shaken_percentage, filler_word_count, gaze_loss_count FROM qa_logs WHERE session_id = :s ORDER BY created_at ASC"), 
            {"s": session_id}
        ).fetchall()
        
        details = []
        for r in logs:
            details.append({
                "question": r[0], "user_answer": r[1], "score": r[2], "feedback": r[3],
                "jitter_delta": r[4], "shimmer_delta": r[5],
                "filler_count": r[6], "gaze_loss": r[7]
            })

        # 3. 유저의 과거 면접 기록 전체 조회 (트렌드 분석)
        history_query = text("""
            SELECT id, overall_score, created_at 
            FROM interview_sessions 
            WHERE user_id = :uid AND overall_score IS NOT NULL AND created_at <= :curr_date
            ORDER BY created_at ASC
        """)
        history_sessions = db.execute(history_query, {"uid": user_id, "curr_date": curr_date}).fetchall()
        
        trend_data = []
        for hs in history_sessions:
            hs_id = hs[0]
            
            # 해당 과거 세션의 평균 떨림 수치 계산
            past_logs = db.execute(
                text("SELECT AVG(jitter_shaken_percentage), AVG(shimmer_shaken_percentage) FROM qa_logs WHERE session_id = :hs_id"), 
                {"hs_id": hs_id}
            ).fetchone()
            
            p_jitter = past_logs[0] if past_logs and past_logs[0] is not None else 0
            p_shimmer = past_logs[1] if past_logs and past_logs[1] is not None else 0
            
            trend_data.append({
                "session_id": str(hs_id),
                "date": hs[2].strftime("%Y-%m-%d %H:%M"),
                "score": hs[1],
                "avg_jitter_shaken": round(float(p_jitter), 2),
                "avg_shimmer_shaken": round(float(p_shimmer), 2)
            })
            
        # 4. 직전 대비 개선도 (Improvement) 계산 및 다이내믹 메시지 생성
        improvement = {
            "score_diff": 0,
            "jitter_diff": 0,
            "message": "첫 면접 완료를 축하합니다! 부족했던 부분을 확인하고 성장을 준비하세요."
        }
        
        if len(trend_data) >= 2:
            prev = trend_data[-2] # 직전 세션
            curr = trend_data[-1] # 현재 세션
            
            score_diff = curr["score"] - prev["score"]
            jitter_diff = curr["avg_jitter_shaken"] - prev["avg_jitter_shaken"]
            
            improvement["score_diff"] = score_diff
            improvement["jitter_diff"] = round(jitter_diff, 2)
            
            if score_diff > 0 and jitter_diff < 0:
                improvement["message"] = f"놀라운 성장입니다! 직전 면접보다 답변 점수는 {score_diff}점 오르고, 목소리 떨림은 {abs(round(jitter_diff, 1))}% 감소해 완벽히 안정된 모습을 보여주셨습니다."
            elif score_diff > 0:
                improvement["message"] = f"좋습니다! 이전보다 답변 수준이 {score_diff}점 상승했습니다. 다음엔 긴장만 조금 더 풀어보세요."
            elif jitter_diff < 0:
                improvement["message"] = f"답변 점수는 아쉽지만, 목소리 떨림이 이전보다 {abs(round(jitter_diff, 1))}%나 줄어 훨씬 차분한 인상을 주었습니다!"
            else:
                improvement["message"] = "이번 면접에서는 조금 긴장하셨던 것 같아요. 피드백을 확인하고 다음을 준비해 봅시다!"

        return {
            "status": "success",
            "overall_score": curr_score,
            "overall_feedback": curr_feedback,
            "details": details,
            "trend_data": trend_data,
            "improvement": improvement
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 🚀 WeasyPrint 대신 안정적인 pdfkit으로 PDF 생성
# ==========================================
@router.get("/{session_id}/pdf")
def download_interview_pdf_report(session_id: str, db: Session = Depends(get_db)):
    """면접 결과를 PDF 리포트로 구워서 반환합니다."""
    try:
        # DB 데이터 조회
        data = get_interview_results(session_id, db)
        
        html_content = f"""
        <!DOCTYPE html>
        <html lang="ko">
        <head>
        <meta charset="UTF-8">
        <style>
            @page {{ size: A4; margin: 15mm; }}
            body {{ font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #333; line-height: 1.6; }}
            h1 {{ color: #2c3e50; text-align: center; border-bottom: 2px solid #3498db; padding-bottom: 10px; }}
            h2 {{ color: #2980b9; margin-top: 30px; }}
            .summary {{ background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }}
            .highlight {{ color: #e74c3c; font-weight: bold; }}
            .question-box {{ margin-bottom: 25px; padding: 15px; border-left: 4px solid #34495e; background: #fff; border: 1px solid #ecf0f1; page-break-inside: avoid; }}
            .badge {{ display: inline-block; padding: 4px 8px; background: #ecf0f1; border-radius: 4px; font-size: 12px; margin-right: 5px; }}
        </style>
        </head>
        <body>
            <h1>AI 면접 분석 종합 리포트</h1>
            
            <div class="summary">
                <h2>📊 면접 종합 요약</h2>
                <p><strong>종합 점수:</strong> {data['overall_score']}점</p>
                <p><strong>AI 코멘트:</strong> {data['improvement']['message']}</p>
            </div>
            
            <h2>🗣️ 상세 문항 분석</h2>
        """
        
        for i, detail in enumerate(data['details']):
            # None 방지 및 줄바꿈 처리
            feedback_text = (detail['feedback'] or '').replace('\n', '<br>')
            html_content += f"""
            <div class="question-box">
                <h3>Q{i+1}. {detail['question']}</h3>
                <p><strong>내 답변:</strong> {detail['user_answer']}</p>
                <p>
                    <span class="badge">채점: {detail['score']}점</span>
                    <span class="badge">음성 흔들림: {round(detail['jitter_delta'], 1)}%</span>
                    <span class="badge highlight">습관어 감지: {detail['filler_count']}회</span>
                    <span class="badge highlight">시선 이탈: {detail['gaze_loss']}회</span>
                </p>
                <p><strong>💡 AI 피드백:</strong><br>{feedback_text}</p>
            </div>
            """
            
        html_content += "</body></html>"
        
        # 1. 시스템에 설치된 wkhtmltopdf 경로 찾기 (기본값)
        wkhtmltopdf_path = r"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe"
        
        if os.path.exists(wkhtmltopdf_path):
            config = pdfkit.configuration(wkhtmltopdf=wkhtmltopdf_path)
        else:
            # 환경변수에 등록되어 있거나 리눅스인 경우
            config = pdfkit.configuration()
            
        options = {
            'page-size': 'A4',
            'margin-top': '15mm',
            'margin-right': '15mm',
            'margin-bottom': '15mm',
            'margin-left': '15mm',
            'encoding': "UTF-8",
            'no-outline': None,
            'enable-local-file-access': None
        }
        
        # 2. PDF 메모리 변환 수행
        pdf_bytes = pdfkit.from_string(html_content, False, configuration=config, options=options)
        
        return Response(
            content=pdf_bytes, 
            media_type='application/pdf',
            headers={"Content-Disposition": f'attachment; filename="AI_Interview_Report_{session_id}.pdf"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF 생성 오류: {str(e)}")


@router.websocket("/ws/{session_id}")
async def websocket_interview_endpoint(
    websocket: WebSocket,
    session_id: str,
    db: Session = Depends(get_db),
):
    """실시간 WebSocket 면접 제어"""
    await websocket.accept()

    result = db.execute(
        text("""
            SELECT questions, job_category
            FROM interview_sessions
            WHERE id = :id
        """),
        {"id": session_id},
    ).fetchone()

    if not result:
        await websocket.close()
        return

    questions_raw = result[0]
    job_category = result[1]

    if isinstance(questions_raw, str):
        questions_list = json.loads(questions_raw)
    else:
        questions_list = questions_raw

    total_questions = len(questions_list)
    current_index = 0
    accumulated_score = 0
    selected_candidates: list[dict] = []
    
    # 시선 이탈(Vision 분석) 카운터 초기화
    current_gaze_loss_count = 0 

    try:
        await websocket.send_json({
            "type": "connection_established",
        })

        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")

            if message_type == "start_interview":
                received_candidates = data.get(
                    "selected_candidates",
                    [],
                )

                selected_candidates = [
                    {
                        "id": candidate.get("id"),
                        "name": candidate.get("name", "지원자"),
                        "description": candidate.get(
                            "description",
                            "",
                        ),
                    }
                    for candidate in received_candidates
                    if isinstance(candidate, dict)
                ]

                await send_next_question(
                    websocket,
                    questions_list[current_index],
                    current_index + 1,
                    total_questions,
                    selected_candidates,
                )

            # 🚀 수정: 프론트엔드에서 주기적으로 전송하는 웹캠 프레임 분석 및 기준점 적용
            elif message_type == "video_frame":
                b64_image = data.get("image", "")
                baseline_nose = data.get("baseline_nose", 0.5)
                baseline_iris = data.get("baseline_iris", 0.5)
                
                if b64_image:
                    try:
                        # 영점 조절된 기준값을 반영하여 시선 이탈 여부 판단
                        if check_gaze_loss(b64_image, baseline_nose, baseline_iris):
                            current_gaze_loss_count += 1
                    except TypeError:
                        # vision_analyzer.py의 check_gaze_loss가 아직 새 파라미터를 받지 못하는 경우 Fallback
                        if check_gaze_loss(b64_image):
                            current_gaze_loss_count += 1

            elif message_type == "submit_answer":
                user_text = data.get(
                    "transcribed_text",
                    "",
                )
                jitter_delta = data.get(
                    "jitter_shaken_percentage",
                    0.0,
                )
                shimmer_delta = data.get(
                    "shimmer_shaken_percentage",
                    0.0,
                )
                wpm_delta = data.get(
                    "speed_difference_wpm",
                    0.0,
                )

                current_q_data = questions_list[current_index]
                # 과거 호환성 고려 (단순 문자열 배열일 경우 대비)
                current_question_text = current_q_data if isinstance(current_q_data, str) else current_q_data.get("question", "")

                rag_result = db.execute(
                    text("""
                        SELECT ideal_answer
                        FROM interview_rag_store
                        WHERE job_category = :job
                        LIMIT 1
                    """),
                    {"job": job_category},
                ).fetchone()

                ideal_answer = (
                    rag_result[0]
                    if rag_result
                    else ""
                )
                
                # 습관어(Filler word) 분석 실행
                filler_count, found_fillers = count_filler_words(user_text)

                evaluation = evaluate_answer_with_llm(
                    current_question_text,
                    user_text,
                    ideal_answer,
                )

                earned_score = evaluation.get("score", 0)
                feedback_text = evaluation.get(
                    "feedback",
                    "오류",
                )
                accumulated_score += earned_score
                
                # 피드백 텍스트에 습관어 및 시선 처리 경고 문구 덧붙이기
                if filler_count > 0:
                    feedback_text += f"\n\n[습관어 교정]: 답변 중 '{', '.join(found_fillers)}' 등의 습관어가 총 {filler_count}회 감지되었습니다. 불필요한 습관어는 전문성을 떨어뜨릴 수 있으니 유의해 주세요."
                if current_gaze_loss_count >= 3:
                    feedback_text += f"\n\n[태도 교정]: 답변 중 화면 밖으로 시선이 벗어난 횟수가 {current_gaze_loss_count}회 감지되었습니다. 면접관과 눈을 맞추듯 렌즈를 응시하세요."

                log_query = text("""
                    INSERT INTO qa_logs (
                        session_id,
                        question,
                        transcribed_text,
                        jitter_shaken_percentage,
                        shimmer_shaken_percentage,
                        speed_difference_wpm,
                        score,
                        feedback,
                        filler_word_count,
                        gaze_loss_count
                    )
                    VALUES (
                        :session_id,
                        :question,
                        :transcribed_text,
                        :jitter,
                        :shimmer,
                        :wpm,
                        :score,
                        :feedback,
                        :filler,
                        :gaze
                    )
                """)

                db.execute(
                    log_query,
                    {
                        "session_id": session_id,
                        "question": current_question_text,
                        "transcribed_text": user_text,
                        "jitter": jitter_delta,
                        "shimmer": shimmer_delta,
                        "wpm": wpm_delta,
                        "score": earned_score,
                        "feedback": feedback_text,
                        "filler": filler_count,
                        "gaze": current_gaze_loss_count,
                    },
                )
                db.commit()

                await websocket.send_json({
                    "type": "qa_feedback",
                    "question": current_question_text,
                    "score": earned_score,
                    "feedback": feedback_text,
                })

                current_index += 1
                current_gaze_loss_count = 0 # 다음 문항을 위해 시선 이탈 횟수 초기화

                if current_index < total_questions:
                    await send_next_question(
                        websocket,
                        questions_list[current_index],
                        current_index + 1,
                        total_questions,
                        selected_candidates,
                    )
                else:
                    final_avg_score = int(
                        accumulated_score / total_questions
                    )

                    db.execute(
                        text("""
                            UPDATE interview_sessions
                            SET overall_score = :score
                            WHERE id = :id
                        """),
                        {
                            "score": final_avg_score,
                            "id": session_id,
                        },
                    )
                    db.commit()

                    await websocket.send_json({
                        "type": "interview_completed",
                    })

    except WebSocketDisconnect:
        print("연결 종료")