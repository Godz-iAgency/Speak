import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/browser', timeout: 180000, workers: 1, use: { channel: 'msedge', headless: true, baseURL: 'http://127.0.0.1:5173' }, webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true } });
