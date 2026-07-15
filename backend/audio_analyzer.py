import parselmouth
from parselmouth.praat import call
import math

def extract_voice_metrics(audio_file_path: str, transcribed_text: str = "") -> dict:
    """
    오디오 파일의 물리적 파동을 분석하여 Jitter, Shimmer 및 WPM을 추출합니다.
    """
    try:
        # Parselmouth(Praat) 오디오 로드
        sound = parselmouth.Sound(audio_file_path)
        
        # 기본 주파수(F0) 및 포인트 프로세스 추출 (목소리의 유성음 구간 탐색)
        pitch = call(sound, "To Pitch", 0.0, 75, 600)
        point_process = call(sound, "To PointProcess (periodic, cc)", 75, 600)
        
        # Jitter (주파수 변동률) 계산 - 기본값: local
        jitter = call(point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
        # Shimmer (진폭 변동률) 계산 - 기본값: local
        shimmer = call([sound, point_process], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        
        # 오디오 총 길이(초)
        duration = sound.get_total_duration()
        
        # WPM (Words Per Minute) 계산
        # 한국어는 어절(띄어쓰기) 단위나 글자 수 기반으로 측정합니다. 여기서는 띄어쓰기 기준(어절) 사용
        word_count = len(transcribed_text.split()) if transcribed_text else 0
        wpm = (word_count / duration) * 60 if duration > 0 else 0.0

        return {
            "jitter": (jitter * 100) if not math.isnan(jitter) else 0.0,
            "shimmer": (shimmer * 100) if not math.isnan(shimmer) else 0.0,
            "wpm": wpm
        }
    except Exception as e:
        print(f"오디오 분석 실패: {str(e)}")
        # 에러 발생 시 기본값 반환
        return {"jitter": 0.0, "shimmer": 0.0, "wpm": 0.0}

def calculate_delta(baseline: float, current: float) -> float:
    """
    평음(Baseline) 대비 현재 음성의 변화율(%)을 계산합니다.
    (현재 - 기준) / 기준 * 100
    """
    if baseline == 0:
        return 0.0
    return ((current - baseline) / baseline) * 100.0