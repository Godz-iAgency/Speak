import { useEffect, useRef, useState } from 'react';

export interface Clip {
  id: string;
  /** Start time in the ORIGINAL recording, in seconds. */
  start: number;
  /** End time in the original recording, in seconds. */
  end: number;
}

interface TimelineProps {
  clips: Clip[];
  /** Playhead position in OUTPUT time (i.e. after cuts and reordering). */
  currentTime: number;
  totalDuration: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSeek: (outputTime: number) => void;
  onDelete: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  /** Drag an edge handle in/out. `sourceTime` is the raw, unclamped drag result. */
  onTrim: (id: string, edge: 'start' | 'end', sourceTime: number) => void;
}

function clipLength(c: Clip) {
  return Math.max(0, c.end - c.start);
}

function formatLen(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${s.toFixed(1)}s`;
}

const DRAG_THRESHOLD = 5;

export function Timeline({
  clips,
  currentTime,
  totalDuration,
  selectedId,
  onSelect,
  onSeek,
  onDelete,
  onReorder,
  onTrim,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [trimming, setTrimming] = useState(false);

  const press = useRef<{ id: string; index: number; x: number; moved: boolean } | null>(null);
  const trim = useRef<{ id: string; edge: 'start' | 'end'; pxPerSec: number; startX: number; initial: number } | null>(
    null,
  );

  // Edge handles crop a clip in/out. Tracked on the window for the same reason
  // reordering is: a fast drag can outrun the handle sliding along with it.
  useEffect(() => {
    if (!trimming) return;

    const onMove = (e: PointerEvent) => {
      const t = trim.current;
      if (!t) return;
      const deltaSeconds = (e.clientX - t.startX) / t.pxPerSec;
      onTrim(t.id, t.edge, t.initial + deltaSeconds);
    };

    const onUp = () => {
      trim.current = null;
      setTrimming(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [trimming, onTrim]);

  const startTrim = (e: React.PointerEvent, clip: Clip, edge: 'start' | 'end') => {
    e.stopPropagation();
    e.preventDefault();
    const blockEl = e.currentTarget.parentElement as HTMLElement | null;
    if (!blockEl) return;
    const rect = blockEl.getBoundingClientRect();
    const pxPerSec = rect.width / Math.max(clipLength(clip), 0.001);
    trim.current = { id: clip.id, edge, pxPerSec, startX: e.clientX, initial: edge === 'start' ? clip.start : clip.end };
    setTrimming(true);
  };

  // Reordering tracks on the window so a fast drag can't outrun the clip element
  // sliding out from under the pointer.
  useEffect(() => {
    if (!draggingId) return;

    const onMove = (e: PointerEvent) => {
      const p = press.current;
      const track = trackRef.current;
      if (!p || !track) return;
      if (!p.moved && Math.abs(e.clientX - p.x) < DRAG_THRESHOLD) return;
      p.moved = true;

      // Which clip is the pointer currently over? Reorder as it passes each one,
      // so the row rearranges live instead of only on drop.
      const blocks = [...track.querySelectorAll('[data-clip-index]')] as HTMLElement[];
      for (const block of blocks) {
        const idx = Number(block.dataset.clipIndex);
        const r = block.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && idx !== p.index) {
          onReorder(p.index, idx);
          p.index = idx;
          break;
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      const p = press.current;
      const track = trackRef.current;
      // A press that never moved is a click: select the clip and scrub to where
      // it was clicked.
      if (p && !p.moved && track && totalDuration > 0) {
        onSelect(p.id);
        const r = track.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        onSeek(ratio * totalDuration);
      }
      press.current = null;
      setDraggingId(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [draggingId, onReorder, onSelect, onSeek, totalDuration]);

  const startPress = (e: React.PointerEvent, clip: Clip, index: number) => {
    press.current = { id: clip.id, index, x: e.clientX, moved: false };
    setDraggingId(clip.id);
  };

  if (clips.length === 0) {
    return (
      <div className="tl">
        <div className="tl-empty">Everything's been cut. Undo a delete or record again.</div>
      </div>
    );
  }

  const playheadPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="tl">
      <div className="tl-track" ref={trackRef}>
        {clips.map((clip, i) => (
          <div
            key={clip.id}
            data-clip-index={i}
            className={[
              'tl-clip',
              selectedId === clip.id ? 'tl-clip-selected' : '',
              draggingId === clip.id ? 'tl-clip-dragging' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ flexGrow: clipLength(clip) }}
            onPointerDown={(e) => startPress(e, clip, i)}
            title="Drag to reorder, click to select"
          >
            <span className="tl-clip-len">{formatLen(clipLength(clip))}</span>
            <button
              className="tl-clip-del"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(clip.id);
              }}
              title="Delete this piece"
              aria-label="Delete this piece"
            >
              ×
            </button>
            {selectedId === clip.id && (
              <>
                <div
                  className="tl-trim-handle tl-trim-handle-left"
                  onPointerDown={(e) => startTrim(e, clip, 'start')}
                  title="Drag to crop in from the start"
                >
                  <span className="tl-trim-bracket">[</span>
                </div>
                <div
                  className="tl-trim-handle tl-trim-handle-right"
                  onPointerDown={(e) => startTrim(e, clip, 'end')}
                  title="Drag to crop in from the end"
                >
                  <span className="tl-trim-bracket">]</span>
                </div>
              </>
            )}
          </div>
        ))}
        <div className="tl-playhead" style={{ left: `${playheadPct}%` }} />
      </div>
      <div className="tl-hint">
        Press <strong>Split</strong> to cut the video at the playhead. Click a piece to select it, drag pieces to
        reorder them, or hit × to delete one and close the gap.
      </div>
    </div>
  );
}
