import os
import asyncio
import base64
import json
import websockets
from dotenv import load_dotenv

load_dotenv()

MUSETALK_TECHNICAL_URL = os.getenv("MUSETALK_TECHNICAL_URL")
MUSETALK_DUO_URL = os.getenv("MUSETALK_DUO_URL")


async def synthesize_avatar_video(audio_path: str, timeout: float = 60.0) -> bytes | None:
    """
    TTS로 생성된 오디오 파일을 Colab의 MuseTalk 기술면접관 엔드포인트로 보내
    립싱크 아바타 영상(mp4 bytes)을 받아옵니다.
    Colab 서버가 꺼져있거나 응답이 없어도 예외를 던지지 않고 None을 반환합니다
    (아바타 영상 없이도 면접 진행 자체는 막히지 않도록 하기 위함).
    """
    if not MUSETALK_TECHNICAL_URL:
        print("[musetalk_client] MUSETALK_TECHNICAL_URL이 설정되지 않았습니다 (.env 확인).")
        return None

    try:
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

        async with websockets.connect(
            MUSETALK_TECHNICAL_URL, max_size=None, open_timeout=15, ping_interval=None
        ) as ws:
            await ws.send(audio_bytes)
            result = await asyncio.wait_for(ws.recv(), timeout=timeout)

        if isinstance(result, str):
            print(f"[musetalk_client] Colab 서버가 에러를 반환했습니다: {result}")
            return None

        return result
    except Exception as e:
        print(f"[musetalk_client] 아바타 영상 생성 실패 (텍스트만으로 계속 진행): {e}")
        return None


async def synthesize_duo_avatar_video(
    audio_path: str, avatar_type: str = "technical", timeout: float = 90.0
) -> bytes | None:
    """
    TTS로 생성된 오디오 파일을, 면접관 두 명이 같이 나오는 듀오 아바타 서버(/synthesize/duo)로 보내
    해당 아바타(avatar_type)만 립싱크된 전체 듀오 화면 영상(mp4 bytes)을 받아옵니다.
    듀오 서버 검증용 임시 경로이며, Colab 서버가 꺼져있거나 응답이 없어도 예외 없이 None을 반환합니다.
    """
    if not MUSETALK_DUO_URL:
        print("[musetalk_client] MUSETALK_DUO_URL이 설정되지 않았습니다 (.env 확인).")
        return None

    try:
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

        payload = {
            "turns": [
                {
                    "avatar_type": avatar_type,
                    "start": 0.0,
                    "duration_hint": 15.0,
                    "audio_base64": base64.b64encode(audio_bytes).decode("utf-8"),
                },
            ],
        }

        async with websockets.connect(
            MUSETALK_DUO_URL, max_size=None, open_timeout=15, ping_interval=None
        ) as ws:
            await ws.send(json.dumps(payload))
            result = await asyncio.wait_for(ws.recv(), timeout=timeout)

        if isinstance(result, str):
            print(f"[musetalk_client] 듀오 서버가 에러를 반환했습니다: {result}")
            return None

        return result
    except Exception as e:
        print(f"[musetalk_client] 듀오 아바타 영상 생성 실패 (텍스트만으로 계속 진행): {e}")
        return None
