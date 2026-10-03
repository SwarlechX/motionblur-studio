#!/bin/bash
# MotionBlur Studio source code packaging script
# Builds a clean .zip without node_modules / .next / dev artifacts

set -e

PROJECT_DIR="/home/z/my-project"
OUTPUT_ZIP="/home/z/my-project/download/motionblur-studio-source.zip"
STAGE_DIR="/tmp/motionblur-stage"

# Clean previous artifacts
rm -rf "$STAGE_DIR" "$OUTPUT_ZIP"
mkdir -p "$STAGE_DIR/motionblur-studio"

cd "$PROJECT_DIR"

# Copy source code (whitelist)
echo "Copying source files..."

# Top-level config files
cp package.json "$STAGE_DIR/motionblur-studio/"
cp tsconfig.json "$STAGE_DIR/motionblur-studio/"
cp next.config.ts "$STAGE_DIR/motionblur-studio/"
cp tailwind.config.ts "$STAGE_DIR/motionblur-studio/"
cp postcss.config.mjs "$STAGE_DIR/motionblur-studio/"
cp eslint.config.mjs "$STAGE_DIR/motionblur-studio/"
cp components.json "$STAGE_DIR/motionblur-studio/"
cp Caddyfile "$STAGE_DIR/motionblur-studio/"
cp next-env.d.ts "$STAGE_DIR/motionblur-studio/"
cp bun.lock "$STAGE_DIR/motionblur-studio/"
cp .gitignore "$STAGE_DIR/motionblur-studio/"
cp .env "$STAGE_DIR/motionblur-studio/" 2>/dev/null || echo "# env placeholder" > "$STAGE_DIR/motionblur-studio/.env"

# Source directories
cp -r src "$STAGE_DIR/motionblur-studio/"
cp -r public "$STAGE_DIR/motionblur-studio/"
cp -r prisma "$STAGE_DIR/motionblur-studio/"
cp -r examples "$STAGE_DIR/motionblur-studio/"
cp -r mini-services "$STAGE_DIR/motionblur-studio/" 2>/dev/null || true
cp -r tests "$STAGE_DIR/motionblur-studio/"
cp -r scripts "$STAGE_DIR/motionblur-studio/"

# GitHub Actions workflow
mkdir -p "$STAGE_DIR/motionblur-studio/.github/workflows"
cp .github/workflows/deploy.yml "$STAGE_DIR/motionblur-studio/.github/workflows/"

# Remove test artifacts (the test video & test scripts that aren't part of the app)
rm -f "$STAGE_DIR/motionblur-studio/public/test-input.mp4"
rm -f "$STAGE_DIR/motionblur-studio/scripts/test-input.mp4"
rm -f "$STAGE_DIR/motionblur-studio/scripts/make-test-video.sh"
rm -f "$STAGE_DIR/motionblur-studio/scripts/upload-script.js"

# Write a fresh README
cat > "$STAGE_DIR/motionblur-studio/README.md" << 'EOF'
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
EOF

# .gitkeep files for empty dirs
mkdir -p "$STAGE_DIR/motionblur-studio/db"
touch "$STAGE_DIR/motionblur-studio/db/.gitkeep"

# Cleanup __pycache__ / .DS_Store / etc
find "$STAGE_DIR/motionblur-studio" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find "$STAGE_DIR/motionblur-studio" -name ".DS_Store" -delete 2>/dev/null || true

# Build zip
cd "$STAGE_DIR"
zip -rq "$OUTPUT_ZIP" motionblur-studio/

# Report
SIZE=$(du -h "$OUTPUT_ZIP" | cut -f1)
FILES=$(find motionblur-studio -type f | wc -l)
echo ""
echo "✓ Zip created: $OUTPUT_ZIP"
echo "  Size: $SIZE"
echo "  Files: $FILES"

# Cleanup stage
rm -rf "$STAGE_DIR"
