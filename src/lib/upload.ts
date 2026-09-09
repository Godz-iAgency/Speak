import { requireCurrentUser } from './firebase';
import { createRecording } from './recordings';

interface SignResponse {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

async function requestUploadUrl(idToken: string, contentType: string): Promise<SignResponse> {
  const res = await fetch('/api/sign-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ contentType }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Couldn't get an upload URL (${res.status}): ${text || res.statusText}`);
  }
  return res.json();
}

// fetch() can't report upload progress, so the PUT itself goes through XHR.
function putWithProgress(url: string, blob: Blob, contentType: string, onProgress?: (ratio: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed: network error'));
    xhr.send(blob);
  });
}

/**
 * Uploads an exported recording to B2 and creates its Firestore record.
 * Returns the new recording's id (used to build the /v/<id> share link).
 */
export async function uploadRecording(
  blob: Blob,
  durationSec: number,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  const user = requireCurrentUser();
  const idToken = await user.getIdToken();
  const contentType = blob.type || 'video/mp4';

  const { uploadUrl, key, publicUrl } = await requestUploadUrl(idToken, contentType);
  await putWithProgress(uploadUrl, blob, contentType, onProgress);

  return createRecording({
    ownerUid: user.uid,
    durationSec,
    sizeBytes: blob.size,
    b2Key: key,
    videoUrl: publicUrl,
  });
}
