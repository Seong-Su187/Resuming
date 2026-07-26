import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserIcon } from '../../components/icons';
import '../../index.css';
import './main.css';

const faqGroups = [
    {
        title: '회원가입 및 로그인',
        items: [
            {
                question: '회원가입을 해야 면접을 진행할 수 있나요?',
                answer:
                    '네. 면접 기록과 분석 결과를 저장하고 관리하기 위해 회원가입과 로그인이 필요합니다.',
            },
            {
                question: '회원가입은 어떻게 하나요?',
                answer:
                    '회원가입 화면에서 이름, 이메일, 비밀번호를 입력하면 계정을 생성할 수 있습니다.',
            },
            {
                question: '이미 가입한 이메일로 다시 회원가입할 수 있나요?',
                answer:
                    '아니요. 이미 등록된 이메일은 중복으로 사용할 수 없습니다. 기존 계정으로 로그인해 주세요.',
            },
            {
                question: '로그인하지 않고 서비스를 이용할 수 있나요?',
                answer:
                    '서비스 소개는 확인할 수 있지만, 면접 진행과 결과 저장을 위해서는 로그인이 필요합니다.',
            },
            {
                question: '회원 정보와 면접 기록은 어디에서 확인할 수 있나요?',
                answer:
                    '로그인 후 마이페이지에서 이전 면접 기록과 분석 결과를 확인할 수 있습니다.',
            },
        ],
    },
    {
        title: '서비스 및 면접 준비',
        items: [
            {
                question: '로그아웃하면 면접 기록이 삭제되나요?',
                answer:
                    '아니요. 동일한 계정으로 다시 로그인하면 기존 기록을 확인할 수 있습니다.',
            },
            {
                question: 'Resuming은 어떤 서비스인가요?',
                answer:
                    '답변 내용과 음성, 시선 습관을 분석해 주는 AI 모의면접 서비스입니다.',
            },
            {
                question: '면접은 어떤 방식으로 진행되나요?',
                answer:
                    '이력서를 기반으로 생성된 5개의 질문에 음성으로 답변하는 방식으로 진행됩니다.',
            },
            {
                question: '질문은 매번 동일하게 나오나요?',
                answer:
                    '아니요. 이력서의 경력, 프로젝트, 기술 스택에 따라 맞춤형 질문이 생성됩니다.',
            },
            {
                question: '이력서를 반드시 등록해야 하나요?',
                answer:
                    '최초 면접 시 등록이 필요하며, 이후에는 기존 이력서를 다시 사용할 수 있습니다.',
            },
        ],
    },
    {
        title: '질문 및 답변 평가',
        items: [
            {
                question: '어떤 형식의 이력서를 등록할 수 있나요?',
                answer:
                    '현재 PDF 형식의 이력서를 지원합니다.',
            },
            {
                question: '면접관은 어떤 역할을 하나요?',
                answer:
                    '기술 면접관은 프로젝트와 기술 경험을, 인사 면접관은 협업과 지원 동기를 질문합니다.',
            },
            {
                question: '답변 평가는 어떤 기준으로 이루어지나요?',
                answer:
                    '질문 의도, 상황, 역할, 행동, 결과와 회고 내용을 종합적으로 평가합니다.',
            },
            {
                question: 'STAR 방식이 무엇인가요?',
                answer:
                    '상황, 과제, 행동, 결과의 순서로 경험을 구체적으로 전달하는 답변 방식입니다.',
            },
            {
                question: '음성 분석에서는 어떤 항목을 확인하나요?',
                answer:
                    '목소리 높낮이, 음량, 말하기 속도, 습관어와 필러 표현을 확인합니다.',
            },
        ],
    },
    {
        title: '음성 및 시선 분석',
        items: [
            {
                question: '습관어와 필러는 무엇인가요?',
                answer:
                    '필러는 “음”, “어” 같은 채움 표현이며, 습관어는 반복적으로 사용하는 표현입니다.',
            },
            {
                question: '시선 이탈은 어떻게 측정하나요?',
                answer:
                    '등록한 면접관 응시 위치를 기준으로 답변 중 시선이 벗어난 횟수를 기록합니다.',
            },
            {
                question: '웹캠을 반드시 사용해야 하나요?',
                answer:
                    '시선 분석을 이용하려면 웹캠이 필요합니다.',
            },
            {
                question: '마이크를 반드시 사용해야 하나요?',
                answer:
                    '음성 답변과 분석을 위해 마이크 사용이 필요합니다.',
            },
            {
                question: '답변 도중 다시 말할 수 있나요?',
                answer:
                    '아니요. 실제 면접처럼 녹음을 종료하면 답변이 즉시 제출되며 다시 녹음할 수 없습니다.',
            },
        ],
    },
    {
        title: '면접 결과 및 이용 환경',
        items: [
            {
                question: '면접 결과에서는 무엇을 확인할 수 있나요?',
                answer:
                    '답변 점수, AI 피드백, 음성 분석, 습관어와 시선 이탈 결과를 확인할 수 있습니다.',
            },
            {
                question: '이전 면접 결과도 다시 볼 수 있나요?',
                answer:
                    '마이페이지에서 이전 면접 기록과 질문별 결과를 확인할 수 있습니다.',
            },
            {
                question: '면접 결과를 PDF로 저장할 수 있나요?',
                answer:
                    '면접 결과 페이지에서 주요 분석 결과를 PDF로 저장할 수 있습니다.',
            },
            {
                question: '실제 채용 결과를 보장하나요?',
                answer:
                    '아니요. 평가 결과는 면접 연습과 답변 개선을 위한 참고 자료입니다.',
            },
            {
                question: '분석 결과가 정확하지 않을 수도 있나요?',
                answer:
                    '소음, 마이크, 웹캠, 조명과 네트워크 환경에 따라 결과에 차이가 발생할 수 있습니다.',
            },
            {
                question: '어떤 환경에서 이용하는 것이 좋나요?',
                answer:
                    '최신 Chrome 또는 Edge와 조용하고 밝은 환경에서 이용하는 것을 권장합니다.',
            },
        ],
    },
];

