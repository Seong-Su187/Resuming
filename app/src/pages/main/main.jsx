import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../index.css';
import './main.css';

function Main({ mainVideoUrl }) {
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const messageTimerRef = useRef([]);
    const [messageStep, setMessageStep] = useState(0);
    const [isFirstVisit] = useState(() => {
        return sessionStorage.getItem('mainVideoPlayed') !== 'true';
    });

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
        ];
    };

    useEffect(() => {
        return () => {
            messageTimerRef.current.forEach((timer) => {
                clearTimeout(timer);
            });
        };
    }, []);

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
                />

                <div className="main-overlay">
                    <div className="main-message">
                        <p className={`main-message-item ${messageStep >= 1 ? 'visible' : ''}`} >
                            면접이 두려우신가요?
                        </p>

                        <p className={`main-message-item ${messageStep >= 2 ? 'visible' : ''}`} >
                            <img
                                src="/assets/resuming-r.png"
                                alt="R"
                                className="main-message-image"
                            />
                            ESUMING과 함께 실제 면접과 같은 환경에서
                            <br />
                            차분하게 말하는 연습을 시작해 보세요.
                        </p>

                        <p className={`main-message-item ${messageStep >= 3 ? 'visible' : ''}`} >
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
                                        시작하기
                                    </button>

                                    <button
                                        type="button"
                                        className="main-button"
                                        onClick={handleLogout}
                                    >
                                        로그아웃
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