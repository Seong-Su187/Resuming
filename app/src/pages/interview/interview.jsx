/* interview.jsx */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../../config/apiConfig';
import '../../index.css';
import './interview.css';

function Interview() {
    const navigate = useNavigate();

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

    const fileInputRef = useRef(null);
    const chatEndRef = useRef(null);
    const websocketRef = useRef(null);
    const sessionCreatedRef = useRef(false);

    // 웹캠 및 비전 AI 처리 Refs
    const userVideoRef = useRef(null);
    const canvasRef = useRef(null);
    const bgImageRef = useRef(new Image());
    const selfieSegmentationRef = useRef(null);
    const renderLoopRef = useRef(null); // 수동 프레임 루프 관리를 위한 Ref

    // 시선 영점 조절용 State (2단계)
    const [calibrationPhase, setCalibrationPhase] = useState('hr_ready'); // hr_ready, hr_calibrating, tech_ready, tech_calibrating
    const [baselines, setBaselines] = useState({
        hrNose: 0.5, hrIris: 0.5,
        techNose: 0.5, techIris: 0.5
    });
    const [calibrationCountdown, setCalibrationCountdown] = useState(0);

    // 🚀 추가: 현재 쳐다봐야 할 대상(질문 중인 면접관) 상태 관리
    const [currentInterviewer, setCurrentInterviewer] = useState('hr'); // 'hr' 또는 'tech'

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

    const interviewerPlaybackIdRef = useRef(0);
    const isInterviewerStreamPlayingRef = useRef(false);
    const isDefaultVideoTransitioningRef = useRef(false);

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

    // 카메라 사용 여부 선택 모달
    const [isCameraChoiceModalOpen, setIsCameraChoiceModalOpen] =
        useState(true);

    // null: 확인 중, true: 카메라 있음, false: 카메라 없음
    const [hasCameraDevice, setHasCameraDevice] = useState(null);

    // 사용자가 카메라 사용을 선택했는지 여부
    const [cameraUsageEnabled, setCameraUsageEnabled] = useState(false);

    const [answerMode, setAnswerMode] = useState('voice');
    const [interviewMode, setInterviewMode] = useState(() => {
        return localStorage.getItem('interviewMode') || 'user';
    });
    const interviewModeRef = useRef(
        localStorage.getItem('interviewMode') || 'user',
    );
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

        localStorage.setItem('interviewMode', mode);
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

        const nextVideoUrl =
            getRandomInterviewerDefaultVideo();

        const handleCanPlay = async () => {
            nextVideo.removeEventListener(
                'canplay',
                handleCanPlay,
            );

            try {
                nextVideo.currentTime = 0;
                await nextVideo.play();

                // 다음 영상이 실제로 재생된 다음 화면 전환
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

    const playInterviewerVideoStream = async (
        text,
        avatar,
        duoAvatarType,
    ) => {
        const videoEl = interviewerStreamVideoRef.current;

        if (!videoEl || !text) {
            return false;
        }

        if (interviewerStreamAbortRef.current) {
            interviewerStreamAbortRef.current.abort();
        }

        const abortController = new AbortController();
        interviewerStreamAbortRef.current = abortController;

        if (interviewerVideoUrlRef.current) {
            URL.revokeObjectURL(
                interviewerVideoUrlRef.current,
            );

            interviewerVideoUrlRef.current = null;
        }

        const MIME =
            'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';

        if (
            !('MediaSource' in window) ||
            !MediaSource.isTypeSupported(MIME)
        ) {
            console.error(
                '[interview] 이 브라우저는 아바타 영상 스트리밍을 지원하지 않습니다.',
            );

            restoreDefaultInterviewerVideo();

            return false;
        }

        let mediaSource = null;
        let sourceBuffer = null;

        const appendQueue = [];

        let appending = false;
        let streamDone = false;
        let monitorTimerId = null;
        let started = false;
        let playAllowed = false;

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
                sourceBuffer.appendBuffer(
                    appendQueue.shift(),
                );
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
                abortController.signal.aborted
            ) {
                return;
            }

            const buffered = videoEl.buffered;

            if (buffered.length > 0) {
                const bufferedEnd =
                    buffered.end(buffered.length - 1);

                const ahead =
                    bufferedEnd - videoEl.currentTime;

                const PAUSE_THRESHOLD = 0.05;
                const RESUME_THRESHOLD = 1.0;

                if (!streamDone) {
                    if (
                        !videoEl.paused &&
                        ahead < PAUSE_THRESHOLD
                    ) {
                        videoEl.pause();
                    } else if (
                        videoEl.paused &&
                        playAllowed &&
                        ahead >= RESUME_THRESHOLD
                    ) {
                        videoEl.play().catch(() => { });
                    }
                } else if (
                    videoEl.paused &&
                    playAllowed
                ) {
                    videoEl.play().catch(() => { });
                }
            }

            monitorTimerId =
                setTimeout(monitorBuffer, 200);
        };

        const initializeStreamVideo = async () => {
            mediaSource = new MediaSource();

            const objectUrl =
                URL.createObjectURL(mediaSource);

            interviewerVideoUrlRef.current =
                objectUrl;

            isInterviewerStreamPlayingRef.current =
                true;

            setIsInterviewerStreamVisible(false);

            videoEl.pause();
            videoEl.loop = false;
            videoEl.muted = false;

            videoEl.removeAttribute('src');
            videoEl.src = objectUrl;
            videoEl.load();

            await new Promise((resolve, reject) => {
                const handleSourceOpen = () => {
                    resolve();
                };

                const handleSourceError = () => {
                    reject(
                        new Error(
                            'MediaSource를 열지 못했습니다.',
                        ),
                    );
                };

                mediaSource.addEventListener(
                    'sourceopen',
                    handleSourceOpen,
                    { once: true },
                );

                mediaSource.addEventListener(
                    'error',
                    handleSourceError,
                    { once: true },
                );
            });

            if (abortController.signal.aborted) {
                throw new DOMException(
                    '스트리밍 요청이 취소되었습니다.',
                    'AbortError',
                );
            }

            sourceBuffer =
                mediaSource.addSourceBuffer(MIME);

            // 문장별로 독립 생성된 mp4 조각들은 각자 타임스탬프가 0부터 다시 시작되므로,
            // 자체 타임스탬프를 무시하고 도착 순서대로 이어붙이는 'sequence' 모드로 설정합니다.
            // (기본값인 'segments' 모드는 겹치는 타임스탬프를 같은 구간으로 취급해
            // 뒤에 온 문장이 덮어써진 것처럼 사라지는 문제가 있었습니다.)
            sourceBuffer.mode = 'sequence';

            sourceBuffer.addEventListener(
                'updateend',
                () => {
                    appending = false;

                    if (
                        streamDone &&
                        appendQueue.length === 0
                    ) {
                        if (
                            mediaSource.readyState ===
                            'open'
                        ) {
                            try {
                                mediaSource.endOfStream();
                            } catch (error) {
                                // 이미 종료된 스트림이면 무시
                            }
                        }
                    } else {
                        flushQueue();
                    }
                },
            );

            sourceBuffer.addEventListener(
                'error',
                (error) => {
                    console.error(
                        '[interview] MSE SourceBuffer 오류:',
                        error,
                    );
                },
            );

            started = true;
            playAllowed = true;

            monitorBuffer();
        };

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
                        duo_avatar_type:
                            duoAvatarType,
                    }),
                    signal:
                        abortController.signal,
                },
            );

            if (!response.ok) {
                console.error(
                    '[interview] 아바타 영상 스트리밍 요청 실패:',
                    response.status,
                );

                restoreDefaultInterviewerVideo();

                return false;
            }

            if (!response.body) {
                console.error(
                    '[interview] 아바타 영상 응답 데이터가 없습니다.',
                );

                restoreDefaultInterviewerVideo();

                return false;
            }

            const reader =
                response.body.getReader();

            while (true) {
                const { done, value } =
                    await reader.read();

                if (done) {
                    break;
                }

                if (
                    !value ||
                    value.byteLength === 0
                ) {
                    continue;
                }

                if (!started) {
                    await initializeStreamVideo();
                }

                appendQueue.push(value);
                flushQueue();
            }

            if (!started) {
                console.error(
                    '[interview] 생성된 아바타 영상 데이터가 없습니다.',
                );

                restoreDefaultInterviewerVideo();

                return false;
            }

            streamDone = true;

            if (
                mediaSource &&
                sourceBuffer &&
                !appending &&
                appendQueue.length === 0 &&
                mediaSource.readyState === 'open'
            ) {
                try {
                    mediaSource.endOfStream();
                } catch (error) {
                    // 이미 종료된 스트림이면 무시
                }
            }

            return true;
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(
                    '[interview] 아바타 영상 스트리밍 실패:',
                    error,
                );

                restoreDefaultInterviewerVideo();
            }

            return false;
        }
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

            startVisionCalibration(); // 웹캠 영점 조절 단계로 이동
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

            startVisionCalibration(); // 웹캠 영점 조절 단계로 이동
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
        // 사용자가 카메라 미사용을 선택했거나 카메라가 없는 경우
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

        // 사용하기로 했지만 현재 카메라가 꺼져 있는 경우
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
        setCalibrationPhase('hr_ready');
        setCalibrationCountdown(3);

        addMessage(
            'system',
            '시선 추적을 위한 영점 조절을 2단계로 진행합니다. 먼저 왼쪽에 있는 인사 면접관의 눈을 바라보고 영점 조절 시작 버튼을 눌러주세요.',
        );
    };

    const handleStartCalibration = () => {
        const currentPhase = calibrationPhase;
        const targetType = currentPhase === 'hr_ready' ? 'hr' : 'tech';

        if (currentPhase === 'hr_ready') {
            setCalibrationPhase('hr_calibrating');
            addMessage('system', '정확한 시선 분석을 위해 왼쪽 인사 면접관의 눈을 바라봐 주세요.');
        } else if (currentPhase === 'tech_ready') {
            setCalibrationPhase('tech_calibrating');
            addMessage('system', '정확한 시선 분석을 위해 오른쪽 기술 면접관의 눈을 바라봐 주세요.');
        }

        setCalibrationCountdown(3);

        let countdown = 3;
        const capturedFrames = [];

        const timer = setInterval(() => {
            countdown -= 1;
            setCalibrationCountdown(countdown);

            if (canvasRef.current) {
                const base64Image = canvasRef.current.toDataURL('image/jpeg', 0.5);
                capturedFrames.push(base64Image);
            }

            if (countdown === 0) {
                clearInterval(timer);
                finishVisionCalibration(targetType, capturedFrames);
            }
        }, 1000);
    };

    const finishVisionCalibration = async (type, frames) => {
        addMessage('system', `${type === 'hr' ? '왼쪽(인사)' : '오른쪽(기술)'} 시선 추적 기준점을 계산하고 있습니다...`);
        try {
            const response = await fetch(`${API_BASE_URL}/interviews/calibrate-vision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ frames })
            });

            const data = await response.json();

            if (response.ok) {
                if (type === 'hr') {
                    setBaselines(prev => ({ ...prev, hrNose: data.baseline_nose, hrIris: data.baseline_iris }));
                    setCalibrationPhase('tech_ready');
                    addMessage('system', '왼쪽 영점 조절이 완료되었습니다. 이어서 오른쪽 기술 면접관의 눈을 바라보고 영점 조절 시작 버튼을 눌러주세요.');
                } else {
                    setBaselines(prev => ({ ...prev, techNose: data.baseline_nose, techIris: data.baseline_iris }));
                    addMessage('system', '오른쪽 영점 조절이 완료되었습니다. 곧 면접이 시작됩니다.');
                    connectWebSocket();
                }
            } else {
                throw new Error("분석 실패");
            }
        } catch (error) {
            console.error('Vision Calibration Error:', error);
            if (type === 'hr') {
                setBaselines(prev => ({ ...prev, hrNose: 0.5, hrIris: 0.5 }));
                setCalibrationPhase('tech_ready');
                addMessage('system', '왼쪽 영점 조절에 실패하여 기본값으로 설정되었습니다. 이어서 오른쪽 기술 면접관의 눈을 바라보고 시작 버튼을 눌러주세요.');
            } else {
                setBaselines(prev => ({ ...prev, techNose: 0.5, techIris: 0.5 }));
                addMessage('system', '오른쪽 영점 조절에 실패하여 기본값으로 설정되었습니다. 곧 면접이 시작됩니다.');
                connectWebSocket();
            }
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

                    setQuestionIndex(data.current_index - 1);
                    setTotalQuestions(data.total_questions);
                    setStep('answer');

                    // 🚀 추가: 어떤 면접관이 질문하는지 파악하여 상태 업데이트
                    const isTechQuestion = data.interviewer_type === 'technical' || data.avatar === 'middle_aged';
                    setCurrentInterviewer(isTechQuestion ? 'tech' : 'hr');

                    addMessage(
                        'interviewer',
                        data.question_text,
                        getInterviewerName(
                            data.interviewer_type,
                            data.avatar,
                        ),
                    );

                    const playbackId = interviewerPlaybackIdRef.current + 1;
                    interviewerPlaybackIdRef.current = playbackId;

                    setIsInterviewerSpeaking(true);

                    playInterviewerVideoStream(
                        data.question_text,
                        data.avatar,
                        data.duo_avatar_type,
                    ).then((success) => {
                        if (
                            success === false &&
                            interviewerPlaybackIdRef.current === playbackId
                        ) {
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

            if (!transcribedText) {
                throw new Error(
                    '답변 음성을 인식하지 못했습니다.',
                );
            }

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

            bgImageRef.current.src = '/office_background.jpg'; // 배경 이미지 경로 (public 폴더 기준)

            const selfieSegmentation = new MP_SelfieSegmentation({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
            });

            selfieSegmentation.setOptions({
                modelSelection: 1, // 1: 성능/속도 우선
            });

            selfieSegmentation.onResults((results) => {
                canvasCtx.save();
                canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

                // 1. 마스크(실루엣) 그리기
                canvasCtx.globalCompositeOperation = 'source-over';
                canvasCtx.drawImage(results.segmentationMask, 0, 0, canvasElement.width, canvasElement.height);

                // 2. 마스크 안쪽에만 실제 웹캠 이미지(내 얼굴) 채워 넣기
                canvasCtx.globalCompositeOperation = 'source-in';
                canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

                // 3. 인물 뒤쪽으로 가짜 배경 밀어넣기
                canvasCtx.globalCompositeOperation = 'destination-over';
                if (bgImageRef.current.complete && bgImageRef.current.naturalWidth > 0) {
                    canvasCtx.drawImage(bgImageRef.current, 0, 0, canvasElement.width, canvasElement.height);
                } else {
                    canvasCtx.fillStyle = '#333333'; // 이미지 로딩 전 기본 배경색
                    canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
                }

                canvasCtx.restore();
            });

            selfieSegmentationRef.current = selfieSegmentation;

            // MediaPipe Camera 래퍼를 사용하지 않고 직접 웹캠 스트림 요청
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
        checkCameraDevice();
    }, []);

    // 🚀 수정: 서버로 프레임 보낼 때 현재 질문 중인 면접관에 맞춰 기준값을 교체하여 전송
    useEffect(() => {
        let interval;
        if (step === 'answer' && isCameraActive && websocketRef.current?.readyState === WebSocket.OPEN) {
            interval = setInterval(() => {
                if (canvasRef.current) {
                    const base64Image = canvasRef.current.toDataURL('image/jpeg', 0.6);

                    // 현재 질문 중인 면접관에 따라 사용할 기준값 선택
                    const activeNose = currentInterviewer === 'tech' ? baselines.techNose : baselines.hrNose;
                    const activeIris = currentInterviewer === 'tech' ? baselines.techIris : baselines.hrIris;

                    websocketRef.current.send(
                        JSON.stringify({
                            type: 'video_frame',
                            image: base64Image,
                            current_target: currentInterviewer, // 현재 쳐다봐야 할 면접관 (서버 참고용)
                            baseline_nose: activeNose,          // 동적으로 바뀌는 실제 검사 기준값
                            baseline_iris: activeIris,

                            // (혹시 모를 서버 로그 기록이나 하위 호환성을 위한 개별 데이터 유지)
                            baseline_nose_hr: baselines.hrNose,
                            baseline_iris_hr: baselines.hrIris,
                            baseline_nose_tech: baselines.techNose,
                            baseline_iris_tech: baselines.techIris
                        })
                    );
                }
            }, 1000);
        }

        // 의존성 배열에 currentInterviewer를 추가하여, 면접관이 바뀔 때마다 interval이 새로 갱신되도록 합니다.
        return () => clearInterval(interval);
    }, [step, isCameraActive, baselines, currentInterviewer]);

    useEffect(() => {
        return () => {
            stopUserCamera(); // 컴포넌트 언마운트 시 리소스 해제
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

        if (step === 'calibrate_vision') {
            if (calibrationPhase === 'hr_ready') {
                return (
                    <button
                        type="button"
                        className="interview-action-button record-button"
                        onClick={handleStartCalibration}
                    >
                        <span className="action-icon">🎯</span>
                        인사 면접관(왼쪽) 영점 조절 시작
                    </button>
                );
            }

            if (calibrationPhase === 'hr_calibrating') {
                return (
                    <button
                        type="button"
                        className="interview-action-button record-button recording"
                        disabled
                    >
                        <span className="action-icon">👁️</span>
                        왼쪽 인사 면접관을 바라보세요 ({calibrationCountdown}초)
                    </button>
                );
            }

            if (calibrationPhase === 'tech_ready') {
                return (
                    <button
                        type="button"
                        className="interview-action-button record-button"
                        onClick={handleStartCalibration}
                        style={{ backgroundColor: '#2d6a4f' }} // 버튼 색상 변경하여 구분감 추가
                    >
                        <span className="action-icon">🎯</span>
                        기술 면접관(오른쪽) 영점 조절 시작
                    </button>
                );
            }

            if (calibrationPhase === 'tech_calibrating') {
                return (
                    <button
                        type="button"
                        className="interview-action-button record-button recording"
                        disabled
                    >
                        <span className="action-icon">👁️</span>
                        오른쪽 기술 면접관을 바라보세요 ({calibrationCountdown}초)
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
                                    : startAnswerRecording
                            }
                            disabled={
                                isInterviewerSpeaking ||
                                isCandidateSpeaking ||
                                isStartingAnswerRecording ||
                                isProcessingAnswer ||
                                (
                                    hasUserAnsweredCurrentQuestion &&
                                    !isRecordingAnswer
                                )
                            }
                        >
                            <span className="action-icon">
                                {isRecordingAnswer
                                    ? '■'
                                    : '🎙'}
                            </span>

                            {isRecordingAnswer
                                ? '답변 녹음 종료'
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
            {isCameraChoiceModalOpen && (
                <div className="camera-choice-overlay">
                    <div
                        className="camera-choice-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="camera-choice-title"
                    >
                        <div className="camera-choice-icon">
                            📷
                        </div>

                        <h2 id="camera-choice-title">
                            카메라를 사용하시겠습니까?
                        </h2>

                        {hasCameraDevice === null && (
                            <p>
                                연결된 카메라를 확인하고 있습니다.
                            </p>
                        )}

                        {hasCameraDevice === true && (
                            <p>
                                카메라를 사용하면 면접 중 시선 방향을
                                분석할 수 있습니다. 카메라를 사용하지
                                않아도 면접은 진행할 수 있습니다.
                            </p>
                        )}

                        {hasCameraDevice === false && (
                            <p>
                                사용할 수 있는 카메라를 찾지 못했습니다.
                                카메라 없이 면접을 진행합니다.
                            </p>
                        )}

                        <div className="camera-choice-buttons">
                            {hasCameraDevice === true && (
                                <button
                                    type="button"
                                    className="camera-choice-use-button"
                                    onClick={handleUseCamera}
                                >
                                    카메라 사용
                                </button>
                            )}

                            <button
                                type="button"
                                className="camera-choice-skip-button"
                                onClick={handleSkipCamera}
                                disabled={hasCameraDevice === null}
                            >
                                {hasCameraDevice === false
                                    ? '카메라 없이 진행'
                                    : '사용하지 않음'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="temporary-mode-panel">
                <div className="temporary-mode-row">
                    <span>답변 모드</span>

                    <div className="temporary-mode-buttons">
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
                </div>

                <div className="temporary-mode-row">
                    <span>진행 모드</span>

                    <div className="temporary-mode-buttons">
                        <button
                            type="button"
                            className={interviewMode === 'developer' ? 'active' : ''}
                            onClick={() => changeInterviewMode('developer')}
                            disabled={
                                isRecordingAnswer ||
                                isStartingAnswerRecording ||
                                isProcessingAnswer
                            }
                        >
                            개발자
                        </button>

                        <button
                            type="button"
                            className={interviewMode === 'user' ? 'active' : ''}
                            onClick={() => changeInterviewMode('user')}
                            disabled={
                                isRecordingAnswer ||
                                isStartingAnswerRecording ||
                                isProcessingAnswer
                            }
                        >
                            사용자
                        </button>
                    </div>
                </div>
            </div>

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

                    {step === 'calibrate_vision' && (
                        <div
                            className={`calibration-target-box ${calibrationPhase.startsWith('hr')
                                ? 'calibration-target-hr'
                                : 'calibration-target-tech'
                                }`}
                        >
                            <span>
                                {calibrationPhase.startsWith('hr')
                                    ? '인사 면접관의 눈을 바라보세요'
                                    : '기술 면접관의 눈을 바라보세요'}
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
                        }}
                        onEnded={() => {
                            if (!isInterviewerStreamPlayingRef.current) {
                                return;
                            }

                            setIsInterviewerSpeaking(false);
                            restoreDefaultInterviewerVideo();
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
                                restoreDefaultInterviewerVideo();
                            }
                        }}
                    />
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
                            ? '답변 녹음 중'
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
                                        : isProcessingAnswer
                                            ? '답변 음성을 분석하고 있습니다.'
                                            : isStartingAnswerRecording
                                                ? '마이크를 연결하고 있습니다.'
                                                : isCandidateSpeaking
                                                    ? `${activeCandidateAnswer?.name} 지원자가 답변하고 있습니다.`
                                                    : hasUserAnsweredCurrentQuestion
                                                        ? '현재 질문에 대한 답변을 완료했습니다.'
                                                        : '지금 답변을 시작할 수 있습니다.'}
                                </strong>

                                <p>
                                    {isRecordingAnswer
                                        ? '답변을 모두 말씀한 후 답변 녹음 종료 버튼을 눌러주세요.'
                                        : isProcessingAnswer
                                            ? '분석이 끝나면 다른 지원자의 답변 대기가 다시 시작됩니다.'
                                            : isCandidateSpeaking
                                                ? '다른 지원자의 답변이 끝나면 녹음할 수 있습니다.'
                                                : hasUserAnsweredCurrentQuestion
                                                    ? '다른 지원자들의 답변이 끝나면 다음 질문으로 넘어갑니다.'
                                                    : '5~10초 후 다른 지원자가 답변할 수 있으므로 먼저 답하려면 녹음 버튼을 눌러주세요.'}
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
                <section className="user-camera-area">
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

                            <span>
                                {step === 'complete'
                                    ? '면접 종료'
                                    : selectedCandidates.length > 0
                                        ? `지원자 ${selectedCandidates.length}명과 함께 진행 중`
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