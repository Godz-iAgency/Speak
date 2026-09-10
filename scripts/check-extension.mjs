import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../extension/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Speak Companion must use Manifest V3.');

const required = [
  manifest.background?.service_worker,
  ...(manifest.content_scripts || []).flatMap((entry) => entry.js || []),
  manifest.action?.default_popup,
  ...Object.values(manifest.icons || {}),
  'protocol.js',
  'popup.css',
  'popup.js',
];
for (const file of required) {
  if (!file || !existsSync(new URL(file, root))) throw new Error(`Extension file is missing: ${file || '(empty manifest entry)'}`);
}

for (const file of ['content.js', 'service-worker.js', 'popup.js', 'protocol.js']) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(file, root))], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `${file} failed syntax validation.`);
}

console.log(`Speak Companion ${manifest.version} is valid.`);
