/* start.jsx */
import { useNavigate } from 'react-router-dom';
import '../../index.css';
import './start.css';

function Start({ startVideoUrl }) {
    const navigate = useNavigate();

    if (!startVideoUrl) {
        return (
            <main className="start-page">
                <div className="video-loading">영상 준비 중...</div>
            </main>
        );
    }

    return (
        <main>
            <video
                className="start-video"
                src={startVideoUrl}
                autoPlay
                playsInline
                onLoadedMetadata={(event) => {
                    event.currentTarget.volume = 0.1;
                }}
                onEnded={() => navigate('/interview', { replace: true })}
            />
        </main>
    );
}

export default Start;