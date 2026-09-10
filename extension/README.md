# Speak Companion

Speak Companion puts the live camera bubble and recording controls directly on ordinary Chrome and Edge pages. The bubble is included when that browser tab is recorded, and moving or resizing it also updates Speak's saved-video layout.

## Install locally

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `extension` folder.
4. Refresh Speak and any page that was already open while you installed the extension. The recording setup will say **Companion connected**.

The extension reads pages only to draw the bubble while a Speak recording session is active. Camera frames stay in the browser and are relayed from the Speak tab to the injected bubble. Chrome does not allow extensions on browser-owned pages such as `chrome://settings`, and a browser extension cannot draw over native desktop applications.

For a desktop app or an entire screen, Speak uses its always-on-top camera window and also burns the camera into the saved video.
