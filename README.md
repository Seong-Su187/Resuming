# 🎬 Resuming — AI 면접 도우미 (AI Interview Assistant)

> **이력서 기반으로 질문하고, 목소리와 시선까지 분석하는 2인 AI 아바타 모의 면접 플랫폼**
> 업로드한 이력서(PDF + GitHub)를 RAG로 분석해 기술/HR 면접관 아바타가 맞춤 질문을 던지고, 답변 내용은 LLM이, 목소리(Jitter/Shimmer/WPM/습관어)와 시선은 물리 신호 분석으로 채점합니다. 과거 답변과의 유사도 검색을 통해 세션 간 성장 추이도 함께 보여줍니다.

---

## 📌 Project Overview

*   **프로젝트명:** Resuming — AI 면접 도우미 (AI Interview Assistant)
*   **개발 환경:** Visual Studio Code (VS Code) + Google Colab (A100 GPU, MuseTalk 아바타 서버 구동)
*   **타겟 플랫폼:** 데스크톱 웹 환경 (Desktop Web Browser)
*   **핵심 목표:**
    *   이력서(PDF) + GitHub README를 RAG로 분석해 기술/HR 면접관이 각각 맞춤 질문을 생성
    *   업로드된 트렌드 기출 질문 DB를 함께 검색해 최신 이슈를 반영한 질문 융합
    *   Praat(Parselmouth) 기반 음성 물리 신호(Jitter/Shimmer/WPM/습관어)로 개인 기준치 대비 상대 평가
    *   MediaPipe 기반 얼굴 뼈대 정규화 + 십자 비대칭 스케일링으로 시선 이탈 추적
    *   MuseTalk 듀오(2인) 아바타의 초저지연 실시간 스트리밍 립싱크 면접 진행
    *   pgvector 코사인 유사도 검색으로 과거 답변과 현재 답변을 비교해 성장 피드백 제공

---

## 🛠 Tech Stack

### Frontend
*   **Framework:** React 19 + Vite, React Router
*   **Vision:** `@mediapipe/camera_utils`, `@mediapipe/selfie_segmentation` (웹캠 캡처 및 세그멘테이션)
*   **Media:** HTML5 Video / Web Audio API (아바타 영상 스트리밍 재생, 마이크 녹음)

### Backend & Database
*   **Framework:** FastAPI (Python 비동기 서버, Uvicorn)
*   **Database:** PostgreSQL + `pgvector` 확장 (이력서 청크 임베딩, 과거 답변 임베딩 코사인 유사도 검색을 원시 SQL로 직접 수행)
*   **Auth:** 자체 구현 (bcrypt 해시 기반 회원가입/로그인)

### AI / RAG Pipeline & Audio·Vision Analytics
*   **LLM (질문 생성·채점):** OpenAI GPT-4o-mini
*   **Embedding:** OpenAI `text-embedding-3-small` (이력서 청크, 과거 답변 벡터화)
*   **STT:** OpenAI Whisper API
*   **TTS:** OpenAI TTS (`tts-1`)
*   **음성 물리 신호 분석:** Praat(Parselmouth) — Jitter, Shimmer, WPM, 습관어(필러) 추출 후 개인 기준치(Baseline) 대비 델타 상대 평가
*   **시선 분석:** MediaPipe FaceMesh — 얼굴 뼈대 기준 정규화 + 십자 비대칭(Cross-Asymmetric) 스케일링으로 시선 이탈 판정
*   **디지털 아바타 엔진:** MuseTalk v1.5 (Google Colab A100에서 구동, ngrok 터널로 백엔드와 연결, 문장 단위 TTS→MuseTalk 파이프라이닝으로 스트리밍)

---

## 💡 Key Features

### 1. 이력서 기반 RAG 맞춤 질문 생성
*   업로드한 이력서(PDF)에서 텍스트를 추출하고, GitHub README가 있으면 함께 청킹하여 임베딩합니다.
*   PostgreSQL의 `pgvector` 코사인 유사도 검색(`embedding <=> ...`)으로 질문 의도별 관련 청크를 찾고, 트렌드 기출 질문 DB를 함께 참고해 GPT-4o-mini가 기술/HR 맞춤 질문을 생성합니다.

### 2. MuseTalk 듀오 아바타 실시간 스트리밍 면접
*   기술 면접관·HR 면접관 2인 아바타가 한 화면에 동시에 등장하는 듀오 합성 구조입니다.
*   질문을 문장 단위로 나눠 TTS 생성과 MuseTalk 영상 합성을 파이프라이닝하고, 첫 영상 프레임까지의 지연(TTFB)을 최소화해 자연스러운 스트리밍 재생을 제공합니다. (실측 아바타 내부 TTFB 평균 0.38초, A100 기준 — `evaluation/` 참고)

### 3. 개인화 음성·시선 물리 분석
*   Praat(Parselmouth)으로 답변 음성의 Jitter(주파수 변동률)·Shimmer(진폭 변동률)·WPM(발화 속도)·습관어 빈도를 추출하고, 사용자 본인의 평온 상태 기준치 대비 변화율(델타)로 긴장도를 평가합니다.
*   MediaPipe FaceMesh로 얼굴 랜드마크를 추적해 시선 이탈 여부를 판정하고, 결과를 히트맵으로 시각화합니다.

### 4. pgvector 기반 성장 추이 피드백
*   현재 답변을 임베딩해 같은 사용자의 과거 세션 답변들과 코사인 유사도로 비교, 가장 관련 있는 과거 답변을 찾아옵니다.
*   과거 답변과 현재 답변의 점수·음성 지표 변화를 근거로 LLM이 "성장 피드백"을 생성해 반복 연습에 따른 발전을 확인할 수 있게 합니다.

