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
  tts_provider?: string | null;
  voice_id?: string | null;
  language?: string | null;
  youtube_video_id?: string | null;
  thumbnail_variants?: string | null;
  use_custom_script?: boolean | null;
  custom_script?: string | null;
  captions_enabled?: boolean | null;
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
// ─── HITL Review Panel ───────────────────────────────────────────────────────
function HitlReviewPanel({
  video,
  details,
  voiceCatalog,
  onApprove,
  onReject,
  onClose,
}: {
  video: Video;
  details: { video: Video; script: VideoScript | null; assets: VideoAsset[] } | null;
  voiceCatalog: any;
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

  // New voice states
  const [language, setLanguage] = useState(video.language || "en");
  const [ttsProvider, setTtsProvider] = useState(video.tts_provider || "local");
  const [voiceId, setVoiceId] = useState(video.voice_id || "");
  const [isRegeneratingVoice, setIsRegeneratingVoice] = useState(false);
  const [customVoiceEnabled, setCustomVoiceEnabled] = useState(() => {
    if (video.voice_id && video.tts_provider === "elevenlabs") {
      const list = voiceCatalog?.["elevenlabs"] || [];
      return !list.some((v: any) => v.id === video.voice_id);
    }
    return false;
  });

  // Cache busters
  const [audioVersion, setAudioVersion] = useState(0);
  const [sceneVersion, setSceneVersion] = useState(0);

  const [currentVideo, setCurrentVideo] = useState<Video>(video);
  const scenes: SceneManifest[] = currentVideo.scene_manifest ? JSON.parse(currentVideo.scene_manifest) : [];

  // Metadata editor state
  const [ytTitle, setYtTitle] = useState("");
  const [ytDescription, setYtDescription] = useState("");
  const [ytTags, setYtTags] = useState("");
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [metaSaved, setMetaSaved] = useState(false);
  const [isRegeneratingScene, setIsRegeneratingScene] = useState<number | null>(null);

  // Thumbnail variants states
  const [thumbnailVariants, setThumbnailVariants] = useState<string[]>([]);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);

  useEffect(() => {
    if (video.thumbnail_variants) {
      try {
        setThumbnailVariants(JSON.parse(video.thumbnail_variants));
      } catch (err) {
        console.error(err);
      }
    }
  }, [video.thumbnail_variants]);

  const handleGenerateVariants = async () => {
    setIsGeneratingVariants(true);
    try {
      const res = await fetch(`${API_BASE}/api/videos/${video.id}/thumbnails/generate-variants`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setThumbnailVariants(data.variants || []);
        setSelectedVariant(0); // Select first variant by default
        // Select it on the server
        await fetch(`${API_BASE}/api/videos/${video.id}/thumbnails/select-variant`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index: 0 }),
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingVariants(false);
    }
  };

  const handleSelectVariant = async (idx: number) => {
    setSelectedVariant(idx);
    try {
      await fetch(`${API_BASE}/api/videos/${video.id}/thumbnails/select-variant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: idx }),
      });
    } catch (err) {
      console.error(err);
    }
  };


  // Load YT metadata from API on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/videos/${video.id}/metadata`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setYtTitle(data.title || "");
          setYtDescription(data.description || "");
          setYtTags(Array.isArray(data.tags) ? data.tags.join(", ") : "");
        }
      })
      .catch(() => {});
  }, [video.id]);

  const handleSaveMetadata = async () => {
    setIsSavingMeta(true);
    try {
      await fetch(`${API_BASE}/api/videos/${video.id}/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ytTitle,
          description: ytDescription,
          tags: ytTags.split(",").map(t => t.trim()).filter(Boolean),
        }),
      });
      setMetaSaved(true);
      setTimeout(() => setMetaSaved(false), 2000);
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleRegenerateSceneImage = async (index: number) => {
    setIsRegeneratingScene(index);
    try {
      const res = await fetch(`${API_BASE}/api/videos/${video.id}/scenes/${index}/regenerate`, {
        method: "POST",
      });
      if (res.ok) {
        setSceneVersion(prev => prev + 1);
      } else {
        const err = await res.json();
        alert(`Regenerate failed: ${err.error || "Unknown error"}`);
      }
    } catch (err: any) {
      alert(`Regenerate error: ${err.message}`);
    } finally {
      setIsRegeneratingScene(null);
    }
  };

  // Helper to filter voices based on provider & language
  const getMatchingVoices = (provider: string, lang: string) => {
    if (!voiceCatalog) return [];
    const catalogKey = provider === "local" ? "kokoro" : (provider === "cloud" ? "elevenlabs" : provider);
    const list = voiceCatalog[catalogKey] || [];
    if (catalogKey === "elevenlabs") return list;
    return list.filter((v: any) => v.lang === lang);
  };

  const matchingVoices = getMatchingVoices(ttsProvider, language);

  useEffect(() => {
    // If language is hindi, local (kokoro) is invalid, automatically switch to edge
    if (language === "hi" && ttsProvider === "local") {
      setTtsProvider("edge");
    }
  }, [language]);

  useEffect(() => {
    if (matchingVoices.length > 0) {
      const exists = matchingVoices.some((v: any) => v.id === voiceId);
      if (!exists) {
        setVoiceId(matchingVoices[0].id);
      }
    }
  }, [ttsProvider, language, matchingVoices, voiceId]);

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

  const handleRegenerateVoice = async () => {
    setIsRegeneratingVoice(true);
    try {
      const res = await fetch(`${API_BASE}/api/videos/${video.id}/regenerate-voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editedScript,
          ttsProvider,
          voiceId,
          language,
        }),
      });
      if (res.ok) {
        setAudioVersion((prev) => prev + 1);
        
        // Fetch updated video details to get the scaled scene durations
        const detailsRes = await fetch(`${API_BASE}/api/videos/${video.id}`);
        if (detailsRes.ok) {
          const latestDetails = await detailsRes.json();
          setCurrentVideo(latestDetails.video);
        }
      }
    } catch (err) {
      console.error("Voice regeneration failed:", err);
    } finally {
      setIsRegeneratingVoice(false);
    }
  };

  const handleImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch(`${API_BASE}/api/videos/${video.id}/scenes/${index}/image`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setSceneVersion((prev) => prev + 1);
      }
    } catch (err) {
      console.error("Image upload failed:", err);
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
            Review the generated script and scene images. Edit the script, customize the voice, or upload custom scene images, then Approve to begin rendering.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0", overflow: "hidden" }}>

          {/* Left: Script Editor & Voice Controls */}
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
                minHeight: "180px",
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

            {/* Voice Control Bar */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid hsl(var(--border))", borderRadius: "8px", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", margin: 0 }}>🎙️ Customize Voice & Narration</p>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                <div>
                  <label style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", display: "block", marginBottom: "0.2rem" }}>Language</label>
                  <select 
                    value={language} 
                    onChange={(e) => setLanguage(e.target.value)}
                    style={{ width: "100%", background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid hsl(var(--border))", borderRadius: "4px", padding: "0.25rem", fontSize: "0.75rem", outline: "none" }}
                  >
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", display: "block", marginBottom: "0.2rem" }}>TTS Engine</label>
                  <select 
                    value={ttsProvider} 
                    onChange={(e) => setTtsProvider(e.target.value)}
                    style={{ width: "100%", background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid hsl(var(--border))", borderRadius: "4px", padding: "0.25rem", fontSize: "0.75rem", outline: "none" }}
                  >
                    {language === "en" && <option value="local">Kokoro (Local)</option>}
                    <option value="edge">Edge TTS (Free)</option>
                    <option value="elevenlabs">ElevenLabs (Cloud)</option>
                  </select>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
                    <label style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))" }}>Voice</label>
                    {ttsProvider === "elevenlabs" && (
                      <button 
                        type="button" 
                        onClick={() => {
                          setCustomVoiceEnabled(!customVoiceEnabled);
                          setVoiceId("");
                        }} 
                        style={{ background: "none", border: "none", color: "hsl(var(--accent-purple))", fontSize: "0.65rem", fontWeight: 600, cursor: "pointer" }}
                      >
                        {customVoiceEnabled ? "List" : "Custom ID"}
                      </button>
                    )}
                  </div>
                  {customVoiceEnabled && ttsProvider === "elevenlabs" ? (
                    <input
                      type="text"
                      className="input-text"
                      placeholder="Voice ID"
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value.trim())}
                      style={{ padding: "0.25rem", fontSize: "0.75rem", outline: "none", width: "100%", boxSizing: "border-box", color: "#fff", background: "rgba(0,0,0,0.3)", border: "1px solid hsl(var(--border))", borderRadius: "4px" }}
                      required
                    />
                  ) : (
                    <select 
                      value={voiceId} 
                      onChange={(e) => setVoiceId(e.target.value)}
                      style={{ width: "100%", background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid hsl(var(--border))", borderRadius: "4px", padding: "0.25rem", fontSize: "0.75rem", outline: "none" }}
                    >
                      {matchingVoices.map((v: any) => (
                        <option key={v.id} value={v.id}>{v.label}</option>
                      ))}
                      {matchingVoices.length === 0 && <option value="">No voices available</option>}
                    </select>
                  )}
                </div>
              </div>

              <button
                onClick={handleRegenerateVoice}
                disabled={isRegeneratingVoice}
                style={{
                  width: "100%",
                  padding: "0.4rem",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  borderRadius: "6px",
                  border: "none",
                  background: isRegeneratingVoice ? "#6b7280" : "linear-gradient(135deg, hsl(var(--accent-purple)), #6366f1)",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "opacity 0.2s",
                }}
              >
                {isRegeneratingVoice ? "⏳ Regenerating Voice & Captions..." : "🎙️ Regenerate Voice & Captions"}
              </button>
            </div>

            {/* Audio preview */}
            <div>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", marginBottom: "0.4rem" }}>🎙️ Narration Audio Preview</p>
              <audio src={`${API_BASE}/assets/${slug}/narration.mp3?v=${audioVersion}`} controls style={{ width: "100%", height: "32px" }} />
            </div>

            {/* YouTube Metadata Editor */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid hsl(var(--border))", borderRadius: "8px", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", margin: 0 }}>📺 YouTube Metadata</p>
                <button
                  onClick={handleSaveMetadata}
                  disabled={isSavingMeta}
                  style={{ padding: "0.25rem 0.6rem", fontSize: "0.65rem", fontWeight: 700, borderRadius: "5px", border: "none", background: metaSaved ? "#22c55e" : "rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer" }}
                >
                  {metaSaved ? "✓ Saved!" : isSavingMeta ? "Saving..." : "💾 Save"}
                </button>
              </div>
              <div>
                <label style={{ fontSize: "0.62rem", color: "hsl(var(--text-muted))", display: "block", marginBottom: "0.15rem" }}>Title (max 65 chars)</label>
                <input
                  value={ytTitle}
                  onChange={e => setYtTitle(e.target.value)}
                  maxLength={100}
                  style={{ width: "100%", background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid hsl(var(--border))", borderRadius: "4px", padding: "0.3rem 0.5rem", fontSize: "0.75rem", outline: "none", boxSizing: "border-box" }}
                />
                <span style={{ fontSize: "0.6rem", color: ytTitle.length > 65 ? "#ef4444" : "hsl(var(--text-muted))" }}>{ytTitle.length}/65</span>
              </div>
              <div>
                <label style={{ fontSize: "0.62rem", color: "hsl(var(--text-muted))", display: "block", marginBottom: "0.15rem" }}>Description</label>
                <textarea
                  value={ytDescription}
                  onChange={e => setYtDescription(e.target.value)}
                  rows={3}
                  style={{ width: "100%", background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid hsl(var(--border))", borderRadius: "4px", padding: "0.3rem 0.5rem", fontSize: "0.72rem", outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.62rem", color: "hsl(var(--text-muted))", display: "block", marginBottom: "0.15rem" }}>Tags (comma-separated)</label>
                <input
                  value={ytTags}
                  onChange={e => setYtTags(e.target.value)}
                  placeholder="nokia, tech history, startup failure"
                  style={{ width: "100%", background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid hsl(var(--border))", borderRadius: "4px", padding: "0.3rem 0.5rem", fontSize: "0.72rem", outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>

            {/* A/B Thumbnail Variants */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid hsl(var(--border))", borderRadius: "8px", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", margin: 0 }}>🎨 A/B Thumbnail Variants</p>
              
              {thumbnailVariants.length === 0 ? (
                <button
                  onClick={handleGenerateVariants}
                  disabled={isGeneratingVariants}
                  style={{
                    width: "100%",
                    padding: "0.4rem",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    borderRadius: "6px",
                    border: "none",
                    background: isGeneratingVariants ? "#6b7280" : "linear-gradient(135deg, hsl(var(--accent-purple)), #6366f1)",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  {isGeneratingVariants ? "⏳ Generating 3 Variants..." : "🎨 Generate A/B Thumbnails"}
                </button>
              ) : (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    {thumbnailVariants.map((variant, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => handleSelectVariant(idx)}
                        style={{
                          border: selectedVariant === idx ? "2.5px solid hsl(var(--accent-purple))" : "1.5px solid hsl(var(--border))",
                          borderRadius: "6px",
                          overflow: "hidden",
                          cursor: "pointer",
                          position: "relative",
                          opacity: selectedVariant === idx ? 1.0 : 0.65,
                          transition: "all 0.2s"
                        }}
                      >
                        <img 
                          src={`${API_BASE}/assets/${slug}/${variant}`} 
                          alt={`Variant ${idx}`} 
                          style={{ width: "100%", aspectRatio: video.video_type === "long" ? "16/9" : "9/16", objectFit: "cover", display: "block" }} 
                        />
                        <div style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: "rgba(0,0,0,0.7)",
                          color: "#fff",
                          fontSize: "0.6rem",
                          fontWeight: 700,
                          textAlign: "center",
                          padding: "0.15rem 0"
                        }}>
                          Option {idx === 0 ? 'A' : idx === 1 ? 'B' : 'C'}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleGenerateVariants}
                    disabled={isGeneratingVariants}
                    style={{
                      width: "100%",
                      padding: "0.3rem",
                      fontSize: "0.68rem",
                      fontWeight: 600,
                      borderRadius: "4px",
                      border: "none",
                      background: "rgba(255,255,255,0.06)",
                      color: "hsl(var(--text-secondary))",
                      cursor: "pointer",
                    }}
                  >
                    {isGeneratingVariants ? "⏳ Regenerating..." : "🔄 Regenerate Variants"}
                  </button>
                </div>
              )}
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
                    src={`${API_BASE}/assets/${slug}/${scene.filename}?v=${sceneVersion}`}
                    alt={`Scene ${scene.index}`}
                    style={{ width: "100%", aspectRatio: video.video_type === "long" ? "16/9" : "9/16", objectFit: "cover", display: "block" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <div style={{ padding: "0.5rem 0.6rem" }}>
                    <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "#f97316", margin: "0 0 0.2rem" }}>Scene {scene.index + 1} · {scene.duration.toFixed(1)}s</p>
                    <p style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", margin: "0 0 0.4rem 0", lineHeight: 1.4 }}>{scene.imagePrompt}</p>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      <label style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.25rem 0.6rem",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        borderRadius: "4px",
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid hsl(var(--border))",
                        color: "hsl(var(--text))",
                        cursor: "pointer",
                        transition: "background 0.2s"
                      }}>
                        📁 Replace
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => handleImageUpload(scene.index, e)}
                        />
                      </label>
                      <button
                        onClick={() => handleRegenerateSceneImage(scene.index)}
                        disabled={isRegeneratingScene === scene.index}
                        style={{
                          padding: "0.25rem 0.6rem",
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          borderRadius: "4px",
                          border: "none",
                          background: isRegeneratingScene === scene.index ? "#6b7280" : "rgba(56,189,248,0.15)",
                          color: isRegeneratingScene === scene.index ? "#fff" : "#38bdf8",
                          cursor: "pointer",
                        }}
                      >
                        {isRegeneratingScene === scene.index ? "⏳" : "🔄 Regen"}
                      </button>
                    </div>
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

// ─── VideoScheduler Component ───────────────────────────────────────────────
function VideoScheduler({ videoId, API_BASE, onScheduled }: { videoId: string; API_BASE: string; onScheduled: () => void }) {
  const [schedule, setSchedule] = useState<any>(null);
  const [publishAt, setPublishAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/schedules`);
      if (res.ok) {
        const list = await res.json();
        const found = list.find((s: any) => s.video_id === videoId && s.status === 'pending');
        setSchedule(found || null);
      }
    } catch {}
  }, [videoId, API_BASE]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publishAt) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/videos/${videoId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishAt }),
      });
      if (res.ok) {
        await fetchSchedule();
        onScheduled();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm("Cancel scheduled publish?")) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/videos/${videoId}/schedule`, { method: "DELETE" });
      if (res.ok) {
        setSchedule(null);
        onScheduled();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (schedule) {
    return (
      <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "8px", padding: "0.75rem", fontSize: "0.8rem" }}>
        <p style={{ fontWeight: 600, color: "#10b981", display: "flex", alignItems: "center", gap: "0.25rem", margin: 0 }}>
          <span>📅 Scheduled to publish on YouTube:</span>
        </p>
        <p style={{ margin: "0.25rem 0 0.5rem 0", color: "#fff", fontWeight: 700 }}>
          {new Date(schedule.publish_at).toLocaleString()}
        </p>
        <button 
          onClick={handleCancel} 
          disabled={isSubmitting}
          style={{
            padding: "0.3rem 0.6rem",
            fontSize: "0.72rem",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "#ef4444",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          {isSubmitting ? "Cancelling..." : "Cancel Schedule"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSchedule} style={{ display: "flex", gap: "0.5rem", alignItems: "end" }}>
      <div className="form-group" style={{ flex: 1, gap: "0.25rem" }}>
        <input 
          type="datetime-local" 
          className="select-input" 
          value={publishAt} 
          onChange={e => setPublishAt(e.target.value)} 
          required 
          style={{ width: "100%", padding: "0.5rem", boxSizing: "border-box" }}
        />
      </div>
      <button 
        type="submit" 
        className="btn" 
        disabled={isSubmitting || !publishAt}
        style={{ padding: "0.5rem 1rem", fontSize: "0.8rem", height: "38px" }}
      >
        {isSubmitting ? "Saving..." : "Schedule"}
      </button>
    </form>
  );
}

// ─── BrandingView Component ──────────────────────────────────────────────────
function BrandingView({ API_BASE }: { API_BASE: string }) {
  const [branding, setBranding] = useState({
    channelName: "Chroniq",
    tagline: "The World's Untold Stories",
    accentColor: "#f97316",
    secondaryColor: "#a855f7",
    outroMessage: "Follow for daily stories.",
    logoEmoji: "🎬",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/branding`)
      .then(res => res.json())
      .then(data => {
        if (data && data.channelName) setBranding(data);
      })
      .catch(console.error);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`${API_BASE}/api/branding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(branding),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "2rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "2rem", alignItems: "start" }} className="panel-grid">
        
        {/* Settings Form */}
        <form onSubmit={handleSave} className="panel" style={{ gap: "1.25rem" }}>
          <h2 className="panel-title">🎨 Channel Branding</h2>
          
          <div className="form-group">
            <label>Channel Name</label>
            <input 
              type="text" 
              className="input-text" 
              value={branding.channelName} 
              onChange={e => setBranding({ ...branding, channelName: e.target.value })} 
              required 
            />
          </div>

          <div className="form-group">
            <label>Channel Tagline</label>
            <input 
              type="text" 
              className="input-text" 
              value={branding.tagline} 
              onChange={e => setBranding({ ...branding, tagline: e.target.value })} 
              required 
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label>Accent Color</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input 
                  type="color" 
                  value={branding.accentColor} 
                  onChange={e => setBranding({ ...branding, accentColor: e.target.value })} 
                  style={{ width: "40px", height: "40px", border: "none", borderRadius: "6px", cursor: "pointer", background: "none", padding: 0 }}
                />
                <input 
                  type="text" 
                  className="input-text" 
                  value={branding.accentColor} 
                  onChange={e => setBranding({ ...branding, accentColor: e.target.value })} 
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Secondary Color</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input 
                  type="color" 
                  value={branding.secondaryColor} 
                  onChange={e => setBranding({ ...branding, secondaryColor: e.target.value })} 
                  style={{ width: "40px", height: "40px", border: "none", borderRadius: "6px", cursor: "pointer", background: "none", padding: 0 }}
                />
                <input 
                  type="text" 
                  className="input-text" 
                  value={branding.secondaryColor} 
                  onChange={e => setBranding({ ...branding, secondaryColor: e.target.value })} 
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: "1rem" }}>
            <div className="form-group">
              <label>Logo Emoji</label>
              <input 
                type="text" 
                className="input-text" 
                value={branding.logoEmoji} 
                onChange={e => setBranding({ ...branding, logoEmoji: e.target.value })} 
                maxLength={2} 
                style={{ textAlign: "center", fontSize: "1.25rem" }}
                required 
              />
            </div>

            <div className="form-group">
              <label>Outro CTA Message</label>
              <input 
                type="text" 
                className="input-text" 
                value={branding.outroMessage} 
                onChange={e => setBranding({ ...branding, outroMessage: e.target.value })} 
                required 
              />
            </div>
          </div>

          <button type="submit" className="btn" disabled={isSaving}>
            {isSaving ? "Saving..." : "💾 Save Channel Settings"}
          </button>
          
          {saved && (
            <div style={{ color: "hsl(var(--accent-emerald))", fontSize: "0.85rem", fontWeight: 600 }}>
              ✅ Branding settings saved successfully! New renders will include this branding and outro.
            </div>
          )}
        </form>

        {/* Outro Preview Box */}
        <div className="panel" style={{ gap: "1.25rem", height: "100%", justifyContent: "space-between" }}>
          <h2 className="panel-title">🎬 Live Outro Preview (5s Card)</h2>
          
          <div style={{
            aspectRatio: "9/16",
            width: "100%",
            maxWidth: "280px",
            margin: "0 auto",
            backgroundColor: "#080808",
            border: "1px solid hsl(var(--border))",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            background: `radial-gradient(circle, ${branding.secondaryColor}15 0%, #080808 80%)`
          }}>
            {/* Logo Circle */}
            <div style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${branding.accentColor}, ${branding.secondaryColor})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 25px ${branding.accentColor}33`,
              marginBottom: "1.5rem"
            }}>
              <span style={{ fontSize: "2.5rem" }}>{branding.logoEmoji || "🎬"}</span>
            </div>

            {/* Title */}
            <h3 style={{
              color: "#fff",
              fontSize: "1.5rem",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              textAlign: "center",
              margin: 0,
              textShadow: `0 0 10px ${branding.accentColor}33`
            }}>
              {branding.channelName || "Chroniq"}
            </h3>

            {/* Tagline */}
            <p style={{
              color: "rgba(255,255,255,0.6)",
              fontSize: "0.85rem",
              textAlign: "center",
              margin: "0.5rem 0 2rem 0",
              fontWeight: 500
            }}>
              {branding.tagline || "The World's Untold Stories"}
            </p>

            {/* CTA */}
            <div style={{
              padding: "0.6rem 1.5rem",
              borderRadius: "20px",
              background: `linear-gradient(90deg, ${branding.accentColor}, ${branding.secondaryColor})`,
              color: "#fff",
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              boxShadow: `0 0 15px ${branding.accentColor}44`,
              textAlign: "center"
            }}>
              {branding.outroMessage || "Follow for daily stories."}
            </div>
          </div>
          <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", textAlign: "center" }}>
            This card is automatically appended as a 5-second end screen to all rendered videos.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── AnalyticsView Component ─────────────────────────────────────────────────
function AnalyticsView({ API_BASE }: { API_BASE: string }) {
  const [summaries, setSummaries] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/analytics`);
      if (res.ok) setSummaries(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`${API_BASE}/api/analytics/sync`, { method: "POST" });
      if (res.ok) {
        await fetchAnalytics();
        setLastSynced(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  const totalViews = summaries.reduce((sum, s) => sum + parseInt(s.views || "0"), 0);
  const totalLikes = summaries.reduce((sum, s) => sum + parseInt(s.likes || "0"), 0);
  const totalComments = summaries.reduce((sum, s) => sum + parseInt(s.comments || "0"), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      
      {/* Top Header Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 800 }}>📊 YouTube Channel Performance</h2>
          <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>Stats are pulled from your live YouTube uploads</p>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {lastSynced && (
            <span style={{ fontSize: "0.75rem", color: "hsl(var(--accent-emerald))", fontWeight: 600 }}>
              Last synced: {lastSynced}
            </span>
          )}
          <button className="btn" onClick={handleSync} disabled={isSyncing}>
            {isSyncing ? "🔄 Syncing with YouTube..." : "⚡ Sync Real-time Stats"}
          </button>
        </div>
      </div>

      {/* Aggregate Stats Cards */}
      <div className="metrics-grid">
        <div className="metric-card" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.05) 0%, rgba(255,255,255,0.01) 100%)" }}>
          <span className="metric-title">Aggregate Views</span>
          <span className="metric-value" style={{ color: "#3b82f6" }}>{totalViews.toLocaleString()}</span>
          <span className="metric-trend up">📈 Across all uploads</span>
        </div>
        <div className="metric-card" style={{ background: "linear-gradient(135deg, rgba(236,72,153,0.05) 0%, rgba(255,255,255,0.01) 100%)" }}>
          <span className="metric-title">Aggregate Likes</span>
          <span className="metric-value" style={{ color: "#ec4899" }}>{totalLikes.toLocaleString()}</span>
          <span className="metric-trend up">❤️ Positive feedback</span>
        </div>
        <div className="metric-card" style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.05) 0%, rgba(255,255,255,0.01) 100%)" }}>
          <span className="metric-title">Aggregate Comments</span>
          <span className="metric-value" style={{ color: "#f59e0b" }}>{totalComments.toLocaleString()}</span>
          <span className="metric-trend up">💬 Viewer comments</span>
        </div>
      </div>

      {/* Video Statistics Table */}
      <div className="panel">
        <h3 className="panel-title">Video Performance Breakdown</h3>
        
        {summaries.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "hsl(var(--text-muted))" }}>
            No YouTube analytics recorded yet. Sync stats above or upload videos to track views.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--border))", color: "hsl(var(--text-muted))" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>Video Name</th>
                  <th style={{ padding: "0.75rem 1rem" }}>YouTube ID</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Views</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Likes</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Comments</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Link</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.01)"} onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                    <td style={{ padding: "1rem", fontWeight: 600, color: "#fff" }}>{s.videoTitle}</td>
                    <td style={{ padding: "1rem", fontFamily: "monospace", fontSize: "0.78rem" }}>{s.youtube_video_id}</td>
                    <td style={{ padding: "1rem", textAlign: "right", fontWeight: 700, color: "#3b82f6" }}>{s.views.toLocaleString()}</td>
                    <td style={{ padding: "1rem", textAlign: "right", color: "#ec4899" }}>{s.likes.toLocaleString()}</td>
                    <td style={{ padding: "1rem", textAlign: "right", color: "#f59e0b" }}>{s.comments.toLocaleString()}</td>
                    <td style={{ padding: "1rem", textAlign: "center" }}>
                      {s.youtubeUrl ? (
                        <a href={s.youtubeUrl} target="_blank" rel="noopener noreferrer" style={{ color: "hsl(var(--accent-purple))", textDecoration: "none", fontWeight: 600 }}>Watch 🎬</a>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SchedulesView Component ─────────────────────────────────────────────────
function SchedulesView({ API_BASE, videos, onRefresh }: { API_BASE: string; videos: Video[]; onRefresh: () => void }) {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [isCancelling, setIsCancelling] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/schedules`);
      if (res.ok) setSchedules(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleCancelSchedule = async (videoId: string) => {
    if (!window.confirm("Are you sure you want to cancel the schedule for this video?")) return;
    setIsCancelling(videoId);
    try {
      const res = await fetch(`${API_BASE}/api/videos/${videoId}/schedule`, { method: "DELETE" });
      if (res.ok) {
        await fetchSchedules();
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCancelling(null);
    }
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      
      {/* Overview */}
      <div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 800 }}>📅 Publish Schedules</h2>
        <p style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>Manage your auto-posting schedule queue for consistent algorithmic growth</p>
      </div>

      {/* Week Calendar Queue */}
      <div className="panel">
        <h3 className="panel-title">Weekly Queue (Next 7 Days)</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "1rem" }}>
          {weekDays.map((day, idx) => {
            const dateOnlyStr = day.toISOString().split("T")[0];
            
            const scheduledOnDay = schedules.filter(s => {
              const sDate = new Date(s.publish_at).toISOString().split("T")[0];
              return sDate === dateOnlyStr;
            });

            const isToday = idx === 0;

            return (
              <div 
                key={idx} 
                style={{
                  background: isToday ? "rgba(168,85,247,0.06)" : "rgba(255,255,255,0.01)",
                  border: isToday ? "1.5px solid hsl(var(--accent-purple))" : "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  padding: "0.75rem",
                  minHeight: "150px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "0.25rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: isToday ? "hsl(var(--accent-purple))" : "hsl(var(--text-secondary))" }}>
                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))" }}>
                    {day.getDate()}
                  </span>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1, overflowY: "auto" }}>
                  {scheduledOnDay.map((s, sidx) => (
                    <div 
                      key={sidx} 
                      style={{
                        padding: "0.3rem 0.5rem",
                        background: "rgba(255,255,255,0.03)",
                        border: `1px solid ${s.status === 'published' ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: "4px",
                        fontSize: "0.7rem",
                        lineHeight: 1.25,
                      }}
                      title={`${s.video_title}\nPublishing at: ${new Date(s.publish_at).toLocaleTimeString()}`}
                    >
                      <div style={{ fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.video_title}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6rem", color: "hsl(var(--text-muted))", marginTop: "0.15rem" }}>
                        <span>{new Date(s.publish_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span style={{ color: s.status === 'published' ? '#22c55e' : s.status === 'failed' ? '#ef4444' : '#3b82f6' }}>
                          {s.status}
                        </span>
                      </div>
                    </div>
                  ))}
                  {scheduledOnDay.length === 0 && (
                    <div style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", fontStyle: "italic", textAlign: "center", margin: "auto" }}>
                      Empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Schedules Table */}
      <div className="panel">
        <h3 className="panel-title">Schedules Queue</h3>
        {schedules.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "hsl(var(--text-muted))" }}>
            No scheduled publishes. Approve and schedule a video from the studio library!
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--border))", color: "hsl(var(--text-muted))" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>Video Title</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Scheduled Publishing Time</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Status</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td style={{ padding: "1rem", fontWeight: 600, color: "#fff" }}>{s.video_title}</td>
                    <td style={{ padding: "1rem" }}>{new Date(s.publish_at).toLocaleString()}</td>
                    <td style={{ padding: "1rem" }}>
                      <span style={{
                        padding: "0.25rem 0.5rem",
                        borderRadius: "4px",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        backgroundColor: s.status === 'published' ? 'rgba(16,185,129,0.15)' : s.status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                        color: s.status === 'published' ? '#10b981' : s.status === 'failed' ? '#ef4444' : '#3b82f6',
                      }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ padding: "1rem", textAlign: "right" }}>
                      {s.status === 'pending' ? (
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => handleCancelSchedule(s.video_id)}
                          disabled={isCancelling === s.video_id}
                          style={{
                            padding: "0.3rem 0.75rem",
                            fontSize: "0.75rem",
                            backgroundColor: "rgba(239,68,68,0.1)",
                            borderColor: "rgba(239,68,68,0.2)",
                            color: "#ef4444"
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.2)"}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.1)"}
                        >
                          {isCancelling === s.video_id ? "Cancelling..." : "Cancel Schedule"}
                        </button>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [queueStats, setQueueStats] = useState<QueueStats>({ waiting: 0, active: 0, completed: 0, failed: 0 });

  const [activeTab, setActiveTab] = useState<'studio' | 'schedules' | 'analytics' | 'branding'>('studio');

  // Form states
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("Horror Stories");
  const [videoType, setVideoType] = useState("short");
  const [mock, setMock] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useCustomScript, setUseCustomScript] = useState(false);
  const [customScript, setCustomScript] = useState("");
  const [captionsEnabled, setCaptionsEnabled] = useState(true);

  // New voice states for video creator
  const [voiceCatalog, setVoiceCatalog] = useState<any>(null);
  const [language, setLanguage] = useState("en");
  const [ttsProvider, setTtsProvider] = useState("local");
  const [voiceId, setVoiceId] = useState("");
  const [customVoiceEnabled, setCustomVoiceEnabled] = useState(false);

  // Modal states
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [videoDetails, setVideoDetails] = useState<{ video: Video; script: VideoScript | null; assets: VideoAsset[] } | null>(null);
  const [completedMetadata, setCompletedMetadata] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // HITL review modal
  const [reviewVideo, setReviewVideo] = useState<Video | null>(null);
  const [reviewDetails, setReviewDetails] = useState<{ video: Video; script: VideoScript | null; assets: VideoAsset[] } | null>(null);

  // Trending states
  const [trendingTopics, setTrendingTopics] = useState<any[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);

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

  const fetchTrendingTopics = useCallback(async () => {
    setIsLoadingTrending(true);
    try {
      const res = await fetch(`${API_BASE}/api/trending-topics`);
      if (res.ok) {
        const data = await res.json();
        setTrendingTopics(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch trending topics:", err);
    } finally {
      setIsLoadingTrending(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
    fetchQueueStats();
    fetchTrendingTopics();
    const interval = setInterval(() => { fetchVideos(); fetchQueueStats(); }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Voice catalog
  useEffect(() => {
    fetch(`${API_BASE}/api/voices`)
      .then((res) => res.json())
      .then((data) => setVoiceCatalog(data))
      .catch(() => {});
  }, []);

  const handleDeleteVideo = async (id: string, videoTitle: string) => {
    if (!window.confirm(`Are you sure you want to delete "${videoTitle}"? This will permanently delete the database record and all associated files.`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/videos/${id}`, { method: "DELETE" });
      if (res.ok) {
        setVideos((prev) => prev.filter((vid) => vid.id !== id));
        if (selectedVideo?.id === id) {
          setSelectedVideo(null);
        }
        if (reviewVideo?.id === id) {
          setReviewVideo(null);
        }
        alert("Video deleted successfully.");
      } else {
        const data = await res.json();
        alert(`Delete failed: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  const handleDownloadVideo = async (vid: Video) => {
    const slug = slugify(vid.title);
    const videoUrl = `${API_BASE}/assets/${slug}/final.mp4`;
    try {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error("Failed to fetch video file from asset server.");
      
      const blob = await response.blob();
      
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `${slug}.mp4`,
          types: [{
            description: 'Video File',
            accept: { 'video/mp4': ['.mp4'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        alert("Video saved successfully to your chosen folder!");
      } else {
        // Fallback for browsers not supporting File System Access API
        const link = document.createElement("a");
        link.href = videoUrl;
        link.download = `${slug}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled the file picker
        return;
      }
      console.error("Download failed:", err);
      alert(`Download failed: ${err.message}`);
    }
  };

  // Helper to filter voices based on provider & language
  const getMatchingVoices = (provider: string, lang: string) => {
    if (!voiceCatalog) return [];
    const catalogKey = provider === "local" ? "kokoro" : (provider === "cloud" ? "elevenlabs" : provider);
    const list = voiceCatalog[catalogKey] || [];
    if (catalogKey === "elevenlabs") return list;
    return list.filter((v: any) => v.lang === lang);
  };

  const matchingVoices = getMatchingVoices(ttsProvider, language);

  useEffect(() => {
    // If language is hindi, local (kokoro) is invalid, automatically switch to edge
    if (language === "hi" && ttsProvider === "local") {
      setTtsProvider("edge");
    }
  }, [language]);

  useEffect(() => {
    if (matchingVoices.length > 0) {
      const exists = matchingVoices.some((v: any) => v.id === voiceId);
      if (!exists) {
        setVoiceId(matchingVoices[0].id);
      }
    }
  }, [ttsProvider, language, matchingVoices, voiceId]);

  useEffect(() => {
    if (!selectedVideo) { 
      setVideoDetails(null); 
      setCompletedMetadata(null); 
      return; 
    }
    const fetch_ = async () => {
      setIsLoadingDetails(true);
      try {
        const res = await fetch(`${API_BASE}/api/videos/${selectedVideo.id}`);
        if (res.ok) setVideoDetails(await res.json());

        const metaRes = await fetch(`${API_BASE}/api/videos/${selectedVideo.id}/metadata`);
        if (metaRes.ok) {
          const metaData = await metaRes.json();
          setCompletedMetadata(metaData);
        }
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
    let finalTitle = title.trim();
    if (useCustomScript && !finalTitle && customScript.trim()) {
      // Try to extract title from custom script e.g. "Title: The Shadows of Bhangarh"
      const match = customScript.match(/Title:\s*([^\n]+)/i);
      if (match && match[1]) {
        finalTitle = match[1].trim();
      } else {
        // Fallback to first 5 words
        finalTitle = customScript.trim().split(/\s+/).slice(0, 5).join(" ");
      }
    }

    if (!finalTitle) {
      alert("Please enter a Video Title or paste a script that starts with 'Title: [Your Title]'");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: finalTitle,
          topic,
          mock,
          videoType,
          ttsProvider,
          voiceId,
          language,
          useCustomScript,
          customScript: useCustomScript ? customScript : null,
          captionsEnabled,
        }),
      });
      if (res.ok) {
        setTitle("");
        setCustomScript("");
        setUseCustomScript(false);
        fetchVideos();
        fetchQueueStats();
      }
    } finally { setIsSubmitting(false); }
  };

  const handleGenerateTopicSuggestion = () => {
    const suggestions: Record<string, string[]> = {
      "Horror Stories": [
        "The Shadows of Bhangarh Fort",
        "The Witch Hunt of Salem",
        "The Haunting of Bangalore Alley",
        "The Legend of the Bell Witch",
        "The Whispering Woods",
        "The Mystery of the Mary Celeste",
        "The Enfield Poltergeist Case",
        "The Dyatlov Pass Incident"
      ],
      "Spirituality": [
        "The Law of Vibration Explained",
        "How Meditation Rewires the Brain",
        "The Seven Hermetic Principles",
        "The Sacred Geometry of Ancient Temples",
        "The Secret Power of Mantras",
        "Understanding Zen Koans",
        "The Third Eye Awakening",
        "The Secret Teachings of Upanishads"
      ],
      "History": [
        "The Library of Alexandria Collapse",
        "The Shortest War in History",
        "The Secret Rooms of Rome",
        "How the Great Pyramid Was Built",
        "The Mystery of the Roanoke Colony",
        "The Fall of the Aztec Empire",
        "The Secrets of the Knights Templar",
        "The Forgotten Empress of Byzantium"
      ]
    };
    const list = suggestions[topic] || suggestions["Horror Stories"];
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

      {/* ── Navigation Tabs ── */}
      <nav style={{
        display: "flex",
        gap: "0.5rem",
        borderBottom: "1px solid hsl(var(--border))",
        paddingBottom: "0.25rem",
        marginBottom: "0.5rem",
        flexWrap: "wrap"
      }}>
        {[
          { id: 'studio', label: '🎬 Studio', desc: 'Generate & Review' },
          { id: 'schedules', label: '📅 Schedules', desc: 'Auto-publish Queue' },
          { id: 'analytics', label: '📊 Analytics', desc: 'YouTube Stats' },
          { id: 'branding', label: '🎨 Branding', desc: 'Channel Settings' }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              background: activeTab === tab.id ? 'rgba(168, 85, 247, 0.1)' : 'none',
              border: "none",
              borderBottom: activeTab === tab.id ? '3px solid hsl(var(--accent-purple))' : '3px solid transparent',
              color: activeTab === tab.id ? '#fff' : 'hsl(var(--text-secondary))',
              padding: "0.6rem 1.25rem",
              borderRadius: "8px 8px 0 0",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: "0.1rem",
              transition: "all 0.2s ease",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{tab.label}</span>
            <span style={{ fontSize: "0.7rem", color: activeTab === tab.id ? 'rgba(255,255,255,0.5)' : 'hsl(var(--text-muted))' }}>{tab.desc}</span>
          </button>
        ))}
      </nav>

      {/* ── Studio View ── */}
      {activeTab === 'studio' && (
        <>
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

      {/* ── Daily Trending Topics ── */}
      <section className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          🔥 Daily Viral Recommendations
          <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "hsl(var(--text-muted))" }}>
            (Today's Trending Ideas — click to create)
          </span>
        </h2>
        {isLoadingTrending ? (
          <div style={{ display: "flex", gap: "1rem", overflowX: "auto", padding: "0.5rem 0" }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="trending-card-skeleton" style={{ flex: "0 0 250px", height: "130px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)", animation: "shimmer 1.5s infinite" }} />
            ))}
          </div>
        ) : trendingTopics.length === 0 ? (
          <div style={{ padding: "1.5rem", textAlign: "center", color: "hsl(var(--text-muted))", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
            No trending topics generated for today.
          </div>
        ) : (
          <div style={{ display: "flex", gap: "1.25rem", overflowX: "auto", padding: "0.5rem 0", scrollbarWidth: "thin" }}>
            {trendingTopics.map((item, idx) => (
              <div
                key={idx}
                className="trending-card"
                onClick={() => {
                  setTitle(item.title);
                  setTopic(item.category);
                  document.querySelector("aside.panel")?.scrollIntoView({ behavior: "smooth" });
                }}
                style={{
                  flex: "0 0 280px",
                  background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "10px",
                  padding: "1rem",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "0.5rem"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "hsl(var(--accent-purple))";
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(255,255,255,0.01) 100%)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "hsl(var(--border))";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)";
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.25rem" }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "hsl(var(--accent-purple))", textTransform: "uppercase" }}>{item.category}</span>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "hsl(var(--accent-green))", background: "rgba(34,197,94,0.1)", padding: "0.1rem 0.3rem", borderRadius: "4px" }}>
                      📈 {item.estimatedViews >= 1000 ? `${(item.estimatedViews/1000).toFixed(0)}k proj` : `${item.estimatedViews} proj`}
                    </span>
                  </div>
                  <h4 style={{ fontSize: "0.875rem", fontWeight: 700, margin: "0.25rem 0", color: "#fff", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>{item.title}</h4>
                  <p style={{ fontSize: "0.75rem", color: "hsl(var(--text-muted))", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis", margin: 0, lineHeight: 1.4 }}>{item.angle}</p>
                </div>
                {item.reason && (
                  <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.45)", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "0.4rem", marginTop: "0.25rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    💡 {item.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
                 <option value="Horror Stories">Horror Stories 🎃</option>
                 <option value="Spirituality">Spirituality 🧘</option>
                 <option value="History">History 🏛️</option>
               </select>
             </div>
            <div className="form-group">
              <label>Video Format</label>
              <select className="select-input" value={videoType} onChange={(e) => setVideoType(e.target.value)}>
                <option value="short">Short (9:16 Vertical, ~50s)</option>
                <option value="long">Long-form (16:9 Landscape, ~8m)</option>
              </select>
            </div>
            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label>Video Title / Idea</label>
                {!useCustomScript && (
                  <button type="button" onClick={handleGenerateTopicSuggestion} style={{ background: "none", border: "none", color: "hsl(var(--accent-purple))", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                    💡 Generate Idea
                  </button>
                )}
              </div>
              <input 
                type="text" 
                className="input-text" 
                placeholder={useCustomScript ? "e.g. The Shadows of Bhangarh (Optional - script title will be used if empty)" : "e.g. Why Nokia Lost Everything"} 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                required={!useCustomScript} 
              />
            </div>

            {/* AI Script / Custom Script Toggle */}
            <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", border: "1px solid hsl(var(--border))", borderRadius: "8px", padding: "3px", gap: "2px" }}>
              <button
                type="button"
                onClick={() => setUseCustomScript(false)}
                style={{
                  flex: 1,
                  padding: "0.4rem",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  borderRadius: "6px",
                  border: "none",
                  background: !useCustomScript ? "linear-gradient(135deg, hsl(var(--accent-purple)), #6366f1)" : "none",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
              >
                ✨ AI Script
              </button>
              <button
                type="button"
                onClick={() => setUseCustomScript(true)}
                style={{
                  flex: 1,
                  padding: "0.4rem",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  borderRadius: "6px",
                  border: "none",
                  background: useCustomScript ? "linear-gradient(135deg, hsl(var(--accent-purple)), #6366f1)" : "none",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
              >
                ✏️ Custom Script
              </button>
            </div>

            {useCustomScript && (
              <div className="form-group">
                <label>Paste Custom Script Narration</label>
                <textarea
                  className="input-text"
                  placeholder="Paste your custom narration script here. Word count should be strictly under 130 words for Shorts (~50s) or 400 words for long-form."
                  value={customScript}
                  onChange={(e) => setCustomScript(e.target.value)}
                  style={{ minHeight: "100px", padding: "0.5rem", fontSize: "0.75rem", resize: "vertical", fontFamily: "inherit" }}
                  required
                />
              </div>
            )}

            {/* Language Selection */}
            <div className="form-group">
              <label>Narration Language</label>
              <select className="select-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </div>

            {/* TTS Provider Selection */}
            <div className="form-group">
              <label>Text-To-Speech Engine</label>
              <select className="select-input" value={ttsProvider} onChange={(e) => setTtsProvider(e.target.value)}>
                {language === "en" && <option value="local">Kokoro (Local, Free)</option>}
                <option value="edge">Edge TTS (Azure, Free)</option>
                <option value="elevenlabs">ElevenLabs (Cloud, Paid)</option>
              </select>
            </div>

            {/* Voice Selection */}
            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label>Select Narrator Voice</label>
                {ttsProvider === "elevenlabs" && (
                  <button 
                    type="button" 
                    onClick={() => {
                      setCustomVoiceEnabled(!customVoiceEnabled);
                      setVoiceId("");
                    }} 
                    style={{ background: "none", border: "none", color: "hsl(var(--accent-purple))", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}
                  >
                    {customVoiceEnabled ? "📋 List" : "✏️ Custom ID"}
                  </button>
                )}
              </div>
              {customVoiceEnabled && ttsProvider === "elevenlabs" ? (
                <input
                  type="text"
                  className="input-text"
                  placeholder="Paste ElevenLabs Voice ID (e.g. pNInz6obpgDQGcFmaJgB)"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value.trim())}
                  required
                />
              ) : (
                <select className="select-input" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                  {matchingVoices.map((v: any) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                  {matchingVoices.length === 0 && <option value="">No voices available</option>}
                </select>
              )}
            </div>

            {/* Captions Toggle Switch */}
            <div className="form-group" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", display: "flex", background: "rgba(255,255,255,0.02)", border: "1px solid hsl(var(--border))", padding: "0.75rem", borderRadius: "8px" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                📺 Show Captions
              </span>
              <label className="switch" style={{ position: "relative", display: "inline-block", width: "42px", height: "22px" }}>
                <input 
                  type="checkbox" 
                  checked={captionsEnabled} 
                  onChange={(e) => setCaptionsEnabled(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }} 
                />
                <span className="slider" style={{
                  position: "absolute",
                  cursor: "pointer",
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: captionsEnabled ? "hsl(var(--accent-purple))" : "rgba(255,255,255,0.15)",
                  transition: "0.3s",
                  borderRadius: "34px",
                  boxShadow: captionsEnabled ? "0 0 8px hsl(var(--accent-purple))" : "none",
                }}>
                  <span className="slider-knob" style={{
                    position: "absolute",
                    height: "16px",
                    width: "16px",
                    left: captionsEnabled ? "22px" : "3px",
                    bottom: "3px",
                    backgroundColor: "#fff",
                    transition: "0.3s",
                    borderRadius: "50%",
                  }} />
                </span>
              </label>
            </div>

            {/* HITL info box */}
            <div style={{ padding: "0.75rem", background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: "8px", fontSize: "0.75rem", color: "hsl(var(--text-muted))", lineHeight: 1.5 }}>
              👀 <strong style={{ color: "#f97316" }}>Human-in-the-Loop enabled.</strong> The pipeline will pause after generation for your review before rendering begins.
            </div>


            <button 
              type="submit" 
              className="btn" 
              disabled={isSubmitting || (!title.trim() && (!useCustomScript || !customScript.trim()))}
            >
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteVideo(vid.id, vid.title);
                        }}
                        style={{
                          position: "absolute",
                          top: "0.75rem",
                          left: "0.75rem",
                          background: "rgba(239, 68, 68, 0.85)",
                          border: "none",
                          color: "white",
                          width: "28px",
                          height: "28px",
                          borderRadius: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          transition: "all 0.2s",
                          zIndex: 10,
                          fontSize: "0.9rem"
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgb(239, 68, 68)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.85)")}
                        title="Delete Video"
                      >
                        🗑️
                      </button>
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
      </>
      )}

      {/* ── Schedules View ── */}
      {activeTab === 'schedules' && (
        <SchedulesView API_BASE={API_BASE} videos={videos} onRefresh={fetchVideos} />
      )}

      {/* ── Analytics View ── */}
      {activeTab === 'analytics' && (
        <AnalyticsView API_BASE={API_BASE} />
      )}

      {/* ── Branding View ── */}
      {activeTab === 'branding' && (
        <BrandingView API_BASE={API_BASE} />
      )}

      {/* ── HITL Review Modal ── */}
      {reviewVideo && (
        <HitlReviewPanel
          video={reviewVideo}
          details={reviewDetails}
          voiceCatalog={voiceCatalog}
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
                    
                    {selectedVideo.status === "completed" && (
                      <div style={{ marginTop: "1rem", borderTop: "1px dashed hsl(var(--border))", paddingTop: "1rem" }}>
                        <h4 style={{ fontSize: "0.75rem", fontWeight: 700, color: "hsl(var(--text-muted))", textTransform: "uppercase", marginBottom: "0.5rem" }}>📅 Posting Schedule</h4>
                        <VideoScheduler videoId={selectedVideo.id} API_BASE={API_BASE} onScheduled={fetchVideos} />
                      </div>
                    )}

                    {completedMetadata && (
                      <div style={{ marginTop: "1.25rem", background: "rgba(255,255,255,0.02)", border: "1px solid hsl(var(--border))", borderRadius: "8px", padding: "1rem" }}>
                        <h4 style={{ fontSize: "0.75rem", fontWeight: 700, color: "hsl(var(--accent-purple))", textTransform: "uppercase", marginBottom: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>📺 Generated YouTube Info</span>
                          <span style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "none" }}>Ready to upload</span>
                        </h4>

                        {/* Title Copy Card */}
                        <div style={{ marginBottom: "0.75rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
                            <label style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", fontWeight: 600 }}>Optimized Title</label>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(completedMetadata.title || "");
                                alert("Title copied to clipboard!");
                              }}
                              style={{ background: "none", border: "none", color: "hsl(var(--accent-purple))", fontSize: "0.65rem", cursor: "pointer", padding: 0 }}
                            >
                              📋 Copy
                            </button>
                          </div>
                          <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "4px", padding: "0.4rem 0.6rem", fontSize: "0.8rem", color: "#fff", wordBreak: "break-word" }}>
                            {completedMetadata.title}
                          </div>
                        </div>

                        {/* Description Copy Card */}
                        <div style={{ marginBottom: "0.75rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
                            <label style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", fontWeight: 600 }}>Description</label>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(completedMetadata.description || "");
                                alert("Description copied to clipboard!");
                              }}
                              style={{ background: "none", border: "none", color: "hsl(var(--accent-purple))", fontSize: "0.65rem", cursor: "pointer", padding: 0 }}
                            >
                              📋 Copy
                            </button>
                          </div>
                          <pre style={{ margin: 0, whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "4px", padding: "0.5rem 0.6rem", fontSize: "0.75rem", fontFamily: "inherit", color: "#ddd", maxHeight: "150px", overflowY: "auto", wordBreak: "break-word" }}>
                            {completedMetadata.description}
                          </pre>
                        </div>

                        {/* Tags Copy Card */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
                            <label style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", fontWeight: 600 }}>Tags / Keywords</label>
                            <button 
                              onClick={() => {
                                const tagsStr = Array.isArray(completedMetadata.tags) ? completedMetadata.tags.join(", ") : "";
                                navigator.clipboard.writeText(tagsStr);
                                alert("Tags copied to clipboard!");
                              }}
                              style={{ background: "none", border: "none", color: "hsl(var(--accent-purple))", fontSize: "0.65rem", cursor: "pointer", padding: 0 }}
                            >
                              📋 Copy
                            </button>
                          </div>
                          <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "4px", padding: "0.4rem 0.6rem", fontSize: "0.75rem", color: "#ccc", wordBreak: "break-word" }}>
                            {Array.isArray(completedMetadata.tags) ? completedMetadata.tags.join(", ") : ""}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: "4rem", textAlign: "center", color: "hsl(var(--text-muted))" }}>Could not load details.</div>
            )}

            <div style={{ borderTop: "1px solid hsl(var(--border))", padding: "1.25rem 2rem", display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                className="btn btn-danger"
                onClick={() => handleDeleteVideo(selectedVideo.id, selectedVideo.title)}
                style={{
                  marginRight: "auto",
                  backgroundColor: "rgb(239, 68, 68)",
                  borderColor: "rgb(239, 68, 68)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                🗑️ Delete Video
              </button>
              {selectedVideo.status === "completed" && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleDownloadVideo(selectedVideo)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    padding: "0.5rem 1rem",
                    borderRadius: "6px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  📥 Save to Folder
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setSelectedVideo(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
