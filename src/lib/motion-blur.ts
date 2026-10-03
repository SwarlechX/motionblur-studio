/**
 * Motion Blur Algorithm
 *
 * CapCut'un aksine, bu algoritma "motion threshold" kullanır:
 * Sadece gerçek hareket tespit edilen pikseller blur yapılır.
 * Statik bölgeler net kalır → rastgele bulanıklık sorunu yok.
 *
 * Algoritma:
 * 1. N adet önceki frame'i circular buffer'da tut
 * 2. Her frame için motion mask hesapla (pixel difference > threshold)
 * 3. Motion mask içindeki piksellerde temporal blending uygula
 * 4. Statik pikselleri olduğu gibi bırak
 */

export interface MotionBlurSettings {
  /** 1-8 arası, kaç frame örneği blend edilecek */
  samples: number;
  /** 0-360 derece, kamera shutter açısı (180 = klasik sinema) */
  shutterAngle: number;
  /** 0-100, motion threshold (altındaki pikseller net kalır) */
  motionThreshold: number;
  /** 0-100, blur yoğunluğu (blend weight scaling) */
  blurStrength: number;
  /** 0.5-1.0, processing scale (düşük = hızlı, düşük kalite) */
  quality: number;
}

export const DEFAULT_SETTINGS: MotionBlurSettings = {
  samples: 4,
  shutterAngle: 180,
  motionThreshold: 15,
  blurStrength: 70,
  quality: 1.0,
};

export interface ProcessProgress {
  phase: 'decoding' | 'processing' | 'encoding' | 'muxing' | 'done' | 'error';
  currentFrame: number;
  totalFrames: number;
  progress: number; // 0-1
  message: string;
}

export type ProgressCallback = (progress: ProcessProgress) => void;

interface FrameBuffer {
  data: ImageData;
  timestamp: number; // microseconds
  duration: number; // microseconds
}

/**
 * Motion mask hesapla: mevcut frame ile önceki frame arasındaki piksel farkları
 * Threshold üzerindeki pikseller "moving" işaretlenir.
 */
function computeMotionMask(
  current: ImageData,
  previous: ImageData,
  threshold: number
): Uint8Array {
  const width = current.width;
  const height = current.height;
  const mask = new Uint8Array(width * height);
  const cur = current.data;
  const prev = previous.data;
  const thr = threshold * 3; // RGB toplamı için

  for (let i = 0, p = 0; i < cur.length; i += 4, p++) {
    const dr = Math.abs(cur[i] - prev[i]);
    const dg = Math.abs(cur[i + 1] - prev[i + 1]);
    const db = Math.abs(cur[i + 2] - prev[i + 2]);
    const diff = dr + dg + db;
    mask[p] = diff > thr ? 1 : 0;
  }
  return mask;
}

/**
 * Motion mask'i yumuşat (blur uygula) — kenar yumuşak olsun diye
 * Basit box blur, 3x3 kernel
 */
function smoothMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const smoothed = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      sum += mask[(y - 1) * width + x - 1];
      sum += mask[(y - 1) * width + x];
      sum += mask[(y - 1) * width + x + 1];
      sum += mask[y * width + x - 1];
      sum += mask[y * width + x];
      sum += mask[y * width + x + 1];
      sum += mask[(y + 1) * width + x - 1];
      sum += mask[(y + 1) * width + x];
      sum += mask[(y + 1) * width + x + 1];
      smoothed[y * width + x] = sum >= 5 ? 1 : 0;
    }
  }
  return smoothed;
}

/**
 * Frame blending: motion blur uygula
 * - Motion mask içindeki pikseller: temporal blend (önceki frame'lerle)
 * - Statik pikseller: mevcut frame olduğu gibi
 */
export function applyMotionBlur(
  current: ImageData,
  history: ImageData[],
  settings: MotionBlurSettings
): ImageData {
  const { width, height, data } = current;
  const output = new Uint8ClampedArray(data);

  // Statik sahne — history yok veya 1 frame — blur'a gerek yok
  if (history.length === 0) {
    return new ImageData(output, width, height);
  }

  // Motion threshold çok yüksekse — hiçbir şey blur olmaz
  if (settings.motionThreshold >= 100) {
    return new ImageData(output, width, height);
  }

  // Motion mask hesapla (en son frame'e göre)
  const motionMask = computeMotionMask(current, history[0], settings.motionThreshold);
  const smoothedMask = smoothMask(motionMask, width, height);

  // Blend weights: shutter angle'e göre exponential decay
  // shutterAngle=180 → weights [1.0, 0.5, 0.25, 0.125]
  // shutterAngle=360 → weights [1.0, 1.0, 1.0, 1.0] (full accumulation)
  const shutterFactor = settings.shutterAngle / 360;
  const blurScale = settings.blurStrength / 100;
  const samples = Math.min(settings.samples, history.length);

  const weights: number[] = [];
  let totalWeight = 1; // current frame
  for (let i = 0; i < samples; i++) {
    // Her frame için shutter faktörü kadar ağırlık
    const w = Math.pow(shutterFactor, i + 1) * blurScale;
    weights.push(w);
    totalWeight += w;
  }

  // Blend
  const denom = totalWeight;
  for (let p = 0; p < smoothedMask.length; p++) {
    if (smoothedMask[p] === 0) continue; // statik piksel — atla

    let r = data[p * 4];
    let g = data[p * 4 + 1];
    let b = data[p * 4 + 2];

    for (let h = 0; h < samples; h++) {
      const hp = history[h].data;
      const w = weights[h] / denom;
      r += hp[p * 4] * w;
      g += hp[p * 4 + 1] * w;
      b += hp[p * 4 + 2] * w;
    }

    output[p * 4] = Math.min(255, r / denom);
    output[p * 4 + 1] = Math.min(255, g / denom);
    output[p * 4 + 2] = Math.min(255, b / denom);
    output[p * 4 + 3] = 255; // alpha
  }

  return new ImageData(output, width, height);
}

/**
 * FrameBuffer sınıfı: son N frame'i tutar, motion blur için history sağlar
 */
export class FrameHistory {
  private frames: ImageData[] = [];
  private maxSamples: number;

  constructor(maxSamples: number) {
    this.maxSamples = maxSamples;
  }

  add(frame: ImageData): void {
    this.frames.unshift(frame);
    if (this.frames.length > this.maxSamples) {
      this.frames.pop();
    }
  }

  getHistory(): ImageData[] {
    return this.frames.slice(0, this.maxSamples);
  }

  clear(): void {
    this.frames = [];
  }
}
