/* main.jsx */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../index.css';
import './main.css';

function Main() {
    const navigate = useNavigate();

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
        <main className="page">
            <section className="main-card">
                <h1 className="logo">
                    <img
                        src="/assets/resuming-r.png"
                        alt="R"
                        className="logo-image"
                    />
                    <span>ESUMING</span>
                </h1>

                {isLoggedIn ? (
                    <div className="main-buttons">
                        <button
                            type="button"
                            onClick={handleStartInterview}
                        >
                            면접 시작하기
                        </button>

                        <button
                            type="button"
                            onClick={handleLogout}
                        >
                            로그아웃
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={handleLogin}
                    >
                        로그인
                    </button>
                )}
            </section>
        </main>
    );
}

export default Main;