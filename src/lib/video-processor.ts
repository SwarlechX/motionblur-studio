/**
 * Video Processor — WebCodecs API tabanlı
 *
 * Pipeline:
 * 1. HTMLVideoElement: dosya → seek ile frame-by-frame extraction
 * 2. Canvas: frame rendering + motion blur uygulama
 * 3. VideoEncoder: processed frames → encoded VideoChunks
 * 4. webm-muxer / mp4-muxer: chunks → output file
 *
 * seek-based yaklaşım: real-time playback gerekmez,
 * her frame'e deterministik olarak erişir.
 */

import {
  applyMotionBlur,
  FrameHistory,
  type MotionBlurSettings,
  type ProcessProgress,
  type ProgressCallback,
} from './motion-blur';

// Dinamik import yerine statik — tree-shaking için
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { Muxer as WebMMuxer, ArrayBufferTarget as WebMArrayBufferTarget } from 'webm-muxer';

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

/**
 * WebCodecs destek kontrolü
 */
export function isWebCodecsSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    typeof VideoDecoder !== 'undefined' &&
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined'
  );
}

/**
 * Video dosyasından metadata çıkar
 */
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
        fps: 30, // Browser API fps vermiyor, varsayılan
        frameCount: Math.round(video.duration * 30),
      };
      cleanup();
      resolve(metadata);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Video metadata yüklenemedi. Format desteklenmiyor olabilir.'));
    };

    video.src = url;
  });
}

/**
 * Thumbnail üret
 */
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

interface EncoderSetup {
  encoder: VideoEncoder;
  muxer: any;
  target: { buffer: ArrayBuffer | null };
  mimeType: string;
}

async function setupEncoder(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<EncoderSetup> {
  // Codec preference: H.264 (geniş destek) > VP9 (kalite)
  const codecCandidates = [
    {
      codec: 'avc1.42E01F', // H.264 Baseline 3.0
      isMP4: true,
      mimeType: 'video/mp4',
      mp4Codec: 'avc' as const,
    },
    {
      codec: 'vp09.00.10.08', // VP9
      isMP4: false,
      mimeType: 'video/webm',
      mp4Codec: null,
    },
  ];

  for (const candidate of codecCandidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: candidate.codec,
        width,
        height,
        bitrate,
        framerate: fps,
        latencyMode: 'quality',
      });
      if (!support.supported) continue;

      let target: any;
      let muxer: any;

      if (candidate.isMP4) {
        target = new Mp4ArrayBufferTarget();
        muxer = new Mp4Muxer({
          target: target,
          video: {
            codec: candidate.mp4Codec,
            width,
            height,
          },
          fastStart: 'in-memory',
        });
      } else {
        target = new WebMArrayBufferTarget();
        muxer = new WebMMuxer({
          target: target,
          video: {
            codec: 'V_VP9',
            width,
            height,
          },
        });
      }

      const encoder = new VideoEncoder({
        output: (chunk, meta) => {
          muxer.addVideoChunk(chunk, meta ?? undefined);
        },
        error: (err) => {
          console.error('VideoEncoder error:', err);
        },
      });

      encoder.configure({
        codec: candidate.codec,
        width,
        height,
        bitrate,
        framerate: fps,
        latencyMode: 'quality',
      });

      return { encoder, muxer, target, mimeType: candidate.mimeType };
    } catch (e) {
      continue;
    }
  }

  throw new Error('Hiçbir codec desteklenmiyor. Lütfen modern bir tarayıcı kullanın (Chrome/Edge/Safari).');
}

/**
 * Seek-to-frame helper: video.currentTime ayarlar, seeked bekler
 */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error(`Seek başarısız: t=${time}`));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

/**
 * Ana işleme fonksiyonu
 */
