import type { Metadata } from "next";
import "./globals.css";

// metadata: ブラウザのタブに出るタイトルと説明(Next.js が <head> に出力する)。
export const metadata: Metadata = {
  title: "3D Portfolio",
  description: "太陽・浜辺・宝石。3つのリアルタイム 3D シーンで綴るポートフォリオ。",
};

// RootLayout: 全ページ共通の外枠。フォントの読み込みと html/body を定義する。
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // lang="ja": 主言語を日本語に設定する。
    <html lang="ja">
      <head>
        {/* Google Fonts への接続を事前に開いて表示を早める(preconnect)。 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* 使用する4書体(見出し・本文・日本語・等幅)をまとめて読み込む。 */}
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* body: ページ本体。暗い下地・本文フォント・全画面固定（3D はスクロールさせない）。 */}
      <body className="bg-ink font-body text-paper m-0 overflow-hidden antialiased">
        {children}
      </body>
    </html>
  );
}
