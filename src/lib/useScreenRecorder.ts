import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type RecorderStatus =
  | 'idle'
  | 'requesting'
  /** Streams are live and previewing, but nothing is being captured yet. */
  | 'ready'
  | 'countdown'
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'error';

export interface RecorderOptions {
  includeWebcam: boolean;
  includeMic: boolean;
}

export type CamSizeKey = 'sm' | 'md' | 'lg';

export interface CamPosition {
  xRatio: number;
  yRatio: number;
}

interface RecorderResult {
  status: RecorderStatus;
  error: string | null;
  elapsedMs: number;
  countdown: number | null;
  /** Acquires the streams and starts previewing — does not capture yet. */
  arm: (opts: RecorderOptions) => Promise<void>;
  /** Runs the countdown, then begins capturing. */
  beginRecording: () => void;
  cancelSetup: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  recordedBlob: Blob | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  webcamEnabled: boolean;
  camPos: CamPosition;
  camSize: CamSizeKey;
  setCamPos: (pos: CamPosition) => void;
  setCamSize: (size: CamSizeKey) => void;
}

// Bubble diameter as a fraction of the shorter canvas dimension, so it scales
// consistently across different screen-share resolutions.
export const CAM_SIZE_FRACTIONS: Record<CamSizeKey, number> = {
  sm: 0.14,
  md: 0.22,
  lg: 0.32,
};

const DEFAULT_CAM_POS: CamPosition = { xRatio: 0.88, yRatio: 0.84 };

