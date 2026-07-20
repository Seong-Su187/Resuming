import re

def count_filler_words(text: str) -> tuple[int, list[str]]:
    """
    STT 텍스트에서 한국어 습관어(Filler words)를 정밀하게 카운팅합니다.
    단어의 일부로 쓰인 경우(예: '음악', '어머니')를 제외하기 위해 정규식을 사용합니다.
    """
    if not text:
        return 0, []

    # 1. 단음절 습관어 (어, 음, 아, 그)
    # 앞뒤로 한글, 영문, 숫자가 없는 경우만 매칭 (공백이나 구두점과 결합된 경우만 허용)
    single_pattern = r'(?<![가-힣a-zA-Z0-9])(어|음|아|그)(?![가-힣a-zA-Z0-9])'
    
    # 2. 다음절 습관어 (자주 쓰이는 면접 습관어)
    multi_pattern = r'(?<![가-힣a-zA-Z0-9])(저기|솔직히|약간|막|진짜|그러니까|그니까)(?![가-힣a-zA-Z0-9])'

    # 정규식 검색 수행
    single_matches = re.findall(single_pattern, text)
    multi_matches = re.findall(multi_pattern, text)

    all_matches = single_matches + multi_matches

    if not all_matches:
        return 0, []

    total_count = len(all_matches)
    # 중복을 제거하여 어떤 습관어가 쓰였는지 종류만 리스트로 반환
    found_fillers = list(set(all_matches))

    return total_count, found_fillers