const interviewScenarioSteps = [
    { id: '01', phase: '메인 페이지', title: '서비스 소개 확인', image: '/assets/scenario/step-01.png', x: 4, y: 10 },
    { id: '02', phase: '메인 페이지', title: '자주 묻는 내용 확인', image: '/assets/scenario/step-02.png', x: 17, y: 10 },
    { id: '03', phase: '메인 페이지', title: '진행 시나리오 확인', image: '/assets/scenario/step-03.png', x: 30, y: 10 },

    { id: '04', phase: '로그인', title: '로그인하기', image: '/assets/scenario/step-04.png', x: 43, y: 10 },

    { id: '05', phase: '면접 설정', title: '동반 면접자 선택', image: '/assets/scenario/step-05.png', x: 56, y: 10 },
    { id: '06', phase: '면접 설정', title: '면접실 입장', image: '/assets/scenario/step-06.png', x: 69, y: 10 },
    { id: '07', phase: '면접 설정', title: '카메라 상태 확인', image: '/assets/scenario/step-07.png', x: 82, y: 10 },

    { id: '08-1-1', phase: '음성 설정', title: '기준 음성 등록', image: '/assets/scenario/step-08-1-1.png', x: 8, y: 38 },
    { id: '08-1-2', phase: '음성 설정', title: '기준 음성 녹음', image: '/assets/scenario/step-08-1-2.png', x: 21, y: 38 },
    { id: '08-1-3', phase: '음성 설정', title: '녹음 결과 확인', image: '/assets/scenario/step-08-1-3.png', x: 34, y: 38 },
    { id: '08-2', phase: '음성 설정', title: '사용할 음성 선택', image: '/assets/scenario/step-08-2.png', x: 21, y: 66 },

    { id: '09-1-1', phase: '이력서 설정', title: '새 이력서 등록', image: '/assets/scenario/step-09-1-1.png', x: 48, y: 38 },
    { id: '09-1-2', phase: '이력서 설정', title: '이력서 파일 선택', image: '/assets/scenario/step-09-1-2.png', x: 61, y: 38 },
    { id: '09-2', phase: '이력서 설정', title: '사용할 이력서 선택', image: '/assets/scenario/step-09-2.png', x: 55, y: 66 },

    { id: '10', phase: '시선 설정', title: '왼쪽 면접관 시선 보정', image: '/assets/scenario/step-10.png', x: 76, y: 38 },
    { id: '11', phase: '시선 설정', title: '오른쪽 면접관 시선 보정', image: '/assets/scenario/step-11.png', x: 89, y: 38 },

    { id: '12-1', phase: '면접 진행', title: '동반 면접자 답변', image: '/assets/scenario/step-12-1.png', x: 70, y: 67 },
    { id: '12-2', phase: '면접 진행', title: '동반 면접자 답변', image: '/assets/scenario/step-12-2.png', x: 82, y: 67 },
    { id: '12-3', phase: '면접 진행', title: '내 답변 진행', image: '/assets/scenario/step-12-3.png', x: 94, y: 67 },
    { id: '13', phase: '면접 진행', title: '답변 피드백 확인', image: '/assets/scenario/step-13.png', repeat: true, x: 82, y: 91 },

    { id: '14', phase: '완료', title: '면접 종료', image: '/assets/scenario/step-14.png', x: 64, y: 91 },
    { id: '15', phase: '결과', title: '면접 결과 분석', image: '/assets/scenario/step-15.png', x: 46, y: 91 },
    { id: '16', phase: '결과', title: '면접 기록 확인', image: '/assets/scenario/step-16.png', x: 28, y: 91 },
];

