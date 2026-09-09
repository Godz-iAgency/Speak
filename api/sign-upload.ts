import type { VercelRequest, VercelResponse } from '@vercel/node';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { requireUid } from './_firebaseAdmin.js';

const ALLOWED_CONTENT_TYPES = new Set(['video/mp4', 'video/webm']);

function extFor(contentType: string): string {
  return contentType === 'video/webm' ? 'webm' : 'mp4';
}

/**
 * Issues a short-lived presigned PUT URL for Backblaze B2 (S3-compatible API).
 * The B2 application key never reaches the browser — the client PUTs directly
 * to the returned URL, so the recording's bytes don't pass through this
 * function at all.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let uid: string;
  try {
    uid = await requireUid(req.headers.authorization);
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const contentType = typeof req.body?.contentType === 'string' ? req.body.contentType : 'video/mp4';
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    res.status(400).json({ error: `Unsupported content type: ${contentType}` });
    return;
  }

  const { B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, B2_ENDPOINT, B2_REGION, B2_DOWNLOAD_HOST } = process.env;
  if (!B2_KEY_ID || !B2_APPLICATION_KEY || !B2_BUCKET || !B2_ENDPOINT || !B2_REGION || !B2_DOWNLOAD_HOST) {
    res.status(500).json({ error: 'Storage is not configured on the server yet.' });
    return;
  }

  const key = `recordings/${uid}/${randomUUID()}.${extFor(contentType)}`;

  const s3 = new S3Client({
    // The browser supplies the body later; do not sign an empty-body checksum.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    region: B2_REGION,
    endpoint: B2_ENDPOINT,
    credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APPLICATION_KEY },
  });

  try {
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: B2_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: 600 },
    );

    const publicUrl = `https://${B2_DOWNLOAD_HOST}/file/${B2_BUCKET}/${key}`;

    res.status(200).json({ uploadUrl, key, publicUrl });
  } catch {
    res.status(500).json({ error: 'Could not prepare the upload. Please try again.' });
  } finally { s3.destroy(); }
}
