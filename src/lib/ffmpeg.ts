import { FFmpeg } from '@ffmpeg/ffmpeg';
import coreScriptURL from '@ffmpeg/core?url';
import coreWasmURL from '@ffmpeg/core/wasm?url';

let ffmpegInstance: FFmpeg | null = null;
let loadAbort: AbortController | null = null;
let loadingInstance: FFmpeg | null = null;
let loadGeneration = 0;
let loadPromise: Promise<FFmpeg> | null = null;

// FFmpeg keeps every registered listener forever, so the singleton gets exactly one
// progress listener that forwards to whichever job is currently running.
let progressCallback: ((ratio: number) => void) | null = null;



export function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return Promise.resolve(ffmpegInstance);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const generation = loadGeneration;
    const ffmpeg = new FFmpeg();
    loadingInstance = ffmpeg;
    const urls: string[] = [];
    const abort = new AbortController();
    loadAbort = abort;
    const timeout = setTimeout(() => abort.abort(), 120000);
    const coreURL = async (url: string, type: string) => {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) throw new Error('Could not download the video processor.');
      const data = await response.arrayBuffer();
      if (abort.signal.aborted) throw new Error(EXPORT_CANCELLED);
      return URL.createObjectURL(new Blob([data], { type }));
    };
    ffmpeg.on('progress', ({ progress }) => {
      progressCallback?.(Math.min(1, Math.max(0, progress)));
    });
    try {
      urls.push(await coreURL(coreScriptURL, 'text/javascript'));
      urls.push(await coreURL(coreWasmURL, 'application/wasm'));
      if (generation !== loadGeneration) throw new Error(EXPORT_CANCELLED);
      await ffmpeg.load({ coreURL: urls[0], wasmURL: urls[1] });
      if (generation !== loadGeneration) throw new Error(EXPORT_CANCELLED);
    } catch (err) {
      if (generation === loadGeneration) loadPromise = null;
      ffmpeg.terminate();
      if (generation !== loadGeneration) throw new Error(EXPORT_CANCELLED);
      throw err;
    } finally {
      clearTimeout(timeout);
      if (loadAbort === abort) loadAbort = null;
      urls.forEach((url) => URL.revokeObjectURL(url));
      if (loadingInstance === ffmpeg) loadingInstance = null;
    }
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

export interface Segment {
  start: number;
  end: number;
}

export const EXPORT_CANCELLED = 'EXPORT_CANCELLED';

export function isCancellation(err: unknown): boolean {
  return err instanceof Error && err.message === EXPORT_CANCELLED;
}

let cancelRequested = false;

/**
 * Stops the running export. A wasm exec cannot be interrupted from the outside,
 * so the only way out is to tear the whole worker down — which takes its virtual
 * filesystem with it. The singleton is cleared so the next job loads a fresh one.
 */
export function cancelExport() {
  cancelRequested = true;
  loadGeneration++;
  loadAbort?.abort();
  loadAbort = null;
  const instance = ffmpegInstance ?? loadingInstance;
  loadingInstance = null;
  ffmpegInstance = null;
  loadPromise = null;
  progressCallback = null;
  try {
    instance?.terminate();
  } catch {
    /* worker already gone */
  }
}

// The ffmpeg instance above is a module-wide singleton, so every job shares one
// virtual filesystem. Two jobs racing on the same filenames — e.g. React
// StrictMode's double-mount, or a fast re-record — can have one job's cleanup
// delete a file the other is still reading. A per-call prefix keeps every job's
// files unique so they can never collide.
let opCounter = 0;
function nextOpId(): string {
  opCounter += 1;
  return `op${opCounter}`;
}

