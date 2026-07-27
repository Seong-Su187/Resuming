import cv2
import numpy as np
import base64
import mediapipe as mp

mp_face_mesh = mp.solutions.face_mesh

# 모듈이 로드될 때 한 번만 초기화하여 프레임당 분석 속도 최적화
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False, 
    max_num_faces=1,
    refine_landmarks=True, # 눈동자(Iris) 랜드마크 활성화
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

def get_gaze_ratios(base64_image: str) -> tuple[float, float]:
    """
    [기존 연동 유지용] 주어진 이미지에서 고개(Head Pose) 비율과 눈동자(Iris) 비율을 수치로 반환합니다.
    """
    if not base64_image:
        return None, None
        
    try:
        if "," in base64_image:
            base64_image = base64_image.split(",")[1]
            
        image_data = base64.b64decode(base64_image)
        np_arr = np.frombuffer(image_data, np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        if image is None:
            return None, None
            
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(image_rgb)
        
        if not results.multi_face_landmarks:
            return None, None
            
        face_landmarks = results.multi_face_landmarks[0]
        
        nose_tip = face_landmarks.landmark[1]
        left_eye_outer = face_landmarks.landmark[33]
        right_eye_outer = face_landmarks.landmark[263]
        
        face_width = right_eye_outer.x - left_eye_outer.x
        nose_ratio = (nose_tip.x - left_eye_outer.x) / face_width if face_width > 0 else 0.5
        
        left_iris = face_landmarks.landmark[468]
        left_eye_inner = face_landmarks.landmark[133]
        
        eye_width = left_eye_inner.x - left_eye_outer.x
        iris_ratio = (left_iris.x - left_eye_outer.x) / eye_width if eye_width > 0 else 0.5
        
        return nose_ratio, iris_ratio
        
    except Exception as e:
        print(f"[Vision Analyzer] Get Ratios Error: {e}")
        return None, None


def calculate_baselines(frames: list[str]) -> tuple[float, float]:
    """
    [기능 1] 시선 영점 조절 (Calibration)
    """
    nose_ratios = []
    iris_ratios = []
    
    for b64_img in frames:
        n_ratio, i_ratio = get_gaze_ratios(b64_img)
        if n_ratio is not None and i_ratio is not None:
            nose_ratios.append(n_ratio)
            iris_ratios.append(i_ratio)

    baseline_nose = sum(nose_ratios) / len(nose_ratios) if nose_ratios else 0.5
    baseline_iris = sum(iris_ratios) / len(iris_ratios) if iris_ratios else 0.5
    
    return baseline_nose, baseline_iris


def check_gaze_loss(base64_image: str, baseline_nose: float = 0.5, baseline_iris: float = 0.5) -> bool:
    """
    [기능 2] 단순 시선 이탈 감지 (기존 호환성)
    """
    nose_ratio, iris_ratio = get_gaze_ratios(base64_image)
    if nose_ratio is None or iris_ratio is None:
        return True
    if abs(nose_ratio - baseline_nose) > 0.10:
        return True
    if abs(iris_ratio - baseline_iris) > 0.08:
        return True
    return False


def analyze_frame(base64_image: str, baseline_nose: float = 0.5, baseline_iris: float = 0.5) -> tuple[bool, dict]:
    """
    [🚀 통합 최적화 기능] 
    MediaPipe 이미지 처리를 1번만 수행하여 시선 이탈 여부(is_loss)와 히트맵 좌표(X, Y)를 동시 반환
    """
    if not base64_image:
        return False, {"x": 0.5, "y": 0.5}

    try:
        if "," in base64_image:
            base64_image = base64_image.split(",")[1]

        image_data = base64.b64decode(base64_image)
        np_arr = np.frombuffer(image_data, np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if image is None:
            return False, {"x": 0.5, "y": 0.5}

        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(image_rgb)

        if not results.multi_face_landmarks:
            return True, {"x": 0.5, "y": 0.5}

        face_landmarks = results.multi_face_landmarks[0]
        
        # 랜드마크 추출
        nose_tip = face_landmarks.landmark[1]
        left_eye_outer = face_landmarks.landmark[33]
        right_eye_outer = face_landmarks.landmark[263]
        left_iris = face_landmarks.landmark[468]
        left_eye_inner = face_landmarks.landmark[133]
        
        # X축 비율 연산 (고개 및 눈동자)
        face_width = right_eye_outer.x - left_eye_outer.x
        nose_ratio = (nose_tip.x - left_eye_outer.x) / face_width if face_width > 0 else 0.5
        
        eye_width = left_eye_inner.x - left_eye_outer.x
        iris_ratio = (left_iris.x - left_eye_outer.x) / eye_width if eye_width > 0 else 0.5

        # Y축 비율 연산 (고개 상하 피치, 이마와 턱끝 기준)
        forehead = face_landmarks.landmark[10]
        chin = face_landmarks.landmark[152]
        face_height = chin.y - forehead.y
        nose_y_ratio = (nose_tip.y - forehead.y) / face_height if face_height > 0 else 0.5

        # --- 1. 시선 이탈 판정 (기존 룰 동일 적용) ---
        is_loss = False
        if abs(nose_ratio - baseline_nose) > 0.10 or abs(iris_ratio - baseline_iris) > 0.08:
            is_loss = True

        # --- 2. 히트맵 좌표 매핑 (진짜 시선 방향 반영) ---
        # X축: 눈동자 이탈률 편차(-0.08 ~ +0.08)를 0.1 ~ 0.9 좌표로 증폭 변환
        diff_x = iris_ratio - baseline_iris
        mapped_x = 0.5 + (diff_x / 0.08) * 0.4
        
        # Y축: 고개 상하 편차 (보통 중앙 응시 시 Y비율은 0.5 근처에 형성됨)
        diff_y = nose_y_ratio - 0.5
        mapped_y = 0.5 + (diff_y / 0.10) * 0.4

        # 범위 클램핑 (0.0 ~ 1.0)
        mapped_x = max(0.0, min(1.0, mapped_x))
        mapped_y = max(0.0, min(1.0, mapped_y))

        return is_loss, {"x": mapped_x, "y": mapped_y}

    except Exception as e:
        print(f"[Vision Analyzer] Analyze Frame Error: {e}")
        return False, {"x": 0.5, "y": 0.5}