import base64
import io
import json
import os
import uuid
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from PyPDF2 import PdfReader
from schemas import SessionCreateRequest
from database import get_db
from audio_analyzer import extract_voice_metrics, calculate_delta
from musetalk_client import synthesize_avatar_video
from llm import (
    generate_resume_based_questions,
    evaluate_answer_with_llm,
    process_audio_to_text,
    generate_text_to_speech
)
import subprocess

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


async def send_next_question(websocket: WebSocket, question_text: str, current_index: int, total_questions: int):
    """
    질문 텍스트를 TTS로 음성 변환한 뒤 Colab MuseTalk 서버로 보내 립싱크 아바타 영상을 받아오고,
    질문 텍스트 + 영상(base64)을 함께 프론트로 전송합니다.
    MuseTalk 호출이 실패해도(Colab 미기동 등) 영상 없이 텍스트만으로 인터뷰가 계속되도록 처리합니다.
    """
    payload = {
        "type": "next_question",
        "current_index": current_index,
        "total_questions": total_questions,
        "question_text": question_text,
        "avatar_video_base64": None,
    }

    tts_path = f"temp_question_tts_{uuid.uuid4()}.mp3"
    try:
        generate_text_to_speech(question_text, tts_path)
        if os.path.exists(tts_path):
            video_bytes = await synthesize_avatar_video(tts_path)
            if video_bytes:
                payload["avatar_video_base64"] = base64.b64encode(video_bytes).decode("utf-8")
    except Exception as e:
        print(f"[interviews] 아바타 영상 생성 중 오류 (텍스트만으로 계속 진행): {e}")
    finally:
        if os.path.exists(tts_path):
            os.remove(tts_path)

    await websocket.send_json(payload)


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

        # 3. LLM을 통한 맞춤형 5가지 질문 생성
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
    """텍스트를 받아 음성 파일(mp3)로 반환"""
    text = text_payload.get("text", "")
    file_id = uuid.uuid4()
    temp_path = f"temp_tts_{file_id}.mp3"
    try:
        output_file = generate_text_to_speech(text, temp_path)
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

        # 2. 현재 세션의 상세 로그 조회
        logs = db.execute(
            text("SELECT question, transcribed_text, score, feedback, jitter_shaken_percentage, shimmer_shaken_percentage FROM qa_logs WHERE session_id = :s ORDER BY created_at ASC"), 
            {"s": session_id}
        ).fetchall()
        
        details = []
        for r in logs:
            details.append({
                "question": r[0], "user_answer": r[1], "score": r[2], "feedback": r[3],
                "jitter_delta": r[4], "shimmer_delta": r[5]
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


@router.websocket("/ws/{session_id}")
async def websocket_interview_endpoint(websocket: WebSocket, session_id: str, db: Session = Depends(get_db)):
    """실시간 웹소켓 면접 제어"""
    await websocket.accept()
    
    result = db.execute(text("SELECT questions, job_category FROM interview_sessions WHERE id = :id"), {"id": session_id}).fetchone()
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

    try:
        await websocket.send_json({"type": "connection_established"})
        
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "start_interview":
                await send_next_question(websocket, questions_list[current_index], current_index + 1, total_questions)

            elif message_type == "submit_answer":
                user_text = data.get("transcribed_text", "")
                jitter_delta = data.get("jitter_shaken_percentage", 0.0)
                shimmer_delta = data.get("shimmer_shaken_percentage", 0.0)
                wpm_delta = data.get("speed_difference_wpm", 0.0)
                
                current_question = questions_list[current_index]

                rag_result = db.execute(text("SELECT ideal_answer FROM interview_rag_store WHERE job_category = :job LIMIT 1"), {"job": job_category}).fetchone()
                ideal_answer = rag_result[0] if rag_result else ""

                evaluation = evaluate_answer_with_llm(current_question, user_text, ideal_answer)
                earned_score, feedback_text = evaluation.get("score", 0), evaluation.get("feedback", "오류")
                accumulated_score += earned_score

                log_query = text("""
                    INSERT INTO qa_logs (session_id, question, transcribed_text, 
                                         jitter_shaken_percentage, shimmer_shaken_percentage, 
                                         speed_difference_wpm, score, feedback)
                    VALUES (:session_id, :question, :transcribed_text, 
                            :jitter, :shimmer, :wpm, :score, :feedback)
                """)
                db.execute(log_query, {
                    "session_id": session_id, "question": current_question, "transcribed_text": user_text,
                    "jitter": jitter_delta, "shimmer": shimmer_delta, "wpm": wpm_delta,
                    "score": earned_score, "feedback": feedback_text
                })
                db.commit()

                await websocket.send_json({
                    "type": "qa_feedback", "question": current_question, "score": earned_score, "feedback": feedback_text
                })
                
                current_index += 1
                if current_index < total_questions:
                    await send_next_question(websocket, questions_list[current_index], current_index + 1, total_questions)
                else:
                    final_avg_score = int(accumulated_score / total_questions)
                    db.execute(text("UPDATE interview_sessions SET overall_score = :score WHERE id = :id"), {"score": final_avg_score, "id": session_id})
                    db.commit()
                    await websocket.send_json({"type": "interview_completed"})
                
    except WebSocketDisconnect:
        print("연결 종료")