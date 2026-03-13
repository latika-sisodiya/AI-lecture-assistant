import os
import uuid
import json
import re
import tempfile
import ffmpeg

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from groq import Groq

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Simple in-memory store instead of a database
store: dict[str, dict] = {}

app = FastAPI(title="AI Lecture Assistant API")

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:5174"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


def parse_json(text: str):
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        text = match.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def process_lecture(lecture_id: str):
    lecture = store[lecture_id]
    lecture["status"] = "processing"

    try:
        video_path = os.path.join(UPLOAD_DIR, lecture["filename"])

        # 1. Get video duration
        try:
            probe = ffmpeg.probe(video_path)
            lecture["duration"] = float(probe["format"]["duration"])
        except Exception:
            pass

        # 2. Extract audio to temp WAV
        tmp_audio = os.path.join(tempfile.gettempdir(), f"{lecture_id}.wav")
        (
            ffmpeg
            .input(video_path)
            .output(tmp_audio, acodec="pcm_s16le", ac=1, ar="16000", vn=None)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )

        client = Groq(api_key=GROQ_API_KEY)

        # 3. Transcribe with Groq Whisper
        with open(tmp_audio, "rb") as f:
            result = client.audio.transcriptions.create(
                file=(tmp_audio, f.read()),
                model="whisper-large-v3",
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )

        segments = []
        if hasattr(result, "segments") and result.segments:
            for s in result.segments:
                if isinstance(s, dict):
                    segments.append({"start": s["start"], "end": s["end"], "text": s["text"].strip()})
                else:
                    segments.append({"start": s.start, "end": s.end, "text": s.text.strip()})

        full_text = result.text
        lecture["transcript"] = {"full_text": full_text, "segments": segments}

        text_for_llm = full_text[:12000]

        # 4. Summary
        r = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are an educator. Return valid JSON only."},
                {"role": "user", "content": (
                    f"From this lecture transcript, return JSON:\n"
                    f'{{ "short_summary": "3-5 sentence overview", "detailed_summary": "bullet points in markdown" }}\n\n'
                    f"Transcript:\n{text_for_llm}"
                )},
            ],
            temperature=0.3, max_tokens=1024,
        )
        lecture["summary"] = parse_json(r.choices[0].message.content)

        # 5. Topics
        r = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are an educator. Return valid JSON only."},
                {"role": "user", "content": (
                    f"Extract 4-6 main topics from this lecture. Return a JSON array:\n"
                    f'[{{ "title": "...", "description": "...", "timestamp": 0 }}]\n\n'
                    f"Transcript:\n{text_for_llm}"
                )},
            ],
            temperature=0.3, max_tokens=512,
        )
        lecture["topics"] = parse_json(r.choices[0].message.content)

        # 6. Questions
        r = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are an educator. Return valid JSON only."},
                {"role": "user", "content": (
                    f"Generate study questions from this lecture. Return JSON:\n"
                    f'{{ "mcq": [{{"question":"...","options":[{{"label":"A","text":"...","is_correct":false}}],"explanation":"..."}}], '
                    f'"short_answer": [{{"question":"...","answer":"..."}}] }}\n'
                    f"Make 3 MCQs (4 options each) and 3 short-answer questions.\n\n"
                    f"Transcript:\n{text_for_llm}"
                )},
            ],
            temperature=0.4, max_tokens=1024,
        )
        lecture["questions"] = parse_json(r.choices[0].message.content)

        lecture["status"] = "completed"

    except Exception as e:
        lecture["status"] = "failed"
        lecture["error"] = str(e)
    finally:
        tmp_audio = os.path.join(tempfile.gettempdir(), f"{lecture_id}.wav")
        if os.path.exists(tmp_audio):
            os.remove(tmp_audio)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "AI Lecture Assistant API is running"}


@app.post("/lectures")
async def upload_lecture(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
):
    allowed = {".mp4", ".mov", ".mkv"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(400, f"Only MP4, MOV, MKV files allowed. Got: {ext}")

    lecture_id = str(uuid.uuid4())
    filename = f"{lecture_id}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    with open(file_path, "wb") as f:
        f.write(await file.read())

    store[lecture_id] = {
        "id": lecture_id,
        "title": title,
        "filename": filename,
        "status": "uploaded",
        "error": None,
        "duration": None,
        "transcript": None,
        "summary": None,
        "topics": None,
        "questions": None,
    }

    background_tasks.add_task(process_lecture, lecture_id)
    return {"id": lecture_id, "title": title, "status": "uploaded"}


@app.get("/lectures")
def list_lectures():
    return [
        {"id": l["id"], "title": l["title"], "status": l["status"], "duration": l["duration"]}
        for l in store.values()
    ]


@app.get("/lectures/{lecture_id}")
def get_lecture(lecture_id: str):
    lecture = store.get(lecture_id)
    if not lecture:
        raise HTTPException(404, "Lecture not found")
    return {
        **lecture,
        "video_url": f"/uploads/{lecture['filename']}",
    }


@app.delete("/lectures/{lecture_id}")
def delete_lecture(lecture_id: str):
    lecture = store.pop(lecture_id, None)
    if not lecture:
        raise HTTPException(404, "Lecture not found")
    file_path = os.path.join(UPLOAD_DIR, lecture["filename"])
    if os.path.exists(file_path):
        os.remove(file_path)
    return {"message": "Deleted"}
