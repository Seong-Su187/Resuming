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
    const websocketRef = useRef(null);
    const sessionCreatedRef = useRef(false);

    const candidateDelayTimerRef = useRef(null);

    const isRecordingAnswerRef = useRef(false);
    const isStartingAnswerRecordingRef = useRef(false);
    const pendingUserAnswerRef = useRef(null);

    const candidateTypingTimerRef = useRef(null);
    const candidateFinishTimerRef = useRef(null);

    const baselineRecorderRef = useRef(null);
    const baselineStreamRef = useRef(null);
    const baselineChunksRef = useRef([]);
    const baselineIntervalRef = useRef(null);
    const baselineAudioUrlRef = useRef(null);
    const baselineAudioRef = useRef(null);

    const answerRecorderRef = useRef(null);
    const answerStreamRef = useRef(null);
    const answerChunksRef = useRef([]);

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

    const [interviewerVideoUrl, setInterviewerVideoUrl] = useState(null);
    const interviewerVideoUrlRef = useRef(null);

    const [isRecordingAnswer, setIsRecordingAnswer] = useState(false);
    const [isResumeUploading, setIsResumeUploading] = useState(false);
    const [hasExistingResume, setHasExistingResume] = useState(false);
    const [isResumeChecking, setIsResumeChecking] = useState(false);

    // 나중에 제거
    const [answerMode, setAnswerMode] = useState('voice');
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

    // base64로 전달받은 mp4 데이터를 브라우저에서 재생 가능한 URL로 변환
    const base64ToVideoUrl = (base64) => {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);

        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }

        const blob = new Blob(
            [new Uint8Array(byteNumbers)],
            { type: 'video/mp4' },
        );

        return URL.createObjectURL(blob);
    };

    const setInterviewerVideo = (base64OrNull) => {
        if (interviewerVideoUrlRef.current) {
            URL.revokeObjectURL(interviewerVideoUrlRef.current);
        }

        const nextUrl = base64OrNull
            ? base64ToVideoUrl(base64OrNull)
            : null;

        interviewerVideoUrlRef.current = nextUrl;
        setInterviewerVideoUrl(nextUrl);
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
                ? `기존에 등록한 기본 음성을 사용합니다. 기준 말하기 속도는 약 ${Math.round(wpm)} WPM입니다.`
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

                    // 최대 60초가 지나면 자동 종료
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
                            selected_candidates: selectedCandidates,
                        }),
                    );

                    return;
                }

                if (data.type === 'next_question') {
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

                    addMessage(
                        'interviewer',
                        data.question_text,
                    );

                    setInterviewerVideo(
                        data.avatar_video_base64 || null,
                    );

                    setActiveCandidateAnswer(null);
                    setTypedCandidateText('');

                    setCandidateAnswerQueue(
                        shuffleCandidateAnswers(
                            data.candidate_answers ?? [],
                        ),
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

    const startAnswerRecording = async () => {
        if (
            step !== 'answer' ||
            isRecordingAnswerRef.current ||
            isStartingAnswerRecordingRef.current ||
            activeCandidateAnswer ||
            hasUserAnsweredCurrentQuestion
        ) {
            return;
        }

        /*
         * 마이크 권한 요청 전에 발언권을 먼저 확보합니다.
         * getUserMedia를 기다리는 사이 지원자 타이머가 실행되는 것을 방지합니다.
         */
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

            /*
             * 권한 요청 중 지원자 발언이 시작됐다면
             * 마이크를 사용하지 않고 종료합니다.
             */
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

                    /*
                     * 마지막 남은 녹음 데이터를 먼저 요청한 후 종료합니다.
                     */
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

            /*
             * 오른쪽 채팅창에 실제 STT 결과 표시
             */
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

            /*
             * STT 결과와 음성 분석 결과를
             * WebSocket 평가 로직으로 전달
             */
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

    /*
     * 현재 테스트용 텍스트 답변 제출
     *
     * 추후 음성인식 기능이 완성되면
     * STT 결과를 answerText에 넣거나
     * handleRecordAnswer를 다시 활성화
     */
    const handleSubmitTextAnswer = () => {
        const trimmedAnswer = answerText.trim();

        if (
            step !== 'answer' ||
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

    useEffect(() => {
        const pendingAnswer =
            pendingUserAnswerRef.current;

        if (
            !pendingAnswer ||
            !hasUserAnsweredCurrentQuestion ||
            activeCandidateAnswer ||
            candidateAnswerQueue.length > 0 ||
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

        websocket.send(
            JSON.stringify(pendingAnswer),
        );

        pendingUserAnswerRef.current = null;
    }, [
        hasUserAnsweredCurrentQuestion,
        activeCandidateAnswer,
        candidateAnswerQueue,
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

    // 선택된 지원자 답변을 겹치지 않게 순차적으로 시작
    useEffect(() => {
        clearTimeout(candidateDelayTimerRef.current);

        if (
            step !== 'answer' ||
            activeCandidateAnswer ||
            candidateAnswerQueue.length === 0 ||
            isRecordingAnswer ||
            isStartingAnswerRecording ||
            isProcessingAnswer
        ) {
            return;
        }

        // 10초 이상 15초 이하
        const randomDelay =
            10000 + Math.floor(Math.random() * 5001);

        candidateDelayTimerRef.current = setTimeout(() => {
            /*
             * 타이머가 끝나는 순간 사용자가 녹음을 시작했거나
             * 답변 분석 중일 수 있으므로 다시 확인합니다.
             */
            if (
                isRecordingAnswerRef.current ||
                isStartingAnswerRecordingRef.current
            ) {
                return;
            }

            setCandidateAnswerQueue((previousQueue) => {
                const [
                    nextCandidate,
                    ...remainingCandidates
                ] = previousQueue;

                if (!nextCandidate) {
                    return previousQueue;
                }

                setActiveCandidateAnswer(nextCandidate);
                setTypedCandidateText('');

                return remainingCandidates;
            });
        }, randomDelay);

        return () => {
            clearTimeout(candidateDelayTimerRef.current);
        };
    }, [
        step,
        activeCandidateAnswer,
        candidateAnswerQueue,
        isRecordingAnswer,
        isStartingAnswerRecording,
        isProcessingAnswer,
    ]);

    // 지원자 답변을 한 글자씩 표시
    useEffect(() => {
        if (!activeCandidateAnswer || isRecordingAnswer) {
            return;
        }

        const fullText = activeCandidateAnswer.answer || '';
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
                    setActiveCandidateAnswer(null);
                    setTypedCandidateText('');
                }, 650);
            }
        }, 55);

        return () => {
            clearInterval(candidateTypingTimerRef.current);
            clearTimeout(candidateFinishTimerRef.current);
        };
    }, [activeCandidateAnswer, isRecordingAnswer]);

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
            clearTimeout(candidateDelayTimerRef.current);
            clearInterval(candidateTypingTimerRef.current);
            clearTimeout(candidateFinishTimerRef.current);

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

            if (interviewerVideoUrlRef.current) {
                URL.revokeObjectURL(interviewerVideoUrlRef.current);
                interviewerVideoUrlRef.current = null;
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
                {interviewerVideoUrl && (
                    <video
                        key={interviewerVideoUrl}
                        className="interviewer-avatar-video"
                        src={interviewerVideoUrl}
                        autoPlay
                        playsInline
                    />
                )}

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
                                                    : '10~15초 후 다른 지원자가 답변할 수 있으므로 먼저 답하려면 녹음 버튼을 눌러주세요.'}
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