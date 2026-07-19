"use client";

import { TABS, type SceneTab } from "@/lib/scene";

// SceneNavProps: 現在のタブと、タブ選択時に親へ通知するコールバック。
interface SceneNavProps {
  active: SceneTab; // 選択中のシーン
  onSelect: (tab: SceneTab) => void; // タブが押されたときに呼ぶ
}

// SceneNav: 画面上部のナビゲーション。左にブランド名、中央にシーン切り替えタブ。
export default function SceneNav({ active, onSelect }: SceneNavProps) {
  return (
    // header: ナビ全体の横並びコンテナ。
    <header className="nav">
      {/* brand: 左端のブランドロゴ文字。 */}
      <div className="brand">R·A</div>
      {/* tabs: 中央のシーン切り替えボタン群。 */}
      <nav className="tabs">
        {TABS.map((tab) => (
          // 各タブボタン。選択中なら on クラスで強調し、押すと onSelect を呼ぶ。
          <button key={tab.id} className={`tabb ${active === tab.id ? "on" : ""}`} onClick={() => onSelect(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>
      {/* navpad: 右側の余白。中央のタブを視覚的に中央寄せするためのダミー。 */}
      <div className="navpad" />
    </header>
  );
}
