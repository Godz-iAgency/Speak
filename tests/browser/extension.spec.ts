import path from 'node:path';
import { expect, test } from '@playwright/test';

test('companion injects and removes the bubble on a presented browser page', async ({ page }) => {
  await page.route('https://presented.example/**', (route) => route.fulfill({ contentType: 'text/html', body: '<main><h1>Presented page</h1></main>' }));
  await page.addInitScript(() => {
    const listeners: Array<(message: unknown) => void> = [];
    const sent: unknown[] = [];
    Object.defineProperty(window, '__speakExtensionTest', { value: { listeners, sent } });
    Object.defineProperty(window, 'chrome', {
      value: {
        runtime: {
          onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) },
          sendMessage: (message: unknown) => { sent.push(message); return Promise.resolve({ ok: true }); },
        },
      },
    });
  });
  await page.goto('https://presented.example/demo');
  await page.addScriptTag({ path: path.resolve(process.cwd(), 'extension/content.js') });

  await expect.poll(() => page.evaluate(() => (window as any).__speakExtensionTest.sent[0]?.type)).toBe('TARGET_READY');
  await page.evaluate(() => {
    const testApi = (window as any).__speakExtensionTest;
    testApi.listeners.forEach((listener: (message: unknown) => void) => listener({
      channel: 'speak-session-state',
      state: { status: 'recording', captureSurface: 'browser', elapsedMs: 2400, countdown: null, webcamEnabled: true, camSize: 'lg', camPos: { xRatio: .75, yRatio: .7 } },
    }));
  });

  const overlay = page.locator('#speak-recorder-overlay');
  await expect(overlay).toHaveAttribute('data-status', 'recording');
  await expect(overlay).toHaveAttribute('data-camera', 'true');
  await expect(overlay).toHaveAttribute('data-size', 'lg');
  await expect(overlay).toHaveAttribute('data-x-ratio', '0.75');
  await expect.poll(() => page.evaluate(() => (window as any).__speakExtensionTest.sent.some((message: any) => message.type === 'OVERLAY_STATUS' && message.active))).toBe(true);
  await page.screenshot({ path: 'test-results/extension-overlay.png' });

  await page.evaluate(() => {
    const testApi = (window as any).__speakExtensionTest;
    testApi.listeners.forEach((listener: (message: unknown) => void) => listener({ channel: 'speak-session-state', state: { status: 'stopped' } }));
  });
  await expect(overlay).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).__speakExtensionTest.sent.some((message: any) => message.type === 'OVERLAY_STATUS' && !message.active))).toBe(true);
});
