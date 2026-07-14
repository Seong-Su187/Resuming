/* main.jsx */
import { useEffect, useRef, useState } from 'react';
import '../../index.css';
import './main.css';

const interviewQuestions = [
    '간단하게 자기소개를 해주세요.',
    '지원한 직무에 관심을 가지게 된 계기는 무엇인가요?',
    '본인의 강점과 약점을 한 가지씩 말씀해주세요.',
    '팀 프로젝트에서 갈등을 해결했던 경험을 말씀해주세요.',
    '마지막으로 하고 싶은 말이 있나요?',
];

/* 백엔드 연결 전 테스트용 가상 음성 답변 */
const mockAnswers = [
    '안녕하세요. 저는 사용자 관점에서 문제를 발견하고, 이를 실제 서비스로 구현하는 개발자입니다. 프론트엔드와 백엔드 개발 경험을 바탕으로 원활하게 협업하며 프로젝트를 완성해 왔습니다.',
    '팀 프로젝트를 진행하면서 사용자의 불편을 기술로 해결하는 과정에 매력을 느껴 지원한 직무에 관심을 가지게 되었습니다.',
    '저의 강점은 맡은 업무를 끝까지 책임지고 완성하는 점입니다. 반면 여러 가지 업무를 한 번에 처리하려는 경향이 있어, 최근에는 우선순위를 정해서 업무를 진행하고 있습니다.',
    '팀원 간 의견 충돌이 있었을 때 각 의견의 장단점을 정리하고, 프로젝트 목표와 일정에 가장 적합한 방식을 기준으로 해결한 경험이 있습니다.',
    '이번 면접을 통해 제가 가진 경험과 성장 가능성을 보여드릴 수 있어 감사했습니다. 입사 후에도 빠르게 배우고 팀에 기여하는 개발자가 되겠습니다.',
];

function Main() {
    const fileInputRef = useRef(null);
    const chatEndRef = useRef(null);
    const recordingTimerRef = useRef(null);

    const [step, setStep] = useState('record');
    const [resumeName, setResumeName] = useState('');
    const [questionIndex, setQuestionIndex] = useState(0);
    const [isRecordingAnswer, setIsRecordingAnswer] = useState(false);

    const [messages, setMessages] = useState([
        {
            id: 1,
            type: 'system',
            text: '면접을 시작하려면 먼저 음성 등록을 진행해주세요.',
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

    const handleRecord = () => {
        addMessage(
            'system',
            '음성 등록이 완료되었습니다. 이제 이력서를 업로드해주세요.',
        );

        setStep('resume');
    };

    const handleResumeButton = () => {
        // 실제 파일 선택창을 사용할 경우 아래 주석을 해제하세요.
        // fileInputRef.current?.click();

        const fixedResumeName = '인터뷰)이력서.pdf';

        setResumeName(fixedResumeName);

        addMessage(
            'system',
            `이력서 "${fixedResumeName}"가 업로드되었습니다.`,
        );

        addMessage('interviewer', interviewQuestions[0]);

        setQuestionIndex(0);
        setStep('answer');
    };

    const handleResumeChange = (event) => {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        setResumeName(file.name);

        addMessage('system', `이력서 "${file.name}"가 업로드되었습니다.`);
        addMessage('interviewer', interviewQuestions[0]);

        setQuestionIndex(0);
        setStep('answer');
    };

    /*
     * 테스트용 음성 답변 처리
     * 버튼을 누르면 녹음 중 상태를 보여준 뒤
     * 현재 질문에 해당하는 가상 답변을 자동 등록합니다.
     */
    const handleRecordAnswer = () => {
        if (step !== 'answer' || isRecordingAnswer) {
            return;
        }

        setIsRecordingAnswer(true);

        recordingTimerRef.current = setTimeout(() => {
            const mockAnswer =
                mockAnswers[questionIndex] ??
                '질문에 대한 테스트 답변입니다.';

            addMessage('user', mockAnswer);
            setIsRecordingAnswer(false);

            const nextQuestionIndex = questionIndex + 1;

            if (nextQuestionIndex < interviewQuestions.length) {
                setQuestionIndex(nextQuestionIndex);

                setTimeout(() => {
                    addMessage(
                        'interviewer',
                        interviewQuestions[nextQuestionIndex],
                    );
                }, 500);
            } else {
                setStep('complete');

                setTimeout(() => {
                    addMessage(
                        'system',
                        '모든 면접 질문이 완료되었습니다.',
                    );
                }, 500);
            }
        }, 2000);
    };

    const renderActionButton = () => {
        if (step === 'record') {
            return (
                <button
                    type="button"
                    className="main-action-button record-button"
                    onClick={handleRecord}
                >
                    <span className="action-icon">●</span>
                    음성 등록
                </button>
            );
        }

        if (step === 'resume') {
            return (
                <button
                    type="button"
                    className="main-action-button resume-button"
                    onClick={handleResumeButton}
                >
                    이력서 업로드
                </button>
            );
        }

        if (step === 'answer') {
            return (
                <button
                    type="button"
                    className={`main-action-button answer-button ${isRecordingAnswer ? 'recording' : ''
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
            );
        }

        return (
            <button
                type="button"
                className="main-action-button complete-button"
                disabled
            >
                면접 완료
            </button>
        );
    };

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'end',
        });
    }, [messages, isRecordingAnswer]);

    useEffect(() => {
        return () => {
            if (recordingTimerRef.current) {
                clearTimeout(recordingTimerRef.current);
            }
        };
    }, []);

    return (
        <main className="interview-page">
            <section className="interview-left">
                <div className="interview-status">
                    <span
                        className={`status-dot ${isRecordingAnswer ? 'recording' : ''
                            }`}
                    />

                    {step === 'record' && '음성 등록 전'}
                    {step === 'resume' && '이력서 업로드 대기'}

                    {step === 'answer' &&
                        (isRecordingAnswer
                            ? '답변 녹음 중'
                            : `${questionIndex + 1} / ${interviewQuestions.length
                            } 질문`)}

                    {step === 'complete' && '면접 완료'}
                </div>

                <div className="left-bottom-area">
                    {resumeName && (
                        <div className="resume-file">
                            업로드된 이력서: {resumeName}
                        </div>
                    )}

                    {step === 'answer' && (
                        <div className="answer-recording-box">
                            <div
                                className={`answer-recording-icon ${isRecordingAnswer ? 'recording' : ''
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

                    {renderActionButton()}

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.hwp"
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
                                {message.type === 'interviewer' && (
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

export default Main;