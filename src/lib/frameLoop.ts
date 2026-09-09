/**
 * A fixed-rate loop that keeps running while its page sits in a background tab.
 *
 * requestAnimationFrame is suspended outright for hidden documents. That is fatal
 * for a screen recorder: MediaRecorder captures the compositing canvas, so the
 * moment the user tabs away to the thing they are recording, the canvas stops
 * being repainted and the recording freezes on its last frame. Worker timers are
 * not tied to the document's rendering steps, so they keep firing while hidden.
 */

const WORKER_SOURCE = `
let timer = null;
self.onmessage = (e) => {
  const msg = e.data;
  if (msg && msg.type === 'start') {
    if (timer !== null) clearInterval(timer);
    timer = setInterval(() => self.postMessage(0), msg.intervalMs);
  } else if (msg && msg.type === 'stop') {
    if (timer !== null) clearInterval(timer);
    timer = null;
    self.close();
  }
};
`;

export interface FrameLoop {
  stop: () => void;
}

export function startFrameLoop(fps: number, onFrame: () => void): FrameLoop {
  const intervalMs = Math.max(1, Math.round(1000 / fps));
  let stopped = false;

  try {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = () => {
      if (!stopped) onFrame();
    };
    worker.postMessage({ type: 'start', intervalMs });
    return {
      stop: () => {
        stopped = true;
        worker.terminate();
        URL.revokeObjectURL(url);
      },
    };
  } catch {
    // No worker available. A main-thread timer is throttled in background tabs,
    // but it still beats rAF, which stops completely.
    const id = window.setInterval(() => {
      if (!stopped) onFrame();
    }, intervalMs);
    return {
      stop: () => {
        stopped = true;
        window.clearInterval(id);
      },
    };
  }
}
