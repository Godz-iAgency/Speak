(() => {
  const WEB_SOURCE = 'speak-recorder-web';
  const ACTIVE_STATES = new Set(['ready', 'countdown', 'recording', 'paused']);
  const SIZE_PIXELS = { sm: 96, md: 136, lg: 180 };

  function isSpeakPage() {
    return location.hostname === 'speakrecorder.vercel.app' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }

  function send(message) {
    try { void chrome.runtime.sendMessage(message).catch(() => {}); } catch { /* Extension was reloaded. */ }
  }

  if (isSpeakPage()) {
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || message.source !== WEB_SOURCE) return;
      if (message.type === 'WEB_READY') send({ channel: 'speak-web', type: 'WEB_READY' });
      if (message.type === 'RECORDER_STATE') send({ channel: 'speak-web', type: 'RECORDER_STATE', state: message.state });
      if (message.type === 'CAMERA_FRAME' && typeof message.frame === 'string') send({ channel: 'speak-web', type: 'CAMERA_FRAME', frame: message.frame });
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.channel !== 'speak-extension-to-web') return;
      window.postMessage(message.message, window.location.origin);
    });
    send({ channel: 'speak-web', type: 'WEB_READY' });
    return;
  }

  let host = null;
  let shadow = null;
  let state = null;
  let frame = '';
  let image = null;
  let timer = null;
  let status = null;
  let pauseButton = null;
  let shell = null;
  let drag = null;

  function formatElapsed(ms) {
    const seconds = Math.max(0, Math.floor((ms || 0) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function removeOverlay() {
    if (!host) return;
    host.remove();
    host = shadow = image = timer = status = pauseButton = shell = null;
    send({ channel: 'speak-target', type: 'OVERLAY_STATUS', active: false });
  }

  function move(clientX, clientY) {
    if (!shell || !state || !drag) return;
    const size = SIZE_PIXELS[state.camSize] || SIZE_PIXELS.md;
    const half = size / 2 + 8;
    const x = Math.min(innerWidth - half, Math.max(half, clientX - drag.offsetX));
    const y = Math.min(innerHeight - half, Math.max(half, clientY - drag.offsetY));
    state.camPos = { xRatio: x / innerWidth, yRatio: y / innerHeight };
    shell.style.left = `${state.camPos.xRatio * 100}%`;
    shell.style.top = `${state.camPos.yRatio * 100}%`;
    send({ channel: 'speak-target', type: 'BUBBLE_POSITION', ...state.camPos });
  }

  function createOverlay() {
    if (host || !document.documentElement) return;
    host = document.createElement('div');
    host.id = 'speak-recorder-overlay';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;contain:layout style;';
    shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box} .shell{position:absolute;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:8px;pointer-events:auto;font-family:Inter,system-ui,sans-serif;color:#fff;user-select:none;touch-action:none}
        .camera{display:block;width:136px;height:136px;border-radius:999px;object-fit:cover;background:linear-gradient(145deg,#6825e7,#e535b8);border:4px solid rgba(255,255,255,.94);box-shadow:0 12px 38px rgba(6,7,20,.44);cursor:grab}.camera:active{cursor:grabbing}
        .no-camera{display:grid;place-items:center;width:54px;height:54px;border-radius:999px;background:#6d35d8;border:3px solid #fff;font-weight:900;font-size:13px;box-shadow:0 10px 28px #0007;cursor:grab}
        .countdown{position:absolute;inset:0;display:grid;place-items:center;border-radius:999px;background:#111425a8;font-size:44px;font-weight:900;text-shadow:0 2px 8px #000}
        .badge{position:absolute;right:-4px;top:-4px;min-width:34px;padding:4px 7px;border-radius:99px;background:#111425e8;border:1px solid #ffffff35;font-size:11px;font-weight:800;text-align:center;box-shadow:0 4px 14px #0005}
        .toolbar{display:flex;align-items:center;gap:6px;padding:6px 7px;border-radius:999px;background:#111425f2;border:1px solid #ffffff24;box-shadow:0 8px 30px #0007;opacity:.18;transition:opacity .16s ease}.shell:hover .toolbar,.shell:focus-within .toolbar{opacity:1}
        .state{padding:0 4px;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#c7c9dc}.dot{display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:50%;background:#ff3d65}.paused .dot{background:#ffc85a}
        button{appearance:none;border:0;border-radius:999px;padding:7px 10px;background:#292d43;color:#fff;font:700 11px/1 Inter,system-ui,sans-serif;cursor:pointer}button:hover{background:#3a405d}.stop{background:#f03e62}.stop:hover{background:#ff5676}.size{min-width:28px;padding:7px}
      </style>
      <div class="shell">
        <div class="visual"><img class="camera" alt=""><div class="no-camera">speak.</div><span class="badge"></span><div class="countdown"></div></div>
        <div class="toolbar"><span class="state"><i class="dot"></i><span></span></span><button class="pause"></button><button class="size" title="Change camera size">↗</button><button class="stop">Stop</button></div>
      </div>`;
    shell = shadow.querySelector('.shell');
    image = shadow.querySelector('.camera');
    timer = shadow.querySelector('.badge');
    status = shadow.querySelector('.state span');
    pauseButton = shadow.querySelector('.pause');
    const stopButton = shadow.querySelector('.stop');
    const sizeButton = shadow.querySelector('.size');

    const beginDrag = (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;
      const rect = shell.getBoundingClientRect();
      drag = { offsetX: event.clientX - (rect.left + rect.width / 2), offsetY: event.clientY - (rect.top + rect.height / 2) };
      shell.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    shell.addEventListener('pointerdown', beginDrag);
    shell.addEventListener('pointermove', (event) => { if (drag) move(event.clientX, event.clientY); });
    shell.addEventListener('pointerup', () => { drag = null; });
    shell.addEventListener('pointercancel', () => { drag = null; });
    pauseButton.addEventListener('click', () => send({ channel: 'speak-target', type: 'RECORDER_COMMAND', command: state?.status === 'paused' ? 'resume' : 'pause' }));
    stopButton.addEventListener('click', () => send({ channel: 'speak-target', type: 'RECORDER_COMMAND', command: 'stop' }));
    sizeButton.addEventListener('click', () => {
      const sizes = ['sm', 'md', 'lg'];
      const next = sizes[(sizes.indexOf(state?.camSize) + 1) % sizes.length];
      state.camSize = next;
      render();
      send({ channel: 'speak-target', type: 'BUBBLE_SIZE', size: next });
    });
    document.documentElement.appendChild(host);
    send({ channel: 'speak-target', type: 'OVERLAY_STATUS', active: true });
  }

  function render() {
    if (!state || !ACTIVE_STATES.has(state.status) || state.captureSurface !== 'browser') { removeOverlay(); return; }
    createOverlay();
    if (!shell) return;
    const visual = shadow.querySelector('.visual');
    const noCamera = shadow.querySelector('.no-camera');
    const countdown = shadow.querySelector('.countdown');
    const toolbar = shadow.querySelector('.toolbar');
    const size = SIZE_PIXELS[state.camSize] || SIZE_PIXELS.md;
    const position = state.camPos || { xRatio: .88, yRatio: .82 };
    shell.style.left = `${position.xRatio * 100}%`;
    shell.style.top = `${position.yRatio * 100}%`;
    host.dataset.status = state.status;
    host.dataset.camera = String(Boolean(state.webcamEnabled));
    host.dataset.size = state.camSize || 'md';
    host.dataset.xRatio = String(position.xRatio);
    host.dataset.yRatio = String(position.yRatio);
    visual.style.cssText = `position:relative;width:${state.webcamEnabled ? size : 54}px;height:${state.webcamEnabled ? size : 54}px`;
    image.style.width = image.style.height = `${size}px`;
    image.style.display = state.webcamEnabled ? 'block' : 'none';
    image.src = frame || '';
    noCamera.style.display = state.webcamEnabled ? 'none' : 'grid';
    timer.textContent = state.status === 'ready' ? 'Ready' : formatElapsed(state.elapsedMs);
    status.textContent = state.status === 'paused' ? 'Paused' : state.status === 'ready' ? 'Ready' : 'Recording';
    toolbar.classList.toggle('paused', state.status === 'paused');
    pauseButton.textContent = state.status === 'paused' ? 'Resume' : 'Pause';
    pauseButton.style.display = ['recording', 'paused'].includes(state.status) ? 'block' : 'none';
    shadow.querySelector('.stop').style.display = ['recording', 'paused'].includes(state.status) ? 'block' : 'none';
    countdown.style.display = state.status === 'countdown' && state.countdown ? 'grid' : 'none';
    countdown.textContent = state.countdown || '';
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.channel === 'speak-session-state') {
      state = message.state;
      render();
    }
    if (message?.channel === 'speak-camera-frame' && typeof message.frame === 'string') {
      frame = message.frame;
      if (image) image.src = frame;
    }
  });
  addEventListener('pagehide', () => send({ channel: 'speak-target', type: 'OVERLAY_STATUS', active: false }), { once: true });
  send({ channel: 'speak-target', type: 'TARGET_READY' });
})();
