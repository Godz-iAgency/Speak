import { isActiveRecorderState, isSpeakUrl, isWebPage } from './protocol.js';

const EXTENSION_SOURCE = 'speak-recorder-extension';
let recorderTabId = null;
let recorderState = null;
let latestFrame = null;
const visibleTargets = new Set();

chrome.storage.session.get(['recorderTabId', 'recorderState']).then((saved) => {
  recorderTabId = Number.isInteger(saved.recorderTabId) ? saved.recorderTabId : null;
  recorderState = saved.recorderState || null;
}).catch(() => {});

function send(tabId, message) {
  if (!Number.isInteger(tabId)) return Promise.resolve();
  return chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

async function relayToRecorder(message) {
  if (!Number.isInteger(recorderTabId)) return;
  await send(recorderTabId, { channel: 'speak-extension-to-web', message: { source: EXTENSION_SOURCE, ...message } });
}

async function reportOverlayStatus() {
  await relayToRecorder({ type: 'OVERLAY_STATUS', active: visibleTargets.size > 0 });
}

async function broadcast(message) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => {
    if (!Number.isInteger(tab.id) || tab.id === recorderTabId || !isWebPage(tab.url || '') || isSpeakUrl(tab.url || '')) return Promise.resolve();
    return send(tab.id, message);
  }));
}

async function publishState() {
  const active = isActiveRecorderState(recorderState?.status);
  if (!active) visibleTargets.clear();
  await broadcast({ channel: 'speak-session-state', state: recorderState });
  if (!active) await reportOverlayStatus();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const senderUrl = sender.url || sender.tab?.url || '';
  const senderTabId = sender.tab?.id;

  if (message?.channel === 'speak-web' && isSpeakUrl(senderUrl) && Number.isInteger(senderTabId)) {
    recorderTabId = senderTabId;
    void chrome.storage.session.set({ recorderTabId });
    if (message.type === 'WEB_READY') {
      void relayToRecorder({ type: 'EXTENSION_READY' });
    }
    if (message.type === 'RECORDER_STATE') {
      recorderState = message.state || null;
      void chrome.storage.session.set({ recorderState });
      void publishState();
    }
    if (message.type === 'CAMERA_FRAME' && typeof message.frame === 'string') {
      latestFrame = message.frame;
      void broadcast({ channel: 'speak-camera-frame', frame: latestFrame });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message?.channel === 'speak-target' && !isSpeakUrl(senderUrl) && Number.isInteger(senderTabId)) {
    if (message.type === 'TARGET_READY') {
      if (isActiveRecorderState(recorderState?.status)) {
        void send(senderTabId, { channel: 'speak-session-state', state: recorderState });
        if (latestFrame) void send(senderTabId, { channel: 'speak-camera-frame', frame: latestFrame });
      }
    }
    if (message.type === 'OVERLAY_STATUS') {
      if (message.active) visibleTargets.add(senderTabId);
      else visibleTargets.delete(senderTabId);
      void reportOverlayStatus();
    }
    if (message.type === 'RECORDER_COMMAND' && ['pause', 'resume', 'stop'].includes(message.command)) {
      void relayToRecorder({ type: 'RECORDER_COMMAND', command: message.command });
    }
    if (message.type === 'BUBBLE_POSITION' && Number.isFinite(message.xRatio) && Number.isFinite(message.yRatio)) {
      void relayToRecorder({ type: 'BUBBLE_POSITION', xRatio: message.xRatio, yRatio: message.yRatio });
    }
    if (message.type === 'BUBBLE_SIZE' && ['sm', 'md', 'lg'].includes(message.size)) {
      void relayToRecorder({ type: 'BUBBLE_SIZE', size: message.size });
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  visibleTargets.delete(tabId);
  if (tabId === recorderTabId) {
    recorderTabId = null;
    recorderState = null;
    latestFrame = null;
    visibleTargets.clear();
    void chrome.storage.session.remove(['recorderTabId', 'recorderState']);
    void broadcast({ channel: 'speak-session-state', state: null });
  } else {
    void reportOverlayStatus();
  }
});
