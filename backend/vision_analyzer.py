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

# 부드러운 이동을 위한 전역 상태 (카메라 짐벌 스무딩 필터용)
_last_gaze_pos = None

def extract_ratios_from_landmarks(face_landmarks):
    """
    [🚀 극강의 안정성] 눈의 너비가 아닌 '얼굴 전체 뼈대'를 기준으로 비율을 추출합니다.
    """
    nose_tip = face_landmarks.landmark[1]
    left_eye_outer = face_landmarks.landmark[33]
    right_eye_outer = face_landmarks.landmark[263]
    left_iris = face_landmarks.landmark[468]
    forehead = face_landmarks.landmark[10]
    chin = face_landmarks.landmark[152]

    # --- 절대 변하지 않는 얼굴 전체 폭/높이 계산 ---
    face_min_x = min(left_eye_outer.x, right_eye_outer.x)
    face_max_x = max(left_eye_outer.x, right_eye_outer.x)
    face_width = face_max_x - face_min_x

    face_min_y = min(forehead.y, chin.y)
    face_max_y = max(forehead.y, chin.y)
    face_height = face_max_y - face_min_y

    # 코와 눈동자를 모두 동일한 '얼굴 전체 크기' 대비 비율로 계산
    nx = (nose_tip.x - face_min_x) / face_width if face_width > 0 else 0.5
    ix = (left_iris.x - face_min_x) / face_width if face_width > 0 else 0.5
    ny = (nose_tip.y - face_min_y) / face_height if face_height > 0 else 0.5
    iy = (left_iris.y - face_min_y) / face_height if face_height > 0 else 0.5

    return nx, ix, ny, iy


def get_gaze_ratios(base64_image: str) -> tuple[float, float, float, float]:
    """ 주어진 단일 프레임에서 X/Y 비율 추출 """
    if not base64_image: return None, None, None, None
    try:
        if "," in base64_image: base64_image = base64_image.split(",")[1]
        image_data = base64.b64decode(base64_image)
        np_arr = np.frombuffer(image_data, np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if image is None: return None, None, None, None
        
        results = face_mesh.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        if not results.multi_face_landmarks: return None, None, None, None
        
        return extract_ratios_from_landmarks(results.multi_face_landmarks[0])
    except Exception as e:
        print(f"[Vision Analyzer] Get Ratios Error: {e}")
        return None, None, None, None


def calculate_baselines(frames: list[str]) -> tuple[float, float, float, float]:
    """ 중앙 단일 지점 프레임들로 4개 축의 영점(평균값) 조절 """
    global _last_gaze_pos
    _last_gaze_pos = None # 영점 조절을 새로 할 때마다 스무딩 기록도 초기화
    
    nx_list, ix_list, ny_list, iy_list = [], [], [], []
    for b64_img in frames:
        nx, ix, ny, iy = get_gaze_ratios(b64_img)
        if nx is not None:
            nx_list.append(nx)
            ix_list.append(ix)
            ny_list.append(ny)
            iy_list.append(iy)

    return (
        sum(nx_list) / len(nx_list) if nx_list else 0.5,
        sum(ix_list) / len(ix_list) if ix_list else 0.5,
        sum(ny_list) / len(ny_list) if ny_list else 0.5,
        sum(iy_list) / len(iy_list) if iy_list else 0.5
    )


def apply_deadzone(val, threshold):
    """ 미세한 떨림을 0으로 만들어주는 필터 """
    if abs(val) < threshold:
        return 0.0
    return val - threshold if val > 0 else val + threshold


def analyze_frame(base64_image: str, bn_x: float, bi_x: float, bn_y: float, bi_y: float) -> tuple[bool, dict]:
    """ 
    [🚀 최종 솔루션] X축 비대칭 스케일링 + Y축 과민감도 억제 매핑 
    """
    global _last_gaze_pos
    
    # 에러 시 돌아가는 기본 좌표를 파란 박스 위치로 통일
    if not base64_image: return False, {"x": 0.45, "y": 0.25}
    try:
        if "," in base64_image: base64_image = base64_image.split(",")[1]
        image_data = base64.b64decode(base64_image)
        np_arr = np.frombuffer(image_data, np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if image is None: return False, {"x": 0.45, "y": 0.25}

        results = face_mesh.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        if not results.multi_face_landmarks: return True, {"x": 0.45, "y": 0.25}

        nx, ix, ny, iy = extract_ratios_from_landmarks(results.multi_face_landmarks[0])

        # --- 1. 편차 계산 ---
        diff_nx = apply_deadzone(nx - bn_x, 0.002)
        diff_ix = apply_deadzone(ix - bi_x, 0.002)
        
        # Y축 노이즈 방지를 위해 데드존 소폭 상향
        diff_ny = apply_deadzone(ny - bn_y, 0.005)
        diff_iy = apply_deadzone(iy - bi_y, 0.005)

        # --- 2. X축 비대칭 부스터 가중치 적용 ---
        if diff_nx < 0:
            weight_nx = 18.0 
        else:
            weight_nx = 8.0  

        if diff_ix < 0:
            weight_ix = 20.0  # 🚀 오른쪽 눈동자 가중치를 25.0에서 20.0으로 조정
        else:
            weight_ix = 12.0 

        # 매핑 기준점 (X: 0.45, Y: 0.25)
        mapped_x = 0.45 - (diff_nx * weight_nx) - (diff_ix * weight_ix)
        
        # 눈동자 상하 떨림을 억제하기 위해 눈동자 가중치(iy)를 2.0으로 깎고, 고개 가중치(ny)를 4.0으로 고정합니다.
        mapped_y = 0.25 + (diff_ny * 4.0) + (diff_iy * 2.0)

        # --- 3. 클램핑 ---
        target_x = max(0.0, min(1.0, mapped_x))
        target_y = max(0.0, min(1.0, mapped_y))

        # --- 4. 시선 이탈 판정 ---
        is_loss = False
        if target_x < 0.10 or target_x > 0.90 or target_y < 0.10 or target_y > 0.90:
            is_loss = True

        # --- 5. 카메라 짐벌 스무딩 (EMA 필터) ---
        if _last_gaze_pos is None:
            _last_gaze_pos = {"x": target_x, "y": target_y}
        else:
            alpha = 0.2
            smoothed_x = (_last_gaze_pos["x"] * (1.0 - alpha)) + (target_x * alpha)
            smoothed_y = (_last_gaze_pos["y"] * (1.0 - alpha)) + (target_y * alpha)
            _last_gaze_pos = {"x": smoothed_x, "y": smoothed_y}

        return is_loss, _last_gaze_pos

    except Exception as e:
        print(f"[Vision Analyzer] Analyze Error: {e}")
        return False, {"x": 0.45, "y": 0.25}