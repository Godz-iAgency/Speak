import { useEffect, useRef } from 'react';
import { RecordingBar } from './RecordingBar';

interface FloatingRecorderProps {
  stream: MediaStream | null;
  elapsedMs: number;
  isPaused: boolean;
  countdown: number | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onCancel: () => void;
}

export function FloatingRecorder({ stream, elapsedMs, isPaused, countdown, onPause, onResume, onStop, onCancel }: FloatingRecorderProps) {
  const video = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = stream;
    void element.play().catch(() => {});
    return () => { element.srcObject = null; };
  }, [stream]);

  return <div className={`floating-recorder ${stream ? 'floating-recorder-camera' : ''}`}>
    {stream && <video ref={video} muted autoPlay playsInline aria-label="Live camera preview"/>}
    {countdown !== null
      ? <div className="floating-countdown"><strong>{countdown}</strong><span>Starting…</span><button className="btn btn-small" onClick={onCancel}>Cancel</button></div>
      : <RecordingBar elapsedMs={elapsedMs} isPaused={isPaused} onPause={onPause} onResume={onResume} onStop={onStop}/>
    }
  </div>;
}
