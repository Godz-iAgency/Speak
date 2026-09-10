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

## Verification

Production build and lint pass; all 28 unit/integration tests and all three browser scenarios pass. Automated tests cover recording lifecycle, export and cancellation, upload ordering, metadata bounds and owner query constraints, local account separation, draft recovery, edited/unedited sharing, library actions, and timestamp playback behavior.

Edge browser checks exercise real generated MediaRecorder media, Picture-in-Picture controls, remux/MP4 export, split/cancel/re-export, real IndexedDB reload and restored edits, and responsive library/viewer layouts. Desktop and mobile screenshots were inspected. Cloud data in these tests is mocked; no production authentication bypass was added.

## Deployment dependency

The Firebase service account available here returned IAM_PERMISSION_DENIED when asked to validate the proposed rules. Rules and indexes have **not** been deployed or emulator-tested. Deploy them with a project administrator's Firebase CLI session as described in README, and wait for the index to finish building before frontend release. Old strict rules reject the new metadata and library requests.

Live Firebase sign-in, a real B2 PUT, and public video playback against deployed storage remain unverified. GitHub push alone does not publish Firestore rules or prove a Vercel deployment is healthy. B2 CORS still needs the app origin, PUT, and Content-Type.

## Remaining product gaps

This is a core recording/sharing workspace, not full Loom feature parity. Team workspaces, folders, comments/reactions, view analytics, notifications, private/invite-only sharing, captions/transcription and AI summaries, camera-only recording, device selection, and server-side media processing remain future work. Shared-video deletion needs coordinated B2 and Firestore cleanup before it can be offered safely.

Drafts are browser-local, not synced or encrypted. Clearing browser storage deletes them; quota errors are shown with a download fallback. An active recording still lives in memory until it stops, so this does not add crash recovery for in-progress sessions. Long recording memory pressure, upload quotas, orphan cleanup, and dependency advisories from EVALUATION.md remain relevant. The Firebase lazy-bundle size notice is also retained.
