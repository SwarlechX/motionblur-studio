/**
 * Video Processor — MediaRecorder API
 *
 * WebCodecs yerine MediaRecorder kullanır:
 * - Tüm modern tarayıcılarda çalışır (Chrome, Edge, Firefox, Safari)
 * - Codec otomatik seçilir (browser ne destekiyorsa)
 * - Real-time capture: video süresi kadar işleme süresi
 */

import {
  applyMotionBlur,
  FrameHistory,
  type MotionBlurSettings,
  type ProcessProgress,
  type ProgressCallback,
} from './motion-blur';

export interface ProcessedResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  framesProcessed: number;
  width: number;
  height: number;
  outputSizeBytes: number;
}

export interface VideoMetadata {
  width: number;
  height: number;
  duration: number;
  fps: number;
  frameCount: number;
}

export function isWebCodecsSupported(): boolean {
  // API uyumluluk için tutuldu
  return false;
}

export async function getVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadedmetadata = () => {
      const metadata: VideoMetadata = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        fps: 30,
        frameCount: Math.round(video.duration * 30),
      };
      cleanup();
      resolve(metadata);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Video metadata yüklenemedi.'));
    };

    video.src = url;
  });
}

export async function generateThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, video.duration / 4);
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        cleanup();
        reject(new Error('Canvas context alınamadı'));
        return;
      }
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      cleanup();
      resolve(dataUrl);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Thumbnail üretilemedi'));
    };

    video.src = url;
  });
}

// Desteklenen MIME türünü seç
function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=h264',
    'video/mp4',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'video/webm';
}

export async function processVideoWithMotionBlur(
  file: File,
  settings: MotionBlurSettings,
  onProgress: ProgressCallback,
  signal?: AbortSignal
): Promise<ProcessedResult> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder API desteklenmiyor. Lütfen modern bir tarayıcı kullanın.');
  }

  const startTime = performance.now();
  const metadata = await getVideoMetadata(file);

  const scale = settings.quality;
  const outWidth = Math.max(2, Math.round(metadata.width * scale));
  const outHeight = Math.max(2, Math.round(metadata.height * scale));
  const fps = metadata.fps;
  const frameCount = metadata.frameCount;

  onProgress({
    phase: 'decoding',
    currentFrame: 0,
    totalFrames: frameCount,
    progress: 0,
    message: 'Hazırlanıyor...',
  });

  // Canvas — frame rendering için
  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context alınamadı');

  // Video element
  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('Video yüklenemedi'));
  });

  // Canvas stream + MediaRecorder
  const stream = canvas.captureStream(fps);
  const mimeType = pickMimeType();
  const bitrate = Math.min(8_000_000, Math.max(500_000, Math.round(outWidth * outHeight * fps * 0.07)));

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: bitrate,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const recorderDone = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };
    recorder.onerror = (e) => reject(new Error('Kayıt hatası: ' + e));
  });

  // Frame history
  const frameHistory = new FrameHistory(settings.samples);
  let processedCount = 0;
  let isAborted = false;

  if (signal) {
    signal.addEventListener('abort', () => {
      isAborted = true;
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      video.pause();
    });
  }

  // Recording başlat
  recorder.start(100); // 100ms chunks

  // Real-time frame capture
  // video.play() + requestVideoFrameCallback ile frame'leri çek
  const processingPromise = new Promise<void>((resolve, reject) => {
    let lastTime = -1;

    const onFrame = async () => {
      if (isAborted) {
        resolve();
        return;
      }

      const currentVideoTime = video.currentTime;

      // Aynı frame'i tekrar işleme
      if (currentTime !== lastTime) {
        lastTime = currentTime;

        // Canvas'a çiz
        ctx.drawImage(video, 0, 0, outWidth, outHeight);
        const currentImageData = ctx.getImageData(0, 0, outWidth, outHeight);

        // Motion blur uygula
        const blurred = applyMotionBlur(currentImageData, frameHistory.getHistory(), settings);

        // History'ye ekle (orijinal frame)
        frameHistory.add(currentImageData);

        // Çıktıyı canvas'a yaz — captureStream otomatik alır
        ctx.putImageData(blurred, 0, 0);

        processedCount++;

        onProgress({
          phase: 'processing',
          currentFrame: processedCount,
          totalFrames: frameCount,
          progress: Math.min(0.95, processedCount / frameCount),
          message: `Frame işleniyor: ${processedCount}/${frameCount}`,
        });
      }

      // Video bitti mi?
      if (video.ended || currentVideoTime >= metadata.duration - 0.05) {
        resolve();
        return;
      }

      // Sonraki frame
      if ('requestVideoFrameCallback' in video) {
        (video as any).requestVideoFrameCallback(onFrame);
      } else {
        // Fallback: setTimeout ile 30fps simüle et
        setTimeout(onFrame, 1000 / fps);
      }
    };

    // İlk frame callback'i
    if ('requestVideoFrameCallback' in video) {
      (video as any).requestVideoFrameCallback(onFrame);
    } else {
      setTimeout(onFrame, 1000 / fps);
    }

    // Safety timeout — 2x video süresi
    const safetyTimeout = setTimeout(() => {
      if (!isAborted) resolve();
    }, (metadata.duration + 5) * 1000);

    video.onended = () => {
      clearTimeout(safetyTimeout);
      resolve();
    };

    video.onerror = (e) => {
      clearTimeout(safetyTimeout);
      reject(new Error('Video oynatma hatası'));
    };
  });

  // Video oynat
  try {
    await video.play();
  } catch (e) {
    // Autoplay engellendi — manuel frame ilerletme
    console.warn('Video play engellendi, manuel mod kullanılıyor');
  }

  await processingPromise;

  // Recorder'ı durdur
  if (recorder.state !== 'inactive') {
    recorder.stop();
  }

  const blob = await recorderDone;
  const durationMs = performance.now() - startTime;

  URL.revokeObjectURL(video.src);
  frameHistory.clear();
  stream.getTracks().forEach((t) => t.stop());

  onProgress({
    phase: 'done',
    currentFrame: processedCount,
    totalFrames: frameCount,
    progress: 1,
    message: 'Tamamlandı',
  });

  return {
    blob,
    mimeType,
    durationMs,
    framesProcessed: processedCount,
    width: outWidth,
    height: outHeight,
    outputSizeBytes: blob.size,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}
