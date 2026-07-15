import os
import uuid
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import text
from schemas import BaselineRequest
from database import get_db
from audio_analyzer import extract_voice_metrics
from llm import process_audio_to_text

router = APIRouter(
    prefix="/profiles",
    tags=["Profiles"]
)

@router.post("/baseline")
def register_user_baseline(data: BaselineRequest, db: Session = Depends(get_db)):
    """(기존) 수동 텍스트 기반 베이스라인 적재"""
    try:
        query = text("""
            INSERT INTO profiles (id, email, baseline_jitter, baseline_shimmer, baseline_wpm)
            VALUES (:id, :email, :jitter, :shimmer, :wpm)
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                baseline_jitter = EXCLUDED.baseline_jitter,
                baseline_shimmer = EXCLUDED.baseline_shimmer,
                baseline_wpm = EXCLUDED.baseline_wpm
            RETURNING id;
        """)
        
        db.execute(query, {
            "id": data.user_id,
            "email": data.email,
            "jitter": data.baseline_jitter,
            "shimmer": data.baseline_shimmer,
            "wpm": data.baseline_wpm
        })
        db.commit()
        
        return {"status": "success", "message": f"유저 {data.user_id}의 베이스라인 등록 완료"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"프로필 데이터베이스 적재 실패: {str(e)}")

@router.post("/baseline/audio")
async def register_user_baseline_via_audio(
    user_id: str = Form(...),
    email: str = Form(""),
    audio_file: UploadFile = File(...), 
    db: Session = Depends(get_db)
):
    """(신규) 1분 평음 오디오 파일을 직접 업로드받아 분석 후 DB에 저장합니다."""
    temp_path = f"temp_baseline_{uuid.uuid4()}.webm"
    try:
        # 1. 파일 임시 저장
        with open(temp_path, "wb") as buffer:
            buffer.write(await audio_file.read())
            
        # 2. STT 변환 및 물리 파동 분석
        transcribed_text = process_audio_to_text(temp_path)
        metrics = extract_voice_metrics(temp_path, transcribed_text)
        
        # 3. DB 저장 (Upsert)
        query = text("""
            INSERT INTO profiles (id, email, baseline_jitter, baseline_shimmer, baseline_wpm)
            VALUES (:id, :email, :jitter, :shimmer, :wpm)
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                baseline_jitter = EXCLUDED.baseline_jitter,
                baseline_shimmer = EXCLUDED.baseline_shimmer,
                baseline_wpm = EXCLUDED.baseline_wpm
        """)
        db.execute(query, {
            "id": user_id,
            "email": email,
            "jitter": metrics["jitter"],
            "shimmer": metrics["shimmer"],
            "wpm": metrics["wpm"]
        })
        db.commit()
        
        return {
            "status": "success",
            "message": "오디오 기반 평음 측정이 성공적으로 완료되었습니다.",
            "baseline_data": metrics,
            "stt_result": transcribed_text
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)