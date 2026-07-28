import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../../config/apiConfig';
import '../../index.css';
import './interview.css';

const INTERVIEW_COMPLETE_CONFETTI = Array.from(
    { length: 36 },
    (_, index) => ({
        id: index,
        left: `${3 + ((index * 17) % 94)}%`,
        delay: `${(index % 12) * 0.08}s`,
        duration: `${1.8 + (index % 5) * 0.25}s`,
        rotation: `${(index * 47) % 360}deg`,
        drift: `${-90 + ((index * 37) % 180)}px`,
        colorIndex: index % 6,
    }),
);

function Interview() {
    const navigate = useNavigate();

    const handleCompleteNavigation = (path) => {
        navigate(path, { replace: true });
    };

    const INTERVIEWER_DEFAULT_VIDEOS = [
        {
            url: '/assets/interviewer-avatar-video1.mp4',
            probability: 0.4,
        },
        {
            url: '/assets/interviewer-avatar-video2.mp4',
            probability: 0.4,
        },
        {
            url: '/assets/interviewer-avatar-video3.mp4',
            probability: 0.1,
        },
        {
            url: '/assets/interviewer-avatar-video4.mp4',
            probability: 0.1,
        },
    ];

    const QUESTION_AVATAR_VARIANTS = ['duo', 'main_avatar1', 'main_avatar2'];

    const pickQuestionDuoAvatarType = (data) => {
        const questionVariant = getRandomVideo(QUESTION_AVATAR_VARIANTS);
        return questionVariant === 'duo'
            ? data.duo_avatar_type
            : `${questionVariant}_${data.duo_avatar_type}`;
    };

    const getRandomInterviewerDefaultVideo = () => {
        const randomValue = Math.random();
        let accumulatedProbability = 0;

        for (const video of INTERVIEWER_DEFAULT_VIDEOS) {
            accumulatedProbability += video.probability;

            if (randomValue < accumulatedProbability) {
                return video.url;
            }
        }

        return INTERVIEWER_DEFAULT_VIDEOS[0].url;
    };

    const getRandomVideo = (videos) => {
        if (!Array.isArray(videos) || videos.length === 0) {
            return '';
        }

        const randomIndex =
            Math.floor(Math.random() * videos.length);

        return videos[randomIndex];
    };

    const fileInputRef = useRef(null);
    const chatEndRef = useRef(null);
    const websocketRef = useRef(null);
    const sessionCreatedRef = useRef(false);

    // 웹캠 및 비전 AI 처리 Refs
    const userVideoRef = useRef(null);
    const canvasRef = useRef(null);
    
    // 백엔드 전송용 (좌우 반전되지 않은 원본) 캔버스 추가
    const originalCanvasRef = useRef(document.createElement('canvas')); 
    
    const bgImageRef = useRef(new Image());
    const selfieSegmentationRef = useRef(null);
    const renderLoopRef = useRef(null);

    // 단일 지점(중앙) 영점 조절용 State
    const [calibrationPhase, setCalibrationPhase] = useState('ready');
    const [baselines, setBaselines] = useState({
        noseX: 0.5, irisX: 0.5, noseY: 0.5, irisY: 0.5
    });
    const [calibrationCountdown, setCalibrationCountdown] = useState(0);

    const [currentInterviewer, setCurrentInterviewer] = useState('hr');

    const candidateDelayTimerRef = useRef(null);

    const isRecordingAnswerRef = useRef(false);
    const isStartingAnswerRecordingRef = useRef(false);
    const pendingUserAnswerRef = useRef(null);
    const developerInterviewEndingRef = useRef(false);

    const candidateTypingTimerRef = useRef(null);
    const candidateFinishTimerRef = useRef(null);
    const candidateVideoRef = useRef(null);
    const candidateVideoAnimationRef = useRef(null);
    const candidateTransitionTimerRef = useRef([]);
    const candidateVideoDirectionRef = useRef(1);
    const candidateVideoPreviousTimeRef = useRef(null);

    const baselineRecorderRef = useRef(null);
    const baselineStreamRef = useRef(null);
    const baselineChunksRef = useRef([]);
    const baselineIntervalRef = useRef(null);
    const baselineAudioUrlRef = useRef(null);
    const baselineAudioRef = useRef(null);

    const answerRecorderRef = useRef(null);
    const answerStreamRef = useRef(null);
    const answerChunksRef = useRef([]);

    // 타이머 및 자동 녹음 상태 
    const [answerTimeLeft, setAnswerTimeLeft] = useState(60);
    const [autoRecordCountdown, setAutoRecordCountdown] = useState(null);

    // 실시간 시선 트래킹용 State
    const [realtimeGaze, setRealtimeGaze] = useState({ x: 0.5, y: 0.5 });
    const [isGazeLoss, setIsGazeLoss] = useState(false);

    // 면접 모드 선택 (기술, 인성, 혼합)
    const [interviewCategory, setInterviewCategory] = useState('mixed');

    const interviewerPlaybackIdRef = useRef(0);
    const isInterviewerStreamPlayingRef = useRef(false);
    const isDefaultVideoTransitioningRef = useRef(false);
    const pendingInterviewerMessageRef = useRef(null);
    const isReactionStreamActiveRef = useRef(false);
    const pendingQuestionAfterReactionRef = useRef(null);

    const [userId, setUserId] = useState('');
    const [step, setStep] = useState('loading');
    const [sessionId, setSessionId] = useState('');
    const [resumeName, setResumeName] = useState('');
    const [questionIndex, setQuestionIndex] = useState(0);
    const [totalQuestions, setTotalQuestions] = useState(0);
    const [selectedCandidates] = useState(() => {
        try {
            return JSON.parse(
                sessionStorage.getItem('selectedCandidates') || '[]',
            );
        } catch (error) {
            console.error('선택 면접자 정보 파싱 오류:', error);
            return [];
        }
    });
    const [candidateAnswerQueue, setCandidateAnswerQueue] = useState([]);
    const [activeCandidateAnswer, setActiveCandidateAnswer] = useState(null);
    const [typedCandidateText, setTypedCandidateText] = useState('');
    const [candidateTransition, setCandidateTransition] = useState('');
    const [isCandidateSceneReady, setIsCandidateSceneReady] = useState(false);

    const interviewerDefaultVideoRefs = [
        useRef(null),
        useRef(null),
    ];
    const interviewerStreamVideoRef = useRef(null);
    const interviewerVideoUrlRef = useRef(null);
    const interviewerStreamAbortRef = useRef(null);

    const [isInterviewerStreamVisible, setIsInterviewerStreamVisible] =
        useState(false);

    const [interviewerDefaultVideos, setInterviewerDefaultVideos] = useState(() => [
        getRandomInterviewerDefaultVideo(),
        '',
    ]);

    const [activeDefaultVideoIndex, setActiveDefaultVideoIndex] = useState(0);

    const [isRecordingAnswer, setIsRecordingAnswer] = useState(false);
    const [isResumeUploading, setIsResumeUploading] = useState(false);
    const [hasExistingResume, setHasExistingResume] = useState(false);
    const [isResumeChecking, setIsResumeChecking] = useState(false);

    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isCameraChoiceModalOpen, setIsCameraChoiceModalOpen] = useState(true);
    const [hasCameraDevice, setHasCameraDevice] = useState(null);
    const [cameraUsageEnabled, setCameraUsageEnabled] = useState(false);

    const [answerMode, setAnswerMode] = useState('voice');
    const [interviewMode, setInterviewMode] = useState('user');
    const interviewModeRef = useRef('user');
    const [answerText, setAnswerText] = useState('');

    const [isBaselineRecording, setIsBaselineRecording] = useState(false);
    const [isBaselineSaving, setIsBaselineSaving] = useState(false);
    const [baselineSeconds, setBaselineSeconds] = useState(0);
    const [hasExistingBaseline, setHasExistingBaseline] = useState(false);
    const [isBaselineChecking, setIsBaselineChecking] = useState(false);
    const [existingBaselineMetrics, setExistingBaselineMetrics] = useState(null);
    const [pendingBaselineBlob, setPendingBaselineBlob] = useState(null);
    const [baselineAudioUrl, setBaselineAudioUrl] = useState('');
    const [isBaselinePreview, setIsBaselinePreview] = useState(false);

    const [isStartingAnswerRecording, setIsStartingAnswerRecording] = useState(false);
    const [hasUserAnsweredCurrentQuestion, setHasUserAnsweredCurrentQuestion] = useState(false);
    const [isProcessingAnswer, setIsProcessingAnswer] = useState(false);

    const [isInterviewerSpeaking, setIsInterviewerSpeaking] = useState(false);

    const changeInterviewMode = (mode) => {
        if (isRecordingAnswer || isStartingAnswerRecording || isProcessingAnswer) {
            return;
        }
        interviewModeRef.current = mode;
        setInterviewMode(mode);
    };

    const baselineGuideText = `
        안녕하세요. 지금부터 기본 음성 등록을 시작하겠습니다.

        저는 실제 면접 상황에서도 제 경험을 차분하고 명확하게 전달하기 위해
        꾸준히 연습하고 있습니다.

        새로운 업무를 맡게 되면 먼저 목표와 요구사항을 정확하게 파악하고,
        필요한 작업을 작은 단위로 나누어 순서대로 해결합니다.

        문제가 발생했을 때는 원인을 확인하고,
        팀원들과 진행 상황을 공유하면서 더 좋은 해결 방법을 찾으려고 노력합니다.

        저의 강점은 맡은 일을 끝까지 책임지고 완성하는 태도입니다.
        부족한 부분은 피드백을 통해 개선하고,
        배운 내용을 실제 업무에 적용하려고 합니다.

        이번 모의면접에서도 긴장하지 않고,
        저의 생각과 경험을 자연스럽게 전달하겠습니다.
    `;

    const [messages, setMessages] = useState([
        {
            id: 1,
            type: 'system',
            text: '면접 세션을 준비하고 있습니다.',
        },
    ]);

    const interviewCategoryLabel = {
        mixed: '실전 면접',
        technical: '기술 면접',
        hr: '인성 면접',
    }[interviewCategory];

    const currentQuestionLabel =
        currentInterviewer === 'tech'
            ? '기술 질문'
            : '인성 질문';

    const candidateProgressLabel =
        selectedCandidates.length > 0
            ? `지원자 ${selectedCandidates.length}명과 함께 진행`
            : '진행';

    const interviewProgressLabel = (() => {
        if (step === 'complete') {
            return '면접 종료';
        }

        if (step !== 'answer') {
            return `${interviewCategoryLabel} 준비 중`;
        }

        if (interviewCategory === 'mixed') {
            return `${interviewCategoryLabel} ${currentQuestionLabel} ${candidateProgressLabel}`;
        }

        return `${interviewCategoryLabel} ${candidateProgressLabel}`;
    })();

    useEffect(() => {
        let timer;
        if (isRecordingAnswer && answerTimeLeft > 0) {
            timer = setTimeout(() => {
                setAnswerTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (isRecordingAnswer && answerTimeLeft <= 0) {
            stopAnswerRecording();
            addMessage('interviewer', '네, 시간 관계상 답변은 여기까지 듣겠습니다.', getInterviewerName(currentInterviewer, ''));
        }
        return () => clearTimeout(timer);
    }, [isRecordingAnswer, answerTimeLeft]);

    useEffect(() => {
        let timer;
        if (autoRecordCountdown !== null && autoRecordCountdown > 0) {
            timer = setTimeout(() => {
                setAutoRecordCountdown(prev => prev - 1);
            }, 1000);
        } else if (autoRecordCountdown === 0) {
            setAutoRecordCountdown(null);
            if (!isRecordingAnswerRef.current && step === 'answer' && !isInterviewerSpeaking && !hasUserAnsweredCurrentQuestion) {
                startAnswerRecording();
            }
        }
        return () => clearTimeout(timer);
    }, [autoRecordCountdown, step, isInterviewerSpeaking, hasUserAnsweredCurrentQuestion]);


    const checkCameraDevice = async () => {
        if (!navigator.mediaDevices?.enumerateDevices) {
            setHasCameraDevice(false);
            return;
        }

        try {
            const devices =
                await navigator.mediaDevices.enumerateDevices();

            const hasVideoInput = devices.some(
                (device) => device.kind === 'videoinput',
            );

            setHasCameraDevice(hasVideoInput);
        } catch (error) {
            console.error('카메라 장치 확인 오류:', error);
            setHasCameraDevice(false);
        }
    };

    const isCandidateSpeaking = Boolean(activeCandidateAnswer);

    const isUserTurnActive =
        isRecordingAnswer || isStartingAnswerRecording;

    const processStatus = (() => {
        if (step === 'record') {
            if (isBaselineChecking) {
                return {
                    type: 'processing',
                    title: '기존 음성 정보를 확인하고 있습니다.',
                    description: '등록된 기본 음성 데이터가 있는지 확인하고 있습니다.',
                };
            }
            if (isBaselineRecording) {
                return {
                    type: 'recording',
                    title: '기본 음성을 녹음하고 있습니다.',
                    description: `가이드 문장을 읽어주세요. ${baselineSeconds}초 녹음 중입니다.`,
                };
            }
            if (isBaselineSaving) {
                return {
                    type: 'processing',
                    title: '기본 음성을 분석하고 있습니다.',
                    description: '말하기 속도와 음성 특성을 측정하고 있습니다.',
                };
            }
            return null;
        }
        if (step === 'resume') {
            if (isResumeChecking) {
                return {
                    type: 'processing',
                    title: '기존 이력서를 확인하고 있습니다.',
                    description: '등록된 이력서가 있는지 확인하고 있습니다.',
                };
            }
            if (isResumeUploading) {
                return {
                    type: 'processing',
                    title: '이력서를 분석하고 있습니다.',
                    description: '이력서 내용을 바탕으로 면접 질문을 생성하고 있습니다.',
                };
            }
            return null;
        }
        if (step === 'answer') {
            if (autoRecordCountdown !== null && autoRecordCountdown > 0) {
                return {
                    type: 'processing',
                    title: `답변을 준비하세요! (⏳ ${autoRecordCountdown}초 남음)`,
                    description: `${autoRecordCountdown}초 뒤 마이크가 켜지고 녹음이 자동으로 시작됩니다.`,
                };
            }
            if (isStartingAnswerRecording) {
                return {
                    type: 'processing',
                    title: '마이크를 연결하고 있습니다.',
                    description: '마이크가 연결되는 즉시 녹음이 시작됩니다.',
                };
            }
            if (isRecordingAnswer) {
                return {
                    type: 'recording',
                    title: `답변을 녹음하고 있습니다. ⏳ ${answerTimeLeft}초 남음`,
                    description: '답변을 완료하셨다면 화면 하단의 녹음 종료 버튼을 눌러 제출해주세요.',
                };
            }
            if (isProcessingAnswer) {
                return {
                    type: 'processing',
                    title: '답변 음성을 분석하고 있습니다.',
                    description: '음성 인식과 답변 평가를 진행하고 있습니다.',
                };
            }
            return null;
        }
        return null;
    })();

    const addMessage = (type, text, name = '') => {
        setMessages((prev) => [
            ...prev,
            {
                id: `${Date.now()}-${Math.random()}`,
                type,
                text,
                name,
            },
        ]);
    };

    const getInterviewerName = (questionType, avatar) => {
        if (
            questionType === 'technical' ||
            questionType === 'tech' ||
            avatar === 'middle_aged'
        ) {
            return '기술면접관';
        }

        if (
            questionType === 'hr' ||
            avatar === 'young'
        ) {
            return '인사담당자';
        }

        return '면접관';
    };

    const shuffleCandidateAnswers = (answers) => {
        const shuffled = [...answers];

        for (let index = shuffled.length - 1; index > 0; index -= 1) {
            const randomIndex = Math.floor(Math.random() * (index + 1));

            [shuffled[index], shuffled[randomIndex]] = [
                shuffled[randomIndex],
                shuffled[index],
            ];
        }

        return shuffled;
    };

    const playNextDefaultInterviewerVideo = () => {
        if (isDefaultVideoTransitioningRef.current) {
            return;
        }

        isDefaultVideoTransitioningRef.current = true;

        const currentIndex = activeDefaultVideoIndex;
        const nextIndex = currentIndex === 0 ? 1 : 0;

        const currentVideo =
            interviewerDefaultVideoRefs[currentIndex].current;

        const nextVideo =
            interviewerDefaultVideoRefs[nextIndex].current;

        if (!nextVideo) {
            isDefaultVideoTransitioningRef.current = false;
            return;
        }

        const nextVideoUrl = getRandomInterviewerDefaultVideo();

        const handleCanPlay = async () => {
            nextVideo.removeEventListener(
                'canplay',
                handleCanPlay,
            );

            try {
                nextVideo.currentTime = 0;
                await nextVideo.play();

                setActiveDefaultVideoIndex(nextIndex);

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (currentVideo) {
                            currentVideo.pause();
                            currentVideo.currentTime = 0;
                        }

                        isDefaultVideoTransitioningRef.current = false;
                    });
                });
            } catch (error) {
                isDefaultVideoTransitioningRef.current = false;

                if (error.name !== 'AbortError') {
                    console.error(
                        '[interview] 다음 기본 영상 재생 오류:',
                        error,
                    );
                }
            }
        };

        nextVideo.addEventListener(
            'canplay',
            handleCanPlay,
            { once: true },
        );

        nextVideo.pause();
        nextVideo.src = nextVideoUrl;
        nextVideo.load();

        setInterviewerDefaultVideos((previousVideos) => {
            const updatedVideos = [...previousVideos];
            updatedVideos[nextIndex] = nextVideoUrl;
            return updatedVideos;
        });
    };

    const restoreDefaultInterviewerVideo = () => {
        const streamVideo =
            interviewerStreamVideoRef.current;

        isInterviewerStreamPlayingRef.current = false;
        setIsInterviewerStreamVisible(false);

        if (interviewerStreamAbortRef.current) {
            interviewerStreamAbortRef.current.abort();
            interviewerStreamAbortRef.current = null;
        }

        if (streamVideo) {
            streamVideo.pause();
            streamVideo.removeAttribute('src');
            streamVideo.load();
        }

        if (interviewerVideoUrlRef.current) {
            URL.revokeObjectURL(
                interviewerVideoUrlRef.current,
            );

            interviewerVideoUrlRef.current = null;
        }

        playNextDefaultInterviewerVideo();
    };

    const startAvatarFetch = (text, avatar, duoAvatarType) => {
        if (!text) {
            return null;
        }

        const abortController = new AbortController();
        const handle = {
            chunks: [],
            done: false,
            ok: null,
            abortController,
            onChunk: null,
            onDone: null,
        };

        (async () => {
            try {
                const response = await fetch(
                    `${API_BASE_URL}/interviews/avatar-video-stream`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            text,
                            avatar,
                            duo_avatar_type: duoAvatarType,
                        }),
                        signal: abortController.signal,
                    },
                );

                if (!response.ok || !response.body) {
                    console.error(
                        '[interview] 아바타 영상 스트리밍 요청 실패:',
                        response.status,
                    );
                    handle.ok = false;
                    return;
                }

                const reader = response.body.getReader();

                while (true) {
                    const { done, value } = await reader.read();

                    if (done) {
                        break;
                    }

                    if (!value || value.byteLength === 0) {
                        continue;
                    }

                    handle.chunks.push(value);

                    if (handle.onChunk) {
                        handle.onChunk();
                    }
                }

                handle.ok = handle.chunks.length > 0;
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(
                        '[interview] 아바타 영상 스트리밍 실패:',
                        error,
                    );
                }
                handle.ok = false;
            } finally {
                handle.done = true;

                if (handle.onDone) {
                    handle.onDone();
                }
            }
        })();

        return handle;
    };

    const attachFetchToVideo = (handle) => {
        return new Promise((resolveOuter) => {
            const videoEl = interviewerStreamVideoRef.current;

            if (!handle || !videoEl) {
                resolveOuter(false);
                return;
            }

            if (
                interviewerStreamAbortRef.current &&
                interviewerStreamAbortRef.current !== handle.abortController
            ) {
                interviewerStreamAbortRef.current.abort();
            }
            interviewerStreamAbortRef.current = handle.abortController;

            if (interviewerVideoUrlRef.current) {
                URL.revokeObjectURL(interviewerVideoUrlRef.current);
                interviewerVideoUrlRef.current = null;
            }

            const MIME = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';

            if (
                !('MediaSource' in window) ||
                !MediaSource.isTypeSupported(MIME)
            ) {
                console.error(
                    '[interview] 이 브라우저는 아바타 영상 스트리밍을 지원하지 않습니다.',
                );
                restoreDefaultInterviewerVideo();
                resolveOuter(false);
                return;
            }

            let mediaSource = null;
            let sourceBuffer = null;
            const appendQueue = [];
            let appending = false;
            let started = false;
            let playAllowed = false;
            let settled = false;

            const finish = (result) => {
                if (settled) {
                    return;
                }
                settled = true;
                resolveOuter(result);
            };

            const flushQueue = () => {
                if (
                    !mediaSource ||
                    !sourceBuffer ||
                    appending ||
                    appendQueue.length === 0 ||
                    mediaSource.readyState !== 'open'
                ) {
                    return;
                }

                appending = true;

                try {
                    sourceBuffer.appendBuffer(appendQueue.shift());
                } catch (error) {
                    appending = false;
                    console.error(
                        '[interview] 영상 데이터 추가 오류:',
                        error,
                    );
                }
            };

            const monitorBuffer = () => {
                if (
                    !started ||
                    videoEl.ended ||
                    handle.abortController.signal.aborted
                ) {
                    return;
                }

                const buffered = videoEl.buffered;

                if (buffered.length > 0) {
                    const bufferedEnd = buffered.end(buffered.length - 1);
                    const ahead = bufferedEnd - videoEl.currentTime;
                    const PAUSE_THRESHOLD = 0.05;
                    const RESUME_THRESHOLD = 1.0;

                    if (!handle.done) {
                        if (!videoEl.paused && ahead < PAUSE_THRESHOLD) {
                            videoEl.pause();
                        } else if (
                            videoEl.paused &&
                            playAllowed &&
                            ahead >= RESUME_THRESHOLD
                        ) {
                            videoEl.play().catch(() => { });
                        }
                    } else if (videoEl.paused && playAllowed) {
                        videoEl.play().catch(() => { });
                    }
                }

                setTimeout(monitorBuffer, 200);
            };

            const initializeStreamVideo = async () => {
                mediaSource = new MediaSource();
                const objectUrl = URL.createObjectURL(mediaSource);
                interviewerVideoUrlRef.current = objectUrl;
                isInterviewerStreamPlayingRef.current = true;
                setIsInterviewerStreamVisible(false);

                videoEl.pause();
                videoEl.loop = false;
                videoEl.muted = false;
                videoEl.removeAttribute('src');
                videoEl.src = objectUrl;
                videoEl.load();

                await new Promise((resolve, reject) => {
                    mediaSource.addEventListener(
                        'sourceopen',
                        () => resolve(),
                        { once: true },
                    );
                    mediaSource.addEventListener(
                        'error',
                        () => reject(new Error('MediaSource를 열지 못했습니다.')),
                        { once: true },
                    );
                });

                if (handle.abortController.signal.aborted) {
                    throw new DOMException(
                        '스트리밍 요청이 취소되었습니다.',
                        'AbortError',
                    );
                }

                sourceBuffer = mediaSource.addSourceBuffer(MIME);
                sourceBuffer.mode = 'sequence';

                sourceBuffer.addEventListener('updateend', () => {
                    appending = false;

                    if (handle.done && appendQueue.length === 0) {
                        if (mediaSource.readyState === 'open') {
                            try {
                                mediaSource.endOfStream();
                            } catch (error) { }
                        }
                    } else {
                        flushQueue();
                    }
                });

                sourceBuffer.addEventListener('error', (error) => {
                    console.error(
                        '[interview] MSE SourceBuffer 오류:',
                        error,
                    );
                });

                started = true;
                playAllowed = true;
                monitorBuffer();
            };

            const handleChunk = async (chunk) => {
                if (!started) {
                    try {
                        await initializeStreamVideo();
                    } catch (error) {
                        if (error.name !== 'AbortError') {
                            console.error(
                                '[interview] 아바타 영상 스트리밍 실패:',
                                error,
                            );
                            restoreDefaultInterviewerVideo();
                        }
                        finish(false);
                        return;
                    }
                }

                appendQueue.push(chunk);
                flushQueue();
            };

            const handleDone = () => {
                if (!started) {
                    console.error(
                        '[interview] 생성된 아바타 영상 데이터가 없습니다.',
                    );
                    restoreDefaultInterviewerVideo();
                    finish(false);
                    return;
                }

                if (
                    mediaSource &&
                    sourceBuffer &&
                    !appending &&
                    appendQueue.length === 0 &&
                    mediaSource.readyState === 'open'
                ) {
                    try {
                        mediaSource.endOfStream();
                    } catch (error) { }
                }

                finish(true);
            };

            let idx = 0;
            let draining = false;

            const drain = async () => {
                if (draining) {
                    return;
                }
                draining = true;

                try {
                    while (idx < handle.chunks.length) {
                        await handleChunk(handle.chunks[idx]);
                        idx += 1;
                    }
                    if (handle.done && idx >= handle.chunks.length) {
                        handleDone();
                    }
                } finally {
                    draining = false;
                }
            };

            handle.onChunk = () => { drain(); };
            handle.onDone = () => { drain(); };

            drain();
        });
    };

    const playInterviewerVideoStream = (text, avatar, duoAvatarType) => {
        const handle = startAvatarFetch(text, avatar, duoAvatarType);

        if (!handle) {
            return Promise.resolve(false);
        }

        return attachFetchToVideo(handle);
    };

    const getCandidateVideoUrl = (videoUrl) => {
        return videoUrl || '';
    };

    const getCandidatePosition = (candidateId) => {
        const sortedCandidates = [...selectedCandidates].sort(
            (candidateA, candidateB) =>
                Number(candidateA.id) - Number(candidateB.id),
        );

        const candidateIndex = sortedCandidates.findIndex(
            (candidate) =>
                Number(candidate.id) === Number(candidateId),
        );

        return candidateIndex === 0 ? 'left' : 'right';
    };

    const getCandidateWithMedia = (candidateAnswer) => {
        const answerCandidateId =
            candidateAnswer.id ?? candidateAnswer.candidate_id;

        const selectedCandidate = selectedCandidates.find(
            (candidate) =>
                Number(candidate.id) === Number(answerCandidateId),
        );

        return {
            ...selectedCandidate,
            ...candidateAnswer,
            id: answerCandidateId,
            video_url:
                candidateAnswer.video_url ||
                selectedCandidate?.video_url ||
                '',
        };
    };

    const stopCandidateVideoAnimation = () => {
        if (candidateVideoAnimationRef.current) {
            cancelAnimationFrame(candidateVideoAnimationRef.current);
            candidateVideoAnimationRef.current = null;
        }

        candidateVideoPreviousTimeRef.current = null;
        candidateVideoDirectionRef.current = 1;
    };

    const playQuestionStream = (data, prefetchHandle) => {
        isReactionStreamActiveRef.current = false;

        setQuestionIndex(data.current_index - 1);
        setTotalQuestions(data.total_questions);
        setStep('answer');

        const isTechQuestion = data.interviewer_type === 'technical' || data.avatar === 'middle_aged';
        setCurrentInterviewer(isTechQuestion ? 'tech' : 'hr');

        const playbackId = interviewerPlaybackIdRef.current + 1;
        interviewerPlaybackIdRef.current = playbackId;

        pendingInterviewerMessageRef.current = {
            playbackId,
            questionText: data.question_text,
            name: getInterviewerName(
                data.interviewer_type,
                data.avatar,
            ),
        };

        setIsInterviewerSpeaking(true);

        const streamPromise = prefetchHandle
            ? attachFetchToVideo(prefetchHandle)
            : playInterviewerVideoStream(
                data.question_text,
                data.avatar,
                pickQuestionDuoAvatarType(data),
            );

        streamPromise.then((success) => {
            if (
                success === false &&
                interviewerPlaybackIdRef.current === playbackId
            ) {
                const pendingMessage =
                    pendingInterviewerMessageRef.current;

                if (
                    pendingMessage &&
                    pendingMessage.playbackId === playbackId
                ) {
                    addMessage(
                        'interviewer',
                        pendingMessage.questionText,
                        pendingMessage.name,
                    );

                    pendingInterviewerMessageRef.current = null;
                }

                setIsInterviewerSpeaking(false);
            }
        });

        stopCandidateVideoAnimation();

        setActiveCandidateAnswer(null);
        setTypedCandidateText('');
        setCandidateTransition('');
        setIsCandidateSceneReady(false);

        setCandidateAnswerQueue(
            shuffleCandidateAnswers(
                data.candidate_answers ?? [],
            ),
        );
    };

    const playQueuedQuestionOrRestoreDefault = () => {
        if (isReactionStreamActiveRef.current) {
            isReactionStreamActiveRef.current = false;

            const queued = pendingQuestionAfterReactionRef.current;

            if (queued) {
                pendingQuestionAfterReactionRef.current = null;

                restoreDefaultInterviewerVideo();
                playQuestionStream(queued.data, queued.prefetchHandle);
                return;
            }
        }

        restoreDefaultInterviewerVideo();
    };

    const startCandidateVideoPingPong = () => {
        const video = candidateVideoRef.current;

        if (!video) {
            console.error('지원자 영상 요소를 찾지 못했습니다.');
            return;
        }

        if (!Number.isFinite(video.duration) || video.duration <= 0) {
            console.error('지원자 영상 duration 오류:', video.duration);
            return;
        }

        stopCandidateVideoAnimation();

        video.pause();

        candidateVideoDirectionRef.current = 1;
        candidateVideoPreviousTimeRef.current = null;
        video.currentTime = 0;

        const animateVideo = (timestamp) => {
            const currentVideo = candidateVideoRef.current;

            if (!currentVideo || !currentVideo.isConnected) {
                stopCandidateVideoAnimation();
                return;
            }

            if (candidateVideoPreviousTimeRef.current === null) {
                candidateVideoPreviousTimeRef.current = timestamp;
            }

            const elapsedSeconds =
                (timestamp - candidateVideoPreviousTimeRef.current) / 1000;

            candidateVideoPreviousTimeRef.current = timestamp;

            const nextTime =
                currentVideo.currentTime +
                elapsedSeconds * candidateVideoDirectionRef.current;

            if (nextTime >= currentVideo.duration) {
                currentVideo.currentTime = currentVideo.duration;
                candidateVideoDirectionRef.current = -1;
            } else if (nextTime <= 0) {
                currentVideo.currentTime = 0;
                candidateVideoDirectionRef.current = 1;
            } else {
                currentVideo.currentTime = nextTime;
            }

            candidateVideoAnimationRef.current =
                requestAnimationFrame(animateVideo);
        };

        candidateVideoAnimationRef.current =
            requestAnimationFrame(animateVideo);
    };

    const getWebSocketUrl = () => {
        return API_BASE_URL
            .replace(/^http:/, 'ws:')
            .replace(/^https:/, 'wss:');
    };

    const createInterviewSession = async () => {
        try {
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

            await Promise.all([
                checkExistingBaseline(userId),
                checkExistingResume(userId),
            ]);

            setStep('record');

            addMessage(
                'system',
                '면접 준비가 완료되었습니다. 기본 음성 정보를 확인해주세요.',
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

    const checkExistingBaseline = async (currentUserId) => {
        setIsBaselineChecking(true);

        try {
            const response = await fetch(
                `${API_BASE_URL}/interviews/baseline-voice/${encodeURIComponent(currentUserId)}`,
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    '기존 음성 정보를 확인하지 못했습니다.',
                );
            }

            setHasExistingBaseline(data.has_baseline);

            if (data.has_baseline) {
                setExistingBaselineMetrics(data.metrics);
            } else {
                setExistingBaselineMetrics(null);
            }
        } catch (error) {
            console.error('기존 음성 조회 오류:', error);

            setHasExistingBaseline(false);
            setExistingBaselineMetrics(null);
        } finally {
            setIsBaselineChecking(false);
        }
    };

    const handleUseExistingBaseline = () => {
        if (!hasExistingBaseline || isBaselineSaving) {
            return;
        }

        const wpm = existingBaselineMetrics?.wpm;

        addMessage(
            'system',
            wpm
                ? `기존에 등록한 기본 음성을 사용합니다. 기존 말하기 속도는 약 ${Math.round(wpm)} WPM입니다.`
                : '기존에 등록한 기본 음성을 사용합니다.',
        );

        setStep('resume');
    };

    const handleRerecordBaseline = () => {
        setHasExistingBaseline(false);
        setExistingBaselineMetrics(null);

        addMessage(
            'system',
            '새 기본 음성 녹음을 시작합니다.',
        );

        handleRecord();
    };

    const replayBaselineRecording = async () => {
        const audio = baselineAudioRef.current;

        if (!audio) {
            return;
        }

        try {
            audio.currentTime = 0;
            await audio.play();
        } catch (error) {
            console.error('녹음 재생 오류:', error);

            addMessage(
                'system',
                '녹음 내용을 재생하지 못했습니다.',
            );
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
                `${API_BASE_URL}/interviews/${sessionId}/use-existing-resume?user_id=${encodeURIComponent(userId)}&interview_mode=${interviewCategory}`,
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

            startVisionCalibration();
        } catch (error) {
            console.error('기존 이력서 사용 오류:', error);

            setIsResumeUploading(false);

            addMessage(
                'system',
                error.message ||
                '기존 이력서를 처리하는 중 오류가 발생했습니다.',
            );
        }
    };

    const handleRecord = async () => {
        if (
            isBaselineRecording ||
            isBaselineSaving
        ) {
            return;
        }

        if (baselineAudioUrlRef.current) {
            URL.revokeObjectURL(baselineAudioUrlRef.current);
            baselineAudioUrlRef.current = null;
        }

        setPendingBaselineBlob(null);
        setBaselineAudioUrl('');

        if (!navigator.mediaDevices?.getUserMedia) {
            addMessage(
                'system',
                '현재 브라우저에서는 음성 녹음을 지원하지 않습니다.',
            );
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            baselineStreamRef.current = stream;
            baselineChunksRef.current = [];

            let mimeType = '';

            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                mimeType = 'audio/webm';
            }

            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);

            baselineRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    baselineChunksRef.current.push(event.data);
                }
            };

            recorder.onerror = (event) => {
                console.error('베이스 음성 녹음 오류:', event);

                addMessage(
                    'system',
                    '음성을 녹음하는 중 오류가 발생했습니다.',
                );
            };

            recorder.start(1000);

            setBaselineSeconds(0);
            setIsBaselineRecording(true);

            addMessage(
                'system',
                '기본 음성 녹음을 시작했습니다. 화면의 가이드 문장을 평소 말하는 목소리로 읽어주세요.',
            );

            baselineIntervalRef.current = setInterval(() => {
                setBaselineSeconds((prev) => {
                    const nextSeconds = prev + 1;

                    if (nextSeconds >= 60) {
                        setTimeout(() => {
                            stopBaselineRecording();
                        }, 0);
                    }

                    return nextSeconds;
                });
            }, 1000);
        } catch (error) {
            console.error('마이크 접근 오류:', error);

            if (error.name === 'NotAllowedError') {
                addMessage(
                    'system',
                    '마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크 사용을 허용해주세요.',
                );
            } else if (error.name === 'NotFoundError') {
                addMessage(
                    'system',
                    '사용할 수 있는 마이크를 찾지 못했습니다.',
                );
            } else {
                addMessage(
                    'system',
                    '마이크를 시작하지 못했습니다.',
                );
            }
        }
    };

    const stopBaselineRecording = async () => {
        const recorder = baselineRecorderRef.current;

        if (
            !recorder ||
            recorder.state === 'inactive' ||
            isBaselineSaving
        ) {
            return;
        }

        if (baselineIntervalRef.current) {
            clearInterval(baselineIntervalRef.current);
            baselineIntervalRef.current = null;
        }

        setIsBaselineRecording(false);

        try {
            const audioBlob = await new Promise((resolve, reject) => {
                recorder.onstop = () => {
                    const blob = new Blob(
                        baselineChunksRef.current,
                        {
                            type:
                                recorder.mimeType ||
                                'audio/webm',
                        },
                    );

                    if (blob.size === 0) {
                        reject(
                            new Error(
                                '녹음된 음성 데이터가 없습니다.',
                            ),
                        );
                        return;
                    }

                    resolve(blob);
                };

                recorder.onerror = () => {
                    reject(
                        new Error(
                            '녹음 파일 생성에 실패했습니다.',
                        ),
                    );
                };

                recorder.stop();
            });

            baselineStreamRef.current
                ?.getTracks()
                .forEach((track) => track.stop());

            baselineStreamRef.current = null;
            baselineRecorderRef.current = null;
            baselineChunksRef.current = [];

            if (baselineAudioUrlRef.current) {
                URL.revokeObjectURL(
                    baselineAudioUrlRef.current,
                );
            }

            const audioUrl = URL.createObjectURL(audioBlob);

            baselineAudioUrlRef.current = audioUrl;

            setPendingBaselineBlob(audioBlob);
            setBaselineAudioUrl(audioUrl);
            setIsBaselinePreview(true);

            addMessage(
                'system',
                '음성 녹음이 완료되었습니다. 녹음 내용을 확인한 후 확정하거나 다시 녹음해주세요.',
            );
        } catch (error) {
            console.error('베이스 음성 녹음 종료 오류:', error);

            addMessage(
                'system',
                error.message ||
                '녹음 파일을 생성하는 중 오류가 발생했습니다.',
            );

            baselineStreamRef.current
                ?.getTracks()
                .forEach((track) => track.stop());

            baselineStreamRef.current = null;
            baselineRecorderRef.current = null;
            baselineChunksRef.current = [];
        }
    };

    const confirmBaselineRecording = async () => {
        if (
            !pendingBaselineBlob ||
            isBaselineSaving
        ) {
            return;
        }

        setIsBaselineSaving(true);

        try {
            const formData = new FormData();

            formData.append('user_id', userId);
            formData.append(
                'audio_file',
                pendingBaselineBlob,
                'baseline_voice.webm',
            );

            const response = await fetch(
                `${API_BASE_URL}/interviews/baseline-voice`,
                {
                    method: 'POST',
                    body: formData,
                },
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    '기본 음성 분석에 실패했습니다.',
                );
            }

            setHasExistingBaseline(true);
            setExistingBaselineMetrics(data.metrics);

            addMessage(
                'system',
                `음성 등록이 완료되었습니다. 기본 말하기 속도는 약 ${Math.round(
                    data.metrics.wpm,
                )} WPM으로 측정되었습니다.`,
            );

            clearBaselinePreview();
            setStep('resume');
        } catch (error) {
            console.error('베이스 음성 저장 오류:', error);

            addMessage(
                'system',
                error.message ||
                '기본 음성을 저장하는 중 오류가 발생했습니다.',
            );
        } finally {
            setIsBaselineSaving(false);
        }
    };

    const clearBaselinePreview = () => {
        if (baselineAudioUrlRef.current) {
            URL.revokeObjectURL(
                baselineAudioUrlRef.current,
            );

            baselineAudioUrlRef.current = null;
        }

        setPendingBaselineBlob(null);
        setBaselineAudioUrl('');
        setIsBaselinePreview(false);
    };

    const retryBaselineRecording = () => {
        clearBaselinePreview();

        addMessage(
            'system',
            '기존 녹음을 취소하고 다시 녹음을 시작합니다.',
        );

        setTimeout(() => {
            handleRecord();
        }, 0);
    };

    const handleResumeButton = () => {
        if (!sessionId || isResumeUploading) {
            return;
        }

        fileInputRef.current?.click();
    };

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
                `${API_BASE_URL}/interviews/${sessionId}/upload-resume?interview_mode=${interviewCategory}`,
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

            startVisionCalibration();
        } catch (error) {
            console.error('이력서 업로드 오류:', error);

            setIsResumeUploading(false);

            addMessage(
                'system',
                error.message ||
                '이력서를 처리하는 중 오류가 발생했습니다.',
            );
        }
    };

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

        event.target.value = '';
    };

    const startVisionCalibration = async () => {
        if (
            !cameraUsageEnabled ||
            hasCameraDevice === false
        ) {
            addMessage(
                'system',
                '카메라를 사용하지 않아 시선 영점 조절을 건너뜁니다. 곧 면접이 시작됩니다.',
            );

            connectWebSocket();
            return;
        }

        if (!isCameraActive) {
            const cameraStarted = await startUserCamera();

            if (!cameraStarted) {
                setCameraUsageEnabled(false);

                addMessage(
                    'system',
                    '카메라를 실행하지 못해 시선 영점 조절 없이 면접을 시작합니다.',
                );

                connectWebSocket();
                return;
            }
        }

        setStep('calibrate_vision');
        setCalibrationPhase('ready');
        setCalibrationCountdown(3);

        addMessage(
            'system',
            '정확한 시선 추적을 위해 파란색 점선 박스 영역을 바라보고 영점 조절 시작 버튼을 눌러주세요.',
        );
    };

    const handleStartCalibration = () => {
        if (calibrationPhase === 'ready') {
            setCalibrationPhase('calibrating');
            addMessage('system', '파란색 박스 안을 응시하며 잠시만 기다려주세요.');
        }

        setCalibrationCountdown(3);

        let countdown = 3;
        const capturedFrames = [];

        const timer = setInterval(() => {
            countdown -= 1;
            setCalibrationCountdown(countdown);

            if (originalCanvasRef.current) {
                const base64Image = originalCanvasRef.current.toDataURL('image/jpeg', 0.5);
                capturedFrames.push(base64Image);
            }

            if (countdown === 0) {
                clearInterval(timer);
                finishVisionCalibration(capturedFrames);
            }
        }, 1000);
    };

    const finishVisionCalibration = async (frames) => {
        addMessage('system', `시선 추적 영점을 계산하고 있습니다...`);
        try {
            const response = await fetch(`${API_BASE_URL}/interviews/calibrate-vision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ frames })
            });

            const data = await response.json();

            if (response.ok) {
                setBaselines({ 
                    noseX: data.baseline_nose_x, 
                    irisX: data.baseline_iris_x,
                    noseY: data.baseline_nose_y, 
                    irisY: data.baseline_iris_y 
                });
                addMessage('system', '영점 조절이 완료되었습니다. 곧 면접이 시작됩니다.');
                connectWebSocket();
            } else {
                throw new Error("분석 실패");
            }
        } catch (error) {
            console.error('Vision Calibration Error:', error);
            setBaselines({ noseX: 0.5, irisX: 0.5, noseY: 0.5, irisY: 0.5 });
            addMessage('system', '영점 조절에 실패하여 기본값으로 설정되었습니다. 곧 면접이 시작됩니다.');
            connectWebSocket();
        }
    };

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

                if (data.type === 'interviewer_acknowledgment') {
                    isReactionStreamActiveRef.current = true;
                    setIsInterviewerSpeaking(true);

                    playInterviewerVideoStream(
                        data.text,
                        data.avatar,
                        data.duo_avatar_type,
                    ).then((success) => {
                        if (success === false) {
                            isReactionStreamActiveRef.current = false;
                            const queued = pendingQuestionAfterReactionRef.current;
                            if (queued) {
                                pendingQuestionAfterReactionRef.current = null;
                                playQuestionStream(queued.data, queued.prefetchHandle);
                            }
                        }
                    });

                    return;
                }

                if (data.type === 'realtime_gaze') {
                    setRealtimeGaze({ x: data.x, y: data.y });
                    setIsGazeLoss(data.is_loss);
                    return;
                }

                if (data.type === 'connection_established') {
                    developerInterviewEndingRef.current = false;

                    websocket.send(
                        JSON.stringify({
                            type: 'start_interview',
                            selected_candidates: selectedCandidates,
                        }),
                    );

                    return;
                }

                if (data.type === 'next_question') {
                    if (developerInterviewEndingRef.current) {
                        return;
                    }

                    clearTimeout(candidateDelayTimerRef.current);

                    pendingUserAnswerRef.current = null;
                    isRecordingAnswerRef.current = false;
                    isStartingAnswerRecordingRef.current = false;

                    setHasUserAnsweredCurrentQuestion(false);
                    setIsStartingAnswerRecording(false);
                    setIsRecordingAnswer(false);
                    setIsProcessingAnswer(false);

                    if (isReactionStreamActiveRef.current) {
                        const prefetchHandle = startAvatarFetch(
                            data.question_text,
                            data.avatar,
                            pickQuestionDuoAvatarType(data),
                        );
                        pendingQuestionAfterReactionRef.current = { data, prefetchHandle };
                    } else {
                        playQuestionStream(data);
                    }

                    return;
                }

                if (data.type === 'qa_feedback') {
                    addMessage(
                        'system',
                        `답변 평가 ${data.score}점\n${data.feedback}`,
                    );

                    if (
                        interviewModeRef.current === 'developer' &&
                        developerInterviewEndingRef.current
                    ) {
                        setStep('complete');
                        setCandidateAnswerQueue([]);
                        setActiveCandidateAnswer(null);
                        setTypedCandidateText('');
                        setCandidateTransition('');
                        setIsCandidateSceneReady(false);

                        addMessage(
                            'system',
                            '개발자 모드이므로 1회 질문·답변 후 면접을 종료합니다.',
                        );

                        websocket.close();
                    }

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

    const startAnswerRecording = async () => {
        setAutoRecordCountdown(null);

        if (
            step !== 'answer' ||
            isRecordingAnswerRef.current ||
            isStartingAnswerRecordingRef.current ||
            activeCandidateAnswer ||
            hasUserAnsweredCurrentQuestion ||
            isInterviewerSpeaking ||
            isProcessingAnswer
        ) {
            return;
        }

        clearTimeout(candidateDelayTimerRef.current);

        isStartingAnswerRecordingRef.current = true;
        setIsStartingAnswerRecording(true);

        const websocket = websocketRef.current;

        if (
            !websocket ||
            websocket.readyState !== WebSocket.OPEN
        ) {
            isStartingAnswerRecordingRef.current = false;
            setIsStartingAnswerRecording(false);

            addMessage(
                'system',
                '면접 서버 연결이 끊어졌습니다.',
            );

            return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            isStartingAnswerRecordingRef.current = false;
            setIsStartingAnswerRecording(false);

            addMessage(
                'system',
                '현재 브라우저에서는 음성 녹음을 지원하지 않습니다.',
            );

            return;
        }

        try {
            const stream =
                await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                });

            if (activeCandidateAnswer) {
                stream
                    .getTracks()
                    .forEach((track) => track.stop());

                return;
            }

            answerStreamRef.current = stream;
            answerChunksRef.current = [];

            let mimeType = '';

            if (
                MediaRecorder.isTypeSupported(
                    'audio/webm;codecs=opus',
                )
            ) {
                mimeType = 'audio/webm;codecs=opus';
            } else if (
                MediaRecorder.isTypeSupported(
                    'audio/webm',
                )
            ) {
                mimeType = 'audio/webm';
            }

            const recorder = mimeType
                ? new MediaRecorder(stream, {
                    mimeType,
                })
                : new MediaRecorder(stream);

            answerRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (
                    event.data &&
                    event.data.size > 0
                ) {
                    answerChunksRef.current.push(
                        event.data,
                    );
                }
            };

            recorder.onerror = (event) => {
                console.error(
                    '답변 녹음 오류:',
                    event,
                );

                addMessage(
                    'system',
                    '답변을 녹음하는 중 오류가 발생했습니다.',
                );
            };

            recorder.start(1000);

            setAnswerTimeLeft(60);
            isRecordingAnswerRef.current = true;
            setIsRecordingAnswer(true);
        } catch (error) {
            console.error(
                '답변 녹음 시작 오류:',
                error,
            );

            if (error.name === 'NotAllowedError') {
                addMessage(
                    'system',
                    '마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크를 허용해주세요.',
                );
            } else if (
                error.name === 'NotFoundError'
            ) {
                addMessage(
                    'system',
                    '사용할 수 있는 마이크를 찾지 못했습니다.',
                );
            } else {
                addMessage(
                    'system',
                    '답변 녹음을 시작하지 못했습니다.',
                );
            }
        } finally {
            isStartingAnswerRecordingRef.current = false;
            setIsStartingAnswerRecording(false);
        }
    };

    const stopAnswerRecording = async () => {
        const recorder = answerRecorderRef.current;

        if (
            !recorder ||
            recorder.state === 'inactive' ||
            !isRecordingAnswerRef.current
        ) {
            return;
        }

        isRecordingAnswerRef.current = false;
        setIsRecordingAnswer(false);
        setIsProcessingAnswer(true);

        try {
            const audioBlob = await new Promise(
                (resolve, reject) => {
                    recorder.onstop = () => {
                        const blob = new Blob(
                            answerChunksRef.current,
                            {
                                type:
                                    recorder.mimeType ||
                                    'audio/webm',
                            },
                        );

                        if (blob.size === 0) {
                            reject(
                                new Error(
                                    '녹음된 답변이 없습니다.',
                                ),
                            );
                            return;
                        }

                        resolve(blob);
                    };

                    recorder.onerror = () => {
                        reject(
                            new Error(
                                '답변 녹음 파일 생성에 실패했습니다.',
                            ),
                        );
                    };

                    recorder.requestData();
                    recorder.stop();
                },
            );

            answerStreamRef.current
                ?.getTracks()
                .forEach((track) => track.stop());

            answerStreamRef.current = null;
            answerRecorderRef.current = null;
            answerChunksRef.current = [];

            addMessage(
                'system',
                '답변 음성을 분석하고 있습니다.',
            );

            const formData = new FormData();

            formData.append('user_id', userId);
            formData.append(
                'audio_file',
                audioBlob,
                'interview_answer.webm',
            );

            const response = await fetch(
                `${API_BASE_URL}/interviews/${sessionId}/process-audio`,
                {
                    method: 'POST',
                    body: formData,
                },
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    '답변 음성 분석에 실패했습니다.',
                );
            }

            const transcribedText =
                data.transcribed_text?.trim();

            addMessage('user', transcribedText);

            const websocket = websocketRef.current;

            if (
                !websocket ||
                websocket.readyState !== WebSocket.OPEN
            ) {
                throw new Error(
                    '면접 서버 연결이 끊어졌습니다.',
                );
            }

            pendingUserAnswerRef.current = {
                type: 'submit_answer',
                transcribed_text: transcribedText,
                jitter_shaken_percentage:
                    data.jitter_shaken_percentage ?? 0,
                shimmer_shaken_percentage:
                    data.shimmer_shaken_percentage ?? 0,
                speed_difference_wpm:
                    data.speed_difference_wpm ?? 0,
            };

            setHasUserAnsweredCurrentQuestion(true);
        } catch (error) {
            console.error('답변 녹음 종료 오류:', error);

            addMessage(
                'system',
                error.message ||
                '답변 음성을 처리하는 중 오류가 발생했습니다.',
            );

            answerStreamRef.current
                ?.getTracks()
                .forEach((track) => track.stop());

            answerStreamRef.current = null;
            answerRecorderRef.current = null;
            answerChunksRef.current = [];

            isRecordingAnswerRef.current = false;
            setIsRecordingAnswer(false);
        } finally {
            setIsProcessingAnswer(false);
        }
    };

    const handleSubmitTextAnswer = () => {
        const trimmedAnswer = answerText.trim();

        if (
            step !== 'answer' ||
            isInterviewerSpeaking ||
            activeCandidateAnswer ||
            hasUserAnsweredCurrentQuestion
        ) {
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

        pendingUserAnswerRef.current = {
            type: 'submit_answer',
            transcribed_text: trimmedAnswer,
            jitter_shaken_percentage: 0,
            shimmer_shaken_percentage: 0,
            speed_difference_wpm: 0,
        };

        setHasUserAnsweredCurrentQuestion(true);
        setAnswerText('');
    };

    const handleAnswerKeyDown = (event) => {
        if (event.key === 'Enter' && event.ctrlKey) {
            event.preventDefault();
            handleSubmitTextAnswer();
        }
    };

    const startUserCamera = async () => {
        try {
            const MP_SelfieSegmentation = window.SelfieSegmentation;

            if (!MP_SelfieSegmentation) {
                console.error("MediaPipe 라이브러리가 아직 로드되지 않았습니다.");
                addMessage('system', '카메라 모듈을 로드하는 중입니다. 잠시 후 다시 켜주세요 (또는 브라우저 새로고침을 해주세요).');
                setIsCameraActive(false);
                return false;
            }

            const videoElement = userVideoRef.current;
            const canvasElement = canvasRef.current;
            const canvasCtx = canvasElement.getContext('2d');
            
            const originalCanvas = originalCanvasRef.current;
            originalCanvas.width = 640;
            originalCanvas.height = 360;
            const originalCtx = originalCanvas.getContext('2d');

            bgImageRef.current.src = '/office_background.jpg';

            const selfieSegmentation = new MP_SelfieSegmentation({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
            });

            selfieSegmentation.setOptions({
                modelSelection: 1,
            });

            selfieSegmentation.onResults((results) => {
                originalCtx.save();
                originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
                originalCtx.drawImage(results.image, 0, 0, originalCanvas.width, originalCanvas.height);
                originalCtx.restore();

                canvasCtx.save();
                canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

                canvasCtx.globalCompositeOperation = 'source-over';
                canvasCtx.drawImage(results.segmentationMask, 0, 0, canvasElement.width, canvasElement.height);

                canvasCtx.globalCompositeOperation = 'source-in';
                canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

                canvasCtx.globalCompositeOperation = 'destination-over';
                if (bgImageRef.current.complete && bgImageRef.current.naturalWidth > 0) {
                    canvasCtx.drawImage(bgImageRef.current, 0, 0, canvasElement.width, canvasElement.height);
                } else {
                    canvasCtx.fillStyle = '#333333';
                    canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
                }

                canvasCtx.restore();
            });

            selfieSegmentationRef.current = selfieSegmentation;

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 360 } },
                audio: false
            });

            videoElement.srcObject = stream;

            await new Promise((resolve, reject) => {
                videoElement.onloadedmetadata = async () => {
                    try {
                        await videoElement.play();

                        let lastVideoTime = -1;
                        let isProcessing = false;

                        const processFrame = async () => {
                            if (
                                !videoElement.paused &&
                                !videoElement.ended &&
                                videoElement.readyState >= 2
                            ) {
                                if (
                                    videoElement.currentTime !== lastVideoTime &&
                                    !isProcessing
                                ) {
                                    isProcessing = true;
                                    lastVideoTime = videoElement.currentTime;

                                    try {
                                        await selfieSegmentation.send({
                                            image: videoElement,
                                        });
                                    } catch (error) {
                                        console.error(
                                            '프레임 전송 오류:',
                                            error,
                                        );
                                    } finally {
                                        isProcessing = false;
                                    }
                                }
                            }

                            renderLoopRef.current =
                                requestAnimationFrame(processFrame);
                        };

                        renderLoopRef.current =
                            requestAnimationFrame(processFrame);

                        setIsCameraActive(true);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                };

                videoElement.onerror = () => {
                    reject(
                        new Error('카메라 영상을 불러오지 못했습니다.'),
                    );
                };
            });

            return true;

        } catch (error) {
            console.error('웹캠 연결 및 AI 초기화 오류:', error);

            stopUserCamera();
            setIsCameraActive(false);

            if (
                error.name === 'NotFoundError' ||
                error.name === 'DevicesNotFoundError'
            ) {
                setHasCameraDevice(false);

                addMessage(
                    'system',
                    '사용 가능한 카메라를 찾지 못했습니다.',
                );
            } else if (
                error.name === 'NotAllowedError' ||
                error.name === 'PermissionDeniedError'
            ) {
                addMessage(
                    'system',
                    '카메라 권한이 거부되어 카메라 없이 진행합니다.',
                );
            } else {
                addMessage(
                    'system',
                    '카메라를 시작하지 못해 카메라 없이 진행합니다.',
                );
            }

            return false;
        }
    };

    const stopUserCamera = () => {
        if (renderLoopRef.current) {
            cancelAnimationFrame(renderLoopRef.current);
            renderLoopRef.current = null;
        }

        if (selfieSegmentationRef.current) {
            selfieSegmentationRef.current.close();
            selfieSegmentationRef.current = null;
        }

        if (userVideoRef.current && userVideoRef.current.srcObject) {
            userVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
            userVideoRef.current.pause();
            userVideoRef.current.srcObject = null;
        }

        setIsCameraActive(false);
    };

    const toggleUserCamera = async () => {
        if (isCameraActive) {
            stopUserCamera();
            setCameraUsageEnabled(false);
            return;
        }

        if (hasCameraDevice === false) {
            addMessage(
                'system',
                '사용 가능한 카메라가 없습니다.',
            );
            return;
        }

        const cameraStarted = await startUserCamera();

        if (cameraStarted) {
            setCameraUsageEnabled(true);
        }
    };

    const handleUseCamera = async () => {
        if (hasCameraDevice === false) {
            return;
        }

        const cameraStarted = await startUserCamera();

        if (!cameraStarted) {
            setCameraUsageEnabled(false);
            setHasCameraDevice(false);
            setIsCameraChoiceModalOpen(false);

            addMessage(
                'system',
                '사용 가능한 카메라를 찾지 못해 카메라 없이 면접을 진행합니다.',
            );

            return;
        }

        setCameraUsageEnabled(true);
        setIsCameraChoiceModalOpen(false);

        addMessage(
            'system',
            '카메라를 사용합니다. 면접 중 시선 분석이 진행됩니다.',
        );
    };

    const handleSkipCamera = () => {
        stopUserCamera();

        setCameraUsageEnabled(false);
        setIsCameraChoiceModalOpen(false);

        addMessage(
            'system',
            '카메라를 사용하지 않고 면접을 진행합니다.',
        );
    };

    useEffect(() => {
        if (step !== 'complete') {
            return;
        }

        clearTimeout(candidateDelayTimerRef.current);
        clearInterval(candidateTypingTimerRef.current);
        clearTimeout(candidateFinishTimerRef.current);

        stopCandidateVideoAnimation();

        setCandidateAnswerQueue([]);
        setActiveCandidateAnswer(null);
        setTypedCandidateText('');
        setCandidateTransition('');
        setIsCandidateSceneReady(false);

        if (
            answerRecorderRef.current &&
            answerRecorderRef.current.state !== 'inactive'
        ) {
            answerRecorderRef.current.stop();
        }

        answerStreamRef.current
            ?.getTracks()
            .forEach((track) => track.stop());

        answerRecorderRef.current = null;
        answerStreamRef.current = null;
        answerChunksRef.current = [];

        isRecordingAnswerRef.current = false;
        isStartingAnswerRecordingRef.current = false;

        setIsRecordingAnswer(false);
        setIsStartingAnswerRecording(false);
        setIsProcessingAnswer(false);

        stopUserCamera();

        if (websocketRef.current?.readyState === WebSocket.OPEN) {
            websocketRef.current.close();
        }
    }, [step]);

    useEffect(() => {
        checkCameraDevice();
    }, []);

    useEffect(() => {
        let interval;
        if (step === 'answer' && isCameraActive && websocketRef.current?.readyState === WebSocket.OPEN) {
            interval = setInterval(() => {
                if (originalCanvasRef.current) {
                    const base64Image = originalCanvasRef.current.toDataURL('image/jpeg', 0.6);

                    websocketRef.current.send(
                        JSON.stringify({
                            type: 'video_frame',
                            image: base64Image,
                            baseline_nose_x: baselines.noseX,
                            baseline_iris_x: baselines.irisX,
                            baseline_nose_y: baselines.noseY,
                            baseline_iris_y: baselines.irisY,
                            is_recording: isRecordingAnswerRef.current
                        })
                    );
                }
            }, 1000);
        }

        return () => clearInterval(interval);
    }, [step, isCameraActive, baselines]);

    // 전역 클린업
    useEffect(() => {
        return () => {
            stopUserCamera();
        };
    }, []);

    useEffect(() => {
        const pendingAnswer =
            pendingUserAnswerRef.current;

        if (
            !pendingAnswer ||
            !hasUserAnsweredCurrentQuestion ||
            activeCandidateAnswer ||
            candidateAnswerQueue.length > 0 ||
            candidateTransition !== '' ||
            isCandidateSceneReady ||
            isRecordingAnswer ||
            isStartingAnswerRecording ||
            isProcessingAnswer
        ) {
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

        if (interviewModeRef.current === 'developer') {
            developerInterviewEndingRef.current = true;
        }

        websocket.send(
            JSON.stringify(pendingAnswer),
        );

        pendingUserAnswerRef.current = null;
    }, [
        hasUserAnsweredCurrentQuestion,
        activeCandidateAnswer,
        candidateAnswerQueue,
        candidateTransition,
        isCandidateSceneReady,
        isRecordingAnswer,
        isStartingAnswerRecording,
        isProcessingAnswer,
    ]);

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
            if (isBaselineChecking) {
                return (
                    <button
                        type="button"
                        className="interview-action-button record-button"
                        disabled
                    >
                        기존 음성 확인 중...
                    </button>
                );
            }

            if (isBaselineSaving) {
                return (
                    <button
                        type="button"
                        className="interview-action-button record-button"
                        disabled
                    >
                        음성 분석 및 저장 중...
                    </button>
                );
            }

            if (isBaselinePreview && baselineAudioUrl) {
                return (
                    <div className="baseline-preview-area">
                        <div className="baseline-preview-card">
                            <strong>녹음 내용을 확인해주세요.</strong>

                            <audio
                                ref={baselineAudioRef}
                                className="baseline-audio-player"
                                src={baselineAudioUrl}
                                controls
                                preload="metadata"
                            />

                            <p className="baseline-privacy-notice">
                                녹음된 원본 음성 파일은 확정 후에도 저장되지 않으며,
                                분석된 음성 지표만 저장됩니다.
                            </p>
                        </div>

                        <div className="baseline-preview-buttons">
                            <button
                                type="button"
                                className="interview-action-button baseline-replay-button"
                                onClick={replayBaselineRecording}
                            >
                                듣기
                            </button>

                            <button
                                type="button"
                                className="interview-action-button baseline-retry-button"
                                onClick={retryBaselineRecording}
                            >
                                다시 녹음
                            </button>

                            <button
                                type="button"
                                className="interview-action-button baseline-confirm-button"
                                onClick={confirmBaselineRecording}
                            >
                                확정
                            </button>
                        </div>
                    </div>
                );
            }

            if (isBaselineRecording) {
                return (
                    <button
                        type="button"
                        className="interview-action-button record-button recording"
                        onClick={stopBaselineRecording}
                    >
                        <span className="action-icon">■</span>
                        음성 녹음 종료
                    </button>
                );
            }

            if (hasExistingBaseline) {
                return (
                    <div className="baseline-choice-area">
                        <div className="existing-baseline-card">
                            <span className="existing-baseline-icon">
                                🎙
                            </span>

                            <div>
                                <strong>등록된 기본 음성이 있습니다.</strong>

                                <p>
                                    기존 음성을 사용하거나 새로 녹음해주세요.
                                </p>

                                {existingBaselineMetrics && (
                                    <div className="baseline-metric-summary">
                                        <span>
                                            말하기 속도{' '}
                                            {Math.round(
                                                existingBaselineMetrics.wpm,
                                            )}{' '}
                                            WPM
                                        </span>

                                        <span>
                                            Jitter{' '}
                                            {Number(
                                                existingBaselineMetrics.jitter,
                                            ).toFixed(3)}
                                        </span>

                                        <span>
                                            Shimmer{' '}
                                            {Number(
                                                existingBaselineMetrics.shimmer,
                                            ).toFixed(3)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="baseline-choice-buttons">
                            <button
                                type="button"
                                className="interview-action-button baseline-use-button"
                                onClick={handleUseExistingBaseline}
                            >
                                기존 음성 사용
                            </button>

                            <button
                                type="button"
                                className="interview-action-button baseline-rerecord-button"
                                onClick={handleRerecordBaseline}
                            >
                                새로 녹음
                            </button>
                        </div>
                    </div>
                );
            }

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
                <div style={{ display: 'flex', flexDirection: 'column' }}>
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
                </div>
            );
        }

        if (step === 'calibrate_vision') {
            if (calibrationPhase === 'ready') {
                return (
                    <button
                        type="button"
                        className="interview-action-button record-button"
                        onClick={handleStartCalibration}
                    >
                        <span className="action-icon">🎯</span>
                        영점 조절 시작
                    </button>
                );
            }

            if (calibrationPhase === 'calibrating') {
                return (
                    <button
                        type="button"
                        className="interview-action-button record-button recording"
                        disabled
                    >
                        <span className="action-icon">👁️</span>
                        파란색 박스를 바라보세요 ({calibrationCountdown}초)
                    </button>
                );
            }
        }

        if (step === 'answer') {
            return (
                <div className="answer-action-area">
                    {answerMode === 'voice' && (
                        <button
                            type="button"
                            className={`interview-action-button answer-button voice-answer-button ${isRecordingAnswer
                                ? 'recording'
                                : ''
                                }`}
                            onClick={
                                isRecordingAnswer
                                    ? stopAnswerRecording
                                    : undefined
                            }
                            disabled={
                                !isRecordingAnswer ||
                                isProcessingAnswer
                            }
                        >
                            <span className="action-icon">
                                {isRecordingAnswer
                                    ? '■'
                                    : '⏳'}
                            </span>

                            {isRecordingAnswer
                                ? `답변 녹음 종료 (${answerTimeLeft}초 남음)`
                                : isInterviewerSpeaking
                                    ? '면접관 질문 중'
                                    : isProcessingAnswer
                                        ? '답변 분석 중...'
                                        : isStartingAnswerRecording
                                            ? '마이크 연결 중...'
                                            : hasUserAnsweredCurrentQuestion
                                                ? '답변 완료'
                                                : isCandidateSpeaking
                                                    ? `${activeCandidateAnswer?.name} 답변 중`
                                                    : autoRecordCountdown !== null && autoRecordCountdown > 0
                                                        ? `${autoRecordCountdown}초 뒤 답변 녹음 시작`
                                                        : '답변 대기 중...'}
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
                                placeholder={
                                    isCandidateSpeaking
                                        ? '다른 지원자의 답변이 끝난 후 입력할 수 있습니다.'
                                        : '면접 질문에 대한 답변을 입력해주세요.'
                                }
                                rows={3}
                                disabled={
                                    isInterviewerSpeaking ||
                                    isCandidateSpeaking ||
                                    hasUserAnsweredCurrentQuestion
                                }
                            />

                            <button
                                type="button"
                                className="answer-submit-button"
                                onClick={handleSubmitTextAnswer}
                                disabled={
                                    !answerText.trim() ||
                                    isInterviewerSpeaking ||
                                    isCandidateSpeaking ||
                                    hasUserAnsweredCurrentQuestion
                                }
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

    useEffect(() => {
        clearTimeout(candidateDelayTimerRef.current);

        if (
            step !== 'answer' ||
            isInterviewerSpeaking ||
            activeCandidateAnswer ||
            candidateAnswerQueue.length === 0 ||
            isRecordingAnswer ||
            isStartingAnswerRecording ||
            isProcessingAnswer
        ) {
            return;
        }

        const randomDelay =
            5000 + Math.floor(Math.random() * 5001);

        candidateDelayTimerRef.current = setTimeout(() => {
            if (
                isRecordingAnswerRef.current ||
                isStartingAnswerRecordingRef.current
            ) {
                return;
            }

            setCandidateAnswerQueue((previousQueue) => {
                const [nextCandidate, ...remainingCandidates] =
                    previousQueue;

                if (!nextCandidate) {
                    return previousQueue;
                }

                const candidateWithMedia =
                    getCandidateWithMedia(nextCandidate);

                candidateTransitionTimerRef.current.forEach((timer) => {
                    clearTimeout(timer);
                });

                candidateTransitionTimerRef.current = [];

                setIsCandidateSceneReady(false);
                setCandidateTransition('closing');
                setTypedCandidateText('');

                const showCandidateTimer = setTimeout(() => {
                    setActiveCandidateAnswer(candidateWithMedia);
                    setCandidateTransition('opening');
                }, 240);

                const finishTransitionTimer = setTimeout(() => {
                    setCandidateTransition('');
                    setIsCandidateSceneReady(true);
                }, 500);

                candidateTransitionTimerRef.current = [
                    showCandidateTimer,
                    finishTransitionTimer,
                ];

                return remainingCandidates;
            });
        }, randomDelay);

        return () => {
            clearTimeout(candidateDelayTimerRef.current);
        };
    }, [
        step,
        isInterviewerSpeaking,
        activeCandidateAnswer,
        candidateAnswerQueue,
        isRecordingAnswer,
        isStartingAnswerRecording,
        isProcessingAnswer,
    ]);

    useEffect(() => {
        if (
            !activeCandidateAnswer ||
            !isCandidateSceneReady ||
            isRecordingAnswer
        ) {
            return;
        }

        const fullText =
            activeCandidateAnswer.answer ||
            activeCandidateAnswer.answer_text ||
            activeCandidateAnswer.text ||
            '';

        if (!fullText) {
            console.error(
                '지원자 답변 텍스트가 없습니다:',
                activeCandidateAnswer,
            );

            stopCandidateVideoAnimation();
            setIsCandidateSceneReady(false);
            setActiveCandidateAnswer(null);
            setTypedCandidateText('');

            return;
        }

        let currentLength = 0;

        candidateTypingTimerRef.current = setInterval(() => {
            currentLength += 1;
            setTypedCandidateText(fullText.slice(0, currentLength));

            if (currentLength >= fullText.length) {
                clearInterval(candidateTypingTimerRef.current);

                candidateFinishTimerRef.current = setTimeout(() => {
                    addMessage(
                        'candidate',
                        fullText,
                        activeCandidateAnswer.name,
                    );

                    stopCandidateVideoAnimation();
                    setIsCandidateSceneReady(false);
                    setCandidateTransition('closing');

                    const hideCandidateTimer = setTimeout(() => {
                        setActiveCandidateAnswer(null);
                        setTypedCandidateText('');
                        setCandidateTransition('opening');
                    }, 240);

                    const finishReturnTimer = setTimeout(() => {
                        setCandidateTransition('');
                    }, 500);

                    candidateTransitionTimerRef.current = [
                        hideCandidateTimer,
                        finishReturnTimer,
                    ];
                }, 650);
            }
        }, 55);

        return () => {
            clearInterval(candidateTypingTimerRef.current);
            clearTimeout(candidateFinishTimerRef.current);
        };
    }, [
        activeCandidateAnswer,
        isCandidateSceneReady,
        isRecordingAnswer,
    ]);

    useEffect(() => {
        if (
            !activeCandidateAnswer ||
            !isCandidateSceneReady
        ) {
            return;
        }

        const video = candidateVideoRef.current;

        if (!video) {
            return;
        }

        video.currentTime = 0;

        video.play().catch((error) => {
            if (error.name !== 'AbortError') {
                console.error(
                    '지원자 영상 재생 오류:',
                    error,
                );
            }
        });

        return () => {
            video.pause();
        };
    }, [activeCandidateAnswer, isCandidateSceneReady]);

    useEffect(() => {
        if (sessionCreatedRef.current) {
            return;
        }

        sessionCreatedRef.current = true;

        createInterviewSession();
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'end',
        });
    }, [messages, isRecordingAnswer]);

    useEffect(() => {
        return () => {
            clearTimeout(candidateDelayTimerRef.current);
            clearInterval(candidateTypingTimerRef.current);
            clearTimeout(candidateFinishTimerRef.current);

            stopCandidateVideoAnimation();

            candidateTransitionTimerRef.current.forEach((timer) => {
                clearTimeout(timer);
            });

            candidateTransitionTimerRef.current = [];

            if (
                answerRecorderRef.current &&
                answerRecorderRef.current.state !== 'inactive'
            ) {
                answerRecorderRef.current.stop();
            }

            answerStreamRef.current
                ?.getTracks()
                .forEach((track) => track.stop());

            answerRecorderRef.current = null;
            answerStreamRef.current = null;
            answerChunksRef.current = [];

            if (baselineIntervalRef.current) {
                clearInterval(baselineIntervalRef.current);
            }

            if (
                baselineRecorderRef.current &&
                baselineRecorderRef.current.state !== 'inactive'
            ) {
                baselineRecorderRef.current.stop();
            }

            baselineStreamRef.current
                ?.getTracks()
                .forEach((track) => track.stop());

            if (baselineAudioUrlRef.current) {
                URL.revokeObjectURL(
                    baselineAudioUrlRef.current,
                );

                baselineAudioUrlRef.current = null;
            }

            if (websocketRef.current) {
                websocketRef.current.close();
                websocketRef.current = null;
            }

            if (interviewerStreamAbortRef.current) {
                interviewerStreamAbortRef.current.abort();
                interviewerStreamAbortRef.current = null;
            }

            if (interviewerVideoUrlRef.current) {
                URL.revokeObjectURL(interviewerVideoUrlRef.current);
                interviewerVideoUrlRef.current = null;
            }
        };
    }, []);

    return (
        <main className="interview-page">
            {step === 'complete' && (
                <div
                    className="interview-complete-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="interview-complete-title"
                >
                    <div
                        className="interview-complete-confetti"
                        aria-hidden="true"
                    >
                        {INTERVIEW_COMPLETE_CONFETTI.map((particle) => (
                            <span
                                key={particle.id}
                                className={`complete-confetti-piece complete-confetti-color-${particle.colorIndex}`}
                                style={{
                                    '--confetti-left': particle.left,
                                    '--confetti-delay': particle.delay,
                                    '--confetti-duration': particle.duration,
                                    '--confetti-rotation': particle.rotation,
                                    '--confetti-drift': particle.drift,
                                }}
                            />
                        ))}
                    </div>

                    <div className="interview-complete-glow" />

                    <section className="interview-complete-modal">
                        <div className="interview-complete-icon">
                            <span>✓</span>
                        </div>

                        <p className="interview-complete-eyebrow">
                            INTERVIEW COMPLETE
                        </p>

                        <h2 id="interview-complete-title">
                            면접이 끝났습니다
                        </h2>

                        <p className="interview-complete-description">
                            모든 질문과 답변이 완료되었습니다.
                            <br />
                            면접 결과는 마이페이지에서 확인할 수 있습니다.
                        </p>

                        <div className="interview-complete-buttons">
                            <button
                                type="button"
                                className="interview-complete-main-button"
                                onClick={() =>
                                    handleCompleteNavigation('/')
                                }
                            >
                                <span className="complete-button-icon">
                                    🏠
                                </span>

                                <span>
                                    <strong>메인</strong>
                                    <small>메인 화면으로 이동</small>
                                </span>
                            </button>

                            <button
                                type="button"
                                className="interview-complete-mypage-button"
                                onClick={() =>
                                    handleCompleteNavigation('/mypage')
                                }
                            >
                                <span className="complete-button-icon">
                                    📊
                                </span>

                                <span>
                                    <strong>마이페이지</strong>
                                    <small>면접 결과 확인</small>
                                </span>

                                <span className="complete-button-arrow">
                                    →
                                </span>
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {isCameraChoiceModalOpen && step !== 'complete' && (
                <div className="camera-choice-overlay">
                    <div
                        className="camera-choice-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="camera-choice-title"
                    >
                        <div className="camera-choice-icon">
                            🎙️
                        </div>

                        <h2 id="camera-choice-title">
                            면접 환경을 설정해주세요
                        </h2>

                        <p className="camera-choice-description">
                            연습할 면접 유형과 카메라 사용 여부를 선택해주세요.
                        </p>

                        <div className="initial-interview-mode-area">
                            <strong className="initial-interview-mode-title">
                                면접 유형
                            </strong>

                            <div className="initial-interview-mode-buttons">
                                {[
                                    {
                                        value: 'mixed',
                                        title: '실전 면접',
                                        description: '기술·인성 질문을 함께 연습합니다.',
                                    },
                                    {
                                        value: 'technical',
                                        title: '기술 면접',
                                        description: '기술 질문을 집중적으로 연습합니다.',
                                    },
                                    {
                                        value: 'hr',
                                        title: '인성 면접',
                                        description: '인성 질문을 집중적으로 연습합니다.',
                                    },
                                ].map((mode) => (
                                    <button
                                        key={mode.value}
                                        type="button"
                                        className={`initial-interview-mode-button ${interviewCategory === mode.value
                                            ? 'selected'
                                            : ''
                                            }`}
                                        onClick={() =>
                                            setInterviewCategory(mode.value)
                                        }
                                        aria-pressed={
                                            interviewCategory === mode.value
                                        }
                                    >
                                        <strong>{mode.title}</strong>
                                        <span>{mode.description}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="initial-camera-choice-area">
                            <strong className="initial-camera-choice-title">
                                카메라 설정
                            </strong>

                            {hasCameraDevice === null && (
                                <p>
                                    연결된 카메라를 확인하고 있습니다.
                                </p>
                            )}

                            {hasCameraDevice === true && (
                                <p>
                                    카메라를 사용하면 면접 중 시선 방향을
                                    분석할 수 있습니다.<br />
                                    카메라를 사용하지
                                    않아도 면접은 진행할 수 있습니다.
                                </p>
                            )}

                            {hasCameraDevice === false && (
                                <p>
                                    사용할 수 있는 카메라를 찾지 못했습니다.
                                    카메라 없이 면접을 진행합니다.
                                </p>
                            )}
                        </div>

                        <div className="camera-choice-buttons">
                            {hasCameraDevice === true && (
                                <button
                                    type="button"
                                    className="camera-choice-use-button"
                                    onClick={handleUseCamera}
                                >
                                    카메라 사용 후 시작
                                </button>
                            )}

                            <button
                                type="button"
                                className="camera-choice-skip-button"
                                onClick={handleSkipCamera}
                                disabled={hasCameraDevice === null}
                            >
                                카메라 없이 시작
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <section className="interview-left">
                <div className="interviewer-video-layer">
                    {interviewerDefaultVideos.map((videoUrl, index) => (
                        <video
                            key={index}
                            ref={interviewerDefaultVideoRefs[index]}
                            className={`interviewer-avatar-video interviewer-default-video ${activeDefaultVideoIndex === index
                                ? 'visible'
                                : ''
                                }`}
                            src={videoUrl || undefined}
                            autoPlay={index === 0}
                            muted
                            playsInline
                            preload="auto"
                            onTimeUpdate={(event) => {
                                if (activeDefaultVideoIndex !== index) {
                                    return;
                                }

                                const video = event.currentTarget;

                                if (
                                    Number.isFinite(video.duration) &&
                                    video.duration > 0 &&
                                    video.duration - video.currentTime <= 0.5
                                ) {
                                    playNextDefaultInterviewerVideo();
                                }
                            }}
                            onEnded={(event) => {
                                if (
                                    activeDefaultVideoIndex === index &&
                                    !isDefaultVideoTransitioningRef.current
                                ) {
                                    event.currentTarget.currentTime = 0;
                                    event.currentTarget.play().catch(() => { });
                                }
                            }}
                            onError={(event) => {
                                const video = event.currentTarget;

                                console.error(
                                    '[interview] 기본 면접관 영상 재생 오류:',
                                    {
                                        src: video.currentSrc,
                                        errorCode: video.error?.code,
                                        errorMessage: video.error?.message,
                                    },
                                );
                            }}
                        />
                    ))}

                    {/* 🚀 파란색 점선 박스의 위치를 25% (Y) 로 최종 수정 */}
                    {step === 'calibrate_vision' && (
                        <div
                            className="calibration-target-box"
                            style={{ 
                                position: 'absolute',
                                left: '45%', 
                                top: '25%',  // 🚀 요청하신 25% 로 수정
                                transform: 'translate(-50%, -50%)',
                                width: '180px',
                                height: '240px',
                                border: '3px dashed #3498db',
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                                zIndex: 20,
                                boxShadow: '0 0 15px rgba(52, 152, 219, 0.3)'
                            }}
                        >
                            <span style={{ 
                                color: '#fff', 
                                fontWeight: 'bold', 
                                textShadow: '1px 1px 4px rgba(0,0,0,0.8)',
                                textAlign: 'center',
                                wordBreak: 'keep-all',
                                fontSize: '14px'
                            }}>
                                이곳을<br/>응시해주세요
                            </span>
                        </div>
                    )}

                    <video
                        ref={interviewerStreamVideoRef}
                        className={`interviewer-avatar-video interviewer-stream-video ${isInterviewerStreamVisible ? 'visible' : ''
                            }`}
                        playsInline
                        preload="auto"
                        onPlaying={() => {
                            setIsInterviewerStreamVisible(true);

                            const pendingMessage =
                                pendingInterviewerMessageRef.current;

                            if (
                                pendingMessage &&
                                pendingMessage.playbackId ===
                                interviewerPlaybackIdRef.current
                            ) {
                                addMessage(
                                    'interviewer',
                                    pendingMessage.questionText,
                                    pendingMessage.name,
                                );

                                pendingInterviewerMessageRef.current = null;
                            }
                        }}
                        onEnded={() => {
                            if (!isInterviewerStreamPlayingRef.current) {
                                return;
                            }

                            setIsInterviewerSpeaking(false);

                            const wasReaction = isReactionStreamActiveRef.current;
                            playQueuedQuestionOrRestoreDefault();

                            // 🚀 면접관의 "질문"이 끝났을 때 5초 뒤 자동 녹음 시작 카운트다운 트리거 발동
                            if (!wasReaction && step === 'answer' && !hasUserAnsweredCurrentQuestion) {
                                setAutoRecordCountdown(5);
                            }
                        }}
                        onError={(event) => {
                            const video = event.currentTarget;

                            console.error(
                                '[interview] 면접관 스트리밍 영상 재생 오류:',
                                {
                                    src: video.currentSrc,
                                    errorCode: video.error?.code,
                                    errorMessage: video.error?.message,
                                },
                            );

                            if (isInterviewerStreamPlayingRef.current) {
                                setIsInterviewerSpeaking(false);
                                playQueuedQuestionOrRestoreDefault();
                            }
                        }}
                    />

                    {/* 🚀 실시간 시선 포인터 */}
                    {isRecordingAnswer && isCameraActive && (
                        <div style={{
                            position: 'absolute',
                            top: `${realtimeGaze.y * 100}%`,
                            left: `${realtimeGaze.x * 100}%`,
                            width: '24px', 
                            height: '24px',
                            backgroundColor: isGazeLoss ? '#FF453A' : '#34C759',
                            borderRadius: '50%',
                            transform: 'translate(-50%, -50%)',
                            transition: 'top 0.1s ease-out, left 0.1s ease-out, background-color 0.2s',
                            zIndex: 100, 
                            boxShadow: '0 0 12px rgba(0,0,0,0.8), 0 0 4px rgba(255,255,255,0.8)',
                            pointerEvents: 'none' 
                        }} />
                    )}
                </div>

                {activeCandidateAnswer && (
                    <video
                        ref={candidateVideoRef}
                        key={`${activeCandidateAnswer.id}-${activeCandidateAnswer.video_url}`}
                        className={`candidate-answer-video ${getCandidatePosition(activeCandidateAnswer.id) === 'left'
                            ? 'candidate-left'
                            : 'candidate-right'
                            }`}
                        src={getCandidateVideoUrl(
                            activeCandidateAnswer.video_url,
                        )}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="auto"
                        onError={(event) => {
                            const video = event.currentTarget;

                            console.error('지원자 영상 재생 오류:', {
                                src: video.currentSrc,
                                errorCode: video.error?.code,
                                errorMessage: video.error?.message,
                            });
                        }}
                    />
                )}

                <div
                    className={`candidate-eye-transition ${candidateTransition
                        ? `candidate-eye-${candidateTransition}`
                        : ''
                        }`}
                />

                <div className="interview-status">
                    <span
                        className={`status-dot ${isRecordingAnswer
                            ? 'recording'
                            : ''
                            }`}
                    />

                    {step === 'loading' && '면접 준비 중'}
                    {step === 'error' && '연결 오류'}
                    {step === 'record' &&
                        (isBaselineSaving
                            ? '기본 음성 분석 중'
                            : isBaselineRecording
                                ? `기본 음성 녹음 중 ${baselineSeconds}초`
                                : isBaselinePreview
                                    ? '녹음 내용 확인 중'
                                    : hasExistingBaseline
                                        ? '기존 음성 확인'
                                        : '음성 등록 전')}
                    {step === 'resume' &&
                        (isResumeUploading
                            ? '이력서 분석 중'
                            : '이력서 업로드 대기')}
                    {step === 'calibrate_vision' && '시선 영점 분석 중'}

                    {step === 'answer' &&
                        (isRecordingAnswer
                            ? `답변 녹음 중 (${answerTimeLeft}초 남음)`
                            : isCandidateSpeaking
                                ? `${activeCandidateAnswer.name} 답변 중`
                                : `${questionIndex + 1} / ${totalQuestions || '-'
                                } 질문`)}

                    {step === 'complete' && '면접 완료'}
                </div>

                {activeCandidateAnswer && (
                    <div className="candidate-speaking-overlay">
                        <strong>{activeCandidateAnswer.name}</strong>

                        <div className="candidate-speaking-bubble">
                            {typedCandidateText}
                            <span className="typing-cursor">|</span>
                        </div>
                    </div>
                )}

                <div className="left-bottom-area">
                    {resumeName && (
                        <div className="resume-file">
                            현재 이력서: {resumeName}
                        </div>
                    )}

                    {processStatus && (
                        <div
                            className={`process-status-box ${processStatus.type}`}
                            role="status"
                            aria-live="polite"
                        >
                            <div className="process-status-icon">
                                {processStatus.type === 'processing' ? (
                                    <span className="process-status-spinner" />
                                ) : (
                                    <>
                                        <span className="process-status-record-dot" />
                                        <span>🎙</span>
                                    </>
                                )}
                            </div>

                            <div className="process-status-content">
                                <strong>{processStatus.title}</strong>
                                <p>{processStatus.description}</p>
                            </div>

                            <div
                                className="process-status-dots"
                                aria-hidden="true"
                            >
                                <span />
                                <span />
                                <span />
                            </div>
                        </div>
                    )}

                    {step === 'answer' &&
                        answerMode === 'voice' &&
                        !processStatus && (
                            <div className="answer-recording-box">
                                <div className="answer-recording-icon">
                                    {isRecordingAnswer ? '🎙' : autoRecordCountdown !== null ? '⏳' : '🎙'}
                                </div>

                                <div>
                                    <strong>
                                        {isCandidateSpeaking
                                            ? `${activeCandidateAnswer?.name} 지원자가 답변하고 있습니다.`
                                            : hasUserAnsweredCurrentQuestion
                                                ? '현재 질문에 대한 답변을 완료했습니다.'
                                                : isRecordingAnswer
                                                    ? '답변 녹음 중입니다. (제한시간 1분)'
                                                    : autoRecordCountdown !== null && autoRecordCountdown > 0
                                                        ? `답변을 준비하세요! ${autoRecordCountdown}초 뒤에 마이크가 켜집니다.`
                                                        : '곧 다음 진행이 시작됩니다.'}
                                    </strong>

                                    <p>
                                        {isCandidateSpeaking
                                            ? '다른 지원자의 답변이 끝나면 녹음할 수 있습니다.'
                                            : hasUserAnsweredCurrentQuestion
                                                ? '다른 지원자들의 답변이 끝나면 다음 질문으로 넘어갑니다.'
                                                : isRecordingAnswer
                                                    ? '답변을 모두 말씀하신 후 아래의 녹음 종료 버튼을 눌러 제출해주세요.'
                                                    : autoRecordCountdown !== null && autoRecordCountdown > 0
                                                        ? '화면을 주시하고 평소 면접 톤으로 답변할 준비를 해주세요.'
                                                        : '잠시 대기해 주세요.'}
                                    </p>

                                    {/* 🚀 1분 타이머 중앙 UI 표시 */}
                                    {isRecordingAnswer && (
                                        <div className="answer-timer" style={{ color: answerTimeLeft <= 10 ? '#e74c3c' : '#2c3e50', fontWeight: 'bold', marginTop: '8px', fontSize: '1.05rem' }}>
                                            남은 시간: {answerTimeLeft}초
                                        </div>
                                    )}
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

                    {step === 'record' && isBaselineRecording && (
                        <div className="baseline-recording-guide">
                            <div className="baseline-guide-header">
                                <strong>기본 음성 등록</strong>

                                <span>
                                    {Math.floor(baselineSeconds / 60)}:
                                    {String(baselineSeconds % 60).padStart(2, '0')}
                                    {' / 1:00'}
                                </span>
                            </div>

                            <p className="baseline-guide-description">
                                평소 면접에서 말하는 목소리와 속도로 아래 문장을 읽어주세요.
                            </p>

                            <div className="baseline-guide-text">
                                {baselineGuideText}
                            </div>
                        </div>
                    )}

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
                <section className="user-camera-area" style={{ position: 'relative' }}>
                    <video
                        ref={userVideoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            width: '100%',
                            height: '100%',
                            opacity: 0.001,
                            zIndex: -1,
                            pointerEvents: 'none',
                        }}
                    />
                    <canvas
                        ref={canvasRef}
                        width={640}
                        height={360}
                        className={`user-video ${isCameraActive ? 'active' : ''}`}
                    />

                    {!isCameraActive && (
                        <div className="camera-placeholder">
                            <span className="camera-icon">📷</span>
                            <span>카메라가 꺼져 있습니다.</span>
                        </div>
                    )}

                    <button
                        type="button"
                        className={`camera-toggle-button ${isCameraActive
                            ? 'camera-on'
                            : 'camera-off'
                            }`}
                        onClick={toggleUserCamera}
                        disabled={hasCameraDevice === false}
                        aria-label={
                            hasCameraDevice === false
                                ? '사용 가능한 카메라 없음'
                                : isCameraActive
                                    ? '내 카메라 끄기'
                                    : '내 카메라 켜기'
                        }
                        title={
                            hasCameraDevice === false
                                ? '사용 가능한 카메라가 없습니다.'
                                : isCameraActive
                                    ? '내 카메라 끄기'
                                    : '내 카메라 켜기'
                        }
                    >
                        {hasCameraDevice === false
                            ? '❌'
                            : isCameraActive
                                ? '🚫'
                                : '📹'}
                    </button>
                </section>

                <section className="chat-area">
                    <div className="chat-header">
                        <div>
                            <strong>AI 면접관</strong>

                            <span>{interviewProgressLabel}</span>
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
                                        {message.name || '면접관'}
                                    </span>
                                )}

                                {message.type === 'user' && (
                                    <span className="message-name">
                                        나
                                    </span>
                                )}

                                {message.type === 'candidate' && (
                                    <span className="message-name">
                                        {message.name}
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
                                    답변을 녹음하고 있습니다...
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