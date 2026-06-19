import { useState, useEffect, useCallback } from "react";

interface Video {
  id: string;
  title: string;
  topic: string;
  status: string;
  duration: string | null;
  youtube_url: string | null;
  video_type?: string;
  error_message?: string | null;
  scene_manifest?: string | null;
  created_at: string;
}

interface VideoAsset {
  id: string;
  video_id: string;
  type: string;
  url: string;
}

interface VideoScript {
  id: string;
  video_id: string;
  content: string;
}

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

interface SceneManifest {
  index: number;
  filename: string;
  duration: number;
  imagePrompt: string;
  searchQuery?: string;
}

const API_BASE = "http://localhost:3000";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function getProgressInfo(status: string) {
  switch (status) {
    case "queued":              return { percent: 5,  label: "⏳ Waiting in queue...",               color: "#3b82f6", indeterminate: false };
    case "researching":         return { percent: 20, label: "🔍 Researching topic...",               color: "#a855f7", indeterminate: false };
    case "generating_script":   return { percent: 35, label: "✍️ Writing script...",                  color: "#ec4899", indeterminate: false };
    case "generating_voice":    return { percent: 55, label: "🎙️ Synthesizing voiceover...",          color: "#f59e0b", indeterminate: false };
    case "generating_visuals":  return { percent: 70, label: "🎨 Generating visual scenes...",        color: "#06b6d4", indeterminate: false };
    case "awaiting_approval":   return { percent: 85, label: "👀 Awaiting your review...",            color: "#f97316", indeterminate: false };
    case "approved":            return { percent: 88, label: "✅ Approved — queueing render...",      color: "#10b981", indeterminate: false };
    case "generating_captions": return { percent: 90, label: "✍️ Compiling captions...",              color: "#14b8a6", indeterminate: false };
    case "rendering_video":     return { percent: 92, label: "🎬 Rendering via Remotion...",          color: "#10b981", indeterminate: true  };
    case "publishing":          return { percent: 98, label: "🚀 Publishing to YouTube...",           color: "#f43f5e", indeterminate: false };
    case "completed":           return { percent: 100, label: "✅ Completed!",                        color: "#22c55e", indeterminate: false };
    case "failed":              return { percent: 100, label: "❌ Generation failed",                  color: "#ef4444", indeterminate: false };
    default:                    return { percent: 0,  label: "Unknown status",                        color: "#6b7280", indeterminate: false };
  }
}

function ProgressBar({ percent, color, indeterminate }: { percent: number; color: string; indeterminate: boolean }) {
  if (indeterminate) {
    return (
      <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", backgroundColor: "rgba(16,185,129,0.15)", borderRadius: "inherit" }}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "45%", background: `linear-gradient(90deg, transparent, ${color}, transparent)`, animation: "shimmer 1.6s ease-in-out infinite" }} />
      </div>
    );
  }
  return <div style={{ width: `${percent}%`, height: "100%", backgroundColor: color, transition: "width 0.4s ease", borderRadius: "inherit" }} />;
}

