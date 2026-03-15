/**
 * Generate a thumbnail from a local video File by capturing a frame via canvas.
 * Works with blob URLs (no CORS issues). Returns data URL.
 */
export function generateVideoThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';

    const done = (result: string | null) => {
      if (resolved) return;
      resolved = true;
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    video.onloadeddata = () => {
      video.currentTime = 0.1;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          done(canvas.toDataURL('image/jpeg', 0.7));
        } else {
          done(null);
        }
      } catch {
        done(null);
      }
    };

    video.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    video.src = url;
  });
}