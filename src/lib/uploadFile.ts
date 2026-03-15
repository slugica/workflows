import { generateVideoThumbnail } from '@/lib/videoThumbnail';

export interface UploadResult {
  url: string;
  thumbnail: string | null;
}

/**
 * Upload file to fal.ai CDN via presigned URL + generate video thumbnail.
 * Single function used everywhere — no duplicate upload logic.
 *
 * Step 1: Server gets presigned URL (tiny JSON, fast)
 * Step 2: Browser PUTs file directly to fal CDN
 * Step 3: (parallel) Generate video thumbnail from local blob
 */
export async function uploadFile(file: File): Promise<UploadResult> {
  // Start thumbnail generation in parallel with upload (for video)
  const thumbnailPromise = file.type.startsWith('video/')
    ? generateVideoThumbnail(file)
    : Promise.resolve(null);

  // Step 1: get presigned URL
  const initRes = await fetch('/api/fal/upload/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentType: file.type || 'application/octet-stream',
      fileName: file.name,
    }),
  });
  const initData = await initRes.json();
  if (!initRes.ok || !initData.upload_url || !initData.file_url) {
    throw new Error(initData.error || 'Failed to get upload URL');
  }

  // Step 2: PUT file directly to fal CDN
  const putRes = await fetch(initData.upload_url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed: ${putRes.status}`);
  }

  // Wait for thumbnail (already running in parallel)
  const thumbnail = await thumbnailPromise;

  return { url: initData.file_url, thumbnail };
}
