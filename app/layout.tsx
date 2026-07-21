import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "협력적 문제해결 지원 시스템",
  description: "AI와 생각을 정교화하고 동료와 관점을 비교하며 팀의 결론을 함께 만드는 학습 지원 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-cream text-ink antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
