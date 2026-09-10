# speak.

Record. Share. Be Heard.

A browser-based screen recorder with a built-in trim editor — record your screen (with an optional webcam bubble and mic), cut out the boring parts, export an MP4, and get a shareable link. Recording, trimming, and export all run locally in the browser; only a video you choose to share leaves your machine, uploaded straight to your own storage.

## Getting started

```bash
npm install
npm run dev
```

Open the printed `localhost` URL in Chrome or Edge (screen/camera capture APIs require a Chromium-based browser) and sign in to start.

Copy `.env.example` to `.env.local` and fill it in — see [Cloud setup](#cloud-setup) below for where each value comes from. Without it, the app has nothing to sign in against; with just Firebase configured (no B2 yet), sign-in/recording/trimming/export all work locally and only "Get shareable link" is unavailable.

## How it works

- Sign-in is real Firebase Auth — Google or email/password — gating the recorder itself. A public share page needs no sign-in at all.
- Screen + optional webcam + mic capture via `getDisplayMedia` / `getUserMedia`, composited live onto a canvas
- `MediaRecorder` captures the composited stream to WebM
- [`ffmpeg.wasm`](https://ffmpegwasm.netlify.app/) runs entirely client-side to fix the recording's duration metadata, trim out marked sections, and export a final MP4
- Sharing uploads directly to Backblaze B2 via a short-lived presigned URL (issued by `api/sign-upload.ts`, a Vercel serverless function) and saves the recording's metadata to Firestore — the video's bytes never pass through the server
- `/v/<id>` is a public share page — anyone with the link can watch, no account needed

## Cloud setup

**Firebase** (console.firebase.google.com): create a project → register a web app (skip Hosting) and copy its config into the `VITE_FIREBASE_*` vars → **Build → Authentication → Sign-in method** → enable **Google** and/or **Email/Password** → **Build → Firestore Database** → create one, production mode → **Rules** tab → paste in [`firestore.rules`](firestore.rules) → Publish → **Project settings → Service accounts** → Generate new private key, paste the whole JSON file as `FIREBASE_SERVICE_ACCOUNT`.

Firebase alone is enough to sign in, record, trim, and export. B2 is only needed for "Get shareable link" specifically.

**Backblaze B2** (backblaze.com): create a bucket (Files in Bucket: **Public**) → note its Endpoint and friendly-URL host from the bucket details page → **App Keys** → create a key restricted to that bucket → fill in `B2_*` in `.env.local`.

`VITE_`-prefixed values are compiled into the browser bundle and are meant to be public. Everything else (`B2_*`, `FIREBASE_SERVICE_ACCOUNT`) is server-only — set those in Vercel's Project Settings → Environment Variables for the deployed app, and never commit them.

## Deploying

Push to a repo Vercel is watching, or `vercel deploy` — Vercel auto-detects the Vite build and picks up everything in `api/` as serverless functions. Set the env vars above in the Vercel project settings first.

## Brand assets

See [`brand/BRANDING.md`](brand/BRANDING.md) for the logo, icon, and color token picks.

## Recording controls and verification

The large preview is for camera setup. After Start, switch to the real tab or app you selected. Supported browsers open always-on-top controls; otherwise return to Speak or use the browser's Stop sharing button. Alt+Shift+P pauses/resumes and Alt+Shift+S stops while Speak or its floating controls have focus. Closing the floating window does not stop recording.

Capture fits within 1920×1080 at 30 fps. Completed recordings and edits autosave as private drafts in this browser. Wait for the saved status before closing; clearing browser data removes local drafts. Active recording is still memory-based and cannot recover from a crash. The video processor is served with this app and downloaded when editing begins.

Run `npm run build`, `npm run lint`, `npm test`, and `npm run test:browser` (Microsoft Edge required). See [EVALUATION.md](EVALUATION.md) for findings, evidence, known limits, and deployment checks. Firestore rules must be published separately. Configure B2 CORS to allow your app origin, PUT, and Content-Type; local Vite alone does not run the Vercel signing function.

## Your video workspace

The signed-in home is now **My library**. Choose **New recording** to open camera/microphone setup, then record, name the video, and add context for viewers. **Share video** uploads an untouched recording directly as WebM; if you cut or reorder clips, it prepares an MP4 automatically. **Export MP4** also remains available for a local download without sharing.

Shared videos appear with a thumbnail, title, date, duration, copy-link action, and rename action. The list is private to the signed-in owner and loads 24 at a time, newest first. The title filter applies to loaded videos; use Load more to include older recordings. Public links remain accessible to anyone with the link.

**Drafts on this device** lets you resume or delete completed recordings. Draft media and edit metadata are stored separately in IndexedDB, so title changes do not rewrite the video. Drafts are grouped by account in the UI, but browser storage is not encrypted and should not be treated as protection from someone with access to the same browser profile. Drafts do not sync between devices. Sharing keeps the editable local draft.

The public viewer includes the video title, description, playback speed, and optional start-at-current-time links. Existing videos without titles or thumbnails still work.

### Required Firebase release step

Deploy both the updated rules and the owner/date index **before releasing this frontend**. Existing strict rules reject the new title/description/thumbnail fields and library queries. Pushing GitHub code does not deploy Firestore configuration.

From a Firebase CLI session signed in as a project administrator, run:

```bash
firebase deploy --only firestore:rules,firestore:indexes --project YOUR_FIREBASE_PROJECT_ID
```

Use the same project as the app's Firebase configuration, and wait for the recordings ownerUid/createdAt index to become ready. The configuration is in `firebase.json`, `firestore.rules`, and `firestore.indexes.json`. No Firebase Hosting changes are included.

See [PRODUCT_PROGRESS.md](PRODUCT_PROGRESS.md) for this pass's verification and remaining feature gaps. On 2026-09-10, the project administrator deployed the rules/index to speak-app-46019 and live Firebase permission checks passed. B2 upload is still blocked by an incompatible master-key configuration; use a standard S3-compatible application key. Production-browser upload and playback remain unverified.
### Backblaze key compatibility

Speak uses the S3-Compatible API, which does not accept a B2 master application key. Use a standard application key restricted to the recordings bucket, and put its **keyID** in `B2_KEY_ID` and **applicationKey** in `B2_APPLICATION_KEY`. Keep both values server-only in local configuration and Vercel's environment settings. Changing `.env.local` does not update Vercel. See [Backblaze's S3 key requirements](https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys).