/**
 * Video Processor — WebCodecs API
 */

import {
  applyMotionBlur,
  FrameHistory,
  type MotionBlurSettings,
  type ProcessProgress,
  type ProgressCallback,
} from './motion-blur';

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

export function isWebCodecsSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    typeof VideoDecoder !== 'undefined' &&
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined'
  );
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

// H.264 ve VP9 codec seviyeleri — biri mutlaka çalışır
const CODEC_CANDIDATES = [
  { codec: 'avc1.42001E', isMP4: true, mimeType: 'video/mp4', mp4Codec: 'avc' as const },
  { codec: 'avc1.42E01F', isMP4: true, mimeType: 'video/mp4', mp4Codec: 'avc' as const },
  { codec: 'avc1.4D401F', isMP4: true, mimeType: 'video/mp4', mp4Codec: 'avc' as const },
  { codec: 'avc1.640028', isMP4: true, mimeType: 'video/mp4', mp4Codec: 'avc' as const },
  { codec: 'vp09.00.10.08', isMP4: false, mimeType: 'video/webm', mp4Codec: null },
  { codec: 'vp8', isMP4: false, mimeType: 'video/webm', mp4Codec: null },
];

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
  bitrate: number,
  onError: (err: Error) => void
): Promise<EncoderSetup> {
  // H.264 çift sayı pixel ister
  const w = width % 2 === 0 ? width : width - 1;
  const h = height % 2 === 0 ? height : height - 1;

  const failedCodecs: string[] = [];

  for (const candidate of CODEC_CANDIDATES) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: candidate.codec,
        width: w,
        height: h,
        bitrate,
        framerate: fps,
      });

      if (!support.supported) {
        failedCodecs.push(`${candidate.codec} (not supported)`);
        continue;
      }

      let target: any;
      let muxer: any;

      if (candidate.isMP4) {
        target = new Mp4ArrayBufferTarget();
        muxer = new Mp4Muxer({
          target: target,
          video: {
            codec: candidate.mp4Codec,
            width: w,
            height: h,
          },
          fastStart: 'in-memory',
        });
      } else {
        target = new WebMArrayBufferTarget();
        muxer = new WebMMuxer({
          target: target,
          video: {
            codec: candidate.codec === 'vp8' ? 'V_VP8' : 'V_VP9',
            width: w,
            height: h,
          },
        });
      }

      // Hata yakalama — ana akışa iletip kullanıcıya göster
      const encoder = new VideoEncoder({
        output: (chunk, meta) => {
          try {
            muxer.addVideoChunk(chunk, meta ?? undefined);
          } catch (e) {
            console.error('Muxer error:', e);
            onError(e instanceof Error ? e : new Error(String(e)));
          }
        },
        error: (err) => {
          console.error('VideoEncoder error:', err);
          onError(err instanceof Error ? err : new Error(String(err)));
        },
      });

      encoder.configure({
        codec: candidate.codec,
        width: w,
        height: h,
        bitrate,
        framerate: fps,
      });

      // Configure senkron olarak state'i günceller
      if (encoder.state !== 'configured') {
        failedCodecs.push(`${candidate.codec} (state: ${encoder.state})`);
        try { encoder.close(); } catch {}
        continue;
      }

      console.log(`✓ Codec seçildi: ${candidate.codec} (${w}x${h})`);
      return { encoder, muxer, target, mimeType: candidate.mimeType };
    } catch (e) {
      failedCodecs.push(`${candidate.codec} (${e instanceof Error ? e.message : 'unknown'})`);
      continue;
    }
  }

  throw new Error(
    `Hiçbir codec desteklenmiyor.\n\nDenenenler:\n${failedCodecs.map(c => '• ' + c).join('\n')}\n\n` +
    `Browser: ${navigator.userAgent}\n` +
    `Lütfen Chrome 94+ veya Edge 94+ deneyin.`
  );
}

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

  const scale = settings.quality;
  const outWidth = Math.max(2, Math.round(metadata.width * scale));
  const outHeight = Math.max(2, Math.round(metadata.height * scale));
  const fps = metadata.fps;
  const frameCount = metadata.frameCount;
  const bitrate = Math.min(8_000_000, Math.max(500_000, Math.round(outWidth * outHeight * fps * 0.07)));

  onProgress({
    phase: 'decoding',
    currentFrame: 0,
    totalFrames: frameCount,
    progress: 0,
    message: 'Encoder hazırlanıyor...',
  });

  // Encoder hatası burada toplanır
  let encoderError: Error | null = null;
  const reportError = (err: Error) => {
    if (!encoderError) encoderError = err;
  };

  const { encoder, muxer, target, mimeType } = await setupEncoder(
    outWidth, outHeight, fps, bitrate, reportError
  );

  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context alınamadı');

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
  const frameDuration = 1 / fps;

  onProgress({
    phase: 'processing',
    currentFrame: 0,
    totalFrames: frameCount,
    progress: 0,
    message: 'Frame işleme başladı...',
  });

  for (let i = 0; i < frameCount; i++) {
    if (signal?.aborted) {
      throw new Error('İşleme iptal edildi');
    }

    // Encoder hatası varsa hemen fırlat
    if (encoderError) {
      throw new Error(`Encoder hatası: ${encoderError.message}`);
    }

    // Encoder state kontrolü
    if (encoder.state !== 'configured') {
      throw new Error(
        `Encoder yapılandırılamadı (state: ${encoder.state}). ` +
        `Browser: ${navigator.userAgent.split(') ')[0]})`
      );
    }

    const seekTime = Math.min(metadata.duration - 0.001, i * frameDuration);
    await seekTo(video, seekTime);

    ctx.drawImage(video, 0, 0, outWidth, outHeight);
    const currentImageData = ctx.getImageData(0, 0, outWidth, outHeight);

    const blurred = applyMotionBlur(currentImageData, frameHistory.getHistory(), settings);
    ctx.putImageData(blurred, 0, 0);

    frameHistory.add(currentImageData);

    const timestampMicros = Math.round(i * frameDuration * 1_000_000);
    const durationMicros = Math.round(frameDuration * 1_000_000);

    const frame = new VideoFrame(canvas, {
      timestamp: timestampMicros,
      duration: durationMicros,
    });

    encoder.encode(frame, { keyFrame: i % 30 === 0 });
    frame.close();

    if (encoder.encodeQueueSize > 10) {
      await new Promise((r) => setTimeout(r, 1));
      if (encoder.encodeQueueSize > 20) {
        await encoder.flush();
      }
    }

    processedCount = i + 1;

    if (i % 3 === 0 || i === frameCount - 1) {
      onProgress({
        phase: 'processing',
        currentFrame: processedCount,
        totalFrames: frameCount,
        progress: processedCount / frameCount,
        message: `Frame işleniyor: ${processedCount}/${frameCount}`,
      });

      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Son kontrol
  if (encoderError) {
    throw new Error(`Encoder hatası: ${encoderError.message}`);
  }

  onProgress({
    phase: 'encoding',
    currentFrame: processedCount,
    totalFrames: frameCount,
    progress: 0.95,
    message: 'Final encode...',
  });

  await encoder.flush();
  await encoder.close();

  muxer.finalize();

  if (!target.buffer) {
    throw new Error('Muxer çıktı buffer üretmedi');
  }

  const blob = new Blob([target.buffer], { type: mimeType });
  const durationMs = performance.now() - startTime;

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