export async function processVideoWithMotionBlur(
  file: File,
  settings: MotionBlurSettings,
  onProgress: ProgressCallback,
  signal?: AbortSignal
): Promise<ProcessedResult> {
  if (!isWebCodecsSupported()) {
    throw new Error(
      'WebCodecs API desteklenmiyor. Lütfen Chrome 94+, Edge 94+ veya Safari 16.4+ kullanın.'
    );
  }

  const startTime = performance.now();
  const metadata = await getVideoMetadata(file);

  // Quality scaling
  const scale = settings.quality;
  const outWidth = Math.max(2, Math.round(metadata.width * scale));
  const outHeight = Math.max(2, Math.round(metadata.height * scale));
  const fps = metadata.fps;
  const frameCount = metadata.frameCount;
  // Bitrate: kalite + boyut dengesi (0.1 bits/pixel/frame)
  const bitrate = Math.min(12_000_000, Math.max(500_000, Math.round(outWidth * outHeight * fps * 0.1)));

  onProgress({
    phase: 'decoding',
    currentFrame: 0,
    totalFrames: frameCount,
    progress: 0,
    message: 'Encoder hazırlanıyor...',
  });

  const { encoder, muxer, target, mimeType } = await setupEncoder(outWidth, outHeight, fps, bitrate);

  // Canvas
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

  const frameHistory = new FrameHistory(settings.samples);
  let processedCount = 0;
  const frameDuration = 1 / fps; // seconds

  onProgress({
    phase: 'processing',
    currentFrame: 0,
    totalFrames: frameCount,
    progress: 0,
    message: 'Frame işleme başladı...',
  });

  // Her frame'i sırayla seek+process
  for (let i = 0; i < frameCount; i++) {
    if (signal?.aborted) {
      throw new Error('İşleme iptal edildi');
    }

    const seekTime = Math.min(metadata.duration - 0.001, i * frameDuration);
    await seekTo(video, seekTime);

    // Frame'i canvas'a çiz
    ctx.drawImage(video, 0, 0, outWidth, outHeight);
    const currentImageData = ctx.getImageData(0, 0, outWidth, outHeight);

    // Motion blur uygula
    const blurred = applyMotionBlur(currentImageData, frameHistory.getHistory(), settings);
    ctx.putImageData(blurred, 0, 0);

    // History'ye ekle (orijinal frame'i — bozulmuş değil)
    frameHistory.add(currentImageData);

    // Encode
    const timestampMicros = Math.round(i * frameDuration * 1_000_000);
    const durationMicros = Math.round(frameDuration * 1_000_000);

    const frame = new VideoFrame(canvas, {
      timestamp: timestampMicros,
      duration: durationMicros,
    });

    encoder.encode(frame, { keyFrame: i % 30 === 0 });
    frame.close();

    // Encoder bellek yönetimi: sıra dolarsa bekle
    if (encoder.encodeQueueSize > 10) {
      await new Promise((r) => setTimeout(r, 1));
      if (encoder.encodeQueueSize > 20) {
        await encoder.flush();
      }
    }

    processedCount = i + 1;

    // Progress (her 3 frame'de bir raporla — performans için)
    if (i % 3 === 0 || i === frameCount - 1) {
      onProgress({
        phase: 'processing',
        currentFrame: processedCount,
        totalFrames: frameCount,
        progress: processedCount / frameCount,
        message: `Frame işleniyor: ${processedCount}/${frameCount}`,
      });

      // UI thread nefes alsın
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Son flush
  onProgress({
    phase: 'encoding',
    currentFrame: processedCount,
    totalFrames: frameCount,
    progress: 0.95,
    message: 'Final encode...',
  });

  await encoder.flush();
  await encoder.close();

  // Mux finalize
  muxer.finalize();

  if (!target.buffer) {
    throw new Error('Muxer çıktı buffer üretmedi');
  }

  const blob = new Blob([target.buffer], { type: mimeType });
  const durationMs = performance.now() - startTime;

  // Cleanup
  URL.revokeObjectURL(video.src);
  frameHistory.clear();

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

/**
 * Format bytes → human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format duration → human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}
