"use client";

import type { HeroContent } from "@/lib/scene";

/** SceneHero の props。 */
interface SceneHeroProps {
  /** 表示する文言。シーンの見出し（lib/scene.ts の HERO）か、選んだ誕生石の見出し（lib/scenes/jewels.ts の jewelHero）。 */
  content: HeroContent;
}

// SceneHero: 画面左下に出る見出しブロック(上付きラベル・タイトル・説明・操作ヒント)。
export default function SceneHero({ content }: SceneHeroProps) {
  return (
    // hero: 見出しをまとめる縦組みのコンテナ。
    // 読み上げの知らせ（aria-live）はここには付けない。付けるとタブを切り替えたり石を選んだりするたびに、見出し全体が長々と読み上げられる。
    // 何を表示しているかは、PortfolioExperience の読み上げ専用の短い文（content.announcement）が伝える
    <div className="max-w-150">
      {/* eyebrow: タイトル上の小さなラベル(例: Scene 01 — Solar)。英語として読み上げさせる。 */}
      <div lang="en" className="mb-4 font-mono text-xs uppercase tracking-[0.26em] opacity-70">
        {content.eyebrow}
      </div>
      {/* title: 大きな英字タイトル(例: THE SUN)。英語として読み上げさせる。 */}
      <h1
        lang="en"
        className="m-0 font-bold font-display text-[76px] leading-[0.9] tracking-[-0.03em] [text-shadow:0_4px_40px_rgba(0,0,0,0.45)]"
      >
        {content.title}
      </h1>
      {/* tag: 日本語の説明文。 */}
      <p className="mt-4.5 max-w-110 font-jp font-medium text-base leading-[1.7] opacity-90 [text-shadow:0_2px_14px_rgba(0,0,0,0.4)]">
        {content.tag}
      </p>
      {/* hint: 操作方法のヒント(例: Drag to orbit · Click to flare)。頭に短い横線を付ける。英語として読み上げさせる。 */}
      <div
        lang="en"
        className="mt-6 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] opacity-65"
      >
        {/* 飾りの横線 */}
        <span className="h-px w-7 bg-current" />
        {content.hint}
      </div>
    </div>
  );
}
