import { useEffect, useRef, useState } from 'react';
import type { CamPosition, CamSizeKey, CaptureSurface, RecorderStatus } from './useScreenRecorder';

const ACTIVE_STATES = new Set<RecorderStatus>(['ready', 'countdown', 'recording', 'paused']);
const WEB_SOURCE = 'speak-recorder-web';
const EXTENSION_SOURCE = 'speak-recorder-extension';

interface RecorderExtensionOptions {
  status: RecorderStatus;
  elapsedMs: number;
  countdown: number | null;
  webcamEnabled: boolean;
  captureLabel: string;
  captureSurface: CaptureSurface;
  camPos: CamPosition;
  camSize: CamSizeKey;
  captureCameraFrame: () => string | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onPosition: (position: CamPosition) => void;
  onSize: (size: CamSizeKey) => void;
  onOverlayChange: (active: boolean) => void;
}

function post(type: string, payload: object = {}) {
  window.postMessage({ source: WEB_SOURCE, type, ...payload }, window.location.origin);
}

export function useRecorderExtension(options: RecorderExtensionOptions) {
  const [available, setAvailable] = useState(false);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  }, [options]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || message.source !== EXTENSION_SOURCE) return;
      if (message.type === 'EXTENSION_READY') {
        setAvailable(true);
        post('WEB_READY');
      }
      if (message.type === 'OVERLAY_STATUS') latest.current.onOverlayChange(Boolean(message.active));
      if (message.type === 'RECORDER_COMMAND') {
        if (message.command === 'pause') latest.current.onPause();
        if (message.command === 'resume') latest.current.onResume();
        if (message.command === 'stop') latest.current.onStop();
      }
      if (message.type === 'BUBBLE_POSITION' && Number.isFinite(message.xRatio) && Number.isFinite(message.yRatio)) {
        latest.current.onPosition({ xRatio: Math.min(1, Math.max(0, message.xRatio)), yRatio: Math.min(1, Math.max(0, message.yRatio)) });
      }
      if (message.type === 'BUBBLE_SIZE' && ['sm', 'md', 'lg'].includes(message.size)) latest.current.onSize(message.size);
    };
    window.addEventListener('message', receive);
    post('WEB_READY');
    return () => window.removeEventListener('message', receive);
  }, []);

  useEffect(() => {
    post('RECORDER_STATE', {
      state: {
        status: options.status,
        elapsedMs: options.elapsedMs,
        countdown: options.countdown,
        webcamEnabled: options.webcamEnabled,
        captureLabel: options.captureLabel,
        captureSurface: options.captureSurface,
        camPos: options.camPos,
        camSize: options.camSize,
      },
    });
    if (!ACTIVE_STATES.has(options.status)) latest.current.onOverlayChange(false);
  }, [options.status, options.elapsedMs, options.countdown, options.webcamEnabled, options.captureLabel, options.captureSurface, options.camPos, options.camSize]);

  useEffect(() => {
    if (!available || !options.webcamEnabled || !ACTIVE_STATES.has(options.status)) return;
    const sendFrame = () => {
      const frame = latest.current.captureCameraFrame();
      if (frame) post('CAMERA_FRAME', { frame });
    };
    sendFrame();
    const timer = window.setInterval(sendFrame, 125);
    return () => window.clearInterval(timer);
  }, [available, options.status, options.webcamEnabled]);

  return { available };
}