export function useScreenRecorder(): RecorderResult {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [webcamEnabled, setWebcamEnabled] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [camPos, setCamPos] = useState<CamPosition>(DEFAULT_CAM_POS);
  const [camSize, setCamSize] = useState<CamSizeKey>('md');

  const screenStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const screenVideoElRef = useRef<HTMLVideoElement | null>(null);
  const camVideoElRef = useRef<HTMLVideoElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const optsRef = useRef<RecorderOptions>({ includeWebcam: false, includeMic: false });
  const countdownTimerRef = useRef<number | null>(null);

  const cleanupTracks = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    camStreamRef.current = null;
    micStreamRef.current = null;
    screenVideoElRef.current = null;
    camVideoElRef.current = null;
    canvasRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    canvasStreamRef.current?.getTracks().forEach((t) => t.stop());
    canvasStreamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  const drawFrameRef = useRef<(includeWebcam: boolean) => void>(() => {});
  const camPosRef = useRef(camPos);
  const camSizeRef = useRef(camSize);
  useEffect(() => {
    camPosRef.current = camPos;
  }, [camPos]);
  useEffect(() => {
    camSizeRef.current = camSize;
  }, [camSize]);

  const drawFrame = useCallback((includeWebcam: boolean) => {
    const canvas = canvasRef.current;
    const screenVideo = screenVideoElRef.current;
    if (!canvas || !screenVideo) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== screenVideo.videoWidth && screenVideo.videoWidth > 0) {
      canvas.width = screenVideo.videoWidth;
      canvas.height = screenVideo.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);

    if (includeWebcam && camVideoElRef.current && camVideoElRef.current.videoWidth > 0) {
      const cam = camVideoElRef.current;
      const minDim = Math.min(canvas.width, canvas.height);
      const size = CAM_SIZE_FRACTIONS[camSizeRef.current] * minDim;
      const radius = size / 2;
      const cx = Math.min(Math.max(camPosRef.current.xRatio * canvas.width, radius), canvas.width - radius);
      const cy = Math.min(Math.max(camPosRef.current.yRatio * canvas.height, radius), canvas.height - radius);
      const x = cx - radius;
      const y = cy - radius;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      const vw = cam.videoWidth;
      const vh = cam.videoHeight;
      const side = Math.min(vw, vh);
      const sx = (vw - side) / 2;
      const sy = (vh - side) / 2;
      ctx.drawImage(cam, sx, sy, side, side, x, y, size, size);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
    }

    rafRef.current = requestAnimationFrame(() => drawFrameRef.current(includeWebcam));
  }, []);
  useEffect(() => {
    drawFrameRef.current = drawFrame;
  }, [drawFrame]);

  const stopInternal = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const arm = useCallback(
    async (opts: RecorderOptions) => {
      setError(null);
      setRecordedBlob(null);
      setStatus('requesting');
      setWebcamEnabled(opts.includeWebcam);
      setCamPos(DEFAULT_CAM_POS);
      setCamSize('md');
      optsRef.current = opts;
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          audio: true,
        });
        screenStreamRef.current = screenStream;

        let camStream: MediaStream | null = null;
        if (opts.includeWebcam) {
          camStream = await navigator.mediaDevices.getUserMedia({ video: true });
          camStreamRef.current = camStream;
        }

        let micStream: MediaStream | null = null;
        if (opts.includeMic) {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = micStream;
        }

        const screenVideo = document.createElement('video');
        screenVideo.srcObject = screenStream;
        screenVideo.muted = true;
        await screenVideo.play();
        screenVideoElRef.current = screenVideo;

        if (camStream) {
          const camVideo = document.createElement('video');
          camVideo.srcObject = camStream;
          camVideo.muted = true;
          await camVideo.play();
          camVideoElRef.current = camVideo;
        }

        const canvas = document.createElement('canvas');
        canvas.width = screenVideo.videoWidth || 1280;
        canvas.height = screenVideo.videoHeight || 720;
        canvasRef.current = canvas;

        canvasStreamRef.current = canvas.captureStream(30);

        // Compositing runs during setup so the bubble can be positioned against a
        // live picture before anything is captured.
        drawFrame(opts.includeWebcam);

        screenStream.getVideoTracks()[0].onended = () => {
          if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            stopInternal();
          } else {
            cleanupTracks();
            setStatus('idle');
          }
        };

        setElapsedMs(0);
        setStatus('ready');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start recording');
        setStatus('error');
        cleanupTracks();
      }
    },
    [cleanupTracks, drawFrame, stopInternal],
  );

  const startCapture = useCallback(() => {
    const canvasStream = canvasStreamRef.current;
    const screenStream = screenStreamRef.current;
    if (!canvasStream || !screenStream) return;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const dest = audioCtx.createMediaStreamDestination();
    let hasAudio = false;
    if (screenStream.getAudioTracks().length > 0) {
      audioCtx.createMediaStreamSource(new MediaStream(screenStream.getAudioTracks())).connect(dest);
      hasAudio = true;
    }
    const micStream = micStreamRef.current;
    if (micStream && micStream.getAudioTracks().length > 0) {
      audioCtx.createMediaStreamSource(new MediaStream(micStream.getAudioTracks())).connect(dest);
      hasAudio = true;
    }

    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...(hasAudio ? dest.stream.getAudioTracks() : []),
    ]);

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';
    const recorder = new MediaRecorder(combined, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedBlob(blob);
      setStatus('stopped');
      cleanupTracks();
    };
    recorderRef.current = recorder;

    recorder.start(250);
    startTimeRef.current = Date.now();
    setElapsedMs(0);
    timerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 250);
    setStatus('recording');
  }, [cleanupTracks]);

  const beginRecording = useCallback(() => {
    setStatus('countdown');
    setCountdown(3);
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          startCapture();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [startCapture]);

  const cancelSetup = useCallback(() => {
    cleanupTracks();
    setCountdown(null);
    setStatus('idle');
  }, [cleanupTracks]);

  const stop = useCallback(() => {
    stopInternal();
  }, [stopInternal]);

  const pause = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.pause();
      setStatus('paused');
      if (timerRef.current) window.clearInterval(timerRef.current);
    }
  }, []);

  const resume = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'paused') {
      recorderRef.current.resume();
      setStatus('recording');
      const pausedElapsed = elapsedMs;
      startTimeRef.current = Date.now() - pausedElapsed;
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 250);
    }
  }, [elapsedMs]);

  const reset = useCallback(() => {
    setRecordedBlob(null);
    setStatus('idle');
    setElapsedMs(0);
    setError(null);
    setWebcamEnabled(false);
    setCountdown(null);
  }, []);

  return {
    status,
    error,
    elapsedMs,
    countdown,
    arm,
    beginRecording,
    cancelSetup,
    stop,
    pause,
    resume,
    reset,
    recordedBlob,
    canvasRef,
    webcamEnabled,
    camPos,
    camSize,
    setCamPos,
    setCamSize,
  };
}
