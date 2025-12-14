# YTGrab - YouTube Video Downloader

YouTube 링크를 입력하면 MP4로 다운로드할 수 있는 웹 애플리케이션입니다.

## 📋 요구사항

- Node.js 18+
- yt-dlp (시스템에 설치되어 있어야 함)
- ffmpeg (영상/음성 병합에 필요)

### yt-dlp 설치

```bash
# macOS (Homebrew)
brew install yt-dlp ffmpeg

# Ubuntu/Debian
sudo apt install yt-dlp ffmpeg

# Windows (chocolatey)
choco install yt-dlp ffmpeg

# pip
pip install yt-dlp
```

## 🚀 실행 방법

### 1. 백엔드 실행 (포트 8000)

```bash
cd backend
npm install
npm start
```

### 2. 프론트엔드 실행 (포트 8080)

```bash
cd frontend
npm install
npm run dev
```

### 3. 브라우저에서 접속

http://localhost:8080 에 접속하여 사용

## 📁 프로젝트 구조

```
musicdownloader/
├── backend/
│   ├── server.js        # Express 서버 (yt-dlp 연동)
│   ├── package.json
│   └── downloads/       # 다운로드 임시 저장 폴더
├── frontend/
│   ├── src/
│   │   ├── App.jsx      # 메인 컴포넌트
│   │   ├── App.css      # 스타일
│   │   └── main.jsx     # 엔트리 포인트
│   ├── index.html
│   └── package.json
└── README.md
```

## 🎯 기능

- YouTube URL 입력으로 영상 정보 조회
- 다양한 화질 옵션 선택
- 실시간 다운로드 진행률 표시
- MP4 형식으로 다운로드

## ⚠️ 주의사항

- 이 도구는 개인적인 용도로만 사용해주세요.
- 저작권이 있는 콘텐츠의 다운로드는 법적 책임이 따를 수 있습니다.
- YouTube의 서비스 약관을 준수해주세요.

