"use client";

import { HERO, type SceneTab } from "@/lib/scene";

// SceneHero: 画面左下に出る、現在のシーンの見出しブロック(上付きラベル・タイトル・説明・操作ヒント)。
export default function SceneHero({ tab }: { tab: SceneTab }) {
  // h: 現在のシーンに対応する見出し文言をテーブルから取り出す。
  const h = HERO[tab];
  return (
    // hero: 見出しをまとめる縦組みのコンテナ。
    <div className="max-w-[600px]">
      {/* eyebrow: タイトル上の小さなラベル(例: Scene 01 — Solar)。 */}
      <div className="mb-4 font-mono text-xs tracking-[0.26em] uppercase opacity-70">
        {h.eyebrow}
      </div>
      {/* title: 大きな英字タイトル(例: THE SUN)。 */}
      <h1 className="font-display m-0 text-[76px] leading-[0.9] font-bold tracking-[-0.03em] [text-shadow:0_4px_40px_rgba(0,0,0,0.45)]">
        {h.title}
      </h1>
      {/* tag: 日本語の説明文。 */}
      <p className="font-jp mt-[18px] max-w-[440px] text-base leading-[1.7] font-medium opacity-90 [text-shadow:0_2px_14px_rgba(0,0,0,0.4)]">
        {h.tag}
      </p>
      {/* hint: 操作方法のヒント(例: Drag to orbit · Click to flare)。頭に短い横線を付ける。 */}
      <div className="mt-6 flex items-center gap-3 font-mono text-[11px] tracking-[0.2em] uppercase opacity-65">
        <span className="h-px w-7 bg-current" />
        {h.hint}
      </div>
    </div>
  );
}