---

## 🏗 System Architecture

### User Flow (Web Browser)
```
[회원가입/로그인] ──► [평온 상태 음성 등록 (Baseline)] ──► [이력서(PDF) 업로드] ──► [RAG 기반 맞춤 질문 생성] ──► [듀오 아바타와 음성 면접 진행 (실시간 시선·음성 분석)] ──► [답변 채점 + 성장 피드백 리포트 확인]
```

### RAG & Avatar Pipeline 아키텍처
```
[이력서 PDF/GitHub] ──► [텍스트 추출·청킹] ──► [text-embedding-3-small] ──► [PostgreSQL pgvector]
                                                                                    │
                                                                     [트렌드 기출 질문 DB] ─┤
                                                                                    ▼
                                                                     [GPT-4o-mini 질문 생성]
                                                                                    │
                                                                                    ▼
                                                              [OpenAI TTS (문장 단위 생성)]
                                                                                    │
                                                              [FastAPI ──lock 직렬화──► MuseTalk(Colab A100)]
                                                                                    │
                                                              [듀오 아바타 영상 스트리밍 ──► 브라우저 재생]
                                                                                    │
[사용자 음성 답변] ──► [Whisper STT] ──► [Praat Jitter/Shimmer/WPM] ──► [GPT-4o-mini 채점]
[웹캠 프레임] ──► [MediaPipe FaceMesh] ──► [시선 이탈 판정·히트맵]
                                                                                    │
[과거 답변 임베딩] ◄── [pgvector 코사인 유사도 검색] ──► [성장 피드백 생성] ──► [리포트 화면 출력]
```

---

## 👨‍💻 Team Roles

| 역할 (Role) | 담당 업무 (Responsibilities) | 담당자 (Members) |
| :--- | :--- | :--- |
| **PM / 기획** | 도메인 분석, 서비스 시나리오·MVP 범위 설계, 정량평가 실행 가이드(G-Eval/RAGAS/SyncNet/CER 등 지표 체계) 설계 및 기획서 총괄 | 공동 |
| **Data Engineer** | 이력서 텍스트 청킹 및 pgvector 벡터 DB 인프라 구축, 트렌드 기출 질문 DB 구성, 면접 세션·답변 데이터 스키마 설계 | 팀원 A |
| **AI Engineer** | Praat(Parselmouth) 기반 Jitter/Shimmer/WPM/습관어 음성 분석 파이프라인, MediaPipe 기반 시선 추적, GPT-4o-mini RAG 질문 생성·채점 프롬프트 엔지니어링, MuseTalk 듀오 아바타 실시간 립싱크 스트리밍(Colab A100) 구축 | 팀원 B, 팀원 C |
| **Backend** | FastAPI 비동기 서버 아키텍처 설계, 면접 세션·답변 관리 API 구현, MuseTalk(Colab) 연동 및 문장 단위 스트리밍 파이프라이닝, bcrypt 기반 자체 인증 및 PostgreSQL/pgvector 연동 | 팀원 A, 팀원 D |
| **Frontend** | React+Vite 면접 UI 구현, 듀오 아바타 영상 스트리밍 재생·전환 처리, MediaPipe 웹캠 캡처 및 마이크 녹음 제어, 결과·마이페이지 리포트(히트맵 등) 시각화 | 팀원 D, 팀원 C |

---

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18 이상) & npm
*   Python (v3.10 이상)
*   Visual Studio Code (VS Code)
*   PostgreSQL (`pgvector` 확장 활성화 필요) 및 OpenAI API Key
*   Google Colab 환경 + `colab/musetalk_duo_avatar_server.ipynb` 실행 (MuseTalk 아바타 서버, A100/L4 GPU 권장) + ngrok 고정 도메인

### Installation & Setup
```bash
# 1. 저장소 클론 및 프로젝트 루트 진입
git clone <repo-url>
cd 3rd_project

# 2. 백엔드(FastAPI) 가상환경 설정 및 패키지 설치
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# [필수] backend/.env 파일 생성 후 아래 값 입력
#   DATABASE_URL=postgresql://...
#   OPENAI_API_KEY=sk-...
#   MUSETALK_DUO_STREAM_URL=https://<ngrok-domain>/synthesize/duo/stream

# 3. 프론트엔드(React + Vite) 의존성 설치
cd ../app
npm install
```

### Running the App
```bash
# [터미널 1] Colab에서 colab/musetalk_duo_avatar_server.ipynb 실행 → ngrok URL 확인 후 .env에 반영

# [터미널 2] 백엔드 서버 (포트 8001)
cd backend
source venv/bin/activate  # Windows: venv\Scripts\activate
python main.py

# [터미널 3] 프론트엔드 개발 서버 (Vite)
cd app
npm run dev
```
*   세 프로세스가 모두 정상 구동되면 브라우저에서 Vite가 안내하는 주소(기본 `http://localhost:5173`)로 접속해 모의 면접 세션을 시작할 수 있습니다.

---

## 🔗 References & Academic Sources

*   **모의 면접 실효성 연구 근거:** [ORISE - Five Reasons Everybody Should Do a Mock Interview](https://orise.orau.gov/internships-fellowships/blog/five-reasons-everybody-should-do-a-mock-interview.html)
*   **실시간 오디오 대화 실현 가능성 벤치마킹:** [GeekNews - 실시간 AI 음성 인터랙션 선행 사례](https://news.hada.io/topic?id=27442)
