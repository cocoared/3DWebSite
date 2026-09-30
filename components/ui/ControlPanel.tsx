"use client";

import type { CSSProperties } from "react";
import { PANEL_ACCENT, type SceneTab, SLIDERS } from "@/lib/scene";

// ControlPanelProps: 現在のシーン・そのパラメータ値・値変更時のコールバック。
interface ControlPanelProps {
  tab: SceneTab; // 対象シーン
  values: Record<string, number>; // フィールド名→現在値(例: { amb: 1.5, rot: 0.5, ... })
  onChange: (field: string, value: number) => void; // スライダー操作時に呼ぶ
}

// ControlPanel: 画面右下の操作パネル。シーンごとに定義されたスライダーを並べる。
export default function ControlPanel({ tab, values, onChange }: ControlPanelProps) {
  // sliders: このシーンで表示するスライダー定義の配列。
  const sliders = SLIDERS[tab];
  // accentStyle: このシーンのアクセント色を CSS 変数 --accent へ流し込む。
  // globals.css のスライダーつまみと、数値・脈動点の色がこの変数を読む。
  const accentStyle = { "--accent": PANEL_ACCENT[tab] } as CSSProperties;

  return (
    // panel: 半透明のガラス風パネル。--accent でシーン色を全体へ伝える。
    <div
      style={accentStyle}
      className="pointer-events-auto w-69 rounded-[18px] border border-white/15 bg-[rgba(9,10,16,0.6)] px-5 pt-4.5 pb-5.5 shadow-[0_26px_64px_-26px_rgba(0,0,0,0.8)] backdrop-blur-lg"
    >
      {/* p-head: パネル見出し。右に脈動する点を置く。 */}
      <div className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.2em] opacity-85">
        <span>Environment</span>
        <span className="h-1.75 w-1.75 animate-[pdot_1.9s_ease-in-out_infinite] rounded-full bg-(--accent)" />
      </div>

      {sliders.map((s, i) => {
        // v: このスライダーの現在値。
        const v = values[s.field];
        return (
          // ctl: スライダー1本のラベル+入力。2本目以降は上に区切り線を引く。
          <label
            key={s.field}
            className={`flex flex-col gap-2.25 py-2.75 ${i > 0 ? "border-white/10 border-t" : ""}`}
          >
            {/* c-top: 上段に名前(日本語+英語補足)と現在値を並べる。 */}
            <span className="flex items-baseline justify-between">
              <span className="font-bold text-[13px]">
                {s.name}{" "}
                <em className="ml-1.75 font-mono text-[10px] not-italic tracking-[0.08em] opacity-50">
                  {s.unit}
                </em>
              </span>
              {/* 現在値を小数2桁で、アクセント色で表示する。 */}
              <span className="font-bold font-mono text-(--accent) text-xs">{v.toFixed(2)}</span>
            </span>
            {/* range: 実際のスライダー。動かすと onChange で親のパラメータを更新する。 */}
            {/* .rng のトラック/つまみは globals.css 側で定義（疑似要素が必要なため）。 */}
            <input
              className="rng"
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={v}
              onChange={(e) => onChange(s.field, parseFloat(e.target.value))}
            />
          </label>
        );
      })}
    </div>
  );
}
