from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from schemas import SessionCreateRequest, QuestionGenerateRequest
from database import get_db
from llm import generate_interview_questions

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

@router.post("/generate-questions")
def get_ai_questions(data: QuestionGenerateRequest):
    """LLM을 활용하여 직무 맞춤형 질문 5개 실시간 생성 API"""
    questions = generate_interview_questions(data.job_category)
    
    return {
        "status": "success",
        "job_category": data.job_category,
        "questions": questions
    }

@router.websocket("/ws/{session_id}")
async def websocket_interview_endpoint(websocket: WebSocket, session_id: str):
    """실시간 오디오 수신 및 STT/OpenSMILE 분석 큐 전개용 웹소켓 라우트"""
    await websocket.accept()
    try:
        # 최초 연결 승인 시 상태 플래그 송출
        await websocket.send_json({
            "type": "connection_established",
            "session_id": session_id,
            "message": "데스크톱 마이크 입력 파이프라인 실시간 연결에 성공하였습니다."
        })
        
        while True:
            # 클라이언트(웹 브라우저)로부터 JSON 메시지 대기 및 수집
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "voice_chunk":
                # 마이크 오디오 입력 신호 발생 시 피드백 수치 파싱 시뮬레이션
                await websocket.send_json({
                    "type": "audio_analysis_status",
                    "status": "processing",
                    "current_jitter": 0.014,
                    "current_shimmer": 0.038
                })
                
            elif message_type == "submit_answer":
                # 사용자가 최종 발화를 마치고 답변 평가를 요청했을 때의 시뮬레이션 데이터 전송
                await websocket.send_json({
                    "type": "qa_feedback",
                    "question": data.get("question"),
                    "score": 88,
                    "jitter_shaken_percentage": 14.2,
                    "shimmer_shaken_percentage": 9.5,
                    "feedback": "STAR 구조에 근거한 본인의 구체적인 갈등 해결 과정은 훌륭히 진술되었습니다. 다만, 기술적 성과 결과 수치를 조금 더 정확히 보강해 보세요."
                })
                
    except WebSocketDisconnect:
        print(f"세션 {session_id} 브라우저 연결 종료")
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"웹소켓 채널 트래픽 오류 발생: {str(e)}"
        })