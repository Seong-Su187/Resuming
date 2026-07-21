/* mypage.jsx */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../../config/apiConfig';
import '../../index.css';
import './mypage.css';

const LINE_CHART_SERIES = [
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
];

const BAR_CHART_SERIES = [
    {
        key: 'averageFiller',
        label: '평균 습관어',
        unit: '회',
        fixed: 1,
        className: 'filler',
    },
    {
        key: 'averageGazeLoss',
        label: '평균 시선이탈',
        unit: '회',
        fixed: 1,
        className: 'gaze-loss',
    },
];

function InterviewAverageChart({
    data,
    sessionLimit,
    onSessionLimitChange,
    totalSessionCount,
}) {
    const lineWidth = 720;
    const barWidth = 520;
    const height = 360;
    const padding = {
        top: 36,
        right: 28,
        bottom: 55,
        left: 52,
    };

    const lineChartWidth = lineWidth - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const getLineX = (index) => {
        if (data.length === 1) {
            return padding.left + lineChartWidth / 2;
        }

        return padding.left
            + (index / Math.max(data.length - 1, 1)) * lineChartWidth;
    };

    const normalizedLineSeries = LINE_CHART_SERIES.map((series) => {
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

        return {
            ...series,
            points: data
                .map((item, index) => {
                    const rawValue = item[series.key];

                    if (!Number.isFinite(rawValue)) {
                        return null;
                    }

                    const normalizedValue = range === 0
                        ? 50
                        : ((rawValue - minValue) / range) * 100;

                    return {
                        sessionId: item.sessionId,
                        label: item.label,
                        rawValue,
                        x: getLineX(index),
                        y: padding.top
                            + chartHeight
                            - (normalizedValue / 100) * chartHeight,
                    };
                })
                .filter(Boolean),
        };
    });

    const barValues = data.flatMap((item) => (
        BAR_CHART_SERIES.map((series) => item[series.key])
    )).filter((value) => Number.isFinite(value));

    const rawBarMax = barValues.length > 0 ? Math.max(...barValues) : 0;
    const barAxisMax = Math.max(1, Math.ceil(rawBarMax));
    const barChartWidth = barWidth - padding.left - padding.right;
    const groupWidth = barChartWidth / Math.max(data.length, 1);
    const barGap = 6;
    const barWidthValue = Math.min(
        30,
        Math.max(12, (groupWidth - 20 - barGap) / 2),
    );

    const lineGridValues = [100, 75, 50, 25, 0];
    const barGridValues = [barAxisMax, barAxisMax * 0.75, barAxisMax * 0.5, barAxisMax * 0.25, 0];

    return (
        <section className="mypage-average-charts">
            <div className="mypage-average-charts-header">
                <div className="mypage-average-charts-heading">
                    <div className="mypage-average-charts-title">
                        <h2>면접별 평균 변화</h2>
                        <p>
                            최근 {Math.min(sessionLimit, totalSessionCount)}건
                        </p>
                    </div>

                    <div
                        className="mypage-chart-limit-buttons"
                        role="group"
                        aria-label="그래프에 표시할 면접 개수"
                    >
                        {[3, 5, 7, 9, 12, 14, 16, 18].map((limit, index, limits) => {
                            const previousLimit = index === 0 ? 0 : limits[index - 1];

                            const isDisabled =
                                totalSessionCount <= previousLimit;

                            return (
                                <button
                                    key={limit}
                                    type="button"
                                    className={
                                        sessionLimit === limit
                                            ? 'mypage-chart-limit-button active'
                                            : 'mypage-chart-limit-button'
                                    }
                                    onClick={() => onSessionLimitChange(limit)}
                                    disabled={isDisabled}
                                >
                                    {limit}건
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="mypage-chart-grid">
                <div className="mypage-chart-panel">
                    <div className="mypage-chart-panel-header">
                        <h3>평균 평가 지표</h3>
                        <span>지표별 변화 추세를 0~100으로 정규화</span>
                    </div>

                    <div className="mypage-chart-legend">
                        {LINE_CHART_SERIES.map((series) => (
                            <div
                                key={series.key}
                                className={`chart-legend-item ${series.className}`}
                            >
                                <span className="chart-legend-line" />
                                <strong>{series.label}</strong>
                            </div>
                        ))}
                    </div>

                    <div className="mypage-combined-chart">
                        <svg
                            className="mypage-combined-chart-svg"
                            viewBox={`0 0 ${lineWidth} ${height}`}
                            preserveAspectRatio="none"
                            role="img"
                            aria-label="평균 점수, 목소리, 음량, 속도 꺾은선 그래프"
                        >
                            {lineGridValues.map((gridValue) => {
                                const y = padding.top
                                    + chartHeight
                                    - (gridValue / 100) * chartHeight;

                                return (
                                    <g key={gridValue}>
                                        <line
                                            className="combined-chart-grid-line"
                                            x1={padding.left}
                                            y1={y}
                                            x2={lineWidth - padding.right}
                                            y2={y}
                                        />
                                        <text
                                            className="combined-chart-axis-label"
                                            x={padding.left - 10}
                                            y={y + 4}
                                            textAnchor="end"
                                        >
                                            {gridValue}
                                        </text>
                                    </g>
                                );
                            })}

                            {data.map((item, index) => {
                                const x = getLineX(index);

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

                            {normalizedLineSeries.map((series) => (
                                <g
                                    key={series.key}
                                    className={`combined-chart-series ${series.className}`}
                                >
                                    {series.points.length > 1 && (
                                        <polyline
                                            className="combined-chart-line"
                                            points={series.points
                                                .map((point) => `${point.x},${point.y}`)
                                                .join(' ')}
                                        />
                                    )}

                                    {series.points.map((point) => (
                                        <circle
                                            key={`${series.key}-${point.sessionId}`}
                                            className="combined-chart-point"
                                            cx={point.x}
                                            cy={point.y}
                                            r="5"
                                        >
                                            <title>
                                                {`${point.label} · ${series.label}: ${point.rawValue.toFixed(series.fixed)}${series.unit}`}
                                            </title>
                                        </circle>
                                    ))}
                                </g>
                            ))}
                        </svg>
                    </div>
                </div>

                <div className="mypage-chart-panel">
                    <div className="mypage-chart-panel-header">
                        <h3>평균 행동 지표</h3>
                        <span>면접별 실제 평균 횟수</span>
                    </div>

                    <div className="mypage-chart-legend">
                        {BAR_CHART_SERIES.map((series) => (
                            <div
                                key={series.key}
                                className={`chart-legend-item ${series.className}`}
                            >
                                <span className="chart-legend-box" />
                                <strong>{series.label}</strong>
                            </div>
                        ))}
                    </div>

                    <div className="mypage-combined-chart">
                        <svg
                            className="mypage-combined-chart-svg mypage-bar-chart-svg"
                            viewBox={`0 0 ${barWidth} ${height}`}
                            preserveAspectRatio="none"
                            role="img"
                            aria-label="평균 습관어와 평균 시선이탈 막대그래프"
                        >
                            {barGridValues.map((gridValue, index) => {
                                const ratio = gridValue / barAxisMax;
                                const y = padding.top + chartHeight - ratio * chartHeight;

                                return (
                                    <g key={`${gridValue}-${index}`}>
                                        <line
                                            className="combined-chart-grid-line"
                                            x1={padding.left}
                                            y1={y}
                                            x2={barWidth - padding.right}
                                            y2={y}
                                        />
                                        <text
                                            className="combined-chart-axis-label"
                                            x={padding.left - 10}
                                            y={y + 4}
                                            textAnchor="end"
                                        >
                                            {Number(gridValue.toFixed(1))}
                                        </text>
                                    </g>
                                );
                            })}

                            {data.map((item, index) => {
                                const groupCenter = padding.left
                                    + groupWidth * index
                                    + groupWidth / 2;
                                const firstX = groupCenter - barWidthValue - barGap / 2;
                                const secondX = groupCenter + barGap / 2;

                                return (
                                    <g key={item.sessionId}>
                                        {BAR_CHART_SERIES.map((series, seriesIndex) => {
                                            const rawValue = item[series.key];
                                            const value = Number.isFinite(rawValue) ? rawValue : 0;
                                            const barHeight = (value / barAxisMax) * chartHeight;
                                            const x = seriesIndex === 0 ? firstX : secondX;
                                            const y = padding.top + chartHeight - barHeight;

                                            return (
                                                <rect
                                                    key={`${series.key}-${item.sessionId}`}
                                                    className={`combined-chart-bar ${series.className}`}
                                                    x={x}
                                                    y={y}
                                                    width={barWidthValue}
                                                    height={barHeight}
                                                    rx="4"
                                                >
                                                    <title>
                                                        {`${item.label} · ${series.label}: ${value.toFixed(series.fixed)}${series.unit}`}
                                                    </title>
                                                </rect>
                                            );
                                        })}

                                        <text
                                            className="combined-chart-session-label"
                                            x={groupCenter}
                                            y={height - 18}
                                            textAnchor="middle"
                                        >
                                            {item.label}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                </div>
            </div>

            <div className="mypage-chart-values">
                {data.map((item) => (
                    <div key={item.sessionId} className="mypage-chart-value-card">
                        <strong>{item.label}</strong>
                        <span>점수 {Number.isFinite(item.averageScore) ? `${item.averageScore.toFixed(1)}점` : '-'}</span>
                        <span>목소리 {Number.isFinite(item.averageVoice) ? `${item.averageVoice.toFixed(2)}%` : '-'}</span>
                        <span>음량 {Number.isFinite(item.averageVolume) ? `${item.averageVolume.toFixed(2)}%` : '-'}</span>
                        <span>속도 {Number.isFinite(item.averageWpm) ? `${item.averageWpm.toFixed(0)}wpm` : '-'}</span>
                        <span>습관어 {Number.isFinite(item.averageFiller) ? `${item.averageFiller.toFixed(1)}회` : '-'}</span>
                        <span>시선 이탈 {Number.isFinite(item.averageGazeLoss) ? `${item.averageGazeLoss.toFixed(1)}회` : '-'}</span>
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
    const [chartSessionLimit, setChartSessionLimit] = useState(3);
    const [resultView, setResultView] = useState('charts');

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
        const recentSessions = [...sessions]
            .sort((a, b) => (
                new Date(b.createdAt).getTime()
                - new Date(a.createdAt).getTime()
            ))
            .slice(0, chartSessionLimit)
            .sort((a, b) => (
                new Date(a.createdAt).getTime()
                - new Date(b.createdAt).getTime()
            ));

        return recentSessions.map((session) => {
            const originalIndex = [...sessions]
                .sort((a, b) => (
                    new Date(a.createdAt).getTime()
                    - new Date(b.createdAt).getTime()
                ))
                .findIndex(
                    (item) => item.sessionId === session.sessionId,
                );

            return {
                sessionId: session.sessionId,
                label: `${originalIndex + 1}`,

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

                averageFiller: calculateAverage(
                    session.qaLogs,
                    'filler_word_count',
                ),

                averageGazeLoss: calculateAverage(
                    session.qaLogs,
                    'gaze_loss_count',
                ),
            };
        });
    }, [sessions, chartSessionLimit]);

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
        <main className="mypage">
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
                                    setResultView('charts');
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
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
                                    setResultView('details');
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                            >
                                <span className="session-label">
                                    면접 {sessions.length - index}
                                </span>
                                <strong>{session.jobCategory || '직무 미지정'}</strong>
                                <span>{formatDate(session.createdAt)}</span>
                                <span>
                                    답변 {session.qaLogs.length}개 · 종합 점수{' '}
                                    {session.overallScore ?? '-'}점
                                </span>
                            </button>
                        ))}
                    </aside>

                    <section className="mypage-result">
                        {/*
                        <div className="mypage-view-navigation">
                            <button
                                type="button"
                                className="mypage-view-button"
                                onClick={() => setResultView('charts')}
                                disabled={resultView === 'charts'}
                            >
                                이전
                            </button>

                            <span>
                                {resultView === 'charts' ? '그래프' : '상세 결과'}
                            </span>

                            <button
                                type="button"
                                className="mypage-view-button"
                                onClick={() => setResultView('details')}
                                disabled={resultView === 'details' || !selectedSession}
                            >
                                다음
                            </button>
                        </div>
                         */}

                        {resultView === 'charts' ? (
                            <InterviewAverageChart
                                data={interviewMetrics}
                                sessionLimit={chartSessionLimit}
                                onSessionLimitChange={setChartSessionLimit}
                                totalSessionCount={sessions.length}
                            />
                        ) : selectedSession && (
                            <div className="mypage-detail-view">
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
                                        <strong>{selectedSession.jobCategory || '직무 미지정'}</strong>
                                    </div>
                                    <div>
                                        <span>종합 점수</span>
                                        <strong>{selectedSession.overallScore ?? '-'}점</strong>
                                    </div>
                                    <div>
                                        <span>면접 일시</span>
                                        <strong>{formatDate(selectedSession.createdAt)}</strong>
                                    </div>
                                </div>

                                {selectedSession.overallFeedback && (
                                    <div className="mypage-overall-feedback">
                                        <h2>종합 피드백</h2>
                                        <p>{selectedSession.overallFeedback}</p>
                                    </div>
                                )}

                                <div className="mypage-answer-list">
                                    {selectedSession.qaLogs.map((log, index) => (
                                        <article key={log.id} className="mypage-answer-card">
                                            <div className="answer-card-header">
                                                <span>질문 {index + 1}</span>
                                                <strong>{log.score ?? '-'}점</strong>
                                            </div>

                                            <div className="voice-metric-list">
                                                <div>
                                                    <span>목소리 떨림</span>
                                                    <strong>{formatMetric(log.jitter_shaken_percentage, 2, '%')}</strong>
                                                </div>
                                                <div>
                                                    <span>음량 흔들림</span>
                                                    <strong>{formatMetric(log.shimmer_shaken_percentage, 2, '%')}</strong>
                                                </div>
                                                <div>
                                                    <span>속도 변화</span>
                                                    <strong>{formatMetric(log.speed_difference_wpm, 0, 'wpm')}</strong>
                                                </div>
                                                <div>
                                                    <span>습관어 사용</span>
                                                    <strong>
                                                        {log.filler_word_count !== null && log.filler_word_count !== undefined
                                                            ? `${log.filler_word_count}회`
                                                            : '-'}
                                                    </strong>
                                                </div>
                                                <div>
                                                    <span>시선 이탈</span>
                                                    <strong>
                                                        {log.gaze_loss_count !== null && log.gaze_loss_count !== undefined
                                                            ? `${log.gaze_loss_count}회`
                                                            : '-'}
                                                    </strong>
                                                </div>
                                            </div>

                                            <div className="answer-content">
                                                <h3>면접 질문</h3>
                                                <p>{log.question}</p>
                                            </div>
                                            <div className="answer-content">
                                                <h3>나의 답변</h3>
                                                <p>{log.transcribed_text || '저장된 답변이 없습니다.'}</p>
                                            </div>
                                            <div className="answer-feedback">
                                                <h3>답변 피드백</h3>
                                                <p>{log.feedback || '저장된 피드백이 없습니다.'}</p>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </main>
    );
}

export default MyPage;