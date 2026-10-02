"use client";

import { type CSSProperties, useId, useState } from "react";
import { PANEL_ACCENT, type SceneTab, SLIDERS } from "@/lib/scene";

/** ControlPanel の props。 */
interface ControlPanelProps {
  /** 対象のシーン。並べるスライダー（lib/scene.ts の SLIDERS）と、パネルの色（PANEL_ACCENT）が決まる。 */
  tab: SceneTab;
  /** スライダーの名前（`SLIDERS[tab]` の `field`）→ 今の値。例: `{ amb: 1.5, rot: 0.5, mera: 0.55 }` */
  values: Record<string, number>;
  /** スライダーが動かされたときに、その名前と新しい値で呼ぶ。 */
  onChange: (field: string, value: number) => void;
}

// ControlPanel: 画面右下の操作パネル。シーンごとに定義されたスライダーを並べる。
// スマホ向けの配置（compact:。幅 768px 未満か高さ 480px 以下）では 3D を広く見せるため、「Environment」ボタンで開け閉めする。パソコン向けの配置ではいつも開いている。
export default function ControlPanel({ tab, values, onChange }: ControlPanelProps) {
  // sliders: このシーンで表示するスライダー定義の配列。
  const sliders = SLIDERS[tab];
  // accentStyle: このシーンのアクセント色を CSS 変数 --accent へ流し込む。
  // globals.css のスライダーつまみと、数値・脈動点の色がこの変数を読む。
  const accentStyle = { "--accent": PANEL_ACCENT[tab] } as CSSProperties;
  // isOpen: スマホ向けの配置で、スライダーを開いて見せているか（パソコン向けの配置ではいつも見せるので、この値は見た目に効かない）
  const [isOpen, setIsOpen] = useState(false);
  // panelId: スライダーを並べた部分の id（開閉ボタンの aria-controls から「このボタンが開け閉めする場所」として指す）
  const panelId = useId();
  // glassClass: ボタンとパネルの地の暗さ。誕生石シーンは 3D が表示されると背景が真っ白になるので（読み込み中も同じ濃さにする）、後ろが白でもいちばん薄い文字（単位、opacity-50）が 4.5:1 を超えるよう濃くする（0.88）。
  // 太陽・浜辺は後ろが暗いので、3D が透けて見える薄さ（ボタン 0.55・パネル 0.6）のまま。
  // クラス名は組み立てず、そのままの文字列で書く（Tailwind はソースの文字列から CSS を作るため）
  // 開閉ボタンのフォーカスの枠も、後ろの明るさで変える（focus）。誕生石シーンでは、外側を濃い色（ink）、内側を白い縁にする（白い枠は白い背景の上で見えないため）。
  // 太陽・浜辺では、外側を白、内側を暗い縁にする（明るい太陽や空の上でも見えるように）
  const glassClass =
    tab === "jewel"
      ? {
          // ボタンの地
          button: "bg-[rgba(10,12,20,0.88)]",
          // パネルの地
          panel: "bg-[rgba(9,10,16,0.88)]",
          // フォーカスの二重の枠
          focus: "focus-visible:shadow-[0_0_0_2px_#ffffff] focus-visible:outline-ink",
        }
      : {
          // ボタンの地
          button: "bg-[rgba(10,12,20,0.55)]",
          // パネルの地
          panel: "bg-[rgba(9,10,16,0.6)]",
          // フォーカスの二重の枠
          focus: "focus-visible:shadow-[0_0_0_2px_rgba(0,0,0,0.85)] focus-visible:outline-paper",
        };

  return (
    // control: 開閉ボタンとパネルの外枠。--accent でシーン色を中へ伝える。
    // flex-col-reverse: 読み上げの順は「ボタン → パネル」のまま、見た目はボタンを下（親指の届く位置）に置き、パネルを上に開く。
    // min-h-0: スマホ向けの配置で画面が低い（横向きなど）ときは、外枠ごと縮んで、開閉ボタンが画面の下にはみ出さないようにする。
    // パソコン向けの配置（roomy:min-h-auto）では縮めない（パネルはいつも全部見せる）
    <div
      style={accentStyle}
      className="pointer-events-auto flex min-h-0 roomy:min-h-auto flex-col-reverse items-end gap-2"
    >
      {/* 開閉ボタン（スマホ向けの配置だけ。roomy: では隠す）。aria-expanded で開いているかを読み上げに伝える */}
      <button
        // type="button": フォームの送信ボタンにならないよう明示する
        type="button"
        // 開いているか
        aria-expanded={isOpen}
        // 開け閉めする場所
        aria-controls={panelId}
        // 押すたびに開く・閉じるを切り替える
        onClick={() => setIsOpen((open) => !open)}
        // シーンのタブと同じガラス風の丸いボタン。高さは約 37px（親指で押しやすいよう py-2.5）。
        // キーボードで選んだときは、枠の内側に縁（box-shadow）を重ねた二重の枠を出す（色は glassClass.focus。後ろが明るくても暗くても枠が見えるように）
        // shrink-0: 画面が低くてもボタンは縮めない（縮むのはパネルのほう）
        className={`flex roomy:hidden shrink-0 cursor-pointer items-center gap-2 rounded-full border border-white/15 ${glassClass.button} px-4 py-2.5 font-mono text-[11px] text-paper uppercase tracking-[0.2em] backdrop-blur-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 ${glassClass.focus}`}
      >
        {/* シーン色の点（飾りなので読み上げない） */}
        <span aria-hidden="true" className="h-1.75 w-1.75 rounded-full bg-(--accent)" />
        {/* ボタンの名前。英語として読み上げさせる */}
        <span lang="en">Environment</span>
        {/* 開閉の向きを示す三角（開いていると下向き）。飾りなので読み上げない。動きを減らす設定では回転の動きを止める */}
        <span
          aria-hidden="true"
          className={`text-[9px] transition-transform motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
        >
          ▲
        </span>
      </button>
      {/* panel: 半透明のガラス風パネル。スマホ向けの配置では閉じていれば隠し（hidden = 読み上げからも外れる）、開けば幅いっぱいにする。
          スマホ向けの配置では高さを画面の 50% までにし、さらに残りの高さに合わせて縮め（min-h-0）、はみ出すスライダーは中でスクロールする
          （横向きや拡大で画面が低くても、下のスライダーに届くように）。
          パソコン向けの配置（roomy:）では、いつも幅 276px で見せる */}
      <div
        id={panelId}
        className={`${isOpen ? "block" : "hidden"} roomy:block max-h-[50dvh] roomy:max-h-none min-h-0 roomy:min-h-auto roomy:w-69 w-full roomy:overflow-visible overflow-y-auto rounded-[18px] border border-white/15 ${glassClass.panel} px-5 pt-4.5 pb-5.5 shadow-[0_26px_64px_-26px_rgba(0,0,0,0.8)] backdrop-blur-lg`}
      >
        {/* p-head: パネル見出し。右に脈動する点を置く。スマホ向けの配置では開閉ボタンが同じ名前を出しているので隠す */}
        <div className="mb-2 roomy:flex hidden items-center justify-between font-mono text-[11px] uppercase tracking-[0.2em] opacity-85">
          {/* 見出し。英語として読み上げさせる */}
          <span lang="en">Environment</span>
          {/* 脈打つ点（飾りなので読み上げない）。動きを減らす設定では脈打たせない */}
          <span
            aria-hidden="true"
            className="h-1.75 w-1.75 animate-[pdot_1.9s_ease-in-out_infinite] rounded-full bg-(--accent) motion-reduce:animate-none"
          />
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
    </div>
  );
}
