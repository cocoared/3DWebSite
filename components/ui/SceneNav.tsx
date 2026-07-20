"use client";

import { TABS, type SceneTab } from "@/lib/scene";

// SceneNavProps: 現在のタブと、タブ選択時に親へ通知するコールバック。
interface SceneNavProps {
  active: SceneTab; // 選択中のシーン
  onSelect: (tab: SceneTab) => void; // タブが押されたときに呼ぶ
}

// SceneNav: 画面上部のナビゲーション。シーン切り替えタブを中央に配置する。
export default function SceneNav({ active, onSelect }: SceneNavProps) {
  return (
    // header: ナビ全体のコンテナ。タブを中央寄せする。
    <header className="flex items-center justify-center">
      {/* tabs: 中央のシーン切り替えボタンを丸いガラス風バーにまとめる。 */}
      <nav className="pointer-events-auto flex gap-[5px] rounded-full border border-white/15 bg-[rgba(10,12,20,0.55)] p-[5px] backdrop-blur-[14px]">
        {TABS.map((tab) => {
          // isActive: このタブが現在選択中か。
          const isActive = active === tab.id;
          return (
            // 各タブボタン。選択中なら白背景で強調し、押すと onSelect を呼ぶ。
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={`cursor-pointer rounded-full border-0 px-5 py-[9px] font-mono text-xs tracking-[0.14em] uppercase transition-colors ${
                isActive
                  ? "bg-paper font-bold text-[#0a0a12]"
                  : "text-paper/60 bg-transparent hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