const scenarioConnections = [
    { from: '01', to: '02' },
    { from: '02', to: '03' },
    { from: '03', to: '04' },
    { from: '04', to: '05' },
    { from: '05', to: '06' },
    { from: '06', to: '07' },

    { from: '07', to: '08-1-1', route: 'branch-top-left' },
    { from: '07', to: '08-2', route: 'branch-top-down' },

    { from: '08-1-1', to: '08-1-2' },
    { from: '08-1-2', to: '08-1-3' },

    { from: '08-1-3', to: '09-1-1' },
    { from: '08-2', to: '09-2' },

    { from: '09-1-1', to: '09-1-2' },
    { from: '09-1-2', to: '10' },
    { from: '09-2', to: '10', route: 'resume-to-calibration' },

    { from: '10', to: '11' },
    { from: '11', to: '12-1' },
    { from: '11', to: '12-2' },
    { from: '11', to: '12-3' },

    { from: '12-1', to: '13' },
    { from: '12-2', to: '13' },
    { from: '12-3', to: '13' },

    { from: '13', to: '14' },
    { from: '14', to: '15' },
    { from: '15', to: '16' },
];

const getScenarioOrder = (id) => {
    const baseOrder = Number(id.split('-')[0]);

    return baseOrder >= 14
        ? baseOrder + 1
        : baseOrder;
};

