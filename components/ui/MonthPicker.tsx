"use client";

import type { Ref } from "react";
import { BIRTHSTONES, type BirthstoneId, monthShortLabel } from "@/lib/birthstones";

/** MonthPicker の props。 */
interface MonthPickerProps {
  /** 選んでいる石。選んでいなければ `null`。 */
  selected: BirthstoneId | null;
  /** 月のボタンが押されたときに、その月の石の id で呼ぶ。 */
  onSelect: (id: BirthstoneId) => void;
  /** ボタン列の `<nav>` 要素を受け取る ref。詳細パネルを閉じたときに、呼び出し側が選んでいた月のボタンへフォーカスを戻すために使う。 */
  ref?: Ref<HTMLElement>;
}

// MonthPicker: 誕生石シーンで、上部のナビの下に出す月のボタン列（JAN〜DEC）。押すとその月の石へカメラが寄る
export default function MonthPicker({ selected, onSelect, ref }: MonthPickerProps) {
  return (
    // months: 丸いガラス風のバーに 12 個のボタンを並べる。狭い画面では折り返す
    <nav
      ref={ref}
      aria-label="誕生月を選ぶ"
      className="pointer-events-auto mx-auto mt-3 flex w-fit max-w-full flex-wrap justify-center gap-1 rounded-[22px] border border-white/15 bg-[rgba(10,12,20,0.55)] p-1.25 backdrop-blur-[14px]"
    >
      {BIRTHSTONES.map((stone) => {
        // isActive: この月が選ばれているか
        const isActive = selected === stone.id;
        return (
          // 月のボタン。選ばれていれば白背景で強調する
          <button
            // type="button": フォームの中に置いてもフォーム送信が走らないようにする
            type="button"
            key={stone.id}
            // aria-pressed: 選ばれているかを読み上げで伝える（押すと切り替わるボタン）
            aria-pressed={isActive}
            onClick={() => onSelect(stone.id)}
            // 選ばれている/いないでスタイルを差し替える。キーボードで選んだときは石の色の枠を出す
            className={`flex cursor-pointer items-center gap-1.5 rounded-full border-0 px-3 py-1.75 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
              isActive
                ? "bg-paper font-bold text-[#0a0a12]"
                : "bg-transparent text-paper/60 hover:text-white"
            }`}
            // キーボードで選んだときの枠の色を、その石の色にする（Tailwind の outline-color が読む CSS 変数）
            style={{ outlineColor: stone.uiColor }}
          >
            {/* 石の色の小さな点（飾りなので読み上げない） */}
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: stone.uiColor }}
            />
            {/* 見えている月の略称（例: JAN）。英語として読み上げさせる */}
            <span lang="en">{monthShortLabel(stone.month)}</span>
            {/* 読み上げだけに足す説明。見えている文字（JAN）を名前の先頭に残し、音声操作でも同じ言葉で押せるようにする */}
            <span className="sr-only">
              {" "}
              {stone.month}月 {stone.nameJa}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