// Unique filenames stop jobs clobbering each other's files, but the worker itself
// can still only run one exec at a time — overlapping jobs (a hot reload landing
// mid-remux, or an export fired while one is still finishing) surface as
// "ErrnoError: FS error". Every job goes through this queue so they serialise.
let jobQueue: Promise<unknown> = Promise.resolve();
function runExclusive<T>(job: () => Promise<T>): Promise<T> {
  const result = jobQueue.then(job, job);
  // Swallow failures on the chain itself so one bad job can't poison the queue.
  jobQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Chrome's MediaRecorder writes webm output with an "unknown" duration in the
 * container header (it doesn't know the final length while streaming), which makes
 * <video>.duration read as garbage until something reads every packet. Remuxing
 * through ffmpeg (stream copy, no re-encode) forces a full read and produces a file
 * with a correct duration header.
 */
export function remuxForDuration(blob: Blob): Promise<Blob> {
  return runExclusive(async () => {
    const ffmpeg = await getFFmpeg();
    const id = nextOpId();
    const inputName = `${id}-remux-in.webm`;
    const outputName = `${id}-remux-out.webm`;
    try {
      await ffmpeg.writeFile(inputName, new Uint8Array(await blob.arrayBuffer()));
      await execChecked(ffmpeg, ['-y', '-i', inputName, '-c', 'copy', outputName]);
      const data = await ffmpeg.readFile(outputName);
      return new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/webm' });
    } finally {
      await removeFiles(ffmpeg, [inputName, outputName]);
    }
  });
}

async function execChecked(ffmpeg: FFmpeg, args: string[]) {
  const code = await ffmpeg.exec(args);
  if (code !== 0) throw new Error(`Video processing failed (exit ${code}).`);
}

async function removeFiles(ffmpeg: FFmpeg, names: string[]) {
  for (const name of names) {
    // Nothing to clean up if the step that would have written it never ran.
    await ffmpeg.deleteFile(name).catch(() => {});
  }
}

/**
 * Cuts `blob` down to `keepSegments` and returns an mp4 Blob. Segments are
 * trimmed+re-encoded individually then concatenated **in array order**, so
 * reordering the caller's segments reorders the finished video. Re-encoding is
 * required because the input is inter-frame vp9/webm and cut points are arbitrary.
 */
export function trimAndExport(
  blob: Blob,
  keepSegments: Segment[],
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  return runExclusive(() => trimAndExportInner(blob, keepSegments, onProgress));
}

async function trimAndExportInner(
  blob: Blob,
  keepSegments: Segment[],
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  if (!keepSegments.length || keepSegments.some((s) => !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start)) throw new Error('Select at least one valid clip.');
  cancelRequested = false;
  const ffmpeg = await getFFmpeg();
  if (cancelRequested) throw new Error(EXPORT_CANCELLED);
  let reported = 0;
  const report = (ratio: number) => {
    reported = Math.max(reported, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    onProgress?.(reported);
  };

  const id = nextOpId();
  const inputName = `${id}-input.webm`;
  const listName = `${id}-list.txt`;
  const partNames: string[] = [];
  let outputName = `${id}-output.mp4`;

  // ffmpeg reports progress per exec, so a multi-clip export would otherwise run
  // the bar 0->100% once per clip. Each clip gets a slice of the bar weighted by
  // its duration, since encode time tracks length. The concat pass is a stream
  // copy and near-instant, so it only takes the last sliver — which also stops
  // the bar parking on 100% while there's still work left.
  const totalSeconds = keepSegments.reduce((acc, s) => acc + Math.max(0, s.end - s.start), 0) || 1;
  const ENCODE_SHARE = 0.97;
  let doneSeconds = 0;

  const failIfCancelled = () => {
    if (cancelRequested) throw new Error(EXPORT_CANCELLED);
  };

  try {
    await ffmpeg.writeFile(inputName, new Uint8Array(await blob.arrayBuffer()));
    failIfCancelled();

    for (let i = 0; i < keepSegments.length; i++) {
      const seg = keepSegments[i];
      const segSeconds = Math.max(0, seg.end - seg.start);
      const partName = `${id}-part${i}.mp4`;
      partNames.push(partName);
      progressCallback = (ratio) => {
        report(((doneSeconds + ratio * segSeconds) / totalSeconds) * ENCODE_SHARE);
      };
      await execChecked(ffmpeg, [
        '-y',
        '-ss', seg.start.toFixed(3),
        '-to', seg.end.toFixed(3),
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-movflags', '+faststart',
        '-c:a', 'aac',
        partName,
      ]);
      failIfCancelled();
      doneSeconds += segSeconds;
      report((doneSeconds / totalSeconds) * ENCODE_SHARE);
    }

    progressCallback = null;

    if (partNames.length === 1) {
      outputName = partNames[0];
    } else {
      await ffmpeg.writeFile(listName, partNames.map((n) => `file '${n}'`).join('\n'));
      await execChecked(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', listName, '-c', 'copy', '-movflags', '+faststart', outputName]);
      failIfCancelled();
    }

    const data = await ffmpeg.readFile(outputName);
    report(1);
    return new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
  } catch (err) {
    // Terminating the worker rejects whatever was in flight with its own error.
    // Report that as the cancellation it actually was, not as a failure.
    if (cancelRequested) throw new Error(EXPORT_CANCELLED);
    throw err;
  } finally {
    progressCallback = null;
    // A cancelled job's filesystem died with the worker, and calling into a
    // terminated instance throws.
    if (!cancelRequested) {
      await removeFiles(ffmpeg, [...new Set([inputName, listName, outputName, ...partNames])]);
    }
  }
}
