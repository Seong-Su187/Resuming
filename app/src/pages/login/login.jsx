/* login.jsx */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom';
import '../../index.css';
import './login.css';

function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')

    const handleSubmit = (event) => {
        event.preventDefault()

        alert(`로그인 정보: ${email}, ${password}`);

        navigate('/start');
    }

    return (
        <main className="page">
            <section className="login-card">
                <h1>AIVIEW</h1>
                <p className="login-description">AI 면접 서비스에 로그인하세요.</p>

                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label htmlFor="email">이메일</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="example@email.com"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
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
                            onChange={(event) => setPassword(event.target.value)}
                            required
                        />
                    </div>

                    <button type="submit" className="login-button">
                        로그인
                    </button>
                </form>
            </section>
        </main>
    )
}

export default Login