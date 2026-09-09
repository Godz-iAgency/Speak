import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Timeline, type Clip } from './Timeline';
import { trimAndExport, remuxForDuration, cancelExport, isCancellation } from '../lib/ffmpeg';
import { uploadRecording } from '../lib/upload';
import { firebaseConfigured } from '../lib/firebase';
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  LinkIcon,
  PauseIcon,
  PlayIcon,
  SparkIcon,
  SplitIcon,
  TrashIcon,
} from './icons';

interface EditorProps {
  blob: Blob;
  onDiscard: () => void;
}

/** Shortest piece worth keeping when splitting, in seconds. */
const MIN_CLIP = 0.15;

function formatTime(s: number) {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function clipLength(c: Clip) {
  return Math.max(0, c.end - c.start);
}

/** Output time (after cuts/reordering) -> which clip, and where in the source. */
function outputToSource(clips: Clip[], t: number) {
  let acc = 0;
  for (let i = 0; i < clips.length; i++) {
    const len = clipLength(clips[i]);
    if (t < acc + len || i === clips.length - 1) {
      const within = Math.max(0, Math.min(t - acc, len));
      return { index: i, sourceTime: clips[i].start + within };
    }
    acc += len;
  }
  return null;
}

/** The inverse: a position inside clip `index` -> its place on the output timeline. */
function sourceToOutput(clips: Clip[], index: number, sourceTime: number) {
  let acc = 0;
  for (let i = 0; i < index && i < clips.length; i++) acc += clipLength(clips[i]);
  const clip = clips[index];
  if (!clip) return acc;
  return acc + Math.max(0, Math.min(sourceTime - clip.start, clipLength(clip)));
}

export function Editor({ blob, onDiscard }: EditorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [workingBlob, setWorkingBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  /** Real aspect ratio of the recording, used to size the stage to fill the screen. */
  const [aspect, setAspect] = useState(16 / 9);
  /** Full length of the underlying recording, in seconds — the outer bound clips can trim within. */
  const [sourceDuration, setSourceDuration] = useState(0);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  /** Which clip playback is currently inside; playback walks clips in order. */
  const playIndexRef = useRef(0);
  const clipSeq = useRef(0);
  const [exporting, setExporting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportBlob, setExportBlob] = useState<Blob | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const alive = useRef(false);
  const ownsExport = useRef(false);
  const uploadAbort = useRef<AbortController | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (ownsExport.current) cancelExport();
      uploadAbort.current?.abort();
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const remuxRef = useRef<{ blob: Blob; promise: Promise<Blob> } | null>(null);
  const [exportDuration, setExportDuration] = useState(0);
  useEffect(() => {
    let active = true;
    if (remuxRef.current?.blob !== blob) remuxRef.current = { blob, promise: remuxForDuration(blob) };
    remuxRef.current.promise.then((fixed) => {
      if (!active) return;
      setWorkingBlob(fixed);
      setVideoUrl(URL.createObjectURL(fixed));
    }).catch((err) => {
      if (!active) return;
      setPrepError(err instanceof Error ? err.message : String(err));
      setVideoUrl(URL.createObjectURL(blob));
    });
    return () => { active = false; };
  }, [blob]);

  const invalidateExport = () => {
    setExportBlob(null);
    setExportUrl(null);
    setShareUrl(null);
  };

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
    if (!v || !Number.isFinite(v.duration)) return;
    if (v.videoWidth > 0 && v.videoHeight > 0) setAspect(v.videoWidth / v.videoHeight);
    setSourceDuration(v.duration);
    setClips([{ id: `c${clipSeq.current++}`, start: 0, end: v.duration }]);
  };

  const totalDuration = useMemo(() => clips.reduce((acc, c) => acc + clipLength(c), 0), [clips]);

  // Playback walks the clips in their current order, jumping the source video to
  // the next clip's start whenever it runs off the end of the current one. That
  // is what makes cuts close up and reordered pieces play back in their new order.
  const advancePlayhead = useCallback((v: HTMLVideoElement) => {
    const idx = playIndexRef.current;
    const clip = clips[idx];
    if (!clip) return;

    if (v.currentTime >= clip.end - 0.03) {
      const next = idx + 1;
      if (next >= clips.length) {
        v.pause();
        setIsPlaying(false);
        setCurrentTime(totalDuration);
        return;
      }
      playIndexRef.current = next;
      v.currentTime = clips[next].start;
      setCurrentTime(sourceToOutput(clips, next, clips[next].start));
      return;
    }

    if (v.currentTime < clip.start - 0.03) {
      v.currentTime = clip.start;
      return;
    }

    setCurrentTime(sourceToOutput(clips, idx, v.currentTime));
  }, [clips, totalDuration]);

  // rAF gives a smooth playhead and catches clip boundaries within a frame, but it
  // is suspended in background tabs — `timeupdate` is driven by the media clock and
  // keeps working there, so it backs the loop up rather than duplicating it.
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
  }, [isPlaying, advancePlayhead]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) return;
    advancePlayhead(v);
  };

  /** Seek by OUTPUT time, mapping back onto whichever clip covers it. */
  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v || clips.length === 0) return;
    const clamped = Math.max(0, Math.min(t, totalDuration));
    const hit = outputToSource(clips, clamped);
    if (!hit) return;
    playIndexRef.current = hit.index;
    v.currentTime = hit.sourceTime;
    setCurrentTime(clamped);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || clips.length === 0 || exporting || uploading) return;
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
      return;
    }
    // Restart from the top if the playhead is parked at the end.
    if (currentTime >= totalDuration - 0.05) {
      playIndexRef.current = 0;
      v.currentTime = clips[0].start;
      setCurrentTime(0);
    }
    void v.play().then(() => setIsPlaying(true)).catch(() => {
      setIsPlaying(false);
      setExportError('Playback could not start. Try pressing Play again.');
    });
  };

  const splitAtPlayhead = () => {
    const hit = outputToSource(clips, currentTime);
    if (!hit) return;
    const clip = clips[hit.index];
    // Refuse splits that would leave a sliver too short to be useful.
    if (hit.sourceTime - clip.start < MIN_CLIP || clip.end - hit.sourceTime < MIN_CLIP) return;
    const left: Clip = { id: `c${clipSeq.current++}`, start: clip.start, end: hit.sourceTime };
    const right: Clip = { id: `c${clipSeq.current++}`, start: hit.sourceTime, end: clip.end };
    const next = clips.flatMap((c, i) => (i === hit.index ? [left, right] : [c]));
    invalidateExport();
    setClips(next);
    seekWithin(next, currentTime);
    setSelectedClipId(right.id);
  };

  const deleteClip = (id: string) => {
    const next = clips.filter((c) => c.id !== id);
    invalidateExport();
    setClips(next);
    if (selectedClipId === id) setSelectedClipId(null);
    const nextTotal = next.reduce((acc, c) => acc + clipLength(c), 0);
    // Pull the playhead back inside what's left so it never points past the end.
    seekWithin(next, Math.min(currentTime, nextTotal));
  };

  const reorderClips = (from: number, to: number) => {
    const next = [...clips];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    invalidateExport();
    setClips(next);
    seekWithin(next, currentTime);
  };

  /** Drag an edge handle in/out. Clamps to the source recording's bounds and a minimum clip length. */
  const trimClip = (id: string, edge: 'start' | 'end', sourceTime: number) => {
    const next = clips.map((c) => {
      if (c.id !== id) return c;
      if (edge === 'start') {
        return { ...c, start: Math.max(0, Math.min(sourceTime, c.end - MIN_CLIP)) };
      }
      return { ...c, end: Math.min(sourceDuration, Math.max(sourceTime, c.start + MIN_CLIP)) };
    });
    invalidateExport();
    setClips(next);
    seekWithin(next, currentTime);
  };

  /** Re-point the video at an output time against a specific clip list. */
  const seekWithin = (list: Clip[], t: number) => {
    const v = videoRef.current;
    if (!v || list.length === 0) {
      v?.pause();
      setIsPlaying(false);
      setCurrentTime(0);
      return;
    }
    const total = list.reduce((acc, c) => acc + clipLength(c), 0);
    const clamped = Math.max(0, Math.min(t, total));
    const hit = outputToSource(list, clamped);
    if (!hit) return;
    playIndexRef.current = hit.index;
    v.currentTime = hit.sourceTime;
    setCurrentTime(clamped);
  };

  // Clips already are the keep-segments, in output order, so export concatenates
  // them exactly as the timeline shows them.
  const keepSegments = useMemo(
    () => clips.filter((c) => clipLength(c) > 0.05).map((c) => ({ start: c.start, end: c.end })),
    [clips],
  );

  const handleExport = async () => {
    if (!workingBlob || exporting || uploading) return;
    videoRef.current?.pause();
    setIsPlaying(false);
    setExporting(true);
    setCancelling(false);
    setExportProgress(0);
    setExportBlob(null);
    setExportUrl(null);
    setExportError(null);
    setShareUrl(null);
    setUploadError(null);
    ownsExport.current = true;
    try {
      const outBlob = await trimAndExport(workingBlob, keepSegments, setExportProgress);
      if (!alive.current) return;
      setExportDuration(totalDuration);
      setExportBlob(outBlob);
      setExportUrl(URL.createObjectURL(outBlob));
    } catch (err) {
      // A cancel is something the user asked for, so it isn't reported as a failure.
      if (alive.current && !isCancellation(err)) setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      ownsExport.current = false;
      if (alive.current) {
        setExporting(false);
        setCancelling(false);
        setExportProgress(0);
      }
    }
  };

  const handleCancelExport = () => {
    setCancelling(true);
    cancelExport();
  };

  const handleGetLink = async () => {
    if (!exportBlob || uploading || exporting) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    uploadAbort.current = new AbortController();
    try {
      const id = await uploadRecording(exportBlob, exportDuration, setUploadProgress, uploadAbort.current.signal);
      if (!alive.current) return;
      setShareUrl(`${window.location.origin}/v/${id}`);
    } catch (err) {
      if (alive.current) setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      uploadAbort.current = null;
      if (alive.current) setUploading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      if (!alive.current) return;
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
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
      <div className="editor-main" style={{ '--ar': aspect } as React.CSSProperties}>
        <div className="editor-stage">
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => {
              const v = videoRef.current;
              if (!v) return;
              if (playIndexRef.current + 1 < clips.length) {
                const index = ++playIndexRef.current;
                v.currentTime = clips[index].start;
                void v.play().catch(() => setIsPlaying(false));
              } else { setIsPlaying(false); setCurrentTime(totalDuration); }
            }}
            onClick={togglePlay}
            className="editor-video"
          />
        </div>

        <fieldset className="editor-edit-tools" disabled={exporting || uploading}>
          <div className="editor-controls">
            <button
              className="btn btn-icon btn-icon-accent"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
            </button>
            <span className="editor-time">
              {formatTime(currentTime)} <span>/ {formatTime(totalDuration)}</span>
            </span>
            <button
              className="btn btn-secondary btn-small"
              onClick={splitAtPlayhead}
              disabled={clips.length === 0}
              title="Cut the video in two at the playhead"
            >
              <SplitIcon size={15} />
              Split
            </button>
            <button
              className="btn btn-secondary btn-small"
              onClick={() => selectedClipId && deleteClip(selectedClipId)}
              disabled={!selectedClipId}
              title="Delete the selected piece"
            >
              <TrashIcon size={15} />
              Delete
            </button>
            <span className="editor-final">
              Final length <strong>{formatTime(totalDuration)}</strong>
            </span>
          </div>

          <Timeline
            clips={clips}
            currentTime={currentTime}
            totalDuration={totalDuration}
            selectedId={selectedClipId}
            onSelect={setSelectedClipId}
            onSeek={seek}
            onDelete={deleteClip}
            onReorder={reorderClips}
            onTrim={trimClip}
            disabled={exporting || uploading}
          />

        </fieldset>
        <div className="editor-actions">
          <button className="btn btn-ghost" onClick={onDiscard} disabled={exporting || uploading}>
            <TrashIcon size={16} />
            Discard &amp; record again
          </button>
          {exporting && (
            <button className="btn btn-ghost" onClick={handleCancelExport} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel export'}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={exporting || uploading || keepSegments.length === 0 || !workingBlob}
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
