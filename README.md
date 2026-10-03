# MotionBlur Studio

Web tabanlı motion blur aracı — CapCut'a alternatif.

## Özellikler
- **Motion Threshold** algoritması: sadece gerçek hareket olan bölgeleri blurlar (CapCut'ın rastgele bulanıklık sorunu yok)
- **Tarayıcıda çalışır**: Sunucuya yükleme yok, tüm işlev WebCodecs API ile client-side
- **Shutter angle kontrolü**: Klasik sinematik motion blur simülasyonu (0-360°)
- **4 hazır preset**: Hafif, Sinematik, Ağır, Sport
- **H.264/VP9 dual codec**: H.264 öncelik, VP9 fallback
- **Tamamen ücretsiz, filigran yok**

## GitHub Pages'e Deploy (önerilen yol)

Repo'yu oluşturduktan sonra:

1. **Settings → Pages → Source**: "GitHub Actions" seçin
2. Kodu `main` branch'ine push'layın
3. `.github/workflows/deploy.yml` otomatik build alıp `https://<username>.github.io/<repo-name>/` adresine deploy eder

> Repo adı otomatik `basePath` olarak kullanılır (örn. repo `motionblur-studio` ise site `https://user.github.io/motionblur-studio/`).

> Eğer `https://user.github.io/` (kök) altında deploy etmek isterseniz, repo adını `<username>.github.io` yapın.

### Manuel statik build

GitHub Actions kullanmadan, kendi makinenizde build alıp `out/` klasörünü `gh-pages` branch'ine push'layabilirsiniz:

```bash
GITHUB_PAGES=true GITHUB_REPOSITORY="<user>/<repo>" bun run build:github
# out/ klasörü oluşur — bunu gh-pages branch'ine push'layın
```

## Lokal Geliştirme

```bash
# Bağımlılıkları yükle
bun install   # veya: npm install

# Dev server'ı başlat
bun run dev   # veya: npm run dev

# Tarayıcıda aç
# http://localhost:3000
```

## Teknoloji Stack
- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4 + shadcn/ui
- WebCodecs API (video encode/decode)
- mp4-muxer & webm-muxer (container muxing)
- Framer Motion

## Tarayıcı Desteği
- Chrome 94+ (önerilen)
- Edge 94+
- Safari 16.4+
- Firefox sınırlı destek

## Mimari

```
src/lib/motion-blur.ts      # Motion blur algoritması (motion mask + temporal blending)
src/lib/video-processor.ts  # WebCodecs pipeline (decode → blur → encode → mux)
src/components/motion-blur-tool.tsx  # Ana UI
src/app/page.tsx            # Route entry
.github/workflows/deploy.yml  # GitHub Pages CI/CD
```

## Kullanım

1. Video yükle (MP4/WebM/MOV, max 200MB)
2. Ayarları seç (preset veya manuel)
3. "Motion Blur Uygula" tıkla
4. Preview'i izle, indir

## Lisans
MIT
