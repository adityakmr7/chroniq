import { useState, useEffect } from "react";

interface Video {
  id: string;
  title: string;
  topic: string;
  status: string;
  duration: string | null;
  youtube_url: string | null;
  video_type?: string;
  error_message?: string | null;
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

const API_BASE = "http://localhost:3000";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getProgressInfo(status: string) {
  switch (status) {
    case "queued":
      return { percent: 5, label: "Waiting in queue...", color: "#3b82f6" };
    case "researching":
      return { percent: 20, label: "🔍 Researching topic details...", color: "#a855f7" };
    case "generating_script":
      return { percent: 40, label: "✍️ Writing script content...", color: "#ec4899" };
    case "generating_voice":
      return { percent: 60, label: "🎙️ Generating voiceover narration...", color: "#f59e0b" };
    case "generating_visuals":
      return { percent: 75, label: "🎨 Generating dynamic image scenes...", color: "#06b6d4" };
    case "rendering_video":
      return { percent: 90, label: "🎥 Rendering final video via FFmpeg...", color: "#10b981" };
    case "completed":
      return { percent: 100, label: "✅ Generation completed!", color: "#22c55e" };
    case "failed":
      return { percent: 100, label: "❌ Generation failed", color: "#ef4444" };
    default:
      return { percent: 0, label: "Unknown status", color: "#6b7280" };
  }
}

export default function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [queueStats, setQueueStats] = useState<QueueStats>({
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
  });

