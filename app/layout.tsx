import type { Metadata } from "next";
import { Manrope, Space_Grotesk, Space_Mono, Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";

// 4書体を next/font 経由で読み込む。ビルド時に自サーバーへ同梱されるため、
// 外部 CDN への接続が不要になり、フォント差し替え時のガタつき(CLS)も自動で抑えられる。
// variable: globals.css の @theme から参照する CSS 変数名。
// display: "swap" → フォント到着前は代替フォントで表示する(文字が消えない)。

// 大見出し用。
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

// 本文・UI 用。
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

// 日本語本文用(SceneHero の説明文)。
// next/font の型は latin / latin-ext / cyrillic しか受け付けないが、
// 日本語グリフは unicode-range 付きで CSS に含まれるため表示できる。
const zenKaku = Zen_Kaku_Gothic_New({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-zen-kaku",
  display: "swap",
});

// ラベル・数値用の等幅。
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

// metadata: ブラウザのタブに出るタイトルと説明(Next.js が <head> に出力する)。
export const metadata: Metadata = {
  title: "3D Portfolio",
  description: "太陽・浜辺・宝石。3つのリアルタイム 3D シーンで綴るポートフォリオ。",
};

// RootLayout: 全ページ共通の外枠。フォント変数の配布と html/body を定義する。
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // lang="ja": 主言語を日本語に設定する。
    // className: 4書体ぶんの CSS 変数を <html> に載せ、配下すべてで使えるようにする。
    <html
      lang="ja"
      className={`${spaceGrotesk.variable} ${manrope.variable} ${zenKaku.variable} ${spaceMono.variable}`}
    >
      {/* body: ページ本体。暗い下地・本文フォント・全画面固定（3D はスクロールさせない）。 */}
      <body className="m-0 overflow-hidden bg-ink font-body text-paper antialiased">
        {children}
      </body>
    </html>
  );
}
