import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

// FFmpeg keeps every registered listener forever, so the singleton gets exactly one
// progress listener that forwards to whichever job is currently running.
let progressCallback: ((ratio: number) => void) | null = null;

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

export function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return Promise.resolve(ffmpegInstance);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    ffmpeg.on('progress', ({ progress }) => {
      progressCallback?.(Math.min(1, Math.max(0, progress)));
    });
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      });
    } catch (err) {
      loadPromise = null;
      throw err;
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

/**
 * Chrome's MediaRecorder writes webm output with an "unknown" duration in the
 * container header (it doesn't know the final length while streaming), which makes
 * <video>.duration read as garbage until something reads every packet. Remuxing
 * through ffmpeg (stream copy, no re-encode) forces a full read and produces a file
 * with a correct duration header.
 */
export async function remuxForDuration(blob: Blob): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  const id = nextOpId();
  const inputName = `${id}-remux-in.webm`;
  const outputName = `${id}-remux-out.webm`;
  try {
    await ffmpeg.writeFile(inputName, new Uint8Array(await blob.arrayBuffer()));
    await ffmpeg.exec(['-y', '-i', inputName, '-c', 'copy', outputName]);
    const data = await ffmpeg.readFile(outputName);
    return new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/webm' });
  } finally {
    await removeFiles(ffmpeg, [inputName, outputName]);
  }
}

async function removeFiles(ffmpeg: FFmpeg, names: string[]) {
  for (const name of names) {
    // Nothing to clean up if the step that would have written it never ran.
    await ffmpeg.deleteFile(name).catch(() => {});
  }
}

/**
 * Cuts `blob` down to the union of `keepSegments` (already sorted, non-overlapping,
 * in seconds) and returns an mp4 Blob. Each segment is trimmed+re-encoded then
 * concatenated, since input is inter-frame vp9/webm and cut points are arbitrary.
 */
export async function trimAndExport(
  blob: Blob,
  keepSegments: Segment[],
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  progressCallback = onProgress ?? null;

  const id = nextOpId();
  const inputName = `${id}-input.webm`;
  const listName = `${id}-list.txt`;
  const partNames: string[] = [];
  let outputName = `${id}-output.mp4`;

  try {
    await ffmpeg.writeFile(inputName, new Uint8Array(await blob.arrayBuffer()));

    for (let i = 0; i < keepSegments.length; i++) {
      const seg = keepSegments[i];
      const partName = `${id}-part${i}.mp4`;
      await ffmpeg.exec([
        '-y',
        '-ss', seg.start.toFixed(3),
        '-to', seg.end.toFixed(3),
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-c:a', 'aac',
        partName,
      ]);
      partNames.push(partName);
    }

    if (partNames.length === 1) {
      outputName = partNames[0];
    } else {
      await ffmpeg.writeFile(listName, partNames.map((n) => `file '${n}'`).join('\n'));
      await ffmpeg.exec(['-y', '-f', 'concat', '-safe', '0', '-i', listName, '-c', 'copy', outputName]);
    }

    const data = await ffmpeg.readFile(outputName);
    return new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
  } finally {
    progressCallback = null;
    await removeFiles(ffmpeg, [...new Set([inputName, listName, outputName, ...partNames])]);
  }
}
