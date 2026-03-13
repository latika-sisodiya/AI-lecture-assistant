# AI Lecture Assistant

Upload a lecture video → get transcript, summary, topics, and study questions powered by Groq AI.

## What it does

1. You upload an MP4/MOV/MKV video
2. The backend extracts audio with FFmpeg
3. Groq Whisper transcribes the audio
4. Groq LLaMA generates a summary, topics, and study questions
5. Everything shows up in the React UI

## Project structure

```
ai-lecture-assistant/
├── backend/
│   ├── main.py          ← entire FastAPI backend (single file)
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx      ← entire React app (single file)
    │   └── main.jsx
    ├── index.html
    ├── package.json
    └── ...config files
```

## Requirements

- Python 3.11+
- Node.js 18+
- FFmpeg → `brew install ffmpeg` (Mac) or download from ffmpeg.org (Windows)
- A free [Groq API key](https://console.groq.com)

## Run it

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # then add your Groq API key inside
uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: http://localhost:5173

## API endpoints

| Method | URL | What it does |
|---|---|---|
| GET | `/` | Health check |
| POST | `/lectures` | Upload a video |
| GET | `/lectures` | List all lectures |
| GET | `/lectures/{id}` | Get full lecture data (transcript, summary, etc.) |
| DELETE | `/lectures/{id}` | Delete a lecture |

## Storage

- Videos saved to `backend/uploads/` folder
- Data saved to `backend/lectures.db` (SQLite — no setup needed)
