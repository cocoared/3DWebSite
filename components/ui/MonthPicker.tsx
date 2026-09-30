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
    // months: 丸いガラス風のバーに 12 個のボタンを並べる。
    // スマホ向けの配置では 6 列 × 2 段のマス目にする（パソコン向けの余白のまま折り返すと、縦持ちの 390px 幅で 4 × 3 段になり、石を見る場所が狭くなった）。
    // 高さ 480px 以下で、しかも幅が 568px（35.5rem）以上の画面（short:min-[35.5rem]:。スマホの横持ちなど）では、12 列 × 1 段にして、下の詳細のシートに高さを残す。
    // 12 列には 1 つ約 42px 以上（文字 約 24px + 左右の余白 6px ずつ + 間隔）が要り、568px より狭いと文字が隣のボタンへはみ出す（拡大して低く狭くなった画面など）ので 6 列のままにする。
    // パソコン向けの配置（roomy:）では横に並べて、入らなければ折り返す
    <nav
      ref={ref}
      aria-label="誕生月を選ぶ"
      className="pointer-events-auto mx-auto mt-2 roomy:mt-3 roomy:flex grid w-fit max-w-full grid-cols-6 roomy:flex-wrap roomy:justify-center gap-0.5 roomy:gap-1 roomy:rounded-[22px] rounded-[18px] border border-white/15 bg-[rgba(10,12,20,0.55)] p-1.25 backdrop-blur-[14px] short:min-[35.5rem]:grid-cols-12"
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
            // 選ばれている/いないでスタイルを差し替える。キーボードで選んだときは石の色の枠を出す。
            // スマホ向けの配置では左右の余白を詰めて 6 列に収める。高さは約 28px（パソコン向けの配置では約 30px）で、
            // WCAG 2.5.8（押す的の大きさ）の最低 24px 以上を保つ。幅は実測で、390px の画面で 1 列 約 48px（点・間隔・文字の中身 約 36px + 左右の余白 6px ずつ）。
            // 320px の画面では 1 列 約 44px になり、中身が約 4px 詰まるが、ボタンの内側に収まる
            className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-full border-0 px-1.5 roomy:px-3 py-1.5 roomy:py-1.75 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
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
