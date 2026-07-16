/* start.jsx */
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../index.css';
import './start.css';

function Start({ startVideoUrl }) {
    const navigate = useNavigate();
    const videoRef = useRef(null);

    const handleVideoPlay = () => {
        if (videoRef.current) {
            videoRef.current.muted = false;
        }
    };

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
                ref={videoRef}
                className="start-video"
                src={startVideoUrl}
                autoPlay
                muted
                playsInline
                onPlay={handleVideoPlay}
                onLoadedMetadata={(event) => {
                    event.currentTarget.volume = 0.1;
                }}
                onEnded={() => navigate('/interview', { replace: true })}
            />
        </main>
    );
}

export default Start;