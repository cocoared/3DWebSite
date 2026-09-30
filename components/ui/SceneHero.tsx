"use client";

import type { HeroContent } from "@/lib/scene";

/** SceneHero の props。 */
interface SceneHeroProps {
  /** 表示する文言。シーンの見出し（lib/scene.ts の HERO）か、選んだ誕生石の見出し（lib/scenes/jewels.ts の jewelHero）。 */
  content: HeroContent;
  /**
   * スマホ向けの配置（compact:。幅 768px 未満か高さ 480px 以下）で、説明文と操作のヒントを見た目だけ隠して（読み上げには残す）、ラベルとタイトルだけにするか。
   * 詳細のシートが開いている間に使う。高さ 480px 以下の画面ではラベルも隠す（パソコン向けの配置では効かない）。
   */
  isCompact?: boolean;
}

// SceneHero: 画面左下に出る見出しブロック(上付きラベル・タイトル・説明・操作ヒント)。
export default function SceneHero({ content, isCompact = false }: SceneHeroProps) {
  // srOnlyWhenCramped: 説明文とヒントを「見た目だけ」隠すクラス（sr-only。読み上げには残す）。スマホ向けの配置だけで効く。
  // 小さくするとき（詳細のシートが開いている間。compact:）と、高さが 480px（30rem）以下の画面（スマホの横持ちなど。app/globals.css の short:）で隠す。
  // 低い画面では、説明文とヒントだけで画面の半分近くを使い、操作パネルが入らなくなるため（高さの低い画面はいつもスマホ向けの配置なので、パソコン向けの配置では効かない）。
  // クラス名は組み立てず、必ずそのままの文字列で書く。Tailwind はソースの文字列を読んで使うクラスだけを CSS にするので、`${"short"}:sr-only` のように組み立てると CSS が作られない
  const srOnlyWhenCramped = isCompact ? "compact:sr-only short:sr-only" : "short:sr-only";
  // eyebrowWhenCramped: 小さくしていて、しかも画面が低いときは、上付きラベル（例: 05 — MAY）も見た目だけ隠す（石の名前のタイトルは残す）
  const eyebrowWhenCramped = isCompact ? "short:sr-only" : "";
  return (
    // hero: 見出しをまとめる縦組みのコンテナ。
    // 読み上げの知らせ（aria-live）はここには付けない。付けるとタブを切り替えたり石を選んだりするたびに、見出し全体が長々と読み上げられる。
    // 何を表示しているかは、PortfolioExperience の読み上げ専用の短い文（content.announcement）が伝える
    // max-w-150: 幅は最大 600px（パソコンの広い画面で、タイトルと説明文が横に伸びすぎないように）。
    // shrink-0: スマホ向けの配置で下の段に縦に積んだとき、詳細のシートに押されて見出しが潰れないようにする
    <div className="max-w-150 shrink-0">
      {/* eyebrow: タイトル上の小さなラベル(例: Scene 01 — Solar)。英語として読み上げさせる。
          スマホ向けの配置では明るい 3D の真上に来るので薄くせず（不透明）、パソコン向けの配置では 70% に薄くする。
          小さくしていて画面が低いときは、見た目だけ隠す（読み上げには残す） */}
      <div
        lang="en"
        className={`mb-2 roomy:mb-4 font-mono roomy:text-xs text-[11px] uppercase tracking-[0.26em] roomy:opacity-70 ${eyebrowWhenCramped}`}
      >
        {content.eyebrow}
      </div>
      {/* title: 大きな英字タイトル(例: THE SUN)。英語として読み上げさせる。スマホ向けの配置では 44px（高さ 480px 以下の画面では 28px）、パソコン向けの配置では 76px。 */}
      <h1
        lang="en"
        className="m-0 font-bold font-display roomy:text-[76px] short:text-[28px] text-[44px] leading-[0.9] tracking-[-0.03em] [text-shadow:0_4px_40px_rgba(0,0,0,0.45)]"
      >
        {content.title}
      </h1>
      {/* tag: 日本語の説明文。1 行は最大 440px（max-w-110。日本語が 1 行に約 27 字までで読みやすい長さ）。
          文字はスマホ向けの配置では 14px、パソコン向けの配置では 16px。上の余白は 12px / 18px。
          スマホ向けの配置では、小さくするときと高さ 480px 以下の画面で、見た目だけ隠す（読み上げには残す） */}
      <p
        className={`mt-3 roomy:mt-4.5 max-w-110 font-jp font-medium roomy:text-base text-sm leading-[1.7] ${srOnlyWhenCramped} opacity-90 [text-shadow:0_2px_14px_rgba(0,0,0,0.4)]`}
      >
        {content.tag}
      </p>
      {/* hint: 操作方法のヒント(例: Drag to orbit · Click to flare)。頭に短い横線を付ける。英語として読み上げさせる。
          スマホ向けの配置では、小さくするときと高さ 480px 以下の画面で、見た目だけ隠す（読み上げには残す） */}
      <div
        lang="en"
        className={`mt-4 roomy:mt-6 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] opacity-65 ${srOnlyWhenCramped}`}
      >
        {/* 飾りの横線 */}
        <span className="h-px w-7 bg-current" />
        {content.hint}
      </div>
    </div>
  );
}
