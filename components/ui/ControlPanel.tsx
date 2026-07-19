"use client";

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
  // accent: このシーン用のパネル装飾色クラス(pSun/pOce/pGem)。
  const accent = PANEL_ACCENT[tab];
  return (
    // panel: 半透明のガラス風パネル。accent で色味を切り替える。
    <div className={`panel ${accent}`}>
      {/* p-head: パネル見出し。右に脈動する点を置く。 */}
      <div className="p-head">
        <span>Environment</span>
        <span className="dot" />
      </div>
      {sliders.map((s) => {
        // v: このスライダーの現在値。
        const v = values[s.field];
        return (
          // ctl: スライダー1本のラベル+入力。
          <label className="ctl" key={s.field}>
            {/* c-top: 上段に名前(日本語+英語補足)と現在値を並べる。 */}
            <span className="c-top">
              <span className="c-name">
                {s.name} <em>{s.unit}</em>
              </span>
              {/* 現在値を小数2桁で表示する。 */}
              <span className="c-val">{v.toFixed(2)}</span>
            </span>
            {/* range: 実際のスライダー。動かすと onChange で親のパラメータを更新する。 */}
            <input className="rng" type="range" min={s.min} max={s.max} step={s.step} value={v} onChange={(e) => onChange(s.field, parseFloat(e.target.value))} />
          </label>
        );
      })}
    </div>
  );
}
