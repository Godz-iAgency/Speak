import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CAM_SIZE_FRACTIONS, type CamPosition, type CamSizeKey } from '../lib/useScreenRecorder';

interface LivePreviewProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  webcamEnabled: boolean;
  camPos: CamPosition;
  camSize: CamSizeKey;
  onCamPosChange: (pos: CamPosition) => void;
  onCamSizeChange: (size: CamSizeKey) => void;
  countdown: number | null;
  topOverlay?: ReactNode;
  bottomOverlay?: ReactNode;
}

const SIZE_OPTIONS: { key: CamSizeKey; label: string; dot: number }[] = [
  { key: 'sm', label: 'Small camera', dot: 8 },
  { key: 'md', label: 'Medium camera', dot: 12 },
  { key: 'lg', label: 'Large camera', dot: 16 },
];

const PICKER_GAP = 10;

export function LivePreview({
  canvasRef,
  webcamEnabled,
  camPos,
  camSize,
  onCamPosChange,
  onCamSizeChange,
  countdown,
  topOverlay,
  bottomOverlay,
}: LivePreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState({ width: 0, height: 0 });
  const dragging = useRef(false);
  const movedSinceDown = useRef(false);
  const [sizePickerOpen, setSizePickerOpen] = useState(false);

  // The recorder creates a fresh canvas per session — mount it directly so the
  // preview shows exactly what's being composited (screen + webcam).
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.classList.add('live-preview-canvas');
    container.appendChild(canvas);
    return () => {
      if (canvas.parentElement === container) container.removeChild(canvas);
    };
  }, [canvasRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setRect({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleStyle = useMemo(() => {
    if (rect.width === 0 || rect.height === 0) return null;
    const minDim = Math.min(rect.width, rect.height);
    const size = CAM_SIZE_FRACTIONS[camSize] * minDim;
    const radius = size / 2;
    const cx = Math.min(Math.max(camPos.xRatio * rect.width, radius), rect.width - radius);
    const cy = Math.min(Math.max(camPos.yRatio * rect.height, radius), rect.height - radius);
    return { width: size, height: size, left: cx - radius, top: cy - radius };
  }, [rect, camPos, camSize]);

  // Anchors the size popover just below the bubble, flipping above it if there's
  // no room underneath.
  const pickerStyle = useMemo(() => {
    if (!handleStyle || rect.height === 0) return null;
    const centerX = handleStyle.left + handleStyle.width / 2;
    const bubbleBottom = handleStyle.top + handleStyle.height;
    const estimatedHeight = 50;
    const below = bubbleBottom + PICKER_GAP + estimatedHeight <= rect.height;
    return {
      left: centerX,
      top: below ? bubbleBottom + PICKER_GAP : handleStyle.top - PICKER_GAP,
      transform: below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
    };
  }, [handleStyle, rect.height]);

  const updateFromPointer = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const box = container.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const minDim = Math.min(box.width, box.height);
    const radius = (CAM_SIZE_FRACTIONS[camSize] * minDim) / 2;
    const radiusRatioX = radius / box.width;
    const radiusRatioY = radius / box.height;
    const relX = (clientX - box.left) / box.width;
    const relY = (clientY - box.top) / box.height;
    onCamPosChange({
      xRatio: Math.min(Math.max(relX, radiusRatioX), 1 - radiusRatioX),
      yRatio: Math.min(Math.max(relY, radiusRatioY), 1 - radiusRatioY),
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    movedSinceDown.current = false;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    movedSinceDown.current = true;
    setSizePickerOpen(false);
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSizePickerOpen((v) => !v);
  };

  const pickSize = (key: CamSizeKey) => {
    onCamSizeChange(key);
    setSizePickerOpen(false);
  };

  return (
    <div className="live-preview-frame" ref={containerRef} onClick={() => setSizePickerOpen(false)}>
      {webcamEnabled && handleStyle && countdown === null && (
        <div
          className="live-preview-cam-handle"
          style={handleStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          title="Drag to move, double-click to resize"
        />
      )}

      {sizePickerOpen && webcamEnabled && countdown === null && pickerStyle && (
        <div className="cam-size-popover" style={pickerStyle} onClick={(e) => e.stopPropagation()}>
          {SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`cam-dot-btn ${camSize === opt.key ? 'cam-dot-btn-active' : ''}`}
              onClick={() => pickSize(opt.key)}
              title={opt.label}
              aria-label={opt.label}
              aria-pressed={camSize === opt.key}
            >
              <span className="cam-dot" style={{ width: opt.dot, height: opt.dot }} />
            </button>
          ))}
        </div>
      )}

      {topOverlay && <div className="stage-overlay stage-overlay-top">{topOverlay}</div>}

      {countdown !== null && (
        <div className="countdown-overlay">
          <div key={countdown} className="countdown-number">
            {countdown}
          </div>
        </div>
      )}

      {countdown === null && bottomOverlay && (
        <div className="stage-overlay stage-overlay-bottom">{bottomOverlay}</div>
      )}
    </div>
  );
}
