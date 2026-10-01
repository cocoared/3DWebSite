"use client";

import type { Ref } from "react";
import type { HeroContent } from "@/lib/scene";

/** SceneHero の props。 */
interface SceneHeroProps {
  /** 表示する文言（lib/scene.ts の HERO か、誕生石シーンの一覧の見出し lib/scenes/jewels.ts の overviewHero）。石を選んでいる間は、この見出しの代わりに JewelCard が出る。 */
  content: HeroContent;
  /**
   * 大きな見出し（h1）の要素を受け取る ref。誕生石の解説カードを閉じたあと、月のラベルが画面に入るまで、ここへフォーカスを預ける（`PortfolioExperience`）。
   */
  headingRef?: Ref<HTMLHeadingElement>;
}

// SceneHero: 画面左下に出る見出しブロック(上付きラベル・タイトル・説明・操作ヒント)。
export default function SceneHero({ content, headingRef }: SceneHeroProps) {
  // srOnlyWhenShort: 説明文とヒントを「見た目だけ」隠すクラス（sr-only。読み上げには残す）。
  // 高さが 480px（30rem）以下の画面（スマホの横持ちなど。app/globals.css の short:）で隠す。
  // 低い画面では、説明文とヒントだけで画面の半分近くを使い、操作パネルが入らなくなるため。
  // クラス名は組み立てず、必ずそのままの文字列で書く（Tailwind はソースの文字列から CSS を作るので、組み立てると CSS が作られない）
  const srOnlyWhenShort = "short:sr-only";
  return (
    // hero: 見出しをまとめる縦組みのコンテナ。
    // 読み上げの知らせ（aria-live）はここには付けない。付けるとタブを切り替えたり石を選んだりするたびに、見出し全体が長々と読み上げられる。
    // 何を表示しているかは、PortfolioExperience の読み上げ専用の短い文（content.announcement）が伝える
    // max-w-150: 幅は最大 600px（パソコンの広い画面で、タイトルと説明文が横に伸びすぎないように）。
    // shrink-0: スマホ向けの配置で下の段に縦に積んだとき、開いた操作パネルに押されて見出しが潰れないようにする
    <div className="max-w-150 shrink-0">
      {/* eyebrow: タイトル上の小さなラベル(例: Scene 01 — Solar)。英語として読み上げさせる。
          スマホ向けの配置では明るい 3D の真上に来るので薄くせず（不透明）、パソコン向けの配置では 70% に薄くする */}
      <div
        lang="en"
        className="mb-2 roomy:mb-4 font-mono roomy:text-xs text-[11px] uppercase tracking-[0.26em] roomy:opacity-70"
      >
        {content.eyebrow}
      </div>
      {/* title: 大きな英字タイトル(例: THE SUN)。英語として読み上げさせる。スマホ向けの配置では 44px（高さ 480px 以下の画面では 28px）、パソコン向けの配置では 76px。
          tabIndex={-1}: Tab キーでは止まらないが、解説カードを閉じたあとにプログラムからフォーカスを預けられるようにする。
          フォーカスの枠は、キーボードで閉じたとき（:focus-visible）だけ白で出す。ふだんは outline-0（outline-none だと focus-visible で太さを付けても枠が出ないため。JewelCard の見出しと同じ） */}
      <h1
        ref={headingRef}
        tabIndex={-1}
        lang="en"
        className="m-0 font-bold font-display roomy:text-[76px] short:text-[28px] text-[44px] leading-[0.9] tracking-[-0.03em] outline-0 [text-shadow:0_4px_40px_rgba(0,0,0,0.45)] focus-visible:outline-2 focus-visible:outline-paper focus-visible:outline-offset-4"
      >
        {content.title}
      </h1>
      {/* tag: 日本語の説明文。1 行は最大 440px（max-w-110。日本語が 1 行に約 27 字までで読みやすい長さ）。
          文字はスマホ向けの配置では 14px、パソコン向けの配置では 16px。上の余白は 12px / 18px。
          高さ 480px 以下の画面で、見た目だけ隠す（読み上げには残す） */}
      <p
        className={`mt-3 roomy:mt-4.5 max-w-110 font-jp font-medium roomy:text-base text-sm leading-[1.7] ${srOnlyWhenShort} opacity-90 [text-shadow:0_2px_14px_rgba(0,0,0,0.4)]`}
      >
        {content.tag}
      </p>
      {/* hint: 操作方法のヒント(例: Drag to orbit · Click to flare)。頭に短い横線を付ける。英語として読み上げさせる。
          高さ 480px 以下の画面で、見た目だけ隠す（読み上げには残す） */}
      <div
        lang="en"
        className={`mt-4 roomy:mt-6 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] opacity-65 ${srOnlyWhenShort}`}
      >
        {/* 飾りの横線 */}
        <span className="h-px w-7 bg-current" />
        {content.hint}
      </div>
    </div>
  );
}
