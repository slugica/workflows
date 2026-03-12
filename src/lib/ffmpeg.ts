import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

// Simple mutex to prevent concurrent ffmpeg operations
let busy = false;
const queue: Array<() => void> = [];

function acquireLock(): Promise<void> {
  return new Promise((resolve) => {
    if (!busy) {
      busy = true;
      resolve();
    } else {
      queue.push(() => {
        busy = true;
        resolve();
      });
    }
  });
}

function releaseLock() {
  busy = false;
  const next = queue.shift();
  if (next) next();
}

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ff = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ff.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpeg = ff;
    return ff;
  })();

  return loadPromise;
}

/**
 * Process a video with ffmpeg using the given filter arguments.
 * Returns a blob URL of the processed video.
 */
export async function processVideo(
  inputUrl: string,
  ffmpegArgs: string[],
  onProgress?: (ratio: number) => void
): Promise<string> {
  await acquireLock();
  try {
    const ff = await getFFmpeg();

    const inputData = await fetchFile(inputUrl);
    await ff.writeFile('input.mp4', inputData);

    if (onProgress) {
      ff.on('progress', ({ progress }) => onProgress(Math.min(progress, 1)));
    }

    await ff.exec(['-i', 'input.mp4', ...ffmpegArgs, '-y', 'output.mp4']);

    const output = await ff.readFile('output.mp4');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blob = new Blob([output as any], { type: 'video/mp4' });

    // Cleanup
    await ff.deleteFile('input.mp4');
    await ff.deleteFile('output.mp4');

    return URL.createObjectURL(blob);
  } finally {
    releaseLock();
  }
}

/**
 * Extract the first frame of a video as an image blob URL.
 */
export function extractFirstFrame(videoUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;
    video.currentTime = 0.1;
    video.muted = true;
    video.onloadeddata = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas context')); return; }
      ctx.drawImage(video, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    video.onerror = () => reject(new Error('Failed to load video'));
  });
}
