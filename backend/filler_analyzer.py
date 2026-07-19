def count_filler_words(text: str) -> tuple[int, list]:
    """
    텍스트 내의 습관어(Filler words)를 감지하고 카운트합니다.
    반환값: (총 습관어 개수, 발견된 습관어 종류 리스트)
    """
    # 감지할 한국어 대표 습관어 목록
    fillers = ["어...", "음...", "그...", "저기", "솔직히", "약간", "아...", "에...", "어버버", "뭔가", "이제"]
    
    found_fillers = []
    total_count = 0
    
    for filler in fillers:
        count = text.count(filler)
        if count > 0:
            total_count += count
            if filler not in found_fillers:
                found_fillers.append(filler)
                
    return total_count, found_fillers