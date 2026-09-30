"use client";

import type { CSSProperties, Ref } from "react";
import TurntableViewer from "@/components/ui/TurntableViewer";
import { type Birthstone, birthstoneSpecs } from "@/lib/birthstones";

/** JewelDetail の props。 */
interface JewelDetailProps {
  /** 詳細を出す石。 */
  stone: Birthstone;
  /** 閉じるボタンが押されたときに呼ぶ（全体の文字盤に戻す）。 */
  onClose: () => void;
  /** パネルの `<section>` 要素を受け取る ref。閉じるときに、フォーカスがパネルの中にあるかを呼び出し側が調べるために使う。 */
  ref?: Ref<HTMLElement>;
}

// JewelDetail: 月を選んだときに右側（スマホ向けの配置では画面の下）へ出す詳細パネル。Cycles の連番で描いた写真（回せる）と、説明・特徴を並べる
export default function JewelDetail({ stone, onClose, ref }: JewelDetailProps) {
  // accentStyle: この石の色を CSS 変数 --accent へ流し込む（見出しの点やキーボードの枠の色に使う）
  const accentStyle = { "--accent": stone.uiColor } as CSSProperties;
  // specs: 特徴の一覧（見出しと値）。並び順や、パールに分散の行を出さない決まりは lib/birthstones.ts の birthstoneSpecs にある
  const specs = birthstoneSpecs(stone);

  return (
    // panel: 半透明のガラス風パネル。画面の高さに収まらないときは中だけスクロールする。
    // スマホ向けの配置: 幅いっぱい・高さは最大で画面の 45%（45dvh）のシート。中身が短ければそれより低い。上の空いたところに 3D の石が見える。
    // scroll-pt-14: スマホ向けの配置では、キーボードで中のボタンへ移ってスクロールしたときに、上に固定した見出し（約 54px）の下に隠れないよう 56px あける。
    // 高さ 480px 以下の画面（short:）では見出しの上の余白を詰めて約 44px になるので、48px（scroll-pt-12）にする（56px のままだと、低いシートでは見える場所のほとんどが余白になる）。
    // パソコン向けの配置（roomy:）: 幅 320px
    <section
      ref={ref}
      aria-label={`${stone.nameJa}の詳細`}
      style={accentStyle}
      className="pointer-events-auto flex max-h-[45dvh] roomy:max-h-none min-h-0 roomy:w-80 w-full compact:scroll-pt-14 short:scroll-pt-12 flex-col overflow-y-auto rounded-[18px] border border-white/15 bg-[rgba(9,10,16,0.6)] px-5 pt-0 roomy:pt-4.5 pb-5 shadow-[0_26px_64px_-26px_rgba(0,0,0,0.8)] backdrop-blur-lg [scrollbar-color:rgba(255,255,255,0.25)_transparent] [scrollbar-width:thin]"
    >
      {/* p-head: パネル見出し（写真の描き方）と閉じるボタン。
          スマホ向けの配置（compact:）では sticky top-0 で、中身をスクロールしても上の端に残し、× ボタンをいつでも押せるようにする（スマホには Esc キーがないため）。
          パネルの上の余白（18px）はスマホ向けの配置ではパネルではなくここに持たせ（pt-4.5）、-mx-5 と px-5 で左右の余白まで濃い背景を広げて、下を流れる中身が透けないようにする。
          （余白をパネルに残すと、固定の位置がその余白の分だけ下がり、上に隙間ができる）
          高さが 480px（30rem）以下のスマホ（横向きなど）では、上の余白を 8px に詰めて、シートの中身が見える高さを残す。
          パソコン向けの配置では固定せず、背景も付けない（元の見た目のまま。Esc キーで閉じられる） */}
      <div className="compact:sticky compact:top-0 compact:z-10 compact:-mx-5 mb-2 flex items-center justify-between compact:bg-[rgb(12,13,20)] compact:px-5 compact:pt-4.5 short:pt-2 compact:pb-2 font-mono text-[11px] uppercase tracking-[0.2em]">
        {/* 見出し。点の色は石の色。英語として読み上げさせる。少し薄くする（背景は濃いまま） */}
        <span lang="en" className="flex items-center gap-2 opacity-85">
          {/* 石の色の点（飾りなので読み上げない） */}
          <span aria-hidden="true" className="h-1.75 w-1.75 rounded-full bg-(--accent)" />
          Photo · Cycles
        </span>
        {/* 閉じて全体に戻るボタン（Esc キーでも戻れる） */}
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じて全体に戻る"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-transparent text-paper/75 text-sm transition-colors hover:text-white focus-visible:outline-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          ×
        </button>
      </div>
      {/* 回せる写真。石が替わったら key で作り直し、読み込み中の画像を捨てる */}
      <TurntableViewer key={stone.id} stone={stone} />
      {/* 説明文 */}
      <p className="mt-4 font-jp text-[13.5px] leading-[1.85] opacity-90">{stone.description}</p>
      {/* 特徴の一覧（見出しと値の 2 列） */}
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-white/10 border-t pt-4 text-xs">
        {specs.map(([label, value]) => (
          // 見出しと値の組をまとめる div（dl の中に置ける。display: contents なので 2 列の並びには影響しない）
          <div key={label} className="contents">
            {/* 見出し */}
            <dt className="font-mono uppercase tracking-[0.12em] opacity-55">{label}</dt>
            {/* 値 */}
            <dd className="m-0 font-jp leading-relaxed">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