  // Form states
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("Technology History");
  const [videoType, setVideoType] = useState("short");
  const [mock, setMock] = useState(true); // Default to mock for safety/cost
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal states
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [videoDetails, setVideoDetails] = useState<{
    video: Video;
    script: VideoScript | null;
    assets: VideoAsset[];
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Fetch lists
  const fetchVideos = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/videos`);
      if (res.ok) {
        const data = await res.json();
        setVideos(data);
      }
    } catch (err) {
      console.error("Failed to fetch videos:", err);
    }
  };

  const fetchQueueStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/queue-stats`);
      if (res.ok) {
        const data = await res.json();
        setQueueStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch queue stats:", err);
    }
  };

  // Poll queues and videos periodically when jobs are active
  useEffect(() => {
    fetchVideos();
    fetchQueueStats();

    const interval = setInterval(() => {
      fetchVideos();
      fetchQueueStats();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Fetch specific video details when clicked
  useEffect(() => {
    if (!selectedVideo) {
      setVideoDetails(null);
      return;
    }

    const fetchDetails = async () => {
      setIsLoadingDetails(true);
      try {
        const res = await fetch(`${API_BASE}/api/videos/${selectedVideo.id}`);
        if (res.ok) {
          const data = await res.json();
          setVideoDetails(data);
        }
      } catch (err) {
        console.error("Failed to fetch video details:", err);
      } finally {
        setIsLoadingDetails(false);
      }
    };

    fetchDetails();
  }, [selectedVideo]);

  // Submit new video job
  const handleQueueVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          topic,
          mock,
          videoType,
        }),
      });

      if (res.ok) {
        setTitle("");
        fetchVideos();
        fetchQueueStats();
      }
    } catch (err) {
      console.error("Failed to queue video:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Autogenerate a viral topic title helper
  const handleGenerateTopicSuggestion = () => {
    const suggestions: Record<string, string[]> = {
      "Technology History": [
        "Why Nokia Failed",
        "The Rise of NVIDIA",
        "How Netscape Lost the Browser War",
        "The History of Android",
        "How IBM Missed the PC Revolution"
      ],
      "Startup Stories": [
        "The Story of Bitcoin",
        "How Airbnb Survived 2008",
        "The Rise of Stripe",
        "How Uber Conquered the World",
        "Why Theranos Collapsed"
      ],
      "AI & Innovation": [
        "The Secret Origin of OpenAI",
        "How AlphaGo Defeated Lee Sedol",
        "What is Quantum Computing?",
        "How GPUs Changed AI Forever",
        "The Future of Humanoid Robots"
      ],
      "Business Case Studies": [
        "How Netflix Destroyed Blockbuster",
        "The Decline of Sears",
        "How WeWork Lost 40 Billion Dollars",
        "Why Toys R Us Went Bankrupt",
        "How Apple Saved Itself in 1997"
      ],
      "Historical Events": [
        "The Shortest War in History",
        "How Rome Built Their Aqueducts",
        "The Story of the Library of Alexandria",
        "The Space Race Secrets",
        "The Mystery of the Roanoke Colony"
      ],
      "Forgotten Stories": [
        "The Man Who Accidentally Saved the World",
        "The Forgotten Inventor of Radio",
        "The Great Emu War of Australia",
        "The Balloon Bomb Invasion of America",
        "The London Beer Flood of 1814"
      ]
    };

    const list = suggestions[topic] || suggestions["Technology History"];
    const randomTitle = list[Math.floor(Math.random() * list.length)];
    setTitle(randomTitle);
  };

  // Helper to format duration seconds
  const formatDuration = (val: string | null) => {
    if (!val) return "0s";
    const sec = parseFloat(val);
    return `${sec.toFixed(1)}s`;
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-section">
          <h1>Chroniq <span>Studio</span></h1>
          <p>AI-Powered Faceless YouTube Automation Monorepo</p>
        </div>
        <div>
          <button className="btn btn-secondary" onClick={() => { fetchVideos(); fetchQueueStats(); }}>
            🔄 Refresh Dashboard
          </button>
        </div>
      </header>

      {/* Metrics Row */}
      <section className="metrics-grid">
        <div className="metric-card">
          <span className="metric-title">Active Queue Jobs</span>
          <span className="metric-value">{queueStats.active}</span>
          <span className="metric-trend up">Processing live</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Jobs Waiting</span>
          <span className="metric-value">{queueStats.waiting}</span>
          <span className="metric-trend neutral">In Redis queue</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Total Completed</span>
          <span className="metric-value">{queueStats.completed}</span>
          <span className="metric-trend up">Published / Rendered</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Failed Generations</span>
          <span className="metric-value">{queueStats.failed}</span>
          <span className="metric-trend" style={{ color: "hsl(var(--accent-red))" }}>
            Errors encountered
          </span>
        </div>
      </section>

      {/* Main Panel Grid */}
      <div className="panel-grid">
        {/* Left Creator Panel */}
        <aside className="panel">
          <h2 className="panel-title">Video Generator</h2>
          <form onSubmit={handleQueueVideo} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            
            <div className="form-group">
              <label>Select Video Niche / Category</label>
              <select 
                className="select-input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              >
                <option value="Technology History">Technology History</option>
                <option value="Startup Stories">Startup Stories</option>
                <option value="AI & Innovation">AI & Innovation</option>
                <option value="Business Case Studies">Business Case Studies</option>
                <option value="Historical Events">Historical Events</option>
                <option value="Forgotten Stories">Forgotten Stories</option>
              </select>
            </div>

            <div className="form-group">
              <label>Video Format</label>
              <select 
                className="select-input"
                value={videoType}
                onChange={(e) => setVideoType(e.target.value)}
              >
                <option value="short">Short (9:16 Vertical, ~50s)</option>
                <option value="long">Long-form (16:9 Landscape, ~3m)</option>
              </select>
            </div>

            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label>Video Title / Idea</label>
                <button 
                  type="button" 
                  onClick={handleGenerateTopicSuggestion}
                  style={{
                    background: "none",
                    border: "none",
                    color: "hsl(var(--accent-purple))",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  💡 Generate Idea
                </button>
              </div>
              <input 
                type="text" 
                className="input-text" 
                placeholder="e.g. Why Nokia Lost Everything"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="checkbox-group">
              <input 
                type="checkbox" 
                id="mockMode" 
                checked={mock} 
                onChange={(e) => setMock(e.target.checked)}
              />
              <label htmlFor="mockMode">Run in MOCK Mode (Fast, free test run)</label>
            </div>

            <button 
              type="submit" 
              className="btn" 
              disabled={isSubmitting || !title.trim()}
            >
              {isSubmitting ? "Queueing..." : "⚡ Queue Video Job"}
            </button>
          </form>
        </aside>

        {/* Right Video Library Panel */}
        <main className="panel" style={{ flex: 1 }}>
          <h2 className="panel-title">
            Generated Content Library 
            <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "hsl(var(--text-muted))" }}>
              {videos.length} videos
            </span>
          </h2>
          
          {videos.length === 0 ? (
            <div className="empty-state">
              <p>No videos generated yet. Enter a title on the left to start automated creation!</p>
            </div>
          ) : (
            <div className="video-grid">
              {videos.map((vid) => {
                const videoSlug = slugify(vid.title);
                const isCompleted = vid.status === "completed";
                const thumbnailUrl = isCompleted 
                  ? `${API_BASE}/assets/${videoSlug}/thumbnail.png`
                  : null;

                return (
                  <div 
                    key={vid.id} 
                    className="video-card"
                    onClick={() => setSelectedVideo(vid)}
                  >
                    <div className="card-thumbnail">
                      {thumbnailUrl ? (
                        <img src={thumbnailUrl} alt={vid.title} />
                      ) : (
                        <div className="card-thumbnail-fallback">
                          🎬
                        </div>
                      )}
                      <span className={`card-status-badge status-${vid.status.replace("_", "")}`}>
                        {vid.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="card-content">
                      <span className="card-topic">{vid.topic}</span>
                      <h3>{vid.title}</h3>
                      
                      {vid.status !== "completed" && vid.status !== "failed" && (
                        <div style={{ margin: "0.5rem 0" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "hsl(var(--text-muted))", marginBottom: "0.25rem" }}>
                            <span>{getProgressInfo(vid.status).label}</span>
                            <span>{getProgressInfo(vid.status).percent}%</span>
                          </div>
                          <div style={{ width: "100%", height: "4px", backgroundColor: "rgba(255, 255, 255, 0.1)", borderRadius: "2px", overflow: "hidden" }}>
                            <div style={{ width: `${getProgressInfo(vid.status).percent}%`, height: "100%", backgroundColor: getProgressInfo(vid.status).color, transition: "width 0.3s ease" }} />
                          </div>
                        </div>
                      )}

                      {vid.status === "failed" && (
                        <span style={{ fontSize: "0.7rem", color: "rgb(239, 68, 68)", margin: "0.5rem 0", display: "block", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
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

      {/* Details Preview Modal */}
      {selectedVideo && (
        <div className="modal-overlay" onClick={() => setSelectedVideo(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedVideo(null)}>×</button>
            
            <div style={{ borderBottom: "1px solid hsl(var(--border))", padding: "1.5rem 2rem" }}>
              <span className="card-topic" style={{ fontSize: "0.875rem" }}>{selectedVideo.topic}</span>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "0.25rem" }}>{selectedVideo.title}</h2>
              <span 
                className={`card-status-badge status-${selectedVideo.status.replace("_", "")}`}
                style={{ position: "static", display: "inline-block", marginTop: "0.5rem" }}
              >
                {selectedVideo.status.replace("_", " ")}
              </span>
            </div>

            {isLoadingDetails ? (
              <div style={{ padding: "4rem", textAlign: "center", color: "hsl(var(--text-muted))" }}>
                <span>Loading generated assets...</span>
              </div>
            ) : videoDetails ? (
              <div className="modal-body">
                {/* Left side: Video player or fallback */}
                <div>
                  <h3 className="modal-section-title">Video Output</h3>
                  {selectedVideo.status === "completed" ? (
                    <div 
                      className="modal-video-preview" 
                      style={{ 
                        aspectRatio: selectedVideo.video_type === "long" ? "16/9" : "9/16",
                        height: selectedVideo.video_type === "long" ? "auto" : undefined 
                      }}
                    >
                      <video 
                        src={`${API_BASE}/assets/${slugify(selectedVideo.title)}/final.mp4`} 
                        controls
                        playsInline
                      />
                    </div>
                  ) : (
                    selectedVideo.status === "failed" ? (
                      <div 
                        className="modal-video-preview" 
                        style={{ 
                          display: "flex", 
                          flexDirection: "column", 
                          alignItems: "center", 
                          justifyContent: "center", 
                          color: "hsl(var(--text-muted))", 
                          padding: "2rem", 
                          textAlign: "center",
                          aspectRatio: selectedVideo.video_type === "long" ? "16/9" : "9/16",
                          height: selectedVideo.video_type === "long" ? "auto" : undefined,
                          borderColor: "rgba(239, 68, 68, 0.4)",
                          backgroundColor: "rgba(239, 68, 68, 0.05)"
                        }}
                      >
                        <span style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</span>
                        <span style={{ color: "rgb(239, 68, 68)", fontWeight: 700, fontSize: "1.125rem" }}>Pipeline Failed</span>
                        <div style={{ 
                          marginTop: "1rem", 
                          padding: "0.75rem", 
                          backgroundColor: "rgba(0, 0, 0, 0.5)", 
                          borderRadius: "6px", 
                          border: "1px solid rgba(239, 68, 68, 0.2)",
                          fontSize: "0.85rem",
                          fontFamily: "monospace",
                          color: "hsl(var(--text))",
                          width: "90%",
                          maxHeight: "150px",
                          overflowY: "auto",
                          textAlign: "left",
                          wordBreak: "break-all"
                        }}>
                          {selectedVideo.error_message || "Unknown error occurred during pipeline execution."}
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="modal-video-preview" 
                        style={{ 
                          display: "flex", 
                          flexDirection: "column", 
                          alignItems: "center", 
                          justifyContent: "center", 
                          color: "hsl(var(--text))", 
                          padding: "2rem", 
                          textAlign: "center",
                          aspectRatio: selectedVideo.video_type === "long" ? "16/9" : "9/16",
                          height: selectedVideo.video_type === "long" ? "auto" : undefined
                        }}
                      >
                        <span className="spinner" style={{ fontSize: "2.5rem", marginBottom: "1rem", display: "inline-block" }}>⚙️</span>
                        <span style={{ fontWeight: 600 }}>{getProgressInfo(selectedVideo.status).label}</span>
                        
                        <div style={{ width: "80%", marginTop: "1.5rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "hsl(var(--text-muted))", marginBottom: "0.5rem" }}>
                            <span>Progress</span>
                            <span>{getProgressInfo(selectedVideo.status).percent}%</span>
                          </div>
                          <div style={{ width: "100%", height: "6px", backgroundColor: "rgba(255, 255, 255, 0.1)", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{ width: `${getProgressInfo(selectedVideo.status).percent}%`, height: "100%", backgroundColor: getProgressInfo(selectedVideo.status).color, transition: "width 0.3s ease" }} />
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>

                {/* Right side: Script & Metadata */}
                <div className="modal-info">
                  {videoDetails.script && (
                    <div>
                      <h3 className="modal-section-title">Narration Script</h3>
                      <div className="modal-script-box">
                        {videoDetails.script.content}
                      </div>
                      
                      {selectedVideo.status === "completed" && (
                        <div style={{ marginTop: "0.75rem" }}>
                          <h4 style={{ fontSize: "0.75rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", marginBottom: "0.25rem" }}>Audio Narration</h4>
                          <audio 
                            src={`${API_BASE}/assets/${slugify(selectedVideo.title)}/narration.mp3`}
                            controls
                            style={{ width: "100%", height: "32px" }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <h3 className="modal-section-title">Publishing & SEO Metadata</h3>
                    
                    {selectedVideo.youtube_url && (
                      <div className="modal-meta-item">
                        <strong>YouTube URL: </strong>
                        <a href={selectedVideo.youtube_url} target="_blank" rel="noopener noreferrer">
                          {selectedVideo.youtube_url} 🔗
                        </a>
                      </div>
                    )}
                    
                    <div className="modal-meta-item">
                      <strong>Duration: </strong>
                      <span>{formatDuration(selectedVideo.duration)}</span>
                    </div>
                    
                    <div className="modal-meta-item">
                      <strong>Video ID: </strong>
                      <span style={{ fontFamily: "monospace" }}>{selectedVideo.id}</span>
                    </div>

                    <div className="modal-meta-item">
                      <strong>Created At: </strong>
                      <span>{new Date(selectedVideo.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: "4rem", textAlign: "center", color: "hsl(var(--text-muted))" }}>
                <span>Could not load details for this video.</span>
              </div>
            )}
            
            <div style={{ borderTop: "1px solid hsl(var(--border))", padding: "1.25rem 2rem", display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setSelectedVideo(null)}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
