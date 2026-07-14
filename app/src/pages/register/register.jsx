import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API_BASE_URL from "../../config/apiConfig";
import '../../index.css';
import './register.css';

function Register() {
    const navigate = useNavigate();

    const [username, setUsername] = useState('');
    const [fullName, setFullName] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');

    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

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