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
  /**
   * 後ろが明るい（誕生石シーンの真っ白な背景が出ている）なら `true`。文字を濃い色（ink）にし、暗い背景向けの黒い影を白い縁取りとにじみに替え、上付きラベルに白い地を敷く。
   * 省略すると `false`（太陽・浜辺の暗い 3D の上に、白い文字で出す）。
   */
  isOnLight?: boolean;
}

// SceneHero: 画面左下に出る見出しブロック(上付きラベル・タイトル・説明・操作ヒント)。
export default function SceneHero({ content, headingRef, isOnLight = false }: SceneHeroProps) {
  // srOnlyWhenShort: 説明文とヒントを「見た目だけ」隠すクラス（sr-only。読み上げには残す）。
  // 高さが 480px（30rem）以下の画面（スマホの横持ちなど。app/globals.css の short:）で隠す。
  // 低い画面では、説明文とヒントだけで画面の半分近くを使い、操作パネルが入らなくなるため。
  // クラス名は組み立てず、必ずそのままの文字列で書く（Tailwind はソースの文字列から CSS を作るので、組み立てると CSS が作られない）
  const srOnlyWhenShort = "short:sr-only";
  // tone: 文字の色・影・フォーカスの枠の色。明るい背景では濃い色の文字にし、黒い影（白い背景の上では文字のまわりが濁って見える）の代わりに白いにじみを付ける。
  // 暗い背景では、白い文字に黒い影を付けて、明るい 3D の上でも読めるようにする。クラス名はそのままの文字列で書く
  const tone = isOnLight
    ? {
        // 濃い色の文字に、白い縁取り（ぼかし 1px と 3px の影）と白いにじみ（12px）を重ねる。白の上では見えないが、縦長の窓や小さな画面で見出しが
        // 色の濃い石や暗い月のラベルに重なったとき、文字のまわりを白く抜いて読めるようにする。
        // text-shadow は子へ受け継がれるので、ここに付ければタイトル・説明文・ヒントにも効く
        text: "text-ink [text-shadow:0_0_1px_#ffffff,0_0_3px_#ffffff,0_0_12px_rgba(255,255,255,0.95)]",
        // 上付きラベルの地: 白 85% の小さな札を敷く。11px の細い文字は縁取りだけでは足りず、320 × 568 の画面では JUL・JUN の暗いラベルの真上に来て読めなかったため
        // （暗いラベルの上でも、地は白に近くなり、濃い文字が 4.5:1 を超える）。-mx-1.5 と px-1.5 で、文字の左端はタイトルとそろえたままにする。
        // パソコン向けの配置でも薄くしない（opacity は地にも効き、縦長の窓で暗いラベルに重なったときに地が効ききらなくなるため）
        eyebrow: "-mx-1.5 w-fit rounded-sm bg-white/85 px-1.5 py-0.5",
        // タイトルのフォーカスの枠: 内側に白い縁、外側に濃い色（ink）の二重の枠（月のラベルと同じ。小さな画面で暗い石やラベルに重なっても見える）。
        // 影は上の text から受け継ぐ
        title:
          "focus-visible:shadow-[0_0_0_2px_#ffffff] focus-visible:outline-ink focus-visible:outline-offset-2",
        // 説明文に足すものは無い（影は上の text から受け継ぐ）
        tag: "",
      }
    : {
        // 文字の色は UI の層（PortfolioExperience）の text-paper を受け継ぐ
        text: "",
        // 上付きラベルは、パソコン向けの配置（roomy:）では 70% に薄くする
        eyebrow: "roomy:opacity-70",
        // タイトルの影と、白いフォーカスの枠
        title:
          "[text-shadow:0_4px_40px_rgba(0,0,0,0.45)] focus-visible:outline-paper focus-visible:outline-offset-4",
        // 説明文の影
        tag: "[text-shadow:0_2px_14px_rgba(0,0,0,0.4)]",
      };
  return (
    // hero: 見出しをまとめる縦組みのコンテナ。
    // 読み上げの知らせ（aria-live）はここには付けない。付けるとタブを切り替えたり石を選んだりするたびに、見出し全体が長々と読み上げられる。
    // 何を表示しているかは、PortfolioExperience の読み上げ専用の短い文（content.announcement）が伝える
    // max-w-150: 幅は最大 600px（パソコンの広い画面で、タイトルと説明文が横に伸びすぎないように）。
    // shrink-0: スマホ向けの配置で下の段に縦に積んだとき、開いた操作パネルに押されて見出しが潰れないようにする
    <div className={`max-w-150 shrink-0 ${tone.text}`}>
      {/* eyebrow: タイトル上の小さなラベル(例: Scene 01 — Solar)。英語として読み上げさせる。
          スマホ向けの配置では明るい 3D の真上に来るので薄くせず（不透明）、パソコン向けの配置では暗い背景のときだけ 70% に薄くする（tone.eyebrow） */}
      <div
        lang="en"
        className={`mb-2 roomy:mb-4 font-mono roomy:text-xs text-[11px] uppercase tracking-[0.26em] ${tone.eyebrow}`}
      >
        {content.eyebrow}
      </div>
      {/* title: 大きな英字タイトル(例: THE SUN)。英語として読み上げさせる。スマホ向けの配置では 44px（高さ 480px 以下の画面では 28px）、パソコン向けの配置では 76px。
          tabIndex={-1}: Tab キーでは止まらないが、解説カードを閉じたあとにプログラムからフォーカスを預けられるようにする。
          フォーカスの枠は、キーボードで閉じたとき（:focus-visible）だけ出す（暗い背景では白い枠、明るい背景では白い縁と濃い色の二重の枠。tone.title）。ふだんは outline-0（outline-none だと focus-visible で太さを付けても枠が出ないため。JewelCard の見出しと同じ） */}
      <h1
        ref={headingRef}
        tabIndex={-1}
        lang="en"
        className={`m-0 font-bold font-display roomy:text-[76px] short:text-[28px] text-[44px] leading-[0.9] tracking-[-0.03em] outline-0 focus-visible:outline-2 ${tone.title}`}
      >
        {content.title}
      </h1>
      {/* tag: 日本語の説明文。1 行は最大 440px（max-w-110。日本語が 1 行に約 27 字までで読みやすい長さ）。
          文字はスマホ向けの配置では 14px、パソコン向けの配置では 16px。上の余白は 12px / 18px。
          高さ 480px 以下の画面で、見た目だけ隠す（読み上げには残す） */}
      <p
        className={`mt-3 roomy:mt-4.5 max-w-110 font-jp font-medium roomy:text-base text-sm leading-[1.7] ${srOnlyWhenShort} opacity-90 ${tone.tag}`}
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
