"use client";

import type { CSSProperties } from "react";
import { SLIDERS, PANEL_ACCENT, type SceneTab } from "@/lib/scene";

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
      className="pointer-events-auto w-[276px] rounded-[18px] border border-white/15 bg-[rgba(9,10,16,0.6)] px-5 pt-[18px] pb-[22px] shadow-[0_26px_64px_-26px_rgba(0,0,0,0.8)] backdrop-blur-[16px]"
    >
      {/* p-head: パネル見出し。右に脈動する点を置く。 */}
      <div className="mb-2 flex items-center justify-between font-mono text-[11px] tracking-[0.2em] uppercase opacity-85">
        <span>Environment</span>
        <span className="h-[7px] w-[7px] [animation:pdot_1.9s_ease-in-out_infinite] rounded-full bg-[var(--accent)]" />
      </div>

      {sliders.map((s, i) => {
        // v: このスライダーの現在値。
        const v = values[s.field];
        return (
          // ctl: スライダー1本のラベル+入力。2本目以降は上に区切り線を引く。
          <label
            key={s.field}
            className={`flex flex-col gap-[9px] py-[11px] ${i > 0 ? "border-t border-white/10" : ""}`}
          >
            {/* c-top: 上段に名前(日本語+英語補足)と現在値を並べる。 */}
            <span className="flex items-baseline justify-between">
              <span className="text-[13px] font-bold">
                {s.name}{" "}
                <em className="ml-[7px] font-mono text-[10px] tracking-[0.08em] not-italic opacity-50">
                  {s.unit}
                </em>
              </span>
              {/* 現在値を小数2桁で、アクセント色で表示する。 */}
              <span className="font-mono text-xs font-bold text-[var(--accent)]">
                {v.toFixed(2)}
              </span>
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
