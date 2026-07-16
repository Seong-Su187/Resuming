import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../../config/apiConfig';
import '../../index.css';
import './start.css';

function Start({ startVideoUrl }) {
    const navigate = useNavigate();
    const videoRef = useRef(null);

    const [candidates, setCandidates] = useState([]);
    const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);
    const [isCandidatesLoading, setIsCandidatesLoading] = useState(true);
    const [candidateError, setCandidateError] = useState('');
    const [isVideoStarted, setIsVideoStarted] = useState(false);

    useEffect(() => {
        const fetchCandidates = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/candidates`);

                if (!response.ok) {
                    throw new Error('면접자 정보를 불러오지 못했습니다.');
                }

                const data = await response.json();

                setCandidates(data.candidates ?? []);
            } catch (error) {
                console.error('면접자 조회 오류:', error);
                setCandidateError('면접자 정보를 불러오지 못했습니다.');
            } finally {
                setIsCandidatesLoading(false);
            }
        };

        fetchCandidates();
    }, []);

    const handleCandidateSelect = (candidateId) => {
        setSelectedCandidateIds((previousIds) => {
            const isAlreadySelected = previousIds.includes(candidateId);

            if (isAlreadySelected) {
                return previousIds.filter((id) => id !== candidateId);
            }

            return [...previousIds, candidateId];
        });
    };

    const handleStartInterview = () => {
        const selectedCandidates = candidates.filter((candidate) =>
            selectedCandidateIds.includes(candidate.id)
        );

        sessionStorage.setItem(
            'selectedCandidates',
            JSON.stringify(selectedCandidates)
        );

        setIsVideoStarted(true);
    };

    const handleVideoPlay = () => {
        if (videoRef.current) {
            videoRef.current.muted = false;
        }
    };

    // 면접자 선택 화면
    if (!isVideoStarted) {
        return (
            <main className="start-page">
                <section className="candidate-selection">
                    <div className="candidate-selection-header">
                        <h1>함께 면접 볼 지원자를 선택해 주세요</h1>

                        <p>
                            선택하지 않으면 혼자 면접을 진행합니다.
                            여러 명을 선택할 수도 있습니다.
                        </p>
                    </div>

                    {isCandidatesLoading && (
                        <div className="candidate-status">
                            면접자 정보를 불러오는 중...
                        </div>
                    )}

                    {candidateError && (
                        <div className="candidate-status candidate-error">
                            {candidateError}
                        </div>
                    )}

                    {!isCandidatesLoading && !candidateError && (
                        <div className="candidate-list">
                            {candidates.map((candidate) => {
                                const isSelected =
                                    selectedCandidateIds.includes(candidate.id);

                                return (
                                    <button
                                        type="button"
                                        key={candidate.id}
                                        className={`candidate-card ${isSelected ? 'selected' : ''
                                            }`}
                                        onClick={() =>
                                            handleCandidateSelect(candidate.id)
                                        }
                                    >
                                        <div className="candidate-image-box">
                                            <img
                                                src={candidate.image_url}
                                                alt={`${candidate.name} 지원자`}
                                            />

                                            <span className="candidate-check">
                                                {isSelected ? '✓' : ''}
                                            </span>
                                        </div>

                                        <div className="candidate-content">
                                            <span className="candidate-label">
                                                면접자 {candidate.id}
                                            </span>

                                            <h2>{candidate.name}</h2>

                                            <p>{candidate.description}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="candidate-selection-footer">
                        <div>
                            {selectedCandidateIds.length === 0 ? (
                                <p>
                                    현재 선택: <strong>혼자 면접</strong>
                                </p>
                            ) : (
                                <p>
                                    현재 선택:{' '}
                                    <strong>
                                        지원자 {selectedCandidateIds.length}명과
                                        함께 면접
                                    </strong>
                                </p>
                            )}
                        </div>

                        <button
                            type="button"
                            className="candidate-start-button"
                            onClick={handleStartInterview}
                            disabled={
                                isCandidatesLoading || Boolean(candidateError)
                            }
                        >
                            {selectedCandidateIds.length === 0
                                ? '혼자 면접 보기'
                                : `${selectedCandidateIds.length}명과 함께 면접 보기`}
                        </button>
                    </div>
                </section>
            </main>
        );
    }

    // 선택 완료 후 영상이 아직 준비되지 않은 경우
    if (!startVideoUrl) {
        return (
            <main className="start-page">
                <div className="video-loading">영상 준비 중...</div>
            </main>
        );
    }

    // 선택 완료 후 시작 영상 재생
    return (
        <main className="start-video-page">
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