// ─── HITL Review Panel ───────────────────────────────────────────────────────
function HitlReviewPanel({
  video,
  details,
  onApprove,
  onReject,
  onClose,
}: {
  video: Video;
  details: { video: Video; script: VideoScript | null; assets: VideoAsset[] } | null;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  const slug = slugify(video.title);
  const [editedScript, setEditedScript] = useState(details?.script?.content || "");
  const [isSavingScript, setIsSavingScript] = useState(false);
  const [scriptSaved, setScriptSaved] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const scenes: SceneManifest[] = video.scene_manifest ? JSON.parse(video.scene_manifest) : [];

  const handleSaveScript = async () => {
    setIsSavingScript(true);
    try {
      await fetch(`${API_BASE}/api/videos/${video.id}/script`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editedScript }),
      });
      setScriptSaved(true);
      setTimeout(() => setScriptSaved(false), 2000);
    } finally {
      setIsSavingScript(false);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await fetch(`${API_BASE}/api/videos/${video.id}/approve`, { method: "POST" });
      onApprove();
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await fetch(`${API_BASE}/api/videos/${video.id}/reject`, { method: "POST" });
      onReject();
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: "1000px", width: "95vw" }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        {/* Header */}
        <div style={{ borderBottom: "1px solid hsl(var(--border))", padding: "1.5rem 2rem", background: "linear-gradient(135deg, rgba(249,115,22,0.1), rgba(239,68,68,0.05))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "1.5rem" }}>👀</span>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.08em" }}>Human Review Required</span>
          </div>
          <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0 }}>{video.title}</h2>
          <p style={{ fontSize: "0.8rem", color: "hsl(var(--text-muted))", marginTop: "0.25rem" }}>
            Review the generated script and scene images. Edit if needed, then Approve to begin rendering.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0", overflow: "hidden" }}>

          {/* Left: Script Editor */}
          <div style={{ padding: "1.5rem", borderRight: "1px solid hsl(var(--border))", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--text-muted))", margin: 0 }}>
                📝 Narration Script
              </h3>
              <button
                onClick={handleSaveScript}
                disabled={isSavingScript}
                style={{
                  padding: "0.3rem 0.75rem",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  borderRadius: "6px",
                  border: "none",
                  background: scriptSaved ? "#22c55e" : "rgba(255,255,255,0.1)",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
              >
                {scriptSaved ? "✓ Saved!" : isSavingScript ? "Saving..." : "💾 Save Edits"}
              </button>
            </div>
            <textarea
              value={editedScript}
              onChange={(e) => setEditedScript(e.target.value)}
              style={{
                flex: 1,
                minHeight: "280px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid hsl(var(--border))",
                borderRadius: "10px",
                padding: "1rem",
                color: "hsl(var(--text))",
                fontSize: "0.85rem",
                lineHeight: 1.7,
                resize: "vertical",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            {/* Audio preview */}
            <div>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", marginBottom: "0.4rem" }}>🎙️ Narration Audio Preview</p>
              <audio src={`${API_BASE}/assets/${slug}/narration.mp3`} controls style={{ width: "100%", height: "32px" }} />
            </div>
          </div>

          {/* Right: Scene Images */}
          <div style={{ padding: "1.5rem", overflowY: "auto", maxHeight: "520px" }}>
            <h3 style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--text-muted))", margin: "0 0 0.75rem 0" }}>
              🎬 Scene Images ({scenes.length} scenes)
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              {scenes.map((scene) => (
                <div key={scene.index} style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid hsl(var(--border))", background: "rgba(0,0,0,0.3)" }}>
                  <img
                    src={`${API_BASE}/assets/${slug}/${scene.filename}`}
                    alt={`Scene ${scene.index}`}
                    style={{ width: "100%", aspectRatio: video.video_type === "long" ? "16/9" : "9/16", objectFit: "cover", display: "block" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <div style={{ padding: "0.5rem 0.6rem" }}>
                    <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "#f97316", margin: "0 0 0.2rem" }}>Scene {scene.index + 1} · {scene.duration.toFixed(1)}s</p>
                    <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", margin: 0, lineHeight: 1.4 }}>{scene.imagePrompt}</p>
                  </div>
                </div>
              ))}
              {scenes.length === 0 && (
                <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.8rem", gridColumn: "1/-1" }}>No scene manifest found.</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer: Action buttons */}
        <div style={{ borderTop: "1px solid hsl(var(--border))", padding: "1.25rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
          <button
            onClick={handleReject}
            disabled={isRejecting}
            style={{
              padding: "0.65rem 1.5rem",
              fontWeight: 700,
              borderRadius: "8px",
              border: "1px solid rgba(239,68,68,0.4)",
              background: "rgba(239,68,68,0.1)",
              color: "#ef4444",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            {isRejecting ? "Rejecting..." : "❌ Reject & Regenerate"}
          </button>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              onClick={handleApprove}
              disabled={isApproving}
              style={{
                padding: "0.65rem 2rem",
                fontWeight: 800,
                borderRadius: "8px",
                border: "none",
                background: isApproving ? "#6b7280" : "linear-gradient(135deg, #22c55e, #16a34a)",
                color: "#fff",
                cursor: "pointer",
                fontSize: "0.9rem",
                boxShadow: "0 4px 15px rgba(34,197,94,0.3)",
              }}
            >
              {isApproving ? "Approving..." : "✅ Approve → Start Render"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [queueStats, setQueueStats] = useState<QueueStats>({ waiting: 0, active: 0, completed: 0, failed: 0 });

  // Form states
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("Technology History");
  const [videoType, setVideoType] = useState("short");
  const [mock, setMock] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal states
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [videoDetails, setVideoDetails] = useState<{ video: Video; script: VideoScript | null; assets: VideoAsset[] } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // HITL review modal
  const [reviewVideo, setReviewVideo] = useState<Video | null>(null);
  const [reviewDetails, setReviewDetails] = useState<{ video: Video; script: VideoScript | null; assets: VideoAsset[] } | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/videos`);
      if (res.ok) setVideos(await res.json());
    } catch {}
  }, []);

  const fetchQueueStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/queue-stats`);
      if (res.ok) setQueueStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchVideos();
    fetchQueueStats();
    const interval = setInterval(() => { fetchVideos(); fetchQueueStats(); }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedVideo) { setVideoDetails(null); return; }
    const fetch_ = async () => {
      setIsLoadingDetails(true);
      try {
        const res = await fetch(`${API_BASE}/api/videos/${selectedVideo.id}`);
        if (res.ok) setVideoDetails(await res.json());
      } finally { setIsLoadingDetails(false); }
    };
    fetch_();
  }, [selectedVideo]);

  const handleCardClick = async (vid: Video) => {
    if (vid.status === "awaiting_approval") {
      // Open HITL review modal
      const res = await fetch(`${API_BASE}/api/videos/${vid.id}`);
      if (res.ok) setReviewDetails(await res.json());
      setReviewVideo(vid);
    } else {
      setSelectedVideo(vid);
    }
  };

  const handleQueueVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), topic, mock, videoType }),
      });
      if (res.ok) { setTitle(""); fetchVideos(); fetchQueueStats(); }
    } finally { setIsSubmitting(false); }
  };

  const handleGenerateTopicSuggestion = () => {
    const suggestions: Record<string, string[]> = {
      "Technology History": ["Why Nokia Failed", "The Rise of NVIDIA", "How Netscape Lost the Browser War", "How IBM Missed the PC Revolution", "The History of Android"],
      "Startup Stories": ["The Story of Bitcoin", "How Airbnb Survived 2008", "The Rise of Stripe", "Why Theranos Collapsed", "How Uber Conquered the World"],
      "AI & Innovation": ["The Secret Origin of OpenAI", "How AlphaGo Defeated Lee Sedol", "How GPUs Changed AI Forever", "What is Quantum Computing?", "The Future of Humanoid Robots"],
      "Business Case Studies": ["How Netflix Destroyed Blockbuster", "The Decline of Sears", "How WeWork Lost 40 Billion Dollars", "Why Toys R Us Went Bankrupt", "How Apple Saved Itself in 1997"],
      "Historical Events": ["The Shortest War in History", "How Rome Built Their Aqueducts", "The Space Race Secrets", "The Mystery of the Roanoke Colony", "The Story of the Library of Alexandria"],
      "Forgotten Stories": ["The Man Who Accidentally Saved the World", "The Great Emu War of Australia", "The Balloon Bomb Invasion of America", "The London Beer Flood of 1814", "The Forgotten Inventor of Radio"],
    };
    const list = suggestions[topic] || suggestions["Technology History"];
    setTitle(list[Math.floor(Math.random() * list.length)]);
  };

  const formatDuration = (val: string | null) => {
    if (!val) return "0s";
    const sec = parseFloat(val);
    if (sec >= 60) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
    return `${sec.toFixed(1)}s`;
  };

  const awaitingCount = videos.filter((v) => v.status === "awaiting_approval").length;

  return (
    <div className="app-container">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="logo-section">
          <h1>Chroniq <span>Studio</span></h1>
          <p>AI-Powered Faceless YouTube Automation</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {awaitingCount > 0 && (
            <div style={{
              padding: "0.4rem 0.9rem",
              background: "linear-gradient(135deg, rgba(249,115,22,0.2), rgba(239,68,68,0.1))",
              border: "1px solid rgba(249,115,22,0.5)",
              borderRadius: "20px",
              fontSize: "0.78rem",
              fontWeight: 700,
              color: "#f97316",
              animation: "pulse 2s infinite",
            }}>
              👀 {awaitingCount} video{awaitingCount > 1 ? "s" : ""} awaiting your review
            </div>
          )}
          <button className="btn btn-secondary" onClick={() => { fetchVideos(); fetchQueueStats(); }}>
            🔄 Refresh
          </button>
        </div>
      </header>

      {/* ── Metrics ── */}
      <section className="metrics-grid">
        <div className="metric-card">
          <span className="metric-title">Active Jobs</span>
          <span className="metric-value">{queueStats.active}</span>
          <span className="metric-trend up">Processing live</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Awaiting Review</span>
          <span className="metric-value" style={{ color: awaitingCount > 0 ? "#f97316" : undefined }}>{awaitingCount}</span>
          <span className="metric-trend neutral">Needs your approval</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Completed</span>
          <span className="metric-value">{videos.filter(v => v.status === "completed").length}</span>
          <span className="metric-trend up">Published / Rendered</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Failed</span>
          <span className="metric-value">{queueStats.failed}</span>
          <span className="metric-trend" style={{ color: "hsl(var(--accent-red))" }}>Errors encountered</span>
        </div>
      </section>

      {/* ── Main Panel ── */}
      <div className="panel-grid">
        {/* Creator Panel */}
        <aside className="panel">
          <h2 className="panel-title">Video Generator</h2>
          <form onSubmit={handleQueueVideo} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="form-group">
              <label>Select Video Niche / Category</label>
              <select className="select-input" value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option>Technology History</option>
                <option>Startup Stories</option>
                <option>AI & Innovation</option>
                <option>Business Case Studies</option>
                <option>Historical Events</option>
                <option>Forgotten Stories</option>
              </select>
            </div>
            <div className="form-group">
              <label>Video Format</label>
              <select className="select-input" value={videoType} onChange={(e) => setVideoType(e.target.value)}>
                <option value="short">Short (9:16 Vertical, ~50s)</option>
                <option value="long">Long-form (16:9 Landscape, ~3m)</option>
              </select>
            </div>
            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label>Video Title / Idea</label>
                <button type="button" onClick={handleGenerateTopicSuggestion} style={{ background: "none", border: "none", color: "hsl(var(--accent-purple))", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                  💡 Generate Idea
                </button>
              </div>
              <input type="text" className="input-text" placeholder="e.g. Why Nokia Lost Everything" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>

            {/* HITL info box */}
            <div style={{ padding: "0.75rem", background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: "8px", fontSize: "0.75rem", color: "hsl(var(--text-muted))", lineHeight: 1.5 }}>
              👀 <strong style={{ color: "#f97316" }}>Human-in-the-Loop enabled.</strong> The pipeline will pause after generation for your review before rendering begins.
            </div>

            <div className="checkbox-group">
              <input type="checkbox" id="mockMode" checked={mock} onChange={(e) => setMock(e.target.checked)} />
              <label htmlFor="mockMode">Run in MOCK Mode (Fast, free test run)</label>
            </div>
            <button type="submit" className="btn" disabled={isSubmitting || !title.trim()}>
              {isSubmitting ? "Queueing..." : "⚡ Queue Video Job"}
            </button>
          </form>
        </aside>

        {/* Video Library */}
        <main className="panel" style={{ flex: 1 }}>
          <h2 className="panel-title">
            Generated Content Library
            <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "hsl(var(--text-muted))" }}> {videos.length} videos</span>
          </h2>

          {videos.length === 0 ? (
            <div className="empty-state">
              <p>No videos generated yet. Enter a title on the left to start!</p>
            </div>
          ) : (
            <div className="video-grid">
              {videos.map((vid) => {
                const videoSlug = slugify(vid.title);
                const isCompleted = vid.status === "completed";
                const isAwaiting = vid.status === "awaiting_approval";
                const thumbnailUrl = (isCompleted || isAwaiting)
                  ? `${API_BASE}/assets/${videoSlug}/thumbnail.png`
                  : null;
                const info = getProgressInfo(vid.status);

                return (
                  <div
                    key={vid.id}
                    className="video-card"
                    onClick={() => handleCardClick(vid)}
                    style={isAwaiting ? { outline: "2px solid rgba(249,115,22,0.6)", boxShadow: "0 0 20px rgba(249,115,22,0.15)" } : {}}
                  >
                    <div className="card-thumbnail">
                      {thumbnailUrl ? (
                        <img src={thumbnailUrl} alt={vid.title} />
                      ) : (
                        <div className="card-thumbnail-fallback">🎬</div>
                      )}
                      <span className={`card-status-badge status-${vid.status.replace(/_/g, "")}`}>
                        {vid.status.replace(/_/g, " ")}
                      </span>
                      {isAwaiting && (
                        <div style={{ position: "absolute", bottom: "0.5rem", left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg,#f97316,#ef4444)", color: "#fff", fontSize: "0.65rem", fontWeight: 800, padding: "0.25rem 0.6rem", borderRadius: "20px", whiteSpace: "nowrap" }}>
                          👀 CLICK TO REVIEW
                        </div>
                      )}
                    </div>
                    <div className="card-content">
                      <span className="card-topic">{vid.topic}</span>
                      <h3>{vid.title}</h3>

                      {vid.status !== "completed" && vid.status !== "failed" && (
                        <div style={{ margin: "0.5rem 0" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "hsl(var(--text-muted))", marginBottom: "0.25rem" }}>
                            <span>{info.label}</span>
                            <span>{info.indeterminate ? "⏳" : `${info.percent}%`}</span>
                          </div>
                          <div style={{ width: "100%", height: "4px", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "2px", overflow: "hidden" }}>
                            <ProgressBar percent={info.percent} color={info.color} indeterminate={info.indeterminate} />
                          </div>
                        </div>
                      )}

                      {vid.status === "failed" && (
                        <span style={{ fontSize: "0.7rem", color: "rgb(239,68,68)", margin: "0.5rem 0", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          ⚠️ {vid.error_message || "Failed"}
                        </span>
                      )}

                      <div className="card-footer" style={{ marginTop: "auto" }}>
                        <span>{formatDuration(vid.duration)}</span>
                        <span>{new Date(vid.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* ── HITL Review Modal ── */}
      {reviewVideo && (
        <HitlReviewPanel
          video={reviewVideo}
          details={reviewDetails}
          onApprove={() => { setReviewVideo(null); fetchVideos(); }}
          onReject={() => { setReviewVideo(null); fetchVideos(); }}
          onClose={() => setReviewVideo(null)}
        />
      )}

      {/* ── Standard Details Modal ── */}
      {selectedVideo && (
        <div className="modal-overlay" onClick={() => setSelectedVideo(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedVideo(null)}>×</button>

            <div style={{ borderBottom: "1px solid hsl(var(--border))", padding: "1.5rem 2rem" }}>
              <span className="card-topic" style={{ fontSize: "0.875rem" }}>{selectedVideo.topic}</span>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "0.25rem" }}>{selectedVideo.title}</h2>
              <span className={`card-status-badge status-${selectedVideo.status.replace(/_/g, "")}`} style={{ position: "static", display: "inline-block", marginTop: "0.5rem" }}>
                {selectedVideo.status.replace(/_/g, " ")}
              </span>
            </div>

            {isLoadingDetails ? (
              <div style={{ padding: "4rem", textAlign: "center", color: "hsl(var(--text-muted))" }}>Loading...</div>
            ) : videoDetails ? (
              <div className="modal-body">
                {/* Video player / status */}
                <div>
                  <h3 className="modal-section-title">Video Output</h3>
                  {selectedVideo.status === "completed" ? (
                    <div className="modal-video-preview" style={{ aspectRatio: selectedVideo.video_type === "long" ? "16/9" : "9/16", height: selectedVideo.video_type === "long" ? "auto" : undefined }}>
                      <video src={`${API_BASE}/assets/${slugify(selectedVideo.title)}/final.mp4`} controls playsInline />
                    </div>
                  ) : selectedVideo.status === "failed" ? (
                    <div className="modal-video-preview" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "hsl(var(--text-muted))", padding: "2rem", textAlign: "center", aspectRatio: "9/16", borderColor: "rgba(239,68,68,0.4)", backgroundColor: "rgba(239,68,68,0.05)" }}>
                      <span style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</span>
                      <span style={{ color: "rgb(239,68,68)", fontWeight: 700 }}>Pipeline Failed</span>
                      <div style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(0,0,0,0.5)", borderRadius: "6px", fontSize: "0.8rem", fontFamily: "monospace", width: "90%", wordBreak: "break-all", textAlign: "left" }}>
                        {selectedVideo.error_message || "Unknown error."}
                      </div>
                    </div>
                  ) : (
                    <div className="modal-video-preview" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center", aspectRatio: "9/16" }}>
                      <span className="spinner" style={{ fontSize: "2.5rem", marginBottom: "1rem", display: "inline-block" }}>⚙️</span>
                      <span style={{ fontWeight: 600 }}>{getProgressInfo(selectedVideo.status).label}</span>
                      <div style={{ width: "80%", marginTop: "1.5rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginBottom: "0.5rem" }}>
                          <span>Progress</span>
                          <span>{getProgressInfo(selectedVideo.status).indeterminate ? "Rendering..." : `${getProgressInfo(selectedVideo.status).percent}%`}</span>
                        </div>
                        <div style={{ width: "100%", height: "6px", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
                          <ProgressBar percent={getProgressInfo(selectedVideo.status).percent} color={getProgressInfo(selectedVideo.status).color} indeterminate={getProgressInfo(selectedVideo.status).indeterminate} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Script & Metadata */}
                <div className="modal-info">
                  {videoDetails.script && (
                    <div>
                      <h3 className="modal-section-title">Narration Script</h3>
                      <div className="modal-script-box">{videoDetails.script.content}</div>
                      {selectedVideo.status === "completed" && (
                        <div style={{ marginTop: "0.75rem" }}>
                          <h4 style={{ fontSize: "0.75rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", marginBottom: "0.25rem" }}>Audio</h4>
                          <audio src={`${API_BASE}/assets/${slugify(selectedVideo.title)}/narration.mp3`} controls style={{ width: "100%", height: "32px" }} />
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <h3 className="modal-section-title">Publishing & Metadata</h3>
                    {selectedVideo.youtube_url && (
                      <div className="modal-meta-item">
                        <strong>YouTube URL: </strong>
                        <a href={selectedVideo.youtube_url} target="_blank" rel="noopener noreferrer">{selectedVideo.youtube_url} 🔗</a>
                      </div>
                    )}
                    <div className="modal-meta-item"><strong>Duration: </strong><span>{formatDuration(selectedVideo.duration)}</span></div>
                    <div className="modal-meta-item"><strong>Format: </strong><span>{selectedVideo.video_type === "long" ? "16:9 Long-form" : "9:16 Short"}</span></div>
                    <div className="modal-meta-item"><strong>Video ID: </strong><span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{selectedVideo.id}</span></div>
                    <div className="modal-meta-item"><strong>Created: </strong><span>{new Date(selectedVideo.created_at).toLocaleString()}</span></div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: "4rem", textAlign: "center", color: "hsl(var(--text-muted))" }}>Could not load details.</div>
            )}

            <div style={{ borderTop: "1px solid hsl(var(--border))", padding: "1.25rem 2rem", display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setSelectedVideo(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
