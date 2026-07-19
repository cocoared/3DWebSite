"use client";

import { HERO, type SceneTab } from "@/lib/scene";

// SceneHero: 画面左下に出る、現在のシーンの見出しブロック(上付きラベル・タイトル・説明・操作ヒント)。
export default function SceneHero({ tab }: { tab: SceneTab }) {
  // h: 現在のシーンに対応する見出し文言をテーブルから取り出す。
  const h = HERO[tab];
  return (
    // hero: 見出しをまとめる縦組みのコンテナ。
    <div className="hero">
      {/* eyebrow: タイトル上の小さなラベル(例: Scene 01 — Solar)。 */}
      <div className="eyebrow">{h.eyebrow}</div>
      {/* title: 大きな英字タイトル(例: THE SUN)。 */}
      <h1 className="title">{h.title}</h1>
      {/* tag: 日本語の説明文。 */}
      <p className="tag">{h.tag}</p>
      {/* hint: 操作方法のヒント(例: Drag to orbit · Click to flare)。 */}
      <div className="hint">{h.hint}</div>
    </div>
  );
}
