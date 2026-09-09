import { test, expect, vi, beforeEach } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
const mock = vi.hoisted(() => ({ instances: [] as any[], fail: false, active: 0, max: 0 }));
vi.mock('@ffmpeg/util', () => ({ toBlobURL: vi.fn(async () => 'blob:core') }));
vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: class {
  progress: any; calls: string[][] = []; files: any[] = [];
  constructor() { mock.instances.push(this); }
  on(_event: string, cb: any) { this.progress = cb; }
  async load() {}
  async writeFile(...args: any[]) { this.files.push(args); }
  async exec(args: string[]) {
    this.calls.push(args); mock.active++; mock.max = Math.max(mock.max, mock.active);
    await new Promise(r => setTimeout(r, 2));
    for (const progress of [.8, .3, 1]) this.progress({ progress });
    mock.active--; return mock.fail ? 1 : 0;
  }
  async readFile() { return new Uint8Array([1, 2, 3]); }
  async deleteFile() {}
  terminate() {}
} }));
beforeEach(() => { vi.resetModules(); mock.instances = []; mock.fail = false; mock.max = 0; URL.revokeObjectURL = vi.fn(); URL.createObjectURL = vi.fn(() => "blob:core"); vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }))); });
const blob = () => new NodeBlob(['video']) as unknown as Blob;
test('serializes remux and export, preserves reordered segments, and reports monotonic progress', async () => {
  const api = await import('../src/lib/ffmpeg'); const progress: number[] = [];
  await Promise.all([api.remuxForDuration(blob()), api.trimAndExport(blob(), [{start: 5,end: 8},{start: 1,end: 2}], v => progress.push(v))]);
  expect(mock.max).toBe(1);
  const calls = mock.instances[0].calls.filter((a: string[]) => a.includes('-ss'));
  expect(calls.map((a: string[]) => a[a.indexOf('-ss') + 1])).toEqual(['5.000', '1.000']);
  expect(progress).toEqual([...progress].sort((a,b) => a-b)); expect(progress.at(-1)).toBe(1);
  expect(calls[0]).toContain('yuv420p');
});
test('nonzero ffmpeg exit fails; a failure does not poison the queue', async () => {
  const api = await import('../src/lib/ffmpeg'); mock.fail = true;
  await expect(api.remuxForDuration(blob())).rejects.toThrow('exit 1');
  mock.fail = false; await expect(api.remuxForDuration(blob())).resolves.toBeInstanceOf(Blob);
});
test('rejects empty and invalid segment lists', async () => {
  const api = await import('../src/lib/ffmpeg');
  for (const segments of [[], [{ start: 2, end: 1 }], [{start: NaN,end: 4}]]) await expect(api.trimAndExport(blob(), segments)).rejects.toThrow('valid clip');
});

test('cancellation aborts a core download and the next job can load fresh', async () => {
  const api=await import('../src/lib/ffmpeg');
  vi.stubGlobal('fetch', vi.fn((_url, {signal}) => new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))));
  const pending=api.trimAndExport(blob(),[{start:0,end:1}]);
  const rejected=expect(pending).rejects.toThrow(api.EXPORT_CANCELLED);
  await new Promise(r=>setTimeout(r,5));api.cancelExport();await rejected;
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)})));
  await expect(api.trimAndExport(blob(),[{start:0,end:1}])).resolves.toBeInstanceOf(Blob);
  expect(mock.instances).toHaveLength(2);
});
