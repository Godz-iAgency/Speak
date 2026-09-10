import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { startFrameLoop, type FrameLoop } from './frameLoop';

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
export type CaptureSurface = NonNullable<MediaTrackSettings['displaySurface']> | '';

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
  webcamStream: MediaStream | null;
  webcamEnabled: boolean;
  captureLabel: string;
  captureSurface: CaptureSurface;
  camPos: CamPosition;
  camSize: CamSizeKey;
  setCamPos: (pos: CamPosition) => void;
  setCamSize: (size: CamSizeKey) => void;
  setExternalOverlayActive: (active: boolean) => void;
  captureCameraFrame: () => string | null;
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
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [captureLabel, setCaptureLabel] = useState('');
  const [captureSurface, setCaptureSurface] = useState<CaptureSurface>('');
  const [camPos, setCamPos] = useState<CamPosition>(DEFAULT_CAM_POS);
  const [camSize, setCamSize] = useState<CamSizeKey>('md');

  const screenStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameLoopRef = useRef<FrameLoop | null>(null);
  const screenVideoElRef = useRef<HTMLVideoElement | null>(null);
  const camVideoElRef = useRef<HTMLVideoElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mixedAudioRef = useRef<MediaStream | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const optsRef = useRef<RecorderOptions>({ includeWebcam: false, includeMic: false });
  const countdownTimerRef = useRef<number | null>(null);
  const externalOverlayRef = useRef(false);
  const cameraFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const sessionRef = useRef(0);
  const busyRef = useRef(false);
  const pausedElapsedRef = useRef(0);

  const cleanupTracks = useCallback(() => {
    sessionRef.current++;
    busyRef.current = false;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    camStreamRef.current = null;
    setWebcamStream(null);
    micStreamRef.current = null;
    screenVideoElRef.current = null;
    camVideoElRef.current = null;
    canvasRef.current = null;
    frameLoopRef.current?.stop();
    frameLoopRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    canvasStreamRef.current?.getTracks().forEach((t) => t.stop());
    canvasStreamRef.current = null;
    mixedAudioRef.current?.getTracks().forEach((t) => t.stop());
    mixedAudioRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    cleanupTracks();
    chunksRef.current = [];
  }, [cleanupTracks]);

  useEffect(() => {
    if (status === 'idle' || status === 'error') return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

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

    if (screenVideo.readyState < 2) return;
    ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);

    if (includeWebcam && !externalOverlayRef.current && camVideoElRef.current && camVideoElRef.current.videoWidth > 0) {
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
  }, []);

  const setExternalOverlayActive = useCallback((active: boolean) => {
    externalOverlayRef.current = active;
  }, []);

  const captureCameraFrame = useCallback(() => {
    const camera = camVideoElRef.current;
    if (!camera || camera.readyState < 2 || camera.videoWidth < 1 || camera.videoHeight < 1) return null;
    const canvas = cameraFrameCanvasRef.current ?? document.createElement('canvas');
    cameraFrameCanvasRef.current = canvas;
    canvas.width = 180;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const side = Math.min(camera.videoWidth, camera.videoHeight);
    const sourceX = (camera.videoWidth - side) / 2;
    const sourceY = (camera.videoHeight - side) / 2;
    context.drawImage(camera, sourceX, sourceY, side, side, 0, 0, 180, 180);
    return canvas.toDataURL('image/webp', 0.68);
  }, []);
  useEffect(() => {
    drawFrameRef.current = drawFrame;
  }, [drawFrame]);

  // 30fps to match both the display capture and canvas.captureStream below, so
  // every composited frame the recorder asks for is a freshly painted one.
  const startCompositing = useCallback((includeWebcam: boolean) => {
    frameLoopRef.current?.stop();
    frameLoopRef.current = startFrameLoop(30, () => drawFrameRef.current(includeWebcam));
  }, []);

  const stopInternal = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const arm = useCallback(
    async (opts: RecorderOptions) => {
      if (busyRef.current || screenStreamRef.current) return;
      busyRef.current = true;
      const session = ++sessionRef.current;
      const checkSession = (stream?: MediaStream) => {
        if (session === sessionRef.current) return;
        stream?.getTracks().forEach((track) => track.stop());
        throw new Error('Setup cancelled');
      };
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
        checkSession(screenStream);
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        setCaptureLabel(screenTrack.label || '');
        setCaptureSurface(screenTrack.getSettings?.().displaySurface || '');

        let camStream: MediaStream | null = null;
        if (opts.includeWebcam) {
          camStream = await navigator.mediaDevices.getUserMedia({ video: true });
          checkSession(camStream);
          camStreamRef.current = camStream;
          setWebcamStream(camStream);
        }

        let micStream: MediaStream | null = null;
        if (opts.includeMic) {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          checkSession(micStream);
          micStreamRef.current = micStream;
        }

        const screenVideo = document.createElement('video');
        screenVideo.srcObject = screenStream;
        screenVideo.muted = true;
        await screenVideo.play();
        checkSession();
        screenVideoElRef.current = screenVideo;

        if (camStream) {
          const camVideo = document.createElement('video');
          camVideo.srcObject = camStream;
          camVideo.muted = true;
          await camVideo.play();
          checkSession();
          camVideoElRef.current = camVideo;
        }

        const canvas = document.createElement('canvas');
        const width = screenVideo.videoWidth || 1280;
        const height = screenVideo.videoHeight || 720;
        const scale = Math.min(1, 1920 / width, 1080 / height);
        canvas.width = Math.max(2, Math.round(width * scale / 2) * 2);
        canvas.height = Math.max(2, Math.round(height * scale / 2) * 2);
        canvasRef.current = canvas;

        canvasStreamRef.current = canvas.captureStream(30);

        // Compositing runs during setup so the bubble can be positioned against a
        // live picture before anything is captured.
        drawFrame(opts.includeWebcam);
        startCompositing(opts.includeWebcam);

        screenStream.getVideoTracks()[0].onended = () => {
          if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            stopInternal();
          } else {
            cleanupTracks();
            setStatus('idle');
          }
        };

        setElapsedMs(0);
        if (screenStream.getVideoTracks()[0].readyState === 'ended') throw new Error('Screen sharing ended. Please choose a screen again.');
        busyRef.current = false;
        setStatus('ready');
      } catch (err) {
        if (session !== sessionRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to start recording');
        setStatus('error');
        cleanupTracks();
      }
    },
    [cleanupTracks, drawFrame, startCompositing, stopInternal],
  );

  const startCapture = useCallback(() => {
    const canvasStream = canvasStreamRef.current;
    const screenStream = screenStreamRef.current;
    if (!canvasStream || !screenStream) return;

    try {
      const audioCtx = audioCtxRef.current;
      if (!audioCtx) throw new Error("Audio could not start. Please try again.");
      if (audioCtx.state === 'suspended') throw new Error('Audio is paused by the browser. Please start recording again.');
      const dest = audioCtx.createMediaStreamDestination();
      mixedAudioRef.current = dest.stream;
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
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        setRecordedBlob(blob);
        setStatus('stopped');
        cleanupTracks();
      };
      recorder.onerror = () => {
        setError('Recording failed. Please try a smaller screen or close other busy apps.');
        if (recorder.state !== 'inactive') recorder.stop();
        else { cleanupTracks(); setStatus('error'); }
      };
      recorderRef.current = recorder;

      recorder.start(250);
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 250);
      setStatus('recording');
    } catch (err) {
      cleanupTracks();
      setError(err instanceof Error ? err.message : 'Could not start recording');
      setStatus('error');
    }
  }, [cleanupTracks]);

  const beginRecording = useCallback(() => {
    if (!canvasStreamRef.current || countdownTimerRef.current || recorderRef.current?.state === 'recording') return;
    const session = sessionRef.current;
    try {
      const audio = new AudioContext();
      audioCtxRef.current = audio;
      void audio.resume().catch(() => {
        if (session !== sessionRef.current) return;
        cleanupTracks();
        setError('Audio could not start. Please try again.');
        setStatus('error');
      });
    } catch (err) {
      cleanupTracks();
      setError(err instanceof Error ? err.message : 'Audio is unavailable');
      setStatus('error');
      return;
    }
    setStatus('countdown');
    setCountdown(3);
    let remaining = 3;
    countdownTimerRef.current = window.setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        window.clearInterval(countdownTimerRef.current!);
        countdownTimerRef.current = null;
        setCountdown(null);
        startCapture();
      } else setCountdown(remaining);
    }, 1000);
  }, [startCapture, cleanupTracks]);

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
      pausedElapsedRef.current = Date.now() - startTimeRef.current;
      setElapsedMs(pausedElapsedRef.current);
      setStatus('paused');
      if (timerRef.current) window.clearInterval(timerRef.current);
    }
  }, []);

  const resume = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'paused') {
      recorderRef.current.resume();
      setStatus('recording');
      const pausedElapsed = pausedElapsedRef.current;
      startTimeRef.current = Date.now() - pausedElapsed;
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 250);
    }
  }, []);

  const reset = useCallback(() => {
    setRecordedBlob(null);
    setStatus('idle');
    setElapsedMs(0);
    setError(null);
    setWebcamEnabled(false);
    setCountdown(null);
    setCaptureLabel('');
    setCaptureSurface('');
    externalOverlayRef.current = false;
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
    webcamStream,
    webcamEnabled,
    captureLabel,
    captureSurface,
    camPos,
    camSize,
    setCamPos,
    setCamSize,
    setExternalOverlayActive,
    captureCameraFrame,
  };
}
