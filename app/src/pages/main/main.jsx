import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserIcon } from '../../components/icons';
import '../../index.css';
import './main.css';

function Main({ mainVideoUrl }) {
    const infoSlides = [
        {
            label: 'FLOW',
            title: '면접 진행 흐름',
            lines: ['음성 / 이력서 등록', '질문 생성', '면접 연습'],
        },
        {
            label: 'HOW TO USE',
            title: '사용 방법',
            lines: ['질문을 듣고', '실제처럼 답변하고', '결과를 확인하세요'],
        },
        {
            label: 'BENEFIT',
            title: '기대 효과',
            lines: ['실전 감각 향상', '답변 연습 강화', '발화 자신감 향상'],
        },
    ];

    const navigate = useNavigate();
    const videoRef = useRef(null);
    const messageTimerRef = useRef([]);
    const [messageStep, setMessageStep] = useState(0);
    const [isFirstVisit] = useState(() => {
        return sessionStorage.getItem('mainVideoPlayed') !== 'true';
    });
    const [infoIndex, setInfoIndex] = useState(0);
    const [nextInfoIndex, setNextInfoIndex] = useState(null);
    const [isInfoSliding, setIsInfoSliding] = useState(false);
    const [isVideoEnded, setIsVideoEnded] = useState(false);

    useEffect(() => {
        if (isFirstVisit) {
            sessionStorage.setItem('mainVideoPlayed', 'true');
        }
    }, [isFirstVisit]);

    useEffect(() => {
        const video = videoRef.current;

        if (!video || !mainVideoUrl) {
            return;
        }

        video.volume = 0.1;

        // 처음 접속: 영상 재생 없이 마지막 화면 표시
        if (isFirstVisit) {
            video.muted = true;
            setMessageStep(4);
            return;
        }

        // 재접속: 영상 정상 재생
        video.muted = false;

        video.play().catch(() => {
            // 브라우저가 소리 있는 자동재생을 막으면 음소거 재생
            video.muted = true;

            video.play().catch((error) => {
                console.error('영상 자동재생 실패:', error);
            });
        });
    }, [mainVideoUrl, isFirstVisit]);

    useEffect(() => {
        return () => {
            messageTimerRef.current.forEach((timer) => {
                clearTimeout(timer);
            });
        };
    }, []);

    useEffect(() => {
        if (messageStep < 4) {
            setInfoIndex(0);
            setNextInfoIndex(null);
            setIsInfoSliding(false);
            return;
        }

        const interval = setInterval(() => {
            if (isInfoSliding) {
                return;
            }

            const nextIndex = (infoIndex + 1) % infoSlides.length;

            setNextInfoIndex(nextIndex);
            setIsInfoSliding(true);

            setTimeout(() => {
                setInfoIndex(nextIndex);
                setNextInfoIndex(null);
                setIsInfoSliding(false);
            }, 550);
        }, 3500);

        return () => clearInterval(interval);
    }, [
        messageStep,
        infoIndex,
        infoSlides.length,
        isInfoSliding,
    ]);

    const handleVideoEnded = () => {
        setTimeout(() => {
            setIsVideoEnded(true);
        }, 600);
    };

    const handleVideoLoadedMetadata = () => {
        const video = videoRef.current;

        if (!video || !isFirstVisit) {
            return;
        }

        // 영상의 완전한 끝보다 약간 앞쪽으로 이동
        video.currentTime = Math.max(video.duration - 0.05, 0);
        video.pause();

        setMessageStep(4);
    };

    const handleVideoPlay = () => {
        if (isFirstVisit) {
            setMessageStep(4);
            return;
        }

        messageTimerRef.current.forEach((timer) => {
            clearTimeout(timer);
        });

        setMessageStep(1);

        messageTimerRef.current = [
            setTimeout(() => setMessageStep(2), 1500),
            setTimeout(() => setMessageStep(3), 7500),
            setTimeout(() => setMessageStep(4), 9000),
            setTimeout(() => setMessageStep(5), 11000),
        ];
    };

    const [isLoggedIn, setIsLoggedIn] = useState(() => {
        return Boolean(localStorage.getItem('userId'));
    });

    const handleLogin = () => {
        navigate('/login');
    };

    const handleLogout = () => {
        localStorage.removeItem('userId');
        localStorage.removeItem('username');
        localStorage.removeItem('fullName');

        setIsLoggedIn(false);
    };

    const handleStartInterview = () => {
        navigate('/start');
    };

    return (
        <main className="main-page">

            <nav className="user-floating-menu" aria-label="사용자 메뉴">
                <button
                    type="button"
                    className="user-floating-trigger"
                    aria-label="사용자 메뉴 열기"
                >
                    <UserIcon size={40} color="#ffffff" />
                </button>
                {isLoggedIn ? (
                    <div className="user-floating-list">
                        <button
                            type="button"
                            className="user-floating-item"
                            onClick={() => navigate('/mypage')}
                        >
                            마이페이지
                        </button>

                        <button
                            type="button"
                            className="user-floating-item"
                            onClick={() => navigate('/start')}
                        >
                            면접 시작
                        </button>

                        <button
                            type="button"
                            className="user-floating-item logout"
                            onClick={handleLogout}
                        >
                            로그아웃
                        </button>
                    </div>
                ) : (
                    <div className="user-floating-list">
                        <button
                            type="button"
                            className="user-floating-item login"
                            onClick={handleLogin}
                        >
                            로그인
                        </button>
                    </div>
                )}
            </nav>

            <section className="main-card section1">
                <video
                    ref={videoRef}
                    className="main-video"
                    src={mainVideoUrl}
                    poster="/assets/main-video-last-frame.png"
                    autoPlay={!isFirstVisit}
                    muted={isFirstVisit}
                    playsInline
                    onPlay={handleVideoPlay}
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onEnded={handleVideoEnded}
                />

                <header className="main-header">
                    <div className="main-header-brand">
                        <img
                            src="/assets/resuming-r.png"
                            alt=""
                            className="main-header-logo"
                        />
                        <span>ESUMING</span>
                    </div>

                    <div className="main-header-description">
                        <span className="main-header-line" />
                        <span>AI INTERVIEW SIMULATION · SPEAKING PRACTICE</span>
                    </div>

                    <div className="main-header-status">
                        <span className="main-header-status-dot" />
                        <span>READY</span>
                    </div>
                </header>

                <div className="main-overlay">
                    <div className="main-left-visual" aria-hidden="true">
                        <div className="main-orbit main-orbit-large">
                            <span className="main-orbit-dot" />
                        </div>

                        <div className="main-orbit main-orbit-medium">
                            <span className="main-orbit-dot" />
                        </div>

                        <div className="main-orbit main-orbit-small">
                            <span className="main-orbit-dot" />
                        </div>

                        <div className="main-visual-core">
                            <span />
                            <span />
                            <span />
                        </div>
                    </div>

                    <div
                        className={`main-info-rotator ${messageStep >= 4 ? 'visible' : ''
                            }`}
                        aria-hidden="true"
                    >
                        <div className="main-info-viewport">
                            <div
                                key={`info-slide-${infoIndex}`}
                                className={`main-info-card ${isInfoSliding ? 'slide-out' : 'active'}`}
                            >
                                <span className="main-info-label">
                                    {infoSlides[infoIndex].label}
                                </span>

                                <h3 className="main-info-title">
                                    {infoSlides[infoIndex].title}
                                </h3>

                                <ul className="main-info-list">
                                    {infoSlides[infoIndex].lines.map((line) => (
                                        <li key={line}>{line}</li>
                                    ))}
                                </ul>
                            </div>

                            {isInfoSliding && nextInfoIndex !== null && (
                                <div className="main-info-card slide-in">
                                    <span className="main-info-label">
                                        {infoSlides[nextInfoIndex].label}
                                    </span>

                                    <h3 className="main-info-title">
                                        {infoSlides[nextInfoIndex].title}
                                    </h3>

                                    <ul className="main-info-list">
                                        {infoSlides[nextInfoIndex].lines.map((line) => (
                                            <li key={line}>{line}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="main-message">
                        <p className={`main-message-item main-message-title ${messageStep >= 5 ? 'visible' : ''}`} >
                            완벽하지 않아도 괜찮은<br />
                            나만의 면접 무대
                        </p>

                        <p className={`main-message-item main-message-description ${messageStep >= 5 ? 'visible' : ''}`} >
                            부담 없이 면접을 반복하며<br />
                            조금씩 달라지는 나를 확인해 보세요.
                        </p>
                    </div>

                    <div className="main-message">
                        <p className={
                            `
                                main-message-item main-subtitle
                                ${messageStep >= 1 ? 'visible' : ''}
                                ${isVideoEnded ? 'ended' : ''}
                                `
                        } >
                            면접이 두려우신가요?
                        </p>

                        <p className={
                            `
                                main-message-item main-subtitle
                                ${messageStep >= 2 ? 'visible' : ''}
                                ${isVideoEnded ? 'ended' : ''}
                                `
                        } >
                            <img
                                src="/assets/resuming-r.png"
                                alt="R"
                                className="main-message-image"
                            />
                            ESUMING과 함께 실제 면접과 같은 환경에서
                            <br />
                            차분하게 말하는 연습을 시작해 보세요.
                        </p>

                        <p className={
                            `
                                main-message-item main-subtitle
                                ${messageStep >= 3 ? 'visible' : ''}
                                ${isVideoEnded ? 'ended' : ''}
                                `
                        } >
                            <span>자신 있는 면접을 위한 첫걸음, </span>

                            <img
                                src="/assets/resuming-r.png"
                                alt="R"
                                className="main-message-image"
                            />

                            <span>ESUMING</span>
                        </p>

                        <p className={`main-actions main-message-item ${messageStep >= 4 ? 'visible' : ''}`} >
                            {isLoggedIn ? (
                                <span className="main-buttons">
                                    <button
                                        type="button"
                                        className="main-button primary"
                                        onClick={handleStartInterview}
                                    >
                                        <span>면접장 입장</span>
                                        <span className="main-button-arrow" aria-hidden="true">
                                            ❯❯
                                        </span>
                                    </button>
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    className="main-button primary"
                                    onClick={handleLogin}
                                >
                                    로그인
                                </button>
                            )}
                        </p>
                    </div>
                </div>
            </section>

            <section className="main-card section2">
            </section>

            <section className="main-card section3">
            </section>
        </main>
    );
}

export default Main;