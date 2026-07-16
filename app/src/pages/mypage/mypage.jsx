/* mypage.jsx */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../../config/apiConfig';
import '../../index.css';
import './mypage.css';

function MyPage() {
    const navigate = useNavigate();

    const [qaLogs, setQaLogs] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        const fetchQaLogs = async () => {
            const userId = localStorage.getItem('userId');

            if (!userId) {
                setErrorMessage('로그인 정보를 찾을 수 없습니다.');
                setIsLoading(false);
                return;
            }

            try {
                const response = await fetch(
                    `${API_BASE_URL}/qa-logs/user/${userId}`,
                );

                if (!response.ok) {
                    const errorData = await response.json().catch(() => null);

                    throw new Error(
                        errorData?.detail
                        || '면접 기록을 불러오지 못했습니다.',
                    );
                }

                const data = await response.json();

                setQaLogs(data);

                if (data.length > 0) {
                    setSelectedSessionId(data[0].session_id);
                }
            } catch (error) {
                console.error('면접 기록 조회 실패:', error);
                setErrorMessage(error.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchQaLogs();
    }, []);

    const sessions = useMemo(() => {
        const sessionMap = new Map();

        qaLogs.forEach((log) => {
            if (!sessionMap.has(log.session_id)) {
                sessionMap.set(log.session_id, {
                    sessionId: log.session_id,
                    jobCategory: log.job_category,
                    overallScore: log.overall_score,
                    overallFeedback: log.overall_feedback,
                    createdAt: log.session_created_at,
                    qaLogs: [],
                });
            }

            sessionMap.get(log.session_id).qaLogs.push(log);
        });

        return Array.from(sessionMap.values());
    }, [qaLogs]);

    const selectedSession = sessions.find(
        (session) => session.sessionId === selectedSessionId,
    );

    const formatDate = (dateValue) => {
        if (!dateValue) {
            return '-';
        }

        return new Intl.DateTimeFormat('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(dateValue));
    };

    const formatMetric = (value, fixed = 2, unit = '') => {
        if (value === null || value === undefined) {
            return '-';
        }

        return `${Number(value).toFixed(fixed)}${unit}`;
    };

    if (isLoading) {
        return (
            <main className="mypage">
                <div className="mypage-message">
                    면접 기록을 불러오는 중입니다.
                </div>
            </main>
        );
    }

    if (errorMessage) {
        return (
            <main className="mypage">
                <div className="mypage-message mypage-error">
                    <p>{errorMessage}</p>

                    <button
                        type="button"
                        onClick={() => navigate('/')}
                    >
                        로그인 페이지로 이동
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className="mypage page">
            <header className="mypage-header">
                <div>
                    <span className="mypage-subtitle">
                        Interview History
                    </span>

                    <h1>마이페이지</h1>

                    <p>
                        지금까지 진행한 면접 답변과 피드백을 확인해 보세요.
                    </p>
                </div>

                <button
                    type="button"
                    className="mypage-main-button"
                    onClick={() => navigate('/main')}
                >
                    메인으로
                </button>
            </header>

            {sessions.length === 0 ? (
                <section className="mypage-empty">
                    <h2>아직 저장된 면접 기록이 없습니다.</h2>

                    <p>
                        면접을 완료하면 질문, 답변, 음성 분석 결과가
                        이곳에 표시됩니다.
                    </p>

                    <button
                        type="button"
                        onClick={() => navigate('/main')}
                    >
                        면접 시작하기
                    </button>
                </section>
            ) : (
                <div className="mypage-layout">
                    <aside className="mypage-session-list">
                        <h2>면접 기록</h2>

                        {sessions.map((session, index) => (
                            <button
                                key={session.sessionId}
                                type="button"
                                className={
                                    selectedSessionId === session.sessionId
                                        ? 'mypage-session-item active'
                                        : 'mypage-session-item'
                                }
                                onClick={() => {
                                    setSelectedSessionId(session.sessionId);
                                }}
                            >
                                <span className="session-label">
                                    면접 {sessions.length - index}
                                </span>

                                <strong>
                                    {session.jobCategory || '직무 미지정'}
                                </strong>

                                <span>
                                    {formatDate(session.createdAt)}
                                </span>

                                <span>
                                    답변 {session.qaLogs.length}개
                                    {' · '}
                                    종합 점수 {session.overallScore ?? '-'}점
                                </span>
                            </button>
                        ))}
                    </aside>

                    <section className="mypage-result">
                        {selectedSession && (
                            <>
                                <div className="mypage-summary">
                                    <div>
                                        <span>지원 직무</span>

                                        <strong>
                                            {selectedSession.jobCategory
                                                || '직무 미지정'}
                                        </strong>
                                    </div>

                                    <div>
                                        <span>종합 점수</span>

                                        <strong>
                                            {selectedSession.overallScore
                                                ?? '-'}
                                            점
                                        </strong>
                                    </div>

                                    <div>
                                        <span>면접 일시</span>

                                        <strong>
                                            {formatDate(
                                                selectedSession.createdAt,
                                            )}
                                        </strong>
                                    </div>
                                </div>

                                {selectedSession.overallFeedback && (
                                    <div className="mypage-overall-feedback">
                                        <h2>종합 피드백</h2>

                                        <p>
                                            {selectedSession.overallFeedback}
                                        </p>
                                    </div>
                                )}

                                <div className="mypage-answer-list">
                                    {selectedSession.qaLogs.map(
                                        (log, index) => (
                                            <article
                                                key={log.id}
                                                className="mypage-answer-card"
                                            >
                                                <div className="answer-card-header">
                                                    <span>
                                                        질문 {index + 1}
                                                    </span>

                                                    <strong>
                                                        {log.score ?? '-'}점
                                                    </strong>
                                                </div>

                                                <div className="voice-metric-list">
                                                    <div>
                                                        <span>
                                                            목소리
                                                        </span>

                                                        <strong>
                                                            {formatMetric(
                                                                log.jitter_shaken_percentage, 2, '%',
                                                            )}
                                                        </strong>
                                                    </div>

                                                    <div>
                                                        <span>
                                                            음량
                                                        </span>

                                                        <strong>
                                                            {formatMetric(
                                                                log.shimmer_shaken_percentage, 2, '%',
                                                            )}
                                                        </strong>
                                                    </div>

                                                    <div>
                                                        <span>
                                                            속도
                                                        </span>

                                                        <strong>
                                                            {formatMetric(
                                                                log.speed_difference_wpm, 0, 'wpm',
                                                            )}
                                                        </strong>
                                                    </div>
                                                </div>

                                                <div className="answer-content">
                                                    <h3>면접 질문</h3>
                                                    <p>{log.question}</p>
                                                </div>

                                                <div className="answer-content">
                                                    <h3>나의 답변</h3>
                                                    <p>
                                                        {log.transcribed_text
                                                            || '저장된 답변이 없습니다.'}
                                                    </p>
                                                </div>

                                                <div className="answer-feedback">
                                                    <h3>답변 피드백</h3>

                                                    <p>
                                                        {log.feedback
                                                            || '저장된 피드백이 없습니다.'}
                                                    </p>
                                                </div>
                                            </article>
                                        ),
                                    )}
                                </div>
                            </>
                        )}
                    </section>
                </div>
            )}
        </main>
    );
}

export default MyPage;