import logging
import time
import functools
import asyncio
from typing import Callable, Any

# 1. 로거 설정 (콘솔 및 파일 저장)
logger = logging.getLogger("InterviewPerformanceLogger")
logger.setLevel(logging.INFO)

if not logger.handlers:
    # 콘솔 출력 포맷
    console_handler = logging.StreamHandler()
    console_formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] [%(filename)s:%(lineno)d] - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    # 파일 출력 포맷 (performance.log 파일로 저장)
    file_handler = logging.FileHandler("interview_performance.log", encoding="utf-8")
    file_formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)


# 2. 함수 실행 시간 측정용 데코레이터 (동기/비동기 모두 지원)
def log_execution_time(task_name: str):
    """
    함수의 실행 시간을 측정하여 로그를 출력하는 데코레이터입니다.
    동기(def)와 비동기(async def) 함수 모두 지원합니다.
    """
    def decorator(func: Callable[..., Any]):
        if asyncio.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                start_time = time.perf_counter()
                logger.info(f"START [{task_name}]")
                try:
                    result = await func(*args, **kwargs)
                    elapsed_time = (time.perf_counter() - start_time) * 1000
                    logger.info(f"SUCCESS [{task_name}] - 소요시간: {elapsed_time:.2f}ms ({elapsed_time / 1000:.3f}초)")
                    return result
                except Exception as e:
                    elapsed_time = (time.perf_counter() - start_time) * 1000
                    logger.error(f"FAIL [{task_name}] - 에러: {e} (소요시간: {elapsed_time:.2f}ms)")
                    raise e
            return async_wrapper
        else:
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs):
                start_time = time.perf_counter()
                logger.info(f"START [{task_name}]")
                try:
                    result = func(*args, **kwargs)
                    elapsed_time = (time.perf_counter() - start_time) * 1000
                    logger.info(f"SUCCESS [{task_name}] - 소요시간: {elapsed_time:.2f}ms ({elapsed_time / 1000:.3f}초)")
                    return result
                except Exception as e:
                    elapsed_time = (time.perf_counter() - start_time) * 1000
                    logger.error(f"FAIL [{task_name}] - 에러: {e} (소요시간: {elapsed_time:.2f}ms)")
                    raise e
            return sync_wrapper
    return decorator


# 3. 코드 블록 단위 시간 측정용 컨텍스트 매니저
class ExecutionTimer:
    """
    특정 코드 블록의 실행 시간을 측정할 때 사용하는 컨텍스트 매니저입니다.
    사용법:
        with ExecutionTimer("LLM 질문 생성"):
            # 처리 코드
    """
    def __init__(self, task_name: str, session_id: str = None):
        self.task_name = task_name
        self.session_id = session_id
        self.start_time = 0.0

    def __enter__(self):
        self.start_time = time.perf_counter()
        session_prefix = f"[{self.session_id}] " if self.session_id else ""
        logger.info(f"{session_prefix}START [{self.task_name}]")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        elapsed_time = (time.perf_counter() - self.start_time) * 1000
        session_prefix = f"[{self.session_id}] " if self.session_id else ""
        if exc_type is None:
            logger.info(f"{session_prefix}SUCCESS [{self.task_name}] - 소요시간: {elapsed_time:.2f}ms ({elapsed_time / 1000:.3f}초)")
        else:
            logger.error(f"{session_prefix}FAIL [{self.task_name}] - 에러: {exc_val} (소요시간: {elapsed_time:.2f}ms)")
        return False