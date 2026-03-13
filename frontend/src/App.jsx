import { useState, useEffect, useRef } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtTime(s) {
  if (!s && s !== 0) return ''
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function StatusBadge({ status }) {
  const styles = {
    uploaded:   'bg-blue-100 text-blue-700',
    processing: 'bg-yellow-100 text-yellow-700',
    completed:  'bg-green-100 text-green-700',
    failed:     'bg-red-100 text-red-700',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles[status] || ''}`}>
      {status}
    </span>
  )
}

// ── Upload form ───────────────────────────────────────────────────────────────
function UploadForm({ onUploaded }) {
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file || !title.trim()) { setError('Please select a file and enter a title.'); return }
    setError('')
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('title', title.trim())
    try {
      const res = await fetch(`${API}/lectures`, { method: 'POST', body: form })
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Upload failed') }
      const data = await res.json()
      onUploaded(data)
      setFile(null)
      setTitle('')
    } catch (err) {
      setError(err.message)
    }
    setUploading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6 space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Upload Lecture</h2>

      <div
        onClick={() => document.getElementById('file-input').click()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
      >
        {file ? (
          <p className="text-gray-700 font-medium">{file.name}</p>
        ) : (
          <>
            <p className="text-gray-500">Click to select a video file</p>
            <p className="text-xs text-gray-400 mt-1">MP4 · MOV · MKV</p>
          </>
        )}
        <input id="file-input" type="file" accept=".mp4,.mov,.mkv" className="hidden" onChange={handleFile} />
      </div>

      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Lecture title"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={uploading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors"
      >
        {uploading ? 'Uploading…' : 'Upload & Process'}
      </button>
    </form>
  )
}

// ── Lecture detail view ───────────────────────────────────────────────────────
function LectureDetail({ lecture, onBack }) {
  const [tab, setTab] = useState('transcript')
  const [mcqAnswers, setMcqAnswers] = useState({})
  const videoRef = useRef(null)

  const seekTo = (secs) => {
    if (videoRef.current) {
      videoRef.current.currentTime = secs
      videoRef.current.play().catch(() => {})
    }
  }

  const tabs = ['transcript', 'summary', 'topics', 'questions']

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-blue-600 hover:underline text-sm">← Back</button>
      <h2 className="text-xl font-bold text-gray-900">{lecture.title}</h2>

      {/* Video player */}
      {lecture.video_url && (
        <video
          ref={videoRef}
          src={`${API}${lecture.video_url}`}
          controls
          className="w-full rounded-xl shadow bg-black"
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg capitalize transition-colors ${
              tab === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Transcript ── */}
      {tab === 'transcript' && (
        <div className="bg-white rounded-2xl shadow p-4 space-y-1 max-h-96 overflow-y-auto">
          {!lecture.transcript ? (
            <p className="text-gray-500 text-sm">Not available yet.</p>
          ) : lecture.transcript.segments?.length > 0 ? (
            lecture.transcript.segments.map((seg, i) => (
              <button
                key={i}
                onClick={() => seekTo(seg.start)}
                className="w-full text-left flex gap-3 p-2 rounded-lg hover:bg-blue-50 group"
              >
                <span className="text-xs font-mono text-blue-500 w-10 shrink-0 mt-0.5">{fmtTime(seg.start)}</span>
                <span className="text-sm text-gray-700 group-hover:text-gray-900">{seg.text}</span>
              </button>
            ))
          ) : (
            <p className="text-sm text-gray-700 leading-relaxed">{lecture.transcript.full_text}</p>
          )}
        </div>
      )}

      {/* ── Summary ── */}
      {tab === 'summary' && (
        <div className="space-y-3">
          {!lecture.summary ? (
            <p className="text-gray-500 text-sm">Not available yet.</p>
          ) : (
            <>
              <div className="bg-white rounded-2xl shadow p-4">
                <h3 className="font-semibold text-gray-800 mb-2">Quick Overview</h3>
                <p className="text-sm text-gray-700 leading-relaxed">{lecture.summary.short_summary}</p>
              </div>
              <div className="bg-white rounded-2xl shadow p-4">
                <h3 className="font-semibold text-gray-800 mb-2">Detailed Summary</h3>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {lecture.summary.detailed_summary}
                </pre>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Topics ── */}
      {tab === 'topics' && (
        <div className="bg-white rounded-2xl shadow p-4 space-y-2">
          {!lecture.topics ? (
            <p className="text-gray-500 text-sm">Not available yet.</p>
          ) : (
            (Array.isArray(lecture.topics) ? lecture.topics : []).map((t, i) => (
              <button
                key={i}
                onClick={() => seekTo(t.timestamp || 0)}
                className="w-full text-left flex items-start gap-3 p-3 rounded-xl bg-gray-50 hover:bg-blue-50 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{t.title}</p>
                  {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                </div>
                {t.timestamp > 0 && (
                  <span className="ml-auto text-xs font-mono text-blue-500 shrink-0">{fmtTime(t.timestamp)}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* ── Questions ── */}
      {tab === 'questions' && (
        <div className="space-y-4">
          {!lecture.questions ? (
            <p className="text-gray-500 text-sm">Not available yet.</p>
          ) : (
            <>
              {/* MCQ */}
              {lecture.questions.mcq?.map((q, qi) => (
                <div key={qi} className="bg-white rounded-2xl shadow p-4 space-y-3">
                  <p className="font-medium text-gray-900 text-sm">Q{qi + 1}. {q.question}</p>
                  <div className="space-y-2">
                    {q.options?.map((opt, oi) => {
                      const selected = mcqAnswers[qi] === oi
                      const revealed = mcqAnswers[qi] !== undefined
                      return (
                        <button
                          key={oi}
                          disabled={revealed}
                          onClick={() => setMcqAnswers(prev => ({ ...prev, [qi]: oi }))}
                          className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                            !revealed ? 'border-gray-200 hover:border-blue-400'
                            : opt.is_correct ? 'border-green-400 bg-green-50'
                            : selected ? 'border-red-400 bg-red-50'
                            : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <span className="font-bold text-gray-500 w-5">{opt.label}.</span>
                          {opt.text}
                        </button>
                      )
                    })}
                  </div>
                  {mcqAnswers[qi] !== undefined && q.explanation && (
                    <p className="text-xs text-yellow-800 bg-yellow-50 rounded-lg px-3 py-2">{q.explanation}</p>
                  )}
                </div>
              ))}

              {/* Short answer */}
              {lecture.questions.short_answer?.map((q, qi) => (
                <ShortAnswer key={qi} q={q} index={qi} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ShortAnswer({ q, index }) {
  const [show, setShow] = useState(false)
  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-2">
      <p className="font-medium text-gray-900 text-sm">SA{index + 1}. {q.question}</p>
      <button onClick={() => setShow(v => !v)} className="text-xs text-blue-600 hover:underline">
        {show ? 'Hide answer' : 'Show answer'}
      </button>
      {show && <p className="text-sm text-gray-700 bg-blue-50 rounded-lg px-3 py-2">{q.answer}</p>}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [lectures, setLectures] = useState([])
  const [selected, setSelected] = useState(null)   // full lecture data
  const [loading, setLoading] = useState(true)

  const fetchLectures = async () => {
    try {
      const res = await fetch(`${API}/lectures`)
      const data = await res.json()
      setLectures(data)
    } catch {}
    setLoading(false)
  }

  const fetchSelected = async (id) => {
    const res = await fetch(`${API}/lectures/${id}`)
    const data = await res.json()
    setSelected(data)
  }

  // Poll every 4s while any lecture is processing
  useEffect(() => {
    fetchLectures()
    const hasProcessing = lectures.some(l => l.status === 'uploaded' || l.status === 'processing')
    if (hasProcessing) {
      const id = setInterval(fetchLectures, 4000)
      return () => clearInterval(id)
    }
  }, [lectures.map(l => l.status).join(',')])

  // Refresh selected lecture while it's still processing
  useEffect(() => {
    if (!selected) return
    if (selected.status !== 'completed' && selected.status !== 'failed') {
      const id = setInterval(() => fetchSelected(selected.id), 4000)
      return () => clearInterval(id)
    }
  }, [selected?.status])

  const handleUploaded = (lecture) => {
    setLectures(prev => [lecture, ...prev])
    setSelected(lecture)
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    await fetch(`${API}/lectures/${id}`, { method: 'DELETE' })
    setLectures(prev => prev.filter(l => l.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const handleSelect = async (lecture) => {
    const res = await fetch(`${API}/lectures/${lecture.id}`)
    const data = await res.json()
    setSelected(data)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-blue-700">AI Lecture Assistant</h1>
        <p className="text-sm text-gray-500">Upload a lecture video → get transcript, summary &amp; questions</p>
      </header>

      <div className="max-w-5xl mx-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Left column: upload + lecture list */}
        <div className="space-y-6">
          <UploadForm onUploaded={handleUploaded} />

          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">My Lectures</h2>
            {loading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : lectures.length === 0 ? (
              <p className="text-sm text-gray-400">No lectures yet.</p>
            ) : (
              <ul className="space-y-2">
                {lectures.map(l => (
                  <li
                    key={l.id}
                    onClick={() => handleSelect(l)}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                      selected?.id === l.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{l.title}</p>
                      <StatusBadge status={l.status} />
                    </div>
                    <button
                      onClick={(e) => handleDelete(l.id, e)}
                      className="text-gray-300 hover:text-red-500 ml-2 text-lg leading-none"
                      title="Delete"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right column: detail view */}
        <div className="md:col-span-2">
          {!selected ? (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
              Select a lecture to view its study materials
            </div>
          ) : selected.status === 'processing' || selected.status === 'uploaded' ? (
            <div className="bg-white rounded-2xl shadow p-8 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="font-semibold text-gray-700">Processing "{selected.title}"…</p>
              <p className="text-sm text-gray-500">Transcribing + generating summaries and questions</p>
            </div>
          ) : selected.status === 'failed' ? (
            <div className="bg-white rounded-2xl shadow p-8 text-center space-y-2">
              <p className="text-red-600 font-semibold">Processing failed</p>
              <p className="text-sm text-gray-500">{selected.error}</p>
            </div>
          ) : (
            <LectureDetail lecture={selected} onBack={() => setSelected(null)} />
          )}
        </div>
      </div>
    </div>
  )
}
