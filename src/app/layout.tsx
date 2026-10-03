import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "MotionBlur Studio — Kusursuz Motion Blur Aracı",
  description:
    "CapCut'a alternatif web tabanlı motion blur aracı. Motion threshold teknolojisiyle sadece hareketli bölgeleri blurlar. Tarayıcıda çalışır, sunucuya yükleme yok.",
  keywords: [
    "motion blur",
    "video editing",
    "capcut alternative",
    "web video editor",
    "motion blur online",
    "free motion blur",
  ],
  authors: [{ name: "MotionBlur Studio" }],
  openGraph: {
    title: "MotionBlur Studio",
    description: "CapCut'a alternatif kusursuz motion blur — tarayıcıda çalışır",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MotionBlur Studio",
    description: "CapCut'a alternatif kusursuz motion blur",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23f59e0b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpolygon points='14.31 8 16.96 12.5 14.31 17 9.69 17 7.04 12.5 9.69 8'/%3E%3C/svg%3E" />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
