/* login.jsx */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API_BASE_URL from '../../config/apiConfig';
import '../../index.css';
import './login.css';

const bubbleMessages = [
    '면접관을 보면 긴장부터 돼...',
    '내가 과연 잘할 수 있을까?',
    '준비한 말을 잊어버리면 어떡하지?',
    '자꾸 생각이 많아져서 정작 할 말이 생각나지 않아...',
    '떨지 않고 자신 있게 말하고 싶어...',
    '실전처럼 연습할 방법이 없을까?',
    '목소리가 떨리면 바로 티 나겠지?',
    '예상하지 못한 질문이 나오면 어떡하지?',
    '내 답변이 너무 짧지는 않을까?',
    '시선을 어디에 둬야 할지 모르겠어...',
    '긴장하면 말이 너무 빨라져...',
    '이번 면접은 꼭 잘 보고 싶어.',
];

function Login() {
    const navigate = useNavigate();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const bubbles = useMemo(() => {
        return bubbleMessages.map((message, index) => ({
            id: index,
            message,

            // 화면 좌우 위치
            left: Math.random() * 88 + 2,

            // 애니메이션 시작 시간
            delay: Math.random() * -24,

            // 올라가는 속도
            duration: Math.random() * 8 + 16,

            // 말풍선 크기
            scale: Math.random() * 0.25 + 0.85,

            // 좌우 흔들림 정도
            drift: Math.random() * 120 - 60,
        }));
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();

        setIsLoading(true);
        setErrorMessage('');

        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username,
                    password,
                }),
            });

            const data = await response.json();

            console.log('로그인 응답:', data);

            if (!response.ok) {
                let message = '아이디 또는 비밀번호를 확인해주세요.';

                if (typeof data.detail === 'string') {
                    message = data.detail;
                } else if (Array.isArray(data.detail)) {
                    message = data.detail
                        .map((error) => error.msg)
                        .join('\n');
                }

                throw new Error(message);
            }

            localStorage.setItem('userId', data.user.user_id);
            localStorage.setItem('username', data.user.username);
            localStorage.setItem('fullName', data.user.full_name);

            navigate('/', { replace: true });
        } catch (error) {
            console.error('로그인 오류:', error);

            setErrorMessage(
                error.message || '로그인 중 오류가 발생했습니다.'
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="login-page">
            <div
                className="worry-bubbles"
                aria-hidden="true"
            >
                {bubbles.map((bubble) => (
                    <div
                        key={bubble.id}
                        className="worry-bubble"
                        style={{
                            '--bubble-left': `${bubble.left}%`,
                            '--bubble-delay': `${bubble.delay}s`,
                            '--bubble-duration': `${bubble.duration}s`,
                            '--bubble-scale': bubble.scale,
                            '--bubble-drift': `${bubble.drift}px`,
                        }}
                    >
                        {bubble.message}
                    </div>
                ))}
            </div>

            <section className="login-card">
                <h1 className="logo">
                    <img
                        src="/assets/resuming-r.png"
                        alt="R"
                        className="logo-image"
                    />
                    <span>ESUMING</span>
                </h1>

                <p className="login-description">
                    AI 면접 서비스에 로그인하세요.
                </p>

                <form
                    className="login-form"
                    onSubmit={handleSubmit}
                >
                    <div className="input-group">
                        <label htmlFor="username">아이디</label>

                        <input
                            id="username"
                            type="text"
                            placeholder="아이디를 입력하세요"
                            value={username}
                            onChange={(event) =>
                                setUsername(event.target.value)
                            }
                            disabled={isLoading}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="password">비밀번호</label>

                        <input
                            id="password"
                            type="password"
                            placeholder="비밀번호를 입력하세요"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            disabled={isLoading}
                            required
                        />
                    </div>

                    {errorMessage && (
                        <p
                            className="login-error"
                            role="alert"
                        >
                            {errorMessage}
                        </p>
                    )}

                    <button
                        type="submit"
                        className="login-button"
                        disabled={isLoading}
                    >
                        {isLoading ? '로그인 중...' : '로그인'}
                    </button>
                </form>

                <p className="register-link">
                    아직 계정이 없으신가요?
                    <Link to="/register">회원가입</Link>
                </p>
            </section>
        </main>
    );
}

export default Login;