import { useCallback, useRef, useState } from 'react';
import type { Segment } from '../lib/ffmpeg';

interface TimelineProps {
  duration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  cuts: Segment[];
  onSeek: (t: number) => void;
  onTrimStartChange: (t: number) => void;
  onTrimEndChange: (t: number) => void;
  onAddCut: (seg: Segment) => void;
  onRemoveCut: (index: number) => void;
}

const MIN_CUT_DURATION = 0.3;

export function Timeline({
  duration,
  currentTime,
  trimStart,
  trimEnd,
  cuts,
  onSeek,
  onTrimStartChange,
  onTrimEndChange,
  onAddCut,
  onRemoveCut,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragSelect, setDragSelect] = useState<{ start: number; end: number } | null>(null);
  const draggingHandle = useRef<'start' | 'end' | null>(null);
  const selecting = useRef(false);

  const posToTime = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || duration === 0) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const pct = (t: number) => (duration === 0 ? 0 : (t / duration) * 100);

  const downXRef = useRef(0);

  const handlePointerDownTrack = (e: React.PointerEvent) => {
    if (draggingHandle.current) return;
    const t = posToTime(e.clientX);
    selecting.current = true;
    downXRef.current = e.clientX;
    setDragSelect({ start: t, end: t });
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingHandle.current) {
      const t = posToTime(e.clientX);
      if (draggingHandle.current === 'start') {
        onTrimStartChange(Math.min(t, trimEnd - 0.1));
      } else {
        onTrimEndChange(Math.max(t, trimStart + 0.1));
      }
      return;
    }
    if (selecting.current && dragSelect) {
      const t = posToTime(e.clientX);
      setDragSelect({ start: dragSelect.start, end: t });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingHandle.current) {
      draggingHandle.current = null;
      return;
    }
    if (selecting.current && dragSelect) {
      selecting.current = false;
      const start = Math.min(dragSelect.start, dragSelect.end);
      const end = Math.max(dragSelect.start, dragSelect.end);
      const movedPx = Math.abs(e.clientX - downXRef.current);
      if (movedPx < 4) {
        onSeek(posToTime(e.clientX));
      } else if (end - start >= MIN_CUT_DURATION) {
        onAddCut({ start, end });
      }
      setDragSelect(null);
    }
  };

  return (
    <div className="timeline">
      <div
        className="timeline-track"
        ref={trackRef}
        onPointerDown={handlePointerDownTrack}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="timeline-dim-left" style={{ width: `${pct(trimStart)}%` }} />
        <div className="timeline-dim-right" style={{ left: `${pct(trimEnd)}%`, right: 0 }} />

        {cuts.map((c, i) => (
          <div
            key={i}
            className="timeline-cut"
            style={{ left: `${pct(c.start)}%`, width: `${pct(c.end - c.start)}%` }}
          >
            <button
              className="timeline-cut-remove"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onRemoveCut(i)}
              title="Remove this cut"
            >
              ×
            </button>
          </div>
        ))}

        {dragSelect && (
          <div
            className="timeline-selecting"
            style={{
              left: `${pct(Math.min(dragSelect.start, dragSelect.end))}%`,
              width: `${pct(Math.abs(dragSelect.end - dragSelect.start))}%`,
            }}
          />
        )}

        <div className="timeline-playhead" style={{ left: `${pct(currentTime)}%` }} />

        <div
          className="timeline-handle timeline-handle-start"
          style={{ left: `${pct(trimStart)}%` }}
          onPointerDown={(e) => {
            e.stopPropagation();
            draggingHandle.current = 'start';
            (e.target as Element).setPointerCapture(e.pointerId);
          }}
        />
        <div
          className="timeline-handle timeline-handle-end"
          style={{ left: `${pct(trimEnd)}%` }}
          onPointerDown={(e) => {
            e.stopPropagation();
            draggingHandle.current = 'end';
            (e.target as Element).setPointerCapture(e.pointerId);
          }}
        />
      </div>
      <div className="timeline-hint">
        Drag the white handles to trim the ends. Click and drag anywhere in the middle to mark a section to cut out.
      </div>
    </div>
  );
}
