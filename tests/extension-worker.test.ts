import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('companion worker relays state to pages and controls back to Speak', async () => {
  let receive: (message: any, sender: any, respond: (value: unknown) => void) => boolean;
  const sendMessage = vi.fn(async () => ({ ok: true }));
  const storage = { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
  vi.stubGlobal('chrome', {
    storage: { session: storage },
    runtime: { onMessage: { addListener: (listener: typeof receive) => { receive = listener; } } },
    tabs: {
      query: vi.fn(async () => [
        { id: 1, url: 'https://speakrecorder.vercel.app/app' },
        { id: 2, url: 'https://presented.example/demo' },
      ]),
      sendMessage,
      onRemoved: { addListener: vi.fn() },
    },
  });

  await import('../extension/service-worker.js');
  receive!({ channel: 'speak-web', type: 'WEB_READY' }, { url: 'https://speakrecorder.vercel.app/app', tab: { id: 1 } }, () => {});
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({
    channel: 'speak-extension-to-web',
    message: expect.objectContaining({ type: 'EXTENSION_READY' }),
  })));

  const state = { status: 'recording', captureSurface: 'browser', webcamEnabled: true };
  receive!({ channel: 'speak-web', type: 'RECORDER_STATE', state }, { url: 'https://speakrecorder.vercel.app/app', tab: { id: 1 } }, () => {});
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(2, { channel: 'speak-session-state', state }));

  receive!({ channel: 'speak-target', type: 'OVERLAY_STATUS', active: true }, { url: 'https://presented.example/demo', tab: { id: 2 } }, () => {});
  receive!({ channel: 'speak-target', type: 'RECORDER_COMMAND', command: 'pause' }, { url: 'https://presented.example/demo', tab: { id: 2 } }, () => {});
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({
    message: expect.objectContaining({ type: 'RECORDER_COMMAND', command: 'pause' }),
  })));
});
