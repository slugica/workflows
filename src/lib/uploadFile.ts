import { generateVideoThumbnail } from '@/lib/videoThumbnail';

/** Convert image_size (Flux) or aspect_ratio (Banana/Video) setting to CSS aspect-ratio */
export function settingToAspectRatio(settings: Record<string, unknown>): string | undefined {
  const ar = settings.aspect_ratio as string | undefined;
  if (ar && ar !== 'auto' && ar.includes(':')) {
    return ar.replace(':', '/');
  }
  const is = settings.image_size as string | undefined;
  if (is && is !== 'auto') {
    if (is === 'square' || is === 'square_hd') return '1/1';
    const m = is.match(/^(landscape|portrait)_(\d+)_(\d+)$/);
    if (m) {
      const [, orient, a, b] = m;
      return orient === 'landscape' ? `${a}/${b}` : `${b}/${a}`;
    }
    const res = is.match(/^(\d+)x(\d+)$/);
    if (res) return `${res[1]}/${res[2]}`;
  }
  return undefined;
}

/** Detect file dimensions and return CSS aspect-ratio string (e.g. "1920/1080") */
export function detectFileAspectRatio(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(`${img.naturalWidth}/${img.naturalHeight}`); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(undefined); };
      img.src = url;
    } else if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(`${video.videoWidth}/${video.videoHeight}`); };
      video.onerror = () => { URL.revokeObjectURL(url); resolve(undefined); };
      video.src = url;
    } else {
      URL.revokeObjectURL(url);
      resolve(undefined);
    }
  });
}

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
