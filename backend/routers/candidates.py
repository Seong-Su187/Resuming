import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(
    prefix="/candidates",
    tags=["candidates"],
)

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "candidates.json"


def load_candidates() -> list[dict]:
    try:
        with DATA_PATH.open("r", encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="면접자 데이터 파일을 찾을 수 없습니다.",
        )
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="면접자 데이터 형식이 올바르지 않습니다.",
        )


@router.get("")
def get_candidates():
    return {
        "candidates": load_candidates()
    }


@router.get("/{candidate_id}")
def get_candidate(candidate_id: int):
    candidates = load_candidates()

    candidate = next(
        (
            candidate
            for candidate in candidates
            if candidate["id"] == candidate_id
        ),
        None,
    )

    if candidate is None:
        raise HTTPException(
            status_code=404,
            detail="해당 면접자를 찾을 수 없습니다.",
        )

    return candidate