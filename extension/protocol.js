export const ACTIVE_RECORDER_STATES = new Set(['ready', 'countdown', 'recording', 'paused']);

const PRODUCTION_HOST = 'speakrecorder.vercel.app';

export function isSpeakUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return url.hostname === PRODUCTION_HOST || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function isWebPage(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isActiveRecorderState(status) {
  return ACTIVE_RECORDER_STATES.has(status);
}
