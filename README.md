# speak.

Record. Share. Be Heard.

A browser-based screen recorder with a built-in trim editor — record your screen (with an optional webcam bubble and mic), cut out the boring parts, export an MP4, and get a shareable link. Recording, trimming, and export all run locally in the browser; only the finished MP4 leaves your machine, uploaded straight to your own storage.

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
- Exporting uploads directly to Backblaze B2 via a short-lived presigned URL (issued by `api/sign-upload.ts`, a Vercel serverless function) and saves the recording's metadata to Firestore — the video's bytes never pass through the server
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
