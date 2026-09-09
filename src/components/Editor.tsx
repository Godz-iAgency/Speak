import { useEffect, useMemo, useRef, useState } from 'react';
import { Timeline } from './Timeline';
import { trimAndExport, remuxForDuration, type Segment } from '../lib/ffmpeg';
import { uploadRecording } from '../lib/upload';
import { firebaseConfigured } from '../lib/firebase';
import { CheckIcon, CopyIcon, DownloadIcon, LinkIcon, PauseIcon, PlayIcon, SparkIcon, TrashIcon } from './icons';

interface EditorProps {
  blob: Blob;
  onDiscard: () => void;
}

function formatTime(s: number) {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function mergeKeepSegments(trimStart: number, trimEnd: number, cuts: Segment[]): Segment[] {
  const sortedCuts = [...cuts].sort((a, b) => a.start - b.start);
  const kept: Segment[] = [];
  let cursor = trimStart;
  for (const cut of sortedCuts) {
    const cs = Math.max(cut.start, trimStart);
    const ce = Math.min(cut.end, trimEnd);
    if (ce <= cursor) continue;
    if (cs > cursor) {
      kept.push({ start: cursor, end: Math.min(cs, trimEnd) });
    }
    cursor = Math.max(cursor, ce);
  }
  if (cursor < trimEnd) {
    kept.push({ start: cursor, end: trimEnd });
  }
  return kept.filter((s) => s.end - s.start > 0.05);
}

export function Editor({ blob, onDiscard }: EditorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [workingBlob, setWorkingBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [cuts, setCuts] = useState<Segment[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportBlob, setExportBlob] = useState<Blob | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // React StrictMode intentionally mounts every component twice in dev to surface
  // exactly this kind of bug — without this guard the remux would run twice
  // concurrently on the shared ffmpeg singleton. It's not cancellable mid-flight,
  // so the guard just makes sure it's only ever started once per recording.
  const remuxStartedRef = useRef(false);

  useEffect(() => {
    if (remuxStartedRef.current) return;
    remuxStartedRef.current = true;
    remuxForDuration(blob)
      .then((fixed) => {
        setWorkingBlob(fixed);
        setVideoUrl(URL.createObjectURL(fixed));
      })
      .catch((err) => {
        // Without ffmpeg there is no trimming and no export, so offer the raw
        // recording rather than an editor whose buttons cannot work.
        setPrepError(err instanceof Error ? err.message : String(err));
        setVideoUrl(URL.createObjectURL(blob));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    return () => {
      if (exportUrl) URL.revokeObjectURL(exportUrl);
    };
  }, [exportUrl]);

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setTrimEnd(v.duration);
  };

  // Stop at the trim point and jump over cut sections so playback previews the
  // finished cut.
  const advancePlayhead = (v: HTMLVideoElement) => {
    if (v.currentTime >= trimEnd) {
      v.pause();
      setIsPlaying(false);
      setCurrentTime(trimEnd);
      return;
    }
    const insideCut = cuts.find((c) => v.currentTime >= c.start && v.currentTime < c.end);
    if (insideCut) {
      v.currentTime = Math.min(insideCut.end, trimEnd);
    }
    setCurrentTime(v.currentTime);
  };

  // rAF gives a smooth playhead and skips cuts within a frame, but it is suspended
  // in background tabs — `timeupdate` is driven by the media clock and keeps working
  // there, so it backs the loop up rather than duplicating it.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (!v) return;
      advancePlayhead(v);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      setCurrentTime(v.currentTime);
      return;
    }
    advancePlayhead(v);
  };

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(t, trimStart), trimEnd);
    setCurrentTime(v.currentTime);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
    } else {
      if (v.currentTime < trimStart || v.currentTime >= trimEnd) {
        v.currentTime = trimStart;
      }
      v.play();
      setIsPlaying(true);
    }
  };

  const keepSegments = useMemo(
    () => mergeKeepSegments(trimStart, trimEnd, cuts),
    [trimStart, trimEnd, cuts],
  );

  const finalDuration = useMemo(
    () => keepSegments.reduce((acc, s) => acc + (s.end - s.start), 0),
    [keepSegments],
  );

  const handleExport = async () => {
    if (!workingBlob) return;
    setExporting(true);
    setExportProgress(0);
    setExportBlob(null);
    setExportUrl(null);
    setExportError(null);
    setShareUrl(null);
    setUploadError(null);
    try {
      const outBlob = await trimAndExport(workingBlob, keepSegments, setExportProgress);
      setExportBlob(outBlob);
      setExportUrl(URL.createObjectURL(outBlob));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const handleGetLink = async () => {
    if (!exportBlob) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    try {
      const id = await uploadRecording(exportBlob, finalDuration, setUploadProgress);
      setShareUrl(`${window.location.origin}/v/${id}`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard permission denied — the link is still visible to copy by hand */
    }
  };

  if (prepError && videoUrl) {
    return (
      <div className="editor">
        <div className="editor-stage">
          <video src={videoUrl} controls className="editor-video" />
        </div>
        <p className="home-error">Couldn't load the video processor ({prepError}).</p>
        <p className="editor-preparing">
          Trimming and MP4 export need it, but your recording is safe. Download it as-is and try again later.
        </p>
        <div className="editor-actions">
          <button className="btn btn-ghost" onClick={onDiscard}>
            <TrashIcon size={16} />
            Record again
          </button>
          <a className="btn btn-primary" href={videoUrl} download="recording.webm">
            <DownloadIcon size={16} />
            Download recording.webm
          </a>
        </div>
      </div>
    );
  }

  if (!videoUrl) {
    return (
      <div className="editor">
        <div className="prep-loading">
          <div className="prep-bar">
            <div className="prep-bar-fill" />
          </div>
          <p className="editor-preparing">Preparing your recording…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      <div className="editor-main">
        <div className="editor-stage">
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onClick={togglePlay}
            className="editor-video"
          />
        </div>

        <div className="editor-controls">
          <button
            className="btn btn-icon btn-icon-accent"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
          </button>
          <span className="editor-time">
            {formatTime(currentTime)} <span>/ {formatTime(duration)}</span>
          </span>
          <span className="editor-final">
            Final length <strong>{formatTime(finalDuration)}</strong>
          </span>
        </div>

        <Timeline
          duration={duration}
          currentTime={currentTime}
          trimStart={trimStart}
          trimEnd={trimEnd}
          cuts={cuts}
          onSeek={seek}
          onTrimStartChange={setTrimStart}
          onTrimEndChange={setTrimEnd}
          onAddCut={(seg) => setCuts((prev) => [...prev, seg])}
          onRemoveCut={(i) => setCuts((prev) => prev.filter((_, idx) => idx !== i))}
        />

        <div className="editor-actions">
          <button className="btn btn-ghost" onClick={onDiscard} disabled={exporting}>
            <TrashIcon size={16} />
            Discard &amp; record again
          </button>
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={exporting || keepSegments.length === 0 || !workingBlob}
          >
            <SparkIcon size={16} />
            {exporting ? `Exporting… ${Math.round(exportProgress * 100)}%` : 'Export MP4'}
          </button>
        </div>
      </div>

      {exportError && <p className="home-error">Export failed: {exportError}</p>}

      {exportUrl && (
        <div className="editor-export-ready">
          <span className="export-ready-head">
            <CheckIcon size={17} />
            Your MP4 is ready
          </span>
          <video src={exportUrl} controls />

          <div className="export-ready-actions">
            <a className="btn btn-secondary" href={exportUrl} download="recording.mp4">
              <DownloadIcon size={16} />
              Download MP4
            </a>
            {!shareUrl && (
              <button
                className="btn btn-primary"
                onClick={handleGetLink}
                disabled={uploading || !firebaseConfigured}
                title={firebaseConfigured ? undefined : 'Storage is not connected on this deployment yet'}
              >
                <LinkIcon size={16} />
                {uploading ? `Uploading… ${Math.round(uploadProgress * 100)}%` : 'Get shareable link'}
              </button>
            )}
          </div>

          {uploadError && <p className="home-error">Couldn't get a link: {uploadError}</p>}

          {shareUrl && (
            <div className="share-link-row">
              <input className="share-link-input" value={shareUrl} readOnly onFocus={(e) => e.target.select()} />
              <button className="btn btn-secondary" onClick={handleCopyLink}>
                {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
