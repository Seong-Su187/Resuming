/* register.jsx */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API_BASE_URL from "../../config/apiConfig";
import '../../index.css';
import './register.css';

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

function Register() {
    const navigate = useNavigate();

    const [username, setUsername] = useState('');
    const [fullName, setFullName] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');

    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

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

        setMessage('');
        setIsError(false);

        if (password !== passwordConfirm) {
            setIsError(true);
            setMessage('비밀번호가 일치하지 않습니다.');
            return;
        }

        try {
            setIsSubmitting(true);

            const response = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username,
                    password,
                    full_name: fullName,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || '회원가입에 실패했습니다.');
            }

            alert(data.message);
            navigate('/', { replace: true });
        } catch (error) {
            setIsError(true);
            setMessage(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="page">
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

            <section className="register-card">
                <h1 className="logo">
                    <img
                        src="/assets/resuming-r.png"
                        alt="R"
                        className="logo-image"
                    />
                    <span>ESUMING</span>
                </h1>

                <p className="register-description">
                    AI 면접 서비스를 시작해보세요.
                </p>

                <form className="register-form" onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label htmlFor="fullName">이름</label>

                        <input
                            id="fullName"
                            type="text"
                            placeholder="이름을 입력하세요"
                            value={fullName}
                            onChange={(event) => setFullName(event.target.value)}
                            autoComplete="name"
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="username">아이디</label>

                        <input
                            id="username"
                            type="text"
                            placeholder="사용할 아이디를 입력하세요"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            autoComplete="username"
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="password">비밀번호</label>

                        <input
                            id="password"
                            type="password"
                            placeholder="8자 이상 입력하세요"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="new-password"
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="passwordConfirm">
                            비밀번호 확인
                        </label>

                        <input
                            id="passwordConfirm"
                            type="password"
                            placeholder="비밀번호를 다시 입력하세요"
                            value={passwordConfirm}
                            onChange={(event) =>
                                setPasswordConfirm(event.target.value)
                            }
                            autoComplete="new-password"
                            required
                        />
                    </div>

                    {message && (
                        <p
                            className={
                                isError
                                    ? 'register-message error'
                                    : 'register-message success'
                            }
                        >
                            {message}
                        </p>
                    )}

                    <button
                        type="submit"
                        className="register-button"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? '가입 중...' : '회원가입'}
                    </button>
                </form>

                <p className="login-link">
                    이미 계정이 있으신가요?
                    <Link to="/">로그인</Link>
                </p>
            </section>
        </main>
    );
}

export default Register;