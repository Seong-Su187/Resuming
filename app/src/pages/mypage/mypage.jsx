/* mypage.jsx */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../../config/apiConfig';
import '../../index.css';
import './mypage.css';

const CHART_SERIES = [
    {
        key: 'averageScore',
        label: '평균 점수',
        unit: '점',
        fixed: 1,
        className: 'score',
    },
    {
        key: 'averageVoice',
        label: '평균 목소리',
        unit: '%',
        fixed: 2,
        className: 'voice',
    },
    {
        key: 'averageVolume',
        label: '평균 음량',
        unit: '%',
        fixed: 2,
        className: 'volume',
    },
    {
        key: 'averageWpm',
        label: '평균 속도',
        unit: 'wpm',
        fixed: 0,
        className: 'wpm',
    },
    {
        key: 'averageGaze',
        label: '시선 유지',
        unit: '%',
        fixed: 1,
        className: 'gaze',
    },
    {
        key: 'averageEmotion',
        label: '긍정 표정',
        unit: '%',
        fixed: 1,
        className: 'emotion',
    },
];

function InterviewAverageChart({ data }) {
    const width = 1000;
    const height = 360;

    const padding = {
        top: 40,
        right: 40,
        bottom: 55,
        left: 55,
    };

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const getX = (index) => {
        if (data.length === 1) {
            return padding.left + chartWidth / 2;
        }

        return padding.left
            + (index / (data.length - 1)) * chartWidth;
    };

    /*
     * 지표별 최솟값과 최댓값을 사용해 0~100으로 정규화합니다.
     * 실제 평균값은 point.rawValue에 그대로 보관합니다.
     */
    const normalizedSeries = CHART_SERIES.map((series) => {
        const validValues = data
            .map((item) => item[series.key])
            .filter((value) => Number.isFinite(value));

        if (validValues.length === 0) {
            return {
                ...series,
                points: [],
            };
        }

        const minValue = Math.min(...validValues);
        const maxValue = Math.max(...validValues);
        const range = maxValue - minValue;

        const points = data
            .map((item, index) => {
                const rawValue = item[series.key];

                if (!Number.isFinite(rawValue)) {
                    return null;
                }

                /*
                 * 모든 값이 같으면 그래프 중앙에 표시합니다.
                 */
                const normalizedValue = range === 0
                    ? 50
                    : ((rawValue - minValue) / range) * 100;

                const x = getX(index);
                const y = padding.top
                    + chartHeight
                    - (normalizedValue / 100) * chartHeight;

                return {
                    sessionId: item.sessionId,
                    label: item.label,
                    rawValue,
                    normalizedValue,
                    x,
                    y,
                };
            })
            .filter(Boolean);

        return {
            ...series,
            points,
        };
    });

    const gridValues = [100, 75, 50, 25, 0];

    return (
        <section className="mypage-average-charts">
            <div className="mypage-average-charts-header">
                <div className="mypage-average-charts-title">
                    <h2>면접별 평균 변화</h2>

                    <p>
                        ( 지표별 변화 추세를 0~100 범위로 정규화 )
                    </p>
                </div>

                <div className="mypage-chart-legend">
                    {CHART_SERIES.map((series) => (
                        <div
                            key={series.key}
                            className={`chart-legend-item ${series.className}`}
                        >
                            <span className="chart-legend-line" />
                            <strong>{series.label}</strong>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mypage-combined-chart">
                <svg
                    className="mypage-combined-chart-svg"
                    viewBox={`0 0 ${width} ${height}`}
                    role="img"
                    aria-label="면접별 평균 지표 변화 그래프"
                >
                    {gridValues.map((gridValue) => {
                        const y = padding.top
                            + chartHeight
                            - (gridValue / 100) * chartHeight;

                        return (
                            <g key={gridValue}>
                                <line
                                    className="combined-chart-grid-line"
                                    x1={padding.left}
                                    y1={y}
                                    x2={width - padding.right}
                                    y2={y}
                                />

                                <text
                                    className="combined-chart-axis-label"
                                    x={padding.left - 12}
                                    y={y + 4}
                                    textAnchor="end"
                                >
                                    {gridValue}
                                </text>
                            </g>
                        );
                    })}

                    {data.map((item, index) => {
                        const x = getX(index);

                        return (
                            <g key={item.sessionId}>
                                <line
                                    className="combined-chart-vertical-line"
                                    x1={x}
                                    y1={padding.top}
                                    x2={x}
                                    y2={padding.top + chartHeight}
                                />

                                <text
                                    className="combined-chart-session-label"
                                    x={x}
                                    y={height - 18}
                                    textAnchor="middle"
                                >
                                    {item.label}
                                </text>
                            </g>
                        );
                    })}

                    {normalizedSeries.map((series) => {
                        const polylinePoints = series.points
                            .map((point) => `${point.x},${point.y}`)
                            .join(' ');

                        return (
                            <g
                                key={series.key}
                                className={`combined-chart-series ${series.className}`}
                            >
                                {series.points.length > 1 && (
                                    <polyline
                                        className="combined-chart-line"
                                        points={polylinePoints}
                                    />
                                )}

                                {series.points.map((point) => (
                                    <g
                                        key={
                                            `${series.key}-${point.sessionId}`
                                        }
                                    >
                                        <circle
                                            className="combined-chart-point"
                                            cx={point.x}
                                            cy={point.y}
                                            r="5"
                                        >
                                            <title>
                                                {`${point.label} · `}
                                                {series.label}
                                                {': '}
                                                {point.rawValue.toFixed(
                                                    series.fixed,
                                                )}
                                                {series.unit}
                                            </title>
                                        </circle>
                                    </g>
                                ))}
                            </g>
                        );
                    })}
                </svg>
            </div>

            <div className="mypage-chart-values">
                {data.map((item) => (
                    <div
                        key={item.sessionId}
                        className="mypage-chart-value-card"
                    >
                        <strong>{item.label}</strong>

                        <span>
                            점수{' '}
                            {Number.isFinite(item.averageScore)
                                ? `${item.averageScore.toFixed(1)}점`
                                : '-'}
                        </span>

                        <span>
                            목소리{' '}
                            {Number.isFinite(item.averageVoice)
                                ? `${item.averageVoice.toFixed(2)}%`
                                : '-'}
                        </span>

                        <span>
                            음량{' '}
                            {Number.isFinite(item.averageVolume)
                                ? `${item.averageVolume.toFixed(2)}%`
                                : '-'}
                        </span>

                        <span>
                            속도{' '}
                            {Number.isFinite(item.averageWpm)
                                ? `${item.averageWpm.toFixed(0)}wpm`
                                : '-'}
                        </span>
                        
                        <span>
                            시선 유지{' '}
                            {Number.isFinite(item.averageGaze)
                                ? `${item.averageGaze.toFixed(1)}%`
                                : '-'}
                        </span>

                        <span>
                            긍정 표정{' '}
                            {Number.isFinite(item.averageEmotion)
                                ? `${item.averageEmotion.toFixed(1)}%`
                                : '-'}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function MyPage() {
    const navigate = useNavigate();

    const [qaLogs, setQaLogs] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

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

    const calculateAverage = (logs, key) => {
        const values = logs
            .map((log) => Number(log[key]))
            .filter((value) => Number.isFinite(value));

        if (values.length === 0) {
            return null;
        }

        return values.reduce((sum, value) => sum + value, 0)
            / values.length;
    };

    const calculateInvertedAverage = (logs, key) => {
        const average = calculateAverage(logs, key);

        return average === null ? null : -average;
    };

    const interviewMetrics = useMemo(() => {
        return [...sessions]
            .sort((a, b) => (
                new Date(a.createdAt).getTime()
                - new Date(b.createdAt).getTime()
            ))
            .map((session, index) => ({
                sessionId: session.sessionId,
                label: `면접 ${index + 1}`,

                averageScore: calculateAverage(
                    session.qaLogs,
                    'score',
                ),

                averageVoice: calculateInvertedAverage(
                    session.qaLogs,
                    'jitter_shaken_percentage',
                ),

                averageVolume: calculateInvertedAverage(
                    session.qaLogs,
                    'shimmer_shaken_percentage',
                ),

                averageWpm: calculateAverage(
                    session.qaLogs,
                    'speed_difference_wpm',
                ),

                averageGaze: calculateAverage(
                    session.qaLogs,
                    'gaze_percentage',
                ),

                averageEmotion: calculateAverage(
                    session.qaLogs,
                    'emotion_percentage',
                ),
            }));
    }, [sessions]);

    // PDF 다운로드 핸들러
    const handleDownloadPdf = async () => {
        if (!selectedSessionId || isDownloadingPdf) return;

        setIsDownloadingPdf(true);

        try {
            // 주의: 이 엔드포인트는 백엔드의 PDF 생성 API 라우팅에 맞게 설정해야 합니다. (예: /interviews/{sessionId}/pdf)
            const response = await fetch(`${API_BASE_URL}/interviews/${selectedSessionId}/pdf`, {
                method: 'GET',
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.detail || 'PDF 리포트를 생성하는 중 오류가 발생했습니다.');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `interview_report_${selectedSessionId}.pdf`;
            
            document.body.appendChild(link);
            link.click();
            
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('PDF 다운로드 오류:', error);
            alert(error.message);
        } finally {
            setIsDownloadingPdf(false);
        }
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
                        onClick={() => navigate('/login')}
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
                    <h1>마이페이지</h1>
                </div>

                <button
                    type="button"
                    className="mypage-main-button"
                    onClick={() => navigate('/')}
                >
                    메인으로
                </button>
            </header>

            {sessions.length === 0 ? (
                <section className="mypage-empty">
                    <h2>아직 저장된 면접 기록이 없습니다.</h2>

                    <p>
                        면접을 완료하면 질문, 답변, 음성 및 비전 분석 결과가
                        이곳에 표시됩니다.
                    </p>

                    <button
                        type="button"
                        onClick={() => navigate('/start')}
                    >
                        면접 시작하기
                    </button>
                </section>
            ) : (
                <div className="mypage-layout">
                    <aside className="mypage-session-list">
                        <span className="mypage-session-list-header">
                            <h2>면접 기록</h2>
                            <button
                                type="button"
                                className="mypage-main-button"
                                onClick={() => {
                                    setTimeout(() => {
                                        window.scrollTo({
                                            top: 0,
                                            behavior: 'smooth',
                                        });
                                    }, 0);
                                }}
                            >
                                그래프
                            </button>
                        </span>

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

                                    setTimeout(() => {
                                        window.scrollTo({
                                            top: document.documentElement.scrollHeight,
                                            behavior: 'smooth',
                                        });
                                    }, 0);
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
                        <InterviewAverageChart data={interviewMetrics} />

                        {selectedSession && (
                            <>
                                <div className="mypage-session-result-header">
                                    <h2>상세 결과</h2>
                                    <button
                                        type="button"
                                        className="pdf-download-button"
                                        onClick={handleDownloadPdf}
                                        disabled={isDownloadingPdf}
                                    >
                                        {isDownloadingPdf ? '다운로드 중...' : 'PDF 다운로드'}
                                    </button>
                                </div>
                            
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
                                                        <span>목소리 떨림</span>

                                                        <strong>
                                                            {formatMetric(
                                                                log.jitter_shaken_percentage, 2, '%',
                                                            )}
                                                        </strong>
                                                    </div>

                                                    <div>
                                                        <span>음량 흔들림</span>

                                                        <strong>
                                                            {formatMetric(
                                                                log.shimmer_shaken_percentage, 2, '%',
                                                            )}
                                                        </strong>
                                                    </div>

                                                    <div>
                                                        <span>속도 변화</span>

                                                        <strong>
                                                            {formatMetric(
                                                                log.speed_difference_wpm, 0, 'wpm',
                                                            )}
                                                        </strong>
                                                    </div>

                                                    <div>
                                                        <span>시선 유지율</span>

                                                        <strong>
                                                            {formatMetric(
                                                                log.gaze_percentage, 1, '%',
                                                            )}
                                                        </strong>
                                                    </div>

                                                    <div>
                                                        <span>긍정 표정</span>

                                                        <strong>
                                                            {formatMetric(
                                                                log.emotion_percentage, 1, '%',
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