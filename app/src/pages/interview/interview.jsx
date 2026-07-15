/* interview.jsx */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../../config/apiConfig';
import '../../index.css';
import './interview.css';

function Interview() {
    const navigate = useNavigate();

    const fileInputRef = useRef(null);
    const chatEndRef = useRef(null);
    const recordingTimerRef = useRef(null);
    const websocketRef = useRef(null);
    const sessionCreatedRef = useRef(false);

    const [userId, setUserId] = useState('');
    const [step, setStep] = useState('loading');
    const [sessionId, setSessionId] = useState('');
    const [resumeName, setResumeName] = useState('');

    const [questionIndex, setQuestionIndex] = useState(0);
    const [totalQuestions, setTotalQuestions] = useState(0);

    const [isRecordingAnswer, setIsRecordingAnswer] = useState(false);
    const [isResumeUploading, setIsResumeUploading] = useState(false);

    const [hasExistingResume, setHasExistingResume] = useState(false);
    const [isResumeChecking, setIsResumeChecking] = useState(false);

    // 나중에 제거
    const [answerMode, setAnswerMode] = useState('voice');
    const [answerText, setAnswerText] = useState('');

    const [messages, setMessages] = useState([
        {
            id: 1,
            type: 'system',
            text: '면접 세션을 준비하고 있습니다.',
        },
    ]);

    const addMessage = (type, text) => {
        setMessages((prev) => [
            ...prev,
            {
                id: `${Date.now()}-${Math.random()}`,
                type,
                text,
            },
        ]);
    };

    /*
     * HTTP 주소를 WebSocket 주소로 변경
     *
     * http://localhost:8001
     * → ws://localhost:8001
     */
    const getWebSocketUrl = () => {
        return API_BASE_URL
            .replace(/^http:/, 'ws:')
            .replace(/^https:/, 'wss:');
    };

    // 1. 면접 페이지 진입 시 백엔드 세션 생성
    const createInterviewSession = async () => {
        try {
            // 로그인할 때 저장한 사용자 정보에 맞춰 사용합니다.
            const savedUser = localStorage.getItem('user');
            const parsedUser = savedUser
                ? JSON.parse(savedUser)
                : null;

            const userId =
                localStorage.getItem('user_id') ||
                localStorage.getItem('userId') ||
                parsedUser?.user_id ||
                parsedUser?.id;

            if (!userId) {
                throw new Error(
                    '로그인 사용자 정보를 찾을 수 없습니다.',
                );
            }

            const response = await fetch(
                `${API_BASE_URL}/interviews/session`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        user_id: userId,

                        // 현재는 백엔드 테스트용 고정 직무
                        job_category: '프론트엔드 개발자',
                    }),
                },
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    '면접 세션 생성에 실패했습니다.',
                );
            }

            setUserId(userId);
            setSessionId(data.session_id);
            await checkExistingResume(userId);
            setStep('record');

            addMessage(
                'system',
                '면접 준비가 완료되었습니다. 음성 등록을 진행해주세요.',
            );
        } catch (error) {
            console.error('면접 세션 생성 오류:', error);

            setStep('error');

            addMessage(
                'system',
                error.message ||
                '면접 세션을 생성하는 중 오류가 발생했습니다.',
            );
        }
    };

    const checkExistingResume = async (currentUserId) => {
        setIsResumeChecking(true);

        try {
            const response = await fetch(
                `${API_BASE_URL}/interviews/resume/${currentUserId}`,
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    '기존 이력서를 확인하지 못했습니다.',
                );
            }

            setHasExistingResume(data.has_resume);
        } catch (error) {
            console.error('기존 이력서 조회 오류:', error);
            setHasExistingResume(false);
        } finally {
            setIsResumeChecking(false);
        }
    };

    const handleUseExistingResume = async () => {
        if (!sessionId || !userId || isResumeUploading) {
            return;
        }

        setIsResumeUploading(true);

        addMessage(
            'system',
            '기존에 등록한 이력서를 불러와 분석하고 있습니다.',
        );

        try {
            const response = await fetch(
                `${API_BASE_URL}/interviews/${sessionId}/use-existing-resume?user_id=${encodeURIComponent(userId)}`,
                {
                    method: 'POST',
                },
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    '기존 이력서를 사용하는 데 실패했습니다.',
                );
            }

            setResumeName('기존 등록 이력서');

            addMessage(
                'system',
                `기존 이력서를 바탕으로 ${data.question_count}개의 면접 질문이 생성되었습니다.`,
            );

            connectWebSocket();
        } catch (error) {
            console.error('기존 이력서 사용 오류:', error);

            addMessage(
                'system',
                error.message ||
                '기존 이력서를 처리하는 중 오류가 발생했습니다.',
            );
        } finally {
            setIsResumeUploading(false);
        }
    };

    // 2. 음성 등록
    const handleRecord = () => {
        addMessage(
            'system',
            '음성 등록이 완료되었습니다. 이제 PDF 이력서를 업로드해주세요.',
        );

        setStep('resume');
    };

    // 3. 실제 파일 선택창 열기
    const handleResumeButton = () => {
        if (!sessionId || isResumeUploading) {
            return;
        }

        fileInputRef.current?.click();
    };

    // 4. PDF를 백엔드로 업로드
    // 선택된 이력서 파일을 현재 면접 세션에 전송 
    const uploadResumeFile = async (file) => {
        if (!file) {
            addMessage(
                'system',
                '사용할 이력서 파일이 없습니다.',
            );
            return;
        }

        if (!sessionId) {
            addMessage(
                'system',
                '면접 세션이 생성되지 않았습니다.',
            );
            return;
        }

        setResumeName(file.name);
        setIsResumeUploading(true);

        addMessage(
            'system',
            `이력서 "${file.name}"를 분석하고 있습니다.`,
        );

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(
                `${API_BASE_URL}/interviews/${sessionId}/upload-resume`,
                {
                    method: 'POST',
                    body: formData,
                },
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    '이력서 업로드에 실패했습니다.',
                );
            }

            addMessage(
                'system',
                `${data.question_count}개의 맞춤 면접 질문이 생성되었습니다.`,
            );

            connectWebSocket();
        } catch (error) {
            console.error('이력서 업로드 오류:', error);

            addMessage(
                'system',
                error.message ||
                '이력서를 처리하는 중 오류가 발생했습니다.',
            );
        } finally {
            setIsResumeUploading(false);
        }
    };

    // 새 이력서 선택
    const handleResumeChange = async (event) => {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        if (!file.name.toLowerCase().endsWith('.pdf')) {
            addMessage(
                'system',
                'PDF 형식의 이력서만 업로드할 수 있습니다.',
            );

            event.target.value = '';
            return;
        }

        await uploadResumeFile(file);

        // 같은 파일을 다시 선택할 수 있도록 초기화
        event.target.value = '';
    };

    // 5. 백엔드 WebSocket 연결
    const connectWebSocket = () => {
        if (!sessionId) {
            addMessage(
                'system',
                '면접 세션 정보가 없습니다.',
            );
            return;
        }

        if (websocketRef.current) {
            websocketRef.current.close();
        }

        const websocketUrl =
            `${getWebSocketUrl()}/interviews/ws/${sessionId}`;

        const websocket = new WebSocket(websocketUrl);

        websocketRef.current = websocket;

        websocket.onopen = () => {
            console.log('WebSocket 연결 성공');
        };

        websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                console.log('WebSocket 수신:', data);

                if (data.type === 'connection_established') {
                    /*
                     * 백엔드는 start_interview를 받은 후
                     * 첫 번째 질문을 전송합니다.
                     */
                    websocket.send(
                        JSON.stringify({
                            type: 'start_interview',
                        }),
                    );

                    return;
                }

                if (data.type === 'next_question') {
                    setQuestionIndex(data.current_index - 1);
                    setTotalQuestions(data.total_questions);
                    setStep('answer');

                    addMessage(
                        'interviewer',
                        data.question_text,
                    );

                    return;
                }

                if (data.type === 'audio_analysis_status') {
                    console.log(
                        'Jitter:',
                        data.current_jitter,
                    );
                    console.log(
                        'Shimmer:',
                        data.current_shimmer,
                    );

                    return;
                }

                if (data.type === 'qa_feedback') {
                    addMessage(
                        'system',
                        `답변 평가 ${data.score}점\n${data.feedback}`,
                    );

                    return;
                }

                if (data.type === 'interview_completed') {
                    setStep('complete');

                    addMessage(
                        'system',
                        data.message ||
                        '모든 면접 질문이 완료되었습니다.',
                    );

                    return;
                }

                if (data.type === 'error') {
                    addMessage(
                        'system',
                        data.message ||
                        '면접 진행 중 오류가 발생했습니다.',
                    );
                }
            } catch (error) {
                console.error(
                    'WebSocket 메시지 처리 오류:',
                    error,
                );
            }
        };

        websocket.onerror = (error) => {
            console.error('WebSocket 오류:', error);

            addMessage(
                'system',
                '면접 서버와 실시간 연결하는 데 실패했습니다.',
            );
        };

        websocket.onclose = () => {
            console.log('WebSocket 연결 종료');
        };
    };

    /*
     * 6. 답변 녹음 버튼
     *
     * 아직 실제 녹음 기능은 연결하지 않고,
     * 녹음 UI를 2초간 표시한 후
     * 백엔드에 submit_answer 신호만 보냅니다.
     */
    const handleRecordAnswer = () => {
        if (step !== 'answer' || isRecordingAnswer) {
            return;
        }

        const websocket = websocketRef.current;

        if (
            !websocket ||
            websocket.readyState !== WebSocket.OPEN
        ) {
            addMessage(
                'system',
                '면접 서버 연결이 끊어졌습니다.',
            );
            return;
        }

        setIsRecordingAnswer(true);

        websocket.send(
            JSON.stringify({
                type: 'voice_chunk',
            }),
        );

        recordingTimerRef.current = setTimeout(() => {
            addMessage(
                'user',
                '음성 답변이 제출되었습니다.',
            );

            websocket.send(
                JSON.stringify({
                    type: 'submit_answer',
                }),
            );

            setIsRecordingAnswer(false);
        }, 2000);
    };

    /*
     * 현재 테스트용 텍스트 답변 제출
     *
     * 추후 음성인식 기능이 완성되면
     * STT 결과를 answerText에 넣거나
     * handleRecordAnswer를 다시 활성화
     */
    const handleSubmitTextAnswer = () => {
        const trimmedAnswer = answerText.trim();

        if (step !== 'answer') {
            return;
        }

        if (!trimmedAnswer) {
            addMessage(
                'system',
                '답변 내용을 입력해주세요.',
            );
            return;
        }

        const websocket = websocketRef.current;

        if (
            !websocket ||
            websocket.readyState !== WebSocket.OPEN
        ) {
            addMessage(
                'system',
                '면접 서버 연결이 끊어졌습니다.',
            );
            return;
        }

        addMessage('user', trimmedAnswer);

        websocket.send(
            JSON.stringify({
                type: 'submit_answer',
                answer_text: trimmedAnswer,
            }),
        );

        setAnswerText('');
    };

    const handleAnswerKeyDown = (event) => {
        if (event.key === 'Enter' && event.ctrlKey) {
            event.preventDefault();
            handleSubmitTextAnswer();
        }
    };

    const renderActionButton = () => {
        if (step === 'loading') {
            return (
                <button
                    type="button"
                    className="interview-action-button record-button"
                    disabled
                >
                    면접 준비 중...
                </button>
            );
        }

        if (step === 'error') {
            return (
                <button
                    type="button"
                    className="interview-action-button complete-button"
                    onClick={() => navigate('/', { replace: true })}
                >
                    메인으로 돌아가기
                </button>
            );
        }

        if (step === 'record') {
            return (
                <button
                    type="button"
                    className="interview-action-button record-button"
                    onClick={handleRecord}
                >
                    <span className="action-icon">●</span>
                    음성 등록
                </button>
            );
        }

        if (step === 'resume') {
            if (isResumeChecking) {
                return (
                    <button
                        type="button"
                        className="interview-action-button resume-button"
                        disabled
                    >
                        기존 이력서 확인 중...
                    </button>
                );
            }

            if (hasExistingResume) {
                return (
                    <div className="resume-choice-area">
                        <div className="existing-resume-card">
                            <span className="existing-resume-icon">
                                📄
                            </span>

                            <div>
                                <strong>등록된 이력서가 있습니다.</strong>
                                <p>
                                    기존 이력서를 사용하거나 새 PDF를 업로드해주세요.
                                </p>
                            </div>
                        </div>

                        <div className="resume-choice-buttons">
                            <button
                                type="button"
                                className="interview-action-button resume-button"
                                onClick={handleUseExistingResume}
                                disabled={isResumeUploading}
                            >
                                {isResumeUploading
                                    ? '이력서 분석 중...'
                                    : '기존 이력서 사용'}
                            </button>

                            <button
                                type="button"
                                className="interview-action-button resume-change-button"
                                onClick={handleResumeButton}
                                disabled={isResumeUploading}
                            >
                                새 이력서 업로드
                            </button>
                        </div>
                    </div>
                );
            }

            return (
                <button
                    type="button"
                    className="interview-action-button resume-button"
                    onClick={handleResumeButton}
                    disabled={isResumeUploading}
                >
                    {isResumeUploading
                        ? '이력서 분석 중...'
                        : '이력서 업로드'}
                </button>
            );
        }

        if (step === 'answer') {
            return (
                <div className="answer-action-area">
                    {answerMode === 'voice' && (
                        <button
                            type="button"
                            className={`interview-action-button answer-button voice-answer-button ${isRecordingAnswer ? 'recording' : ''
                                }`}
                            onClick={handleRecordAnswer}
                            disabled={isRecordingAnswer}
                        >
                            <span className="action-icon">
                                {isRecordingAnswer ? '●' : '🎙'}
                            </span>

                            {isRecordingAnswer
                                ? '답변 녹음 중...'
                                : '답변 녹음 시작'}
                        </button>
                    )}

                    {answerMode === 'text' && (
                        <div className="text-answer-row">
                            <textarea
                                className="answer-textarea"
                                value={answerText}
                                onChange={(event) =>
                                    setAnswerText(event.target.value)
                                }
                                onKeyDown={handleAnswerKeyDown}
                                placeholder="면접 질문에 대한 답변을 입력해주세요."
                                rows={3}
                            />

                            <button
                                type="button"
                                className="answer-submit-button"
                                onClick={handleSubmitTextAnswer}
                                disabled={!answerText.trim()}
                            >
                                답변 제출
                            </button>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <button
                type="button"
                className="interview-action-button complete-button"
                onClick={() =>
                    navigate('/', { replace: true })
                }
            >
                면접 완료
            </button>
        );
    };

    // 페이지 최초 진입 시 면접 세션 생성
    useEffect(() => {
        if (sessionCreatedRef.current) {
            return;
        }

        sessionCreatedRef.current = true;

        createInterviewSession();
    }, []);

    // 메시지 추가 시 채팅창 아래로 이동
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'end',
        });
    }, [messages, isRecordingAnswer]);

    // 컴포넌트 종료 시 타이머 및 WebSocket 정리     
    useEffect(() => {
        return () => {
            if (recordingTimerRef.current) {
                clearTimeout(recordingTimerRef.current);
            }

            if (websocketRef.current) {
                websocketRef.current.close();
                websocketRef.current = null;
            }
        };
    }, []);

    return (
        <main className="interview-page">
            <div className="temporary-mode-toggle">
                <span>임시 답변 모드</span>

                <button
                    type="button"
                    className={answerMode === 'voice' ? 'active' : ''}
                    onClick={() => setAnswerMode('voice')}
                    disabled={isRecordingAnswer}
                >
                    음성
                </button>

                <button
                    type="button"
                    className={answerMode === 'text' ? 'active' : ''}
                    onClick={() => setAnswerMode('text')}
                    disabled={isRecordingAnswer}
                >
                    텍스트
                </button>
            </div>

            <section className="interview-left">
                <div className="interview-status">
                    <span
                        className={`status-dot ${isRecordingAnswer
                            ? 'recording'
                            : ''
                            }`}
                    />

                    {step === 'loading' && '면접 준비 중'}
                    {step === 'error' && '연결 오류'}
                    {step === 'record' && '음성 등록 전'}
                    {step === 'resume' &&
                        (isResumeUploading
                            ? '이력서 분석 중'
                            : '이력서 업로드 대기')}

                    {step === 'answer' &&
                        (isRecordingAnswer
                            ? '답변 녹음 중'
                            : `${questionIndex + 1} / ${totalQuestions || '-'
                            } 질문`)}

                    {step === 'complete' && '면접 완료'}
                </div>

                <div className="left-bottom-area">
                    {resumeName && (
                        <div className="resume-file">
                            현재 이력서: {resumeName}
                        </div>
                    )}

                    {step === 'answer' && answerMode === 'voice' && (
                        <div className="answer-recording-box">
                            <div
                                className={`answer-recording-icon ${isRecordingAnswer
                                    ? 'recording'
                                    : ''
                                    }`}
                            >
                                🎙
                            </div>

                            <div>
                                <strong>
                                    {isRecordingAnswer
                                        ? '답변을 녹음하고 있습니다.'
                                        : '음성으로 답변해주세요.'}
                                </strong>

                                <p>
                                    {isRecordingAnswer
                                        ? '답변을 말씀해주세요. 음성이 자동으로 인식됩니다.'
                                        : '버튼을 누른 후 면접 질문에 답변해주세요.'}
                                </p>
                            </div>
                        </div>
                    )}

                    {step === 'answer' && answerMode === 'text' && (
                        <div className="answer-recording-box text-mode-guide">
                            <div className="answer-recording-icon">
                                ✏️
                            </div>

                            <div>
                                <strong>텍스트로 답변해주세요.</strong>

                                <p>
                                    답변을 작성한 후 오른쪽의 제출 버튼을 눌러주세요.
                                </p>
                            </div>
                        </div>
                    )}

                    {renderActionButton()}

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        className="hidden-file-input"
                        onChange={handleResumeChange}
                    />
                </div>
            </section>

            <aside className="interview-right">
                <section className="user-camera-area">
                    <div className="camera-placeholder">
                        <span className="camera-icon">▣</span>
                        <p>사용자 화면</p>
                    </div>
                </section>

                <section className="chat-area">
                    <div className="chat-header">
                        <div>
                            <strong>AI 면접관</strong>

                            <span>
                                {step === 'complete'
                                    ? '면접 종료'
                                    : '면접 진행 중'}
                            </span>
                        </div>
                    </div>

                    <div className="chat-messages">
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`chat-message ${message.type}`}
                            >
                                {message.type ===
                                    'interviewer' && (
                                        <span className="message-name">
                                            면접관
                                        </span>
                                    )}

                                {message.type === 'user' && (
                                    <span className="message-name">
                                        나
                                    </span>
                                )}

                                <div className="message-bubble">
                                    {message.text}
                                </div>
                            </div>
                        ))}

                        {isRecordingAnswer && (
                            <div className="chat-message system">
                                <div className="message-bubble recording-message">
                                    <span className="recording-dot" />
                                    음성을 인식하고 있습니다...
                                </div>
                            </div>
                        )}

                        <div ref={chatEndRef} />
                    </div>
                </section>
            </aside>
        </main>
    );
}

export default Interview;