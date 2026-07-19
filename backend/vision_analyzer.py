import cv2
import numpy as np
import base64
import mediapipe as mp

# MediaPipe Face Detection 초기화 (CPU 환경에서도 빠르고 가볍게 동작)
mp_face_detection = mp.solutions.face_detection
face_detection = mp_face_detection.FaceDetection(min_detection_confidence=0.5)

def check_gaze_loss(base64_img: str) -> bool:
    """
    Base64 이미지를 분석하여 얼굴을 감지합니다.
    얼굴이 화면 밖으로 벗어나거나 감지되지 않으면 시선 이탈(True)로 판별합니다.
    """
    try:
        # Base64 문자열에서 헤더(data:image/jpeg;base64,) 제거 및 이미지 디코딩
        if "," in base64_img:
            base64_img = base64_img.split(",")[1]
            
        img_data = base64.b64decode(base64_img)
        np_arr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        if img is None:
            return True # 이미지 디코딩 실패 시 이탈로 간주
            
        # OpenCV 이미지를 RGB로 변환하여 MediaPipe에 전달
        results = face_detection.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        
        # 얼굴이 감지되지 않으면 시선/자세 이탈로 판단
        if not results.detections:
            return True
            
        return False # 얼굴이 정상적으로 감지됨 (집중 상태)
        
    except Exception as e:
        print(f"[Vision Error]: {str(e)}")
        return False # 에러 발생 시 면접 진행을 방해하지 않도록 기본값 반환