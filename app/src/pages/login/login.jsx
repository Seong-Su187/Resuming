/* login.jsx */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API_BASE_URL from '../../config/apiConfig';
import '../../index.css';
import './login.css';

function Login() {
    const navigate = useNavigate();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

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
                    username: username,
                    password: password,
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

            navigate('/start', { replace: true });
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
        <main className="page">
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

                <form className="login-form" onSubmit={handleSubmit}>
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
                        <p className="login-error" role="alert">
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