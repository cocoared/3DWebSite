"use client";

import { type SceneTab, TABS } from "@/lib/scene";

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
      <nav className="pointer-events-auto flex gap-1.25 rounded-full border border-white/15 bg-[rgba(10,12,20,0.55)] p-1.25 backdrop-blur-[14px]">
        {TABS.map((tab) => {
          // isActive: このタブが現在選択中か。
          const isActive = active === tab.id;
          return (
            // 各タブボタン。選択中なら白背景で強調し、押すと onSelect を呼ぶ。
            <button
              // type="button": 既定の type="submit" だと、将来 <form> の中に置いたときにフォーム送信が走ってしまうため明示する
              type="button"
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              // 前半は常時適用、後半の三項演算子で選択中/非選択のスタイルを差し替える。
              // [] は Tailwind の任意値(既定の階段に無い値を直接指定)、/60 は不透明度。
              className={`cursor-pointer rounded-full border-0 px-5 py-2.25 font-mono text-xs uppercase tracking-[0.14em] transition-colors ${
                isActive
                  ? "bg-paper font-bold text-[#0a0a12]"
                  : "bg-transparent text-paper/60 hover:text-white"
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
