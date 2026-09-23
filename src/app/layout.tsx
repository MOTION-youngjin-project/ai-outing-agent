import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION = "대구 날씨·대기질·행사·주차를 함께 확인해서 지금 나가기 좋은 곳을 추천해요.";

// 탭 아이콘은 src/app/icon.png를 Next가 자동으로 집어간다(별도 설정 불필요).
export const metadata: Metadata = {
  title: "NAPL · 나들플랜",
  description: DESCRIPTION,
  applicationName: "NAPL",
  openGraph: {
    title: "NAPL · 나들플랜",
    description: DESCRIPTION,
    images: ["/napl-logo.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