const buildPolylinePath = (points) => {
    if (!points.length) {
        return '';
    }

    return points
        .map((point, index) =>
            `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
        )
        .join(' ');
};

const createScenarioPath = (from, to, route, anchors) => {
    const fromAnchor = anchors[from.id];
    const toAnchor = anchors[to.id];

    if (!fromAnchor || !toAnchor) {
        return '';
    }

    if (route === 'resume-to-calibration') {
        const start = fromAnchor.top;
        const end = toAnchor.left;

        const lowerLaneY = start.y - 7;
        const sideLaneX = end.x - 4;

        return buildPolylinePath([
            start,
            {
                x: start.x,
                y: lowerLaneY,
            },
            {
                x: sideLaneX,
                y: lowerLaneY,
            },
            {
                x: sideLaneX,
                y: end.y,
            },
            end,
        ]);
    }

    if (route === 'branch-top-down') {
        const start = fromAnchor.bottom;
        const end = toAnchor.left;

        const topLaneY = 28;
        const sideLaneX = end.x - 2.5;

        return buildPolylinePath([
            start,
            {
                x: start.x,
                y: topLaneY,
            },
            {
                x: sideLaneX,
                y: topLaneY,
            },
            {
                x: sideLaneX,
                y: end.y,
            },
            end,
        ]);
    }

    if (route === 'branch-top-left') {
        const start = fromAnchor.bottom;
        const end = toAnchor.top;
        const middleY = (start.y + end.y) / 2;

        return buildPolylinePath([
            start,
            {
                x: start.x,
                y: middleY,
            },
            {
                x: end.x,
                y: middleY,
            },
            end,
        ]);
    }

    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        const movingRight = deltaX > 0;

        const start = movingRight
            ? fromAnchor.right
            : fromAnchor.left;

        const end = movingRight
            ? toAnchor.left
            : toAnchor.right;

        const middleX = (start.x + end.x) / 2;

        return buildPolylinePath([
            start,
            {
                x: middleX,
                y: start.y,
            },
            {
                x: middleX,
                y: end.y,
            },
            end,
        ]);
    }

    const movingDown = deltaY > 0;

    const start = movingDown
        ? fromAnchor.bottom
        : fromAnchor.top;

    const end = movingDown
        ? toAnchor.top
        : toAnchor.bottom;

    const middleY = (start.y + end.y) / 2;

    return buildPolylinePath([
        start,
        {
            x: start.x,
            y: middleY,
        },
        {
            x: end.x,
            y: middleY,
        },
        end,
    ]);
};

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
    const section2Ref = useRef(null);
    const section3Ref = useRef(null);
    const scenarioMapContentRef = useRef(null);
    const scenarioPreviewRefs = useRef({});

    const [messageStep, setMessageStep] = useState(0);
    const [isFirstVisit] = useState(() => {
        return sessionStorage.getItem('mainVideoPlayed') !== 'true';
    });
    const [infoIndex, setInfoIndex] = useState(0);
    const [nextInfoIndex, setNextInfoIndex] = useState(null);
    const [isInfoSliding, setIsInfoSliding] = useState(false);
    const [isVideoEnded, setIsVideoEnded] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    const [isFaqVisible, setIsFaqVisible] = useState(false);
    const [selectedScenarioStep, setSelectedScenarioStep] = useState(null);
    const [scenarioAnchors, setScenarioAnchors] = useState({});
    const [isScenarioVisible, setIsScenarioVisible] = useState(false);

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

    useEffect(() => {
        const mainPage = document.querySelector('.main-page');

        if (!mainPage) {
            return;
        }

        const handleScroll = () => {
            setIsScrolled(mainPage.scrollTop >= window.innerHeight * 0.5);
        };

        mainPage.addEventListener('scroll', handleScroll);

        return () => {
            mainPage.removeEventListener('scroll', handleScroll);
        };
    }, []);

    useEffect(() => {
        const section2 = section2Ref.current;
        const mainPage = document.querySelector('.main-page');

        if (!section2 || !mainPage) {
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsFaqVisible(entry.intersectionRatio >= 0.35);
            },
            {
                root: mainPage,
                threshold: 0.35,
            },
        );

        observer.observe(section2);

        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        const section3 = section3Ref.current;
        const mainPage = document.querySelector('.main-page');

        if (!section3 || !mainPage) {
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsScenarioVisible(entry.intersectionRatio >= 0.35);
            },
            {
                root: mainPage,
                threshold: 0.35,
            },
        );

        observer.observe(section3);

        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!selectedScenarioStep) {
            return;
        }

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setSelectedScenarioStep(null);
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [selectedScenarioStep]);

    useEffect(() => {
        const mapContent = scenarioMapContentRef.current;

        if (!mapContent) {
            return;
        }

        const updateScenarioAnchors = () => {
            const mapRect = mapContent.getBoundingClientRect();

            if (!mapRect.width || !mapRect.height) {
                return;
            }

            const nextAnchors = {};

            interviewScenarioSteps.forEach((step) => {
                const preview = scenarioPreviewRefs.current[step.id];

                if (!preview) {
                    return;
                }

                const previewRect = preview.getBoundingClientRect();

                const left =
                    ((previewRect.left - mapRect.left) / mapRect.width) * 100;

                const right =
                    ((previewRect.right - mapRect.left) / mapRect.width) * 100;

                const top =
                    ((previewRect.top - mapRect.top) / mapRect.height) * 100;

                const bottom =
                    ((previewRect.bottom - mapRect.top) / mapRect.height) * 100;

                const centerX = (left + right) / 2;
                const centerY = (top + bottom) / 2;

                nextAnchors[step.id] = {
                    left: {
                        x: left,
                        y: centerY,
                    },
                    right: {
                        x: right,
                        y: centerY,
                    },
                    top: {
                        x: centerX,
                        y: top,
                    },
                    bottom: {
                        x: centerX,
                        y: bottom,
                    },
                };
            });

            setScenarioAnchors(nextAnchors);
        };

        updateScenarioAnchors();

        const resizeObserver = new ResizeObserver(() => {
            updateScenarioAnchors();
        });

        resizeObserver.observe(mapContent);

        Object.values(scenarioPreviewRefs.current).forEach((preview) => {
            if (preview) {
                resizeObserver.observe(preview);
            }
        });

        window.addEventListener('resize', updateScenarioAnchors);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateScenarioAnchors);
        };
    }, []);

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

            <nav
                className={`user-floating-menu ${isScrolled ? 'scrolled' : ''}`}
                aria-label="사용자 메뉴"
            >
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

            <section
                ref={section2Ref}
                className={`main-card section2 ${isFaqVisible ? 'faq-visible' : ''}`}
            >
                <div className="main-faq-background" aria-hidden="true" />

                <div className="main-faq-container">
                    <div className="main-faq-heading">
                        <h2>궁금한 내용을 확인해 보세요</h2>
                    </div>

                    <div className="main-faq-groups">
                        {faqGroups.map((group, groupIndex) => {
                            return (
                                <article
                                    key={group.title}
                                    className="main-faq-group"
                                    style={{
                                        '--faq-delay': `${groupIndex * 0.08}s`,
                                    }}
                                >
                                    <h3 className="main-faq-group-title">
                                        {group.title}
                                    </h3>

                                    <div className="main-faq-list">
                                        {group.items.map((item, itemIndex) => (
                                            <div
                                                key={item.question}
                                                className="main-faq-item"
                                            >
                                                <div
                                                    className="main-faq-question main-faq-message"
                                                    style={{
                                                        '--message-delay':
                                                            `${itemIndex * 1.25}s`,
                                                    }}
                                                >
                                                    <span className="main-faq-mark">
                                                        Q
                                                    </span>

                                                    <p>{item.question}</p>
                                                </div>

                                                <div
                                                    className="main-faq-answer main-faq-message"
                                                    style={{
                                                        '--message-delay':
                                                            `${itemIndex * 1.25 + 0.55}s`,
                                                    }}
                                                >
                                                    <span className="main-faq-mark">
                                                        A
                                                    </span>

                                                    <p>{item.answer}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section
                ref={section3Ref}
                className={`main-card section3 ${isScenarioVisible ? 'scenario-visible' : ''
                    }`}
            >
                <div className="main-scenario-background" aria-hidden="true" />

                <div className="main-scenario-container">
                    <header className="main-scenario-heading">
                        <h2>AI 모의면접 진행 시나리오</h2>
                    </header>

                    <div className="main-scenario-map">
                        <div
                            ref={scenarioMapContentRef}
                            className="main-scenario-map-content"
                        >
                            <svg
                                className="main-scenario-lines"
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                                aria-hidden="true"
                            >
                                <defs>
                                    {/* 좌우 연결 화살표 */}
                                    <marker
                                        id="scenarioArrowHorizontal"
                                        viewBox="0 0 6 6"
                                        markerWidth="6"
                                        markerHeight="6"
                                        refX="5.4"
                                        refY="3"
                                        orient="auto"
                                        markerUnits="strokeWidth"
                                    >
                                        <path
                                            d="M0,0 L6,3 L0,6 Z"
                                            fill="#487460"
                                            stroke="none"
                                        />
                                    </marker>

                                    {/* 상하 연결 화살표 */}
                                    <marker
                                        id="scenarioArrowVertical"
                                        viewBox="0 0 6 6"
                                        markerWidth="6"
                                        markerHeight="6"
                                        refX="6.7"
                                        refY="3"
                                        orient="auto"
                                        markerUnits="strokeWidth"
                                    >
                                        <path
                                            d="M0,0 L6,3 L0,6 Z"
                                            fill="#487460"
                                            stroke="none"
                                        />
                                    </marker>
                                </defs>

                                {scenarioConnections.map(
                                    ({ from: fromId, to: toId, route }) => {
                                        const from = interviewScenarioSteps.find(
                                            (step) => step.id === fromId,
                                        );

                                        const to = interviewScenarioSteps.find(
                                            (step) => step.id === toId,
                                        );

                                        if (!from || !to) {
                                            return null;
                                        }

                                        const deltaX = to.x - from.x;
                                        const deltaY = to.y - from.y;

                                        const isVerticalConnection =
                                            Boolean(route) ||
                                            Math.abs(deltaY) > Math.abs(deltaX);

                                        const pathData = createScenarioPath(
                                            from,
                                            to,
                                            route,
                                            scenarioAnchors,
                                        );

                                        if (!pathData) {
                                            return null;
                                        }

                                        const connectionOrder = getScenarioOrder(to.id);

                                        return (
                                            <path
                                                key={`${fromId}-${toId}`}
                                                className="main-scenario-connection scenario-appear"
                                                d={pathData}
                                                style={{
                                                    '--scenario-delay':
                                                        `${(connectionOrder - 1) * 0.55}s`,
                                                }}
                                                markerEnd={
                                                    isVerticalConnection
                                                        ? 'url(#scenarioArrowVertical)'
                                                        : 'url(#scenarioArrowHorizontal)'
                                                }
                                            />
                                        );
                                    },
                                )}

                                <path
                                    className="main-scenario-loop-line main-scenario-connection scenario-appear"
                                    style={{
                                        '--scenario-delay': `${(14 - 1) * 0.55}s`,
                                    }}
                                    d="M 82 84 C 99 97, 103 68, 94 64"
                                    markerEnd="url(#scenarioArrowVertical)"
                                />
                            </svg>

                            <div className="main-scenario-zone zone-entry">ENTRY</div>
                            <div className="main-scenario-zone zone-setup">SETUP</div>
                            <div className="main-scenario-zone zone-interview">INTERVIEW</div>
                            <div className="main-scenario-zone zone-result">RESULT</div>

                            {interviewScenarioSteps.map((step) => {
                                const scenarioOrder = getScenarioOrder(step.id);

                                return (
                                    <article
                                        key={`${step.id}-${step.title}`}
                                        className={`main-scenario-step scenario-appear ${step.repeat ? 'repeat-step' : ''
                                            }`}
                                        style={{
                                            '--scenario-delay': `${(scenarioOrder - 1) * 0.55}s`,
                                            '--scenario-x': `${step.x}%`,
                                            '--scenario-y': `${step.y}%`,
                                        }}
                                    >
                                        <button
                                            ref={(element) => {
                                                if (element) {
                                                    scenarioPreviewRefs.current[step.id] = element;
                                                } else {
                                                    delete scenarioPreviewRefs.current[step.id];
                                                }
                                            }}
                                            type="button"
                                            className="main-scenario-preview"
                                            onClick={() => setSelectedScenarioStep(step)}
                                            aria-label={`${step.id}단계 ${step.title} 화면 크게 보기`}
                                        >
                                            <img
                                                src={step.image}
                                                alt={`${step.title} 실행 화면`}
                                                onError={(event) => {
                                                    event.currentTarget.style.display = 'none';
                                                }}
                                            />
                                            <span className="main-scenario-placeholder">
                                                <span>SCREENSHOT</span>
                                                <small>{step.image}</small>
                                            </span>
                                            <span className="main-scenario-zoom" aria-hidden="true">＋</span>
                                        </button>

                                        <div className="main-scenario-step-info">
                                            <div className="main-scenario-step-topline">
                                                <span className="main-scenario-number">{step.id}</span>
                                                <span className="main-scenario-phase">{step.phase}</span>
                                            </div>
                                            <h3>{step.title}</h3>
                                            {step.branch && (
                                                <span className="main-scenario-branch">{step.branch}</span>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}

                            <div
                                className="main-scenario-loop-label scenario-appear"
                                style={{
                                    '--scenario-delay': `${(14 - 1) * 0.55}s`,
                                }}
                            >
                                <strong>5회 반복</strong>
                                <span>면접 답변 · 피드백</span>
                            </div>
                        </div>
                    </div>
                </div>

                {selectedScenarioStep && (
                    <div
                        className="main-scenario-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${selectedScenarioStep.title} 실행 화면`}
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) {
                                setSelectedScenarioStep(null);
                            }
                        }}
                    >
                        <div className="main-scenario-modal-content">
                            <div className="main-scenario-modal-header">
                                <div>
                                    <span>{selectedScenarioStep.id} · {selectedScenarioStep.phase}</span>
                                    <h3>{selectedScenarioStep.title}</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedScenarioStep(null)}
                                    aria-label="확대 화면 닫기"
                                >
                                    ×
                                </button>
                            </div>

                            <div className="main-scenario-modal-image">
                                <img
                                    src={selectedScenarioStep.image}
                                    alt={`${selectedScenarioStep.title} 실행 화면 크게 보기`}
                                    onError={(event) => {
                                        event.currentTarget.style.display = 'none';
                                    }}
                                />
                                <span className="main-scenario-placeholder modal-placeholder">
                                    <span>SCREENSHOT</span>
                                    <small>{selectedScenarioStep.image}</small>
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </main>
    );
}

export default Main;