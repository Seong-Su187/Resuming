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
    [영점 조절용 함수]
    주어진 이미지에서 고개(Head Pose) 비율과 눈동자(Iris) 비율을 수치로 반환합니다.
    얼굴을 찾을 수 없는 경우 None, None을 반환합니다.
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
        
        # 1. 고개 돌아감(Head Pose) 비율 계산
        nose_tip = face_landmarks.landmark[1]
        left_eye_outer = face_landmarks.landmark[33]
        right_eye_outer = face_landmarks.landmark[263]
        
        face_width = right_eye_outer.x - left_eye_outer.x
        nose_ratio = (nose_tip.x - left_eye_outer.x) / face_width if face_width > 0 else 0.5
        
        # 2. 눈동자(Iris) 치우침 비율 계산
        left_iris = face_landmarks.landmark[468]
        left_eye_inner = face_landmarks.landmark[133]
        
        eye_width = left_eye_inner.x - left_eye_outer.x
        iris_ratio = (left_iris.x - left_eye_outer.x) / eye_width if eye_width > 0 else 0.5
        
        return nose_ratio, iris_ratio
        
    except Exception as e:
        print(f"[Vision Analyzer] Get Ratios Error: {e}")
        return None, None


def check_gaze_loss(base64_image: str, baseline_nose: float = 0.5, baseline_iris: float = 0.5) -> bool:
    """
    [시선 이탈 판별 함수]
    사용자의 '영점(baseline)'을 기준으로 시선이 일정 수준 이상 벗어났는지 확인합니다.
    True: 시선 이탈 감지, False: 정상 응시
    """
    nose_ratio, iris_ratio = get_gaze_ratios(base64_image)
    
    # 프레임에서 아예 얼굴이 사라진 경우 이탈로 간주
    if nose_ratio is None or iris_ratio is None:
        return True
        
    # 영점 기준으로 고개가 좌우 15% 이상 돌아갔는지 확인
    if abs(nose_ratio - baseline_nose) > 0.15:
        return True
        
    # 영점 기준으로 눈동자가 좌우 20% 이상 굴러갔는지 확인
    if abs(iris_ratio - baseline_iris) > 0.20:
        return True

    return False