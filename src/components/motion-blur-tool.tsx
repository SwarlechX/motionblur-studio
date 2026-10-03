'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Film,
  Download,
  Loader2,
  Settings2,
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  Zap,
  Github,
  ArrowRight,
  Gauge,
  Layers,
  Aperture,
  Wand2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  type MotionBlurSettings,
  DEFAULT_SETTINGS,
} from '@/lib/motion-blur';
import {
  isWebCodecsSupported,
  getVideoMetadata,
  generateThumbnail,
  processVideoWithMotionBlur,
  formatBytes,
  formatDuration,
  type ProcessedResult,
  type ProcessProgress,
} from '@/lib/video-processor';

type Stage = 'idle' | 'ready' | 'processing' | 'done' | 'error';

export default function MotionBlurTool() {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<{
    width: number;
    height: number;
    duration: number;
    frameCount: number;
  } | null>(null);
  const [settings, setSettings] = useState<MotionBlurSettings>(DEFAULT_SETTINGS);
  const [progress, setProgress] = useState<ProcessProgress | null>(null);
  const [result, setResult] = useState<ProcessedResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultUrlRef = useRef<string | null>(null);

  // WebCodecs kontrol — lazy init, dependency yok
  const [supported] = useState<boolean>(() => isWebCodecsSupported());

  // Cleanup result URL on unmount
  useEffect(() => {
    return () => {
      if (resultUrlRef.current) {
        URL.revokeObjectURL(resultUrlRef.current);
      }
    };
  }, []);

  // Ref ↔ state sync (ref'i event handlers'da kullan, state'i render'da kullan)
  useEffect(() => {
    resultUrlRef.current = resultUrl;
  }, [resultUrl]);

  const handleFile = useCallback(async (selectedFile: File) => {
    if (!selectedFile.type.startsWith('video/')) {
      toast({
        title: 'Geçersiz dosya',
        description: 'Lütfen bir video dosyası seçin (MP4, WebM, MOV).',
        variant: 'destructive',
      });
      return;
    }

    // 200MB üstü uyar
    if (selectedFile.size > 200 * 1024 * 1024) {
      toast({
        title: 'Büyük dosya uyarısı',
        description: '200MB üstü dosyalar işlem süresi uzun sürebilir.',
      });
    }

    setFile(selectedFile);
    setStage('ready');
    setResult(null);
    setProgress(null);

    try {
      const meta = await getVideoMetadata(selectedFile);
      setMetadata({
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
        frameCount: meta.frameCount,
      });

      const thumb = await generateThumbnail(selectedFile);
      setThumbnail(thumb);
    } catch (err) {
      toast({
        title: 'Video okunamadı',
        description: err instanceof Error ? err.message : 'Bilinmeyen hata',
        variant: 'destructive',
      });
      setStage('idle');
    }
  }, [toast]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFile(droppedFile);
    },
    [handleFile]
  );

  const handleProcess = async () => {
    if (!file) return;

    abortRef.current = new AbortController();
    setStage('processing');
    setProgress(null);

    // Önceki result URL'i temizle
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResultUrl(null);

    try {
      const result = await processVideoWithMotionBlur(
        file,
        settings,
        (p) => setProgress(p),
        abortRef.current.signal
      );
      setResult(result);
      const url = URL.createObjectURL(result.blob);
      resultUrlRef.current = url;
      setResultUrl(url);
      setStage('done');
      toast({
        title: 'Motion blur uygulandı!',
        description: `${result.framesProcessed} frame işlendi • ${formatDuration(result.durationMs)}`,
      });
    } catch (err) {
      if (abortRef.current?.signal.aborted) {
        setStage('ready');
        return;
      }
      toast({
        title: 'İşleme hatası',
        description: err instanceof Error ? err.message : 'Bilinmeyen hata',
        variant: 'destructive',
      });
      setStage('error');
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setStage('ready');
    setProgress(null);
  };

  const handleReset = () => {
    setFile(null);
    setThumbnail(null);
    setMetadata(null);
    setResult(null);
    setProgress(null);
    setStage('idle');
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResultUrl(null);
  };

  const updateSetting = <K extends keyof MotionBlurSettings>(
    key: K,
    value: MotionBlurSettings[K]
  ) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0b] text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800/80 backdrop-blur-xl sticky top-0 z-40 bg-[#0a0a0b]/80">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Aperture className="w-5 h-5 text-black" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-semibold tracking-tight">MotionBlur</div>
              <div className="text-[10px] text-zinc-500 -mt-0.5 font-mono">studio</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="hidden sm:flex border-zinc-700 text-zinc-400">
              <Zap className="w-3 h-3 mr-1" />
              WebCodecs
            </Badge>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-zinc-100 transition-colors"
              aria-label="GitHub"
            >
              <Github className="w-5 h-5" />
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Hero / Intro - sadece idle'da */}
        <AnimatePresence mode="wait">
          {stage === 'idle' && (
            <motion.div
              key="hero"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="max-w-3xl mx-auto text-center mb-12"
            >
              <Badge
                variant="outline"
                className="mb-5 border-amber-500/40 bg-amber-500/10 text-amber-300"
              >
                <Sparkles className="w-3 h-3 mr-1.5" />
                CapCut'a alternatif • Tarayıcıda çalışır
              </Badge>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-5 bg-gradient-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
                Kusursuz Motion Blur
              </h1>
              <p className="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
                CapCut'un güncelleme sonrası {'"rastgele bulanıklık"'} sorununu yaşıyorsanız doğru
                yerdesiniz. Motion threshold teknolojimizle sadece gerçek hareket olan bölgeleri
                blurlarız — statik sahneler net kalır. Hiçbir dosya sunucuya yüklenmez,
                hepsi tarayıcınızda işlenir.
              </p>

              {/* Feature badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-10 max-w-2xl mx-auto">
                {[
                  { icon: Gauge, label: 'Motion Threshold', desc: 'Akıllı hareket algılama' },
                  { icon: Layers, label: 'Temporal Blend', desc: 'Çoklu frame örnekleri' },
                  { icon: Aperture, label: 'Shutter Angle', desc: 'Sinematik kontrol' },
                  { icon: Zap, label: 'Hızlı', desc: 'WebCodecs ile' },
                ].map((f, i) => (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                    className="flex flex-col items-center text-center gap-1.5 p-3"
                  >
                    <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-1">
                      <f.icon className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="text-xs font-medium">{f.label}</div>
                    <div className="text-[10px] text-zinc-500 leading-tight">{f.desc}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Browser support warning */}
        {!supported && (
          <div className="max-w-2xl mx-auto mb-6">
            <Card className="bg-red-950/40 border-red-900/60 p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-red-200">WebCodecs desteklenmiyor</div>
                <p className="text-red-300/80 mt-1">
                  Lütfen Chrome 94+, Edge 94+ veya Safari 16.4+ kullanın. Firefox sınırlı destek
                  sunuyor.
                </p>
              </div>
            </Card>
          </div>
        )}

        {/* Upload zone */}
        {stage === 'idle' && (
          <div className="max-w-2xl mx-auto">
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative border-2 border-dashed rounded-2xl p-12 sm:p-16
                transition-all duration-300 cursor-pointer group
                ${
                  dragging
                    ? 'border-amber-500 bg-amber-500/10 scale-[1.02]'
                    : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/50 hover:bg-zinc-900/50'
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <div className="flex flex-col items-center text-center gap-4">
                <div
                  className={`
                  w-16 h-16 rounded-2xl flex items-center justify-center
                  bg-gradient-to-br from-amber-500/20 to-orange-600/20
                  border border-amber-500/30
                  transition-transform group-hover:scale-110
                `}
                >
                  <Upload className="w-7 h-7 text-amber-400" />
                </div>
                <div>
                  <div className="font-medium text-zinc-100">Video yükle</div>
                  <div className="text-sm text-zinc-500 mt-1">
                    Sürükle bırak veya tıkla • MP4, WebM, MOV • max 200MB
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom info */}
            <div className="mt-6 grid grid-cols-3 gap-3 text-xs">
              <div className="text-center text-zinc-500">
                <div className="font-mono text-zinc-300">100%</div>
                <div className="mt-1">Tarayıcıda</div>
              </div>
              <div className="text-center text-zinc-500">
                <div className="font-mono text-zinc-300">0</div>
                <div className="mt-1">Sunucu yükleme</div>
              </div>
              <div className="text-center text-zinc-500">
                <div className="font-mono text-zinc-300">Ücretsiz</div>
                <div className="mt-1">Filigran yok</div>
              </div>
            </div>
          </div>
        )}

        {/* Ready / Processing / Done — sidebar layout */}
        {stage !== 'idle' && file && (
          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            {/* Left: Preview + Result */}
            <div className="space-y-6">
              <Card className="bg-zinc-950 border-zinc-800 overflow-hidden">
                <div className="aspect-video bg-black relative">
                  {thumbnail && (
                    <img
                      src={thumbnail}
                      alt="Video preview"
                      className="w-full h-full object-contain"
                    />
                  )}
                  {stage === 'done' && resultUrl && (
                    <video
                      src={resultUrl}
                      controls
                      autoPlay
                      loop
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  )}
                  {stage === 'processing' && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                      <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
                      <div className="text-sm text-zinc-300">
                        {progress?.message || 'İşleniyor...'}
                      </div>
                      {progress && (
                        <div className="w-3/4 max-w-md">
                          <Progress
                            value={progress.progress * 100}
                            className="h-1.5 bg-zinc-800"
                          />
                          <div className="text-[10px] text-zinc-500 text-center mt-2 font-mono">
                            {progress.currentFrame} / {progress.totalFrames} •{' '}
                            {(progress.progress * 100).toFixed(1)}%
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>

              {/* Metadata badges */}
              {metadata && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
                    <Film className="w-3 h-3 mr-1" />
                    {metadata.width}×{metadata.height}
                  </Badge>
                  <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
                    {metadata.duration.toFixed(1)}s
                  </Badge>
                  <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
                    ~{metadata.frameCount} frame
                  </Badge>
                  <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
                    {formatBytes(file.size)}
                  </Badge>
                  {result && (
                    <>
                      <Separator orientation="vertical" className="h-5 bg-zinc-700" />
                      <Badge
                        variant="outline"
                        className="border-amber-700 bg-amber-950/50 text-amber-300"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {formatBytes(result.outputSizeBytes)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-amber-700 bg-amber-950/50 text-amber-300"
                      >
                        {result.width}×{result.height}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-amber-700 bg-amber-950/50 text-amber-300"
                      >
                        {formatDuration(result.durationMs)}
                      </Badge>
                    </>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                {stage === 'ready' && (
                  <>
                    <Button
                      onClick={handleProcess}
                      disabled={!supported}
                      size="lg"
                      className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-black font-semibold"
                    >
                      <Wand2 className="w-4 h-4 mr-2" />
                      Motion Blur Uygula
                    </Button>
                    <Button onClick={handleReset} variant="outline" size="lg">
                      <X className="w-4 h-4 mr-2" />
                      İptal
                    </Button>
                  </>
                )}
                {stage === 'processing' && (
                  <Button onClick={handleCancel} variant="outline" size="lg">
                    İptal Et
                  </Button>
                )}
                {stage === 'done' && (
                  <>
                    <Button
                      onClick={() => {
                        if (resultUrl) {
                          const a = document.createElement('a');
                          a.href = resultUrl;
                          a.download = `motion-blur-${Date.now()}.${
                            result?.mimeType === 'video/mp4' ? 'mp4' : 'webm'
                          }`;
                          a.click();
                        }
                      }}
                      size="lg"
                      className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-black font-semibold"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      İndir
                    </Button>
                    <Button onClick={handleReset} variant="outline" size="lg">
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Yeni Video
                    </Button>
                  </>
                )}
                {stage === 'error' && (
                  <Button onClick={handleReset} variant="outline" size="lg">
                    Yeniden Dene
                  </Button>
                )}
              </div>
            </div>

            {/* Right: Settings panel */}
            <aside className="space-y-4">
              <Card className="bg-zinc-950 border-zinc-800 p-5 lg:sticky lg:top-20">
                <div className="flex items-center gap-2 mb-5">
                  <Settings2 className="w-4 h-4 text-amber-400" />
                  <h3 className="font-semibold text-sm">Ayarlar</h3>
                  <Badge variant="outline" className="ml-auto text-[10px] border-zinc-700 text-zinc-500">
                    Preset: Custom
                  </Badge>
                </div>

                <div className="space-y-5">
                  {/* Motion Threshold */}
                  <SettingSlider
                    label="Motion Threshold"
                    icon={Gauge}
                    value={settings.motionThreshold}
                    min={0}
                    max={100}
                    step={1}
                    unit=""
                    description="Düşük: daha çok blur. Yüksek: sadece hızlı hareket blur olur."
                    onChange={(v) => updateSetting('motionThreshold', v)}
                  />

                  {/* Blur Strength */}
                  <SettingSlider
                    label="Blur Yoğunluğu"
                    icon={Wand2}
                    value={settings.blurStrength}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    description="Hareketli bölgelere uygulanan blur miktarı."
                    onChange={(v) => updateSetting('blurStrength', v)}
                  />

                  {/* Samples */}
                  <SettingSlider
                    label="Frame Örnekleri"
                    icon={Layers}
                    value={settings.samples}
                    min={1}
                    max={8}
                    step={1}
                    unit=" frame"
                    description="Daha fazla = daha yumuşak blur ama daha yavaş."
                    onChange={(v) => updateSetting('samples', v)}
                  />

                  {/* Shutter Angle */}
                  <SettingSlider
                    label="Shutter Açısı"
                    icon={Aperture}
                    value={settings.shutterAngle}
                    min={0}
                    max={360}
                    step={15}
                    unit="°"
                    description="180° = klasik sinema. 360° = tam accumulation."
                    onChange={(v) => updateSetting('shutterAngle', v)}
                  />

                  <Separator className="bg-zinc-800" />

                  {/* Quality */}
                  <SettingSlider
                    label="Kalite"
                    icon={Zap}
                    value={Math.round(settings.quality * 100)}
                    min={25}
                    max={100}
                    step={5}
                    unit="%"
                    description="Düşük: hızlı. Yüksek: orijinal çözünürlük."
                    onChange={(v) => updateSetting('quality', v / 100)}
                  />

                  <Separator className="bg-zinc-800" />

                  {/* Presets */}
                  <div>
                    <Label className="text-xs text-zinc-400 mb-2 block">Hazır Ayarlar</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <PresetButton
                        label="Hafif"
                        onClick={() =>
                          setSettings({
                            ...DEFAULT_SETTINGS,
                            samples: 2,
                            shutterAngle: 90,
                            motionThreshold: 25,
                            blurStrength: 40,
                          })
                        }
                      />
                      <PresetButton
                        label="Sinematik"
                        active
                        onClick={() =>
                          setSettings({
                            ...DEFAULT_SETTINGS,
                            samples: 4,
                            shutterAngle: 180,
                            motionThreshold: 15,
                            blurStrength: 70,
                          })
                        }
                      />
                      <PresetButton
                        label="Ağır"
                        onClick={() =>
                          setSettings({
                            ...DEFAULT_SETTINGS,
                            samples: 6,
                            shutterAngle: 270,
                            motionThreshold: 8,
                            blurStrength: 90,
                          })
                        }
                      />
                      <PresetButton
                        label="Sport"
                        onClick={() =>
                          setSettings({
                            ...DEFAULT_SETTINGS,
                            samples: 5,
                            shutterAngle: 225,
                            motionThreshold: 20,
                            blurStrength: 80,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Info card */}
              <Card className="bg-zinc-950/50 border-zinc-800/50 p-4">
                <div className="text-xs text-zinc-400 leading-relaxed">
                  <div className="font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    CapCut'a göre farkı
                  </div>
                  <p>
                    CapCut rastgele bulanıklık basar çünkü motion estimation yapmaz. Bizim motion
                    threshold algoritması piksel farklarını analiz eder, sadece gerçek hareket
                    olan bölgeleri blurlar. Statik sahneler %100 net kalır.
                  </p>
                </div>
              </Card>
            </aside>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 mt-auto">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <div>
            Tarayıcıda işlenir • Sunucuya yükleme yok •{' '}
            <a href="#" className="hover:text-zinc-300 transition-colors">
              Gizlilik
            </a>
          </div>
          <div className="font-mono">Powered by WebCodecs</div>
        </div>
      </footer>
    </div>
  );
}

interface SettingSliderProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  description: string;
  onChange: (value: number) => void;
}

function SettingSlider({
  label,
  icon: Icon,
  value,
  min,
  max,
  step,
  unit,
  description,
  onChange,
}: SettingSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
          <Icon className="w-3.5 h-3.5 text-amber-400/80" />
          {label}
        </div>
        <div className="font-mono text-xs text-amber-400">
          {value}
          {unit}
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        className="[&_[role=slider]]:bg-amber-500 [&_[role=slider]]:border-amber-400 [&_[role=slider]]:shadow-amber-500/50"
      />
      <p className="text-[10px] text-zinc-500 leading-relaxed">{description}</p>
    </div>
  );
}

function PresetButton({
  label,
  onClick,
  active,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        text-xs py-2 px-3 rounded-md border transition-all
        ${
          active
            ? 'border-amber-500 bg-amber-500/10 text-amber-300'
            : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
        }
      `}
    >
      {label}
    </button>
  );
}
