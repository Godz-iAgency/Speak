import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { isActiveRecorderState, isSpeakUrl, isWebPage } from '../extension/protocol.js';

describe('Speak Companion package', () => {
  test('manifest is a loadable Manifest V3 extension with the required bridge files', () => {
    const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background.service_worker).toBe('service-worker.js');
    expect(manifest.content_scripts[0].js).toContain('content.js');
    expect(manifest.content_scripts[0].matches).toEqual(['http://*/*', 'https://*/*']);
  });

  test('only Speak pages can become recorder pages', () => {
    expect(isSpeakUrl('https://speakrecorder.vercel.app/app')).toBe(true);
    expect(isSpeakUrl('http://localhost:5173/app')).toBe(true);
    expect(isSpeakUrl('https://example.com/app')).toBe(false);
    expect(isSpeakUrl('chrome://extensions')).toBe(false);
    expect(isWebPage('https://youtube.com/watch?v=1')).toBe(true);
    expect(isWebPage('chrome://settings')).toBe(false);
  });

  test('overlay lifetime matches recording setup and recording states', () => {
    expect(isActiveRecorderState('ready')).toBe(true);
    expect(isActiveRecorderState('countdown')).toBe(true);
    expect(isActiveRecorderState('recording')).toBe(true);
    expect(isActiveRecorderState('paused')).toBe(true);
    expect(isActiveRecorderState('idle')).toBe(false);
    expect(isActiveRecorderState('stopped')).toBe(false);
  });
});
