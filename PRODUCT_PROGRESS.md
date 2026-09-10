# Speak: library and sharing pass

This pass implements the recommended core flow: record → edit → library → share. It keeps Speak branding and the existing capture engine.

## What changed

- A responsive personal library with video thumbnails, titles, dates, durations, title filtering, pagination, copying share links, and renaming.
- New recording opens a focused camera/microphone setup dialog with keyboard focus handling.
- Completed recordings autosave locally with their title, description, and timeline. Drafts reopen after a reload and can be deleted explicitly. Video bytes are stored separately from edits to avoid repeated large writes.
- A preparing draft records whether the timeline has initialized, preserving the difference between interrupted preparation and an intentionally empty edit.
- One-click sharing uploads an unedited WebM directly; edited recordings are rendered to MP4 automatically. Local MP4 export is still available.
- Public playback includes title, description, thumbnail, speed controls, timestamp links, copy fallback, and loading/error states.
- Owner-scoped Firestore list queries are limited to 24; rename can change only the title. Public single-video links remain public. An owner/date composite index and Firebase deployment configuration are included.
- Speak Companion is a Manifest V3 Chrome/Edge extension that injects the live camera bubble and controls into browser tabs, relays camera frames and commands, and keeps bubble position/size synchronized with the saved recording. Whole-screen and app-window capture use a camera-enabled Document Picture-in-Picture fallback.
- Phones and tablets retain the responsive library and public viewer. Browsers without screen capture now receive a clear desktop-recording message instead of entering a broken recorder flow.

## Verification

Production build and lint pass; all 33 unit/integration tests and all four browser scenarios pass. Automated tests cover recording lifecycle, extension packaging and message relay, injected overlay lifecycle, floating camera cleanup, export and cancellation, upload ordering, metadata bounds and owner query constraints, local account separation, draft recovery, edited/unedited sharing, library actions, mobile capture fallback, and timestamp playback behavior.

Edge browser checks exercise the real extension content script on a presented page, real generated MediaRecorder media, Picture-in-Picture camera controls, remux/MP4 export, split/cancel/re-export, real IndexedDB reload and restored edits, the unsupported-mobile recording message, and responsive library/viewer layouts. Desktop and mobile screenshots were inspected. The extension background relay is verified with a browser-API contract test; installing the unpacked extension with a physical camera remains a manual check. Cloud data in these tests is mocked; no production authentication bypass was added.

## Live deployment verification — 2026-09-10

Firebase CLI authenticated with the project administrator and successfully deployed the rules and index to `speak-app-46019`. The project initially had no default Firestore database; the deployment enabled its API and created the database. Rules compiled successfully, and the owner/date index finished building.

Live Firebase checks passed: a temporary account signed in with a custom token, created recording metadata, renamed it, and found it through the owner-scoped indexed query. Unrestricted collection listing and ownership changes were rejected. Signed-out single-document access passed. Temporary test metadata and accounts were removed. This verifies the deployed rules, not the Google sign-in UI or a full production-browser recording session.

The real upload-signing handler accepted a valid Firebase token and generated a URL. B2 rejected the subsequent video PUT with `InvalidAccessKeyId: Malformed Access Key Id`. The configured credentials successfully authenticate to B2's Native API and have key-creation capability; they are a master-key configuration that is incompatible with the S3 upload path. A bucket/prefix-restricted application key is required. Creating that persistent key and replacing local configuration is awaiting explicit user approval; no replacement key has been created yet.

GitHub reports a successful Vercel preview build for commit a7a3cff. The preview requires Vercel login; the repository's listed homepage (`https://speak-hazel.vercel.app`) returns 404. Production environment settings, B2 CORS, and actual browser upload/playback still need verification. The feature branch remains separate from main until these release checks pass.

## Remaining product gaps

This is a core recording/sharing workspace, not full Loom feature parity. The companion must be signed and published through the Chrome and Edge stores before it can have a one-click consumer install. A native iPhone/iPad recorder still requires an Apple project, ReplayKit capture extension, App Store signing, and Mac/Xcode verification; Android work was intentionally excluded from this pass. Team workspaces, folders, comments/reactions, view analytics, notifications, private/invite-only sharing, captions/transcription and AI summaries, camera-only recording, device selection, and server-side media processing remain future work. Shared-video deletion needs coordinated B2 and Firestore cleanup before it can be offered safely.

Drafts are browser-local, not synced or encrypted. Clearing browser storage deletes them; quota errors are shown with a download fallback. An active recording still lives in memory until it stops, so this does not add crash recovery for in-progress sessions. Long recording memory pressure, upload quotas, orphan cleanup, and dependency advisories from EVALUATION.md remain relevant. The Firebase lazy-bundle size notice is also retained.
