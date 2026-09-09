import { PauseIcon, PlayIcon, StopIcon } from './icons';

interface RecordingBarProps {
  elapsedMs: number;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

function formatElapsed(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function RecordingBar({ elapsedMs, isPaused, onPause, onResume, onStop }: RecordingBarProps) {
  return (
    <div className="recording-bar">
      <span className="recording-status">
        <span className={`recording-dot ${isPaused ? 'recording-dot-paused' : ''}`} />
        {isPaused ? 'Paused' : 'Recording'}
      </span>
      <span className="recording-time">{formatElapsed(elapsedMs)}</span>
      <span className="recording-divider" />
      {isPaused ? (
        <button className="btn btn-icon" onClick={onResume} title="Resume" aria-label="Resume">
          <PlayIcon size={16} />
        </button>
      ) : (
        <button className="btn btn-icon" onClick={onPause} title="Pause" aria-label="Pause">
          <PauseIcon size={16} />
        </button>
      )}
      <button className="btn btn-small btn-danger" onClick={onStop}>
        <StopIcon size={13} />
        Stop
      </button>
    </div>
  );
}
