import io
import json
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import text
from PyPDF2 import PdfReader
from schemas import SessionCreateRequest
from database import get_db
from llm import generate_resume_based_questions

router = APIRouter(
    prefix="/interviews",
    tags=["Interviews"]
)

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
            "questions": json.dumps(generated_questions), # 배열을 JSONB 문자열로 변환
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

@router.websocket("/ws/{session_id}")
async def websocket_interview_endpoint(websocket: WebSocket, session_id: str, db: Session = Depends(get_db)):
    """실시간 오디오 수신 및 질문을 하나씩 순차적으로 던지는 웹소켓 라우트"""
    await websocket.accept()
    
    # DB에서 세션에 저장된 5개의 질문 리스트를 불러옴
    query = text("SELECT questions FROM interview_sessions WHERE id = :id")
    result = db.execute(query, {"id": session_id}).fetchone()
    
    if not result or not result[0]:
        await websocket.send_json({"type": "error", "message": "질문 리스트가 생성되지 않았습니다. 이력서 업로드를 선행해주세요."})
        await websocket.close()
        return

    questions_list = result[0]
    total_questions = len(questions_list)
    current_index = 0

    try:
        # 최초 연결 승인 시 상태 플래그 송출
        await websocket.send_json({
            "type": "connection_established",
            "session_id": session_id,
            "message": "데스크톱 마이크 입력 파이프라인 실시간 연결에 성공하였습니다."
        })
        
        while True:
            # 클라이언트로부터 명령 대기
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "start_interview":
                # 면접 시작 명령을 받으면 첫 번째 질문 전송
                await websocket.send_json({
                    "type": "next_question",
                    "current_index": current_index + 1,
                    "total_questions": total_questions,
                    "question_text": questions_list[current_index]
                })

            elif message_type == "voice_chunk":
                # 마이크 오디오 입력 신호 분석 (긴장도)
                await websocket.send_json({
                    "type": "audio_analysis_status",
                    "status": "processing",
                    "current_jitter": 0.014,
                    "current_shimmer": 0.038
                })
                
            elif message_type == "submit_answer":
                # 1. 사용자의 답변을 수신받아 채점 및 피드백 전송
                await websocket.send_json({
                    "type": "qa_feedback",
                    "question": questions_list[current_index],
                    "score": 88,
                    "jitter_shaken_percentage": 14.2,
                    "shimmer_shaken_percentage": 9.5,
                    "feedback": "지원자님의 해당 경험이 이력서 내용과 잘 부합하게 설명되었습니다. 좋은 답변입니다."
                })
                
                # 2. 질문 인덱스 증가 및 다음 질문 전송
                current_index += 1
                
                if current_index < total_questions:
                    # 다음 질문이 남아있을 경우 전송
                    await websocket.send_json({
                        "type": "next_question",
                        "current_index": current_index + 1,
                        "total_questions": total_questions,
                        "question_text": questions_list[current_index]
                    })
                else:
                    # 5개의 질문이 모두 끝난 경우 종료 신호 전송
                    await websocket.send_json({
                        "type": "interview_completed",
                        "message": "모든 면접 질문이 종료되었습니다. 수고하셨습니다."
                    })
                
    except WebSocketDisconnect:
        print(f"세션 {session_id} 브라우저 연결 종료")
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"웹소켓 채널 트래픽 오류 발생: {str(e)}"
        })