"use client";

import { memo } from "react";
import { BIRTHSTONES, type BirthstoneId, monthShortLabel } from "@/lib/birthstones";
import type { MonthLabelHandles } from "@/lib/monthLabels";

/** MonthLabels の props。 */
interface MonthLabelsProps {
  /**
   * ラベルの DOM 要素を入れる入れ物（`PortfolioExperience` が 1 つ作る）。この部品は要素を入れるだけで、
   * 位置と見え方は 3D 側（`JewelsScene` の `useMonthLabels`）が毎フレーム `style` に書き込む。
   */
  handles: MonthLabelHandles;
  /** ラベルが押されたときに、その月の石の id で呼ぶ。 */
  onSelect: (id: BirthstoneId) => void;
}

// MonthLabels: 誕生石シーンで、文字盤の各石のそばに浮かべる月のラベル（JAN〜DEC の押せるボタン）。
// ボタンは HTML の UI の層（ナビの直後）に置く。キーボードの移動順がタブの次になり、閉じたあとにフォーカスを返す先にもなる。
// 呼び出し側は 3D が読み込まれてから描く。それでも最初のフレームで位置が決まるまでは見えない（invisible）ようにして、左上に固まったラベルを見せない。
// memo: 親（PortfolioExperience）はスライダーを動かすたびに描き直されるが、props（入れ物と選ぶ関数）は変わらないので、12 個のボタンは描き直さない
function MonthLabels({ handles, onSelect }: MonthLabelsProps) {
  return (
    // 層: 画面いっぱいに広げる。ラベル以外の場所では操作を下の 3D に通す（ドラッグで回せるように）。
    // <nav> と名前で、石から石へ移るための 12 個のボタンのまとまりを読み上げに伝える。
    // fixed: 画面（= キャンバス）に対して置く。高さ 256px 未満の画面では UI の層ごとスクロールするが、キャンバスは動かないので、層と一緒に動くとラベルが石からずれるため。
    // -z-10: UI の層（PortfolioExperience の isolate）の中で一番下に描き、タブ・見出し・カード・操作パネルの上にラベルが重ならないようにする（それらを押すつもりでラベルを押さないように）。
    // has-[:focus-visible]:z-10: キーボードでラベルにフォーカスしている間だけは一番上に出す（操作パネルなどの下に隠れたラベルでも、今いる場所が見えるように。WCAG 2.4.11）。層は操作を通すので、マウスの動きは変わらない。
    // overflow-clip: 画面の端にかかったラベルを切り取り、はみ出しでスクロールが生まれないようにする
    <nav
      aria-label="誕生月を選ぶ"
      className="pointer-events-none fixed inset-0 -z-10 overflow-clip has-[:focus-visible]:z-10"
    >
      {BIRTHSTONES.map((stone, index) => (
        // ラベル 1 つ。左上を基準にし、JewelsScene が transform で石のそばへ動かす
        <button
          // type="button": フォームの送信ボタンにならないよう明示する
          type="button"
          key={stone.id}
          // 要素を入れ物の月の位置に入れ、消えるときに null に戻す（React 19 の ref の後始末）。性能のため入れ物を直接書き換える
          ref={(element) => {
            // 入れる
            handles.elements[index] = element;
            // 後始末: 外す
            return () => {
              // 消えた要素を残さない
              handles.elements[index] = null;
            };
          }}
          // 押したらその月の石を選ぶ
          onClick={() => onSelect(stone.id)}
          // 半透明の暗い小さな角丸の地（75%。白いパールや強い光の真上でも、文字と地のコントラストを 4.5:1 以上に保つ濃さ）に、等幅の英字。押せる的は 24px 以上（min-h-6 / min-w-6。WCAG 2.5.8）。
          // スマホ向けの配置では石が小さく写り、文字盤の内側に並ぶので、隣のラベルと重ならないよう左右の余白と字間を詰める（幅 約 36px）。
          // パソコン向けの配置の縦長・正方形の窓でも内側に並ぶが、石が大きく写るので幅 約 54px のままで重ならない。
          // 幅か高さが 360px 未満（small:）では文字盤がさらに小さく写るので、左右の余白を 3px、字間を 0、行の高さを文字の高さにまで詰める（約 28 × 24px）。
          // 320 × 568 でも隣のラベルと重ならない（上下に接する組は残る）。高さは押せる的の最低ライン 24px（min-h-6）で止め、文字は 11px のまま読みやすさを保つ。
          // キーボードで選んだときは、その石の色の枠を出し、内側に暗い縁（box-shadow）を重ねる（ダイヤやパールの白っぽい色の枠でも、明るい石の上で見えるように）。
          // focus-visible:z-10: そのラベルを隣のラベルより上に描く（ラベルは後ろのものほど上に描かれ、接している・重なっている隣のラベルが枠を覆うため）。
          // will-change-transform: 毎フレーム動かすので、描画を別の層に分けてもらう
          className="pointer-events-auto invisible absolute top-0 left-0 flex min-h-6 min-w-6 cursor-pointer items-center gap-1.5 rounded-md border border-white/15 bg-[rgba(10,12,20,0.75)] px-1.5 roomy:px-2 py-1 font-mono text-[11px] text-paper/85 uppercase roomy:tracking-[0.12em] tracking-[0.06em] backdrop-blur-sm transition-colors will-change-transform hover:text-white focus-visible:z-10 focus-visible:shadow-[0_0_0_2px_rgba(0,0,0,0.85)] focus-visible:outline-2 focus-visible:outline-offset-2 small:px-[3px] small:py-0.5 small:leading-none small:tracking-normal"
          // キーボードで選んだときの枠の色を、その石の色にする
          style={{ outlineColor: stone.uiColor }}
        >
          {/* 石の色の小さな点（飾りなので読み上げない）。スマホ向けの配置では幅を詰めるために出さない */}
          <span
            aria-hidden="true"
            className="compact:hidden h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: stone.uiColor }}
          />
          {/* 見えている月の略称（例: JAN）。英語として読み上げさせる */}
          <span lang="en">{monthShortLabel(stone.month)}</span>
          {/* 読み上げだけに足す説明。見えている文字（JAN）を名前の先頭に残し、音声操作でも同じ言葉で押せるようにする（WCAG 2.5.3） */}
          <span className="sr-only">
            {" "}
            {stone.month}月 {stone.nameJa}
          </span>
        </button>
      ))}
    </nav>
  );
}

// 描き直しを減らすため memo で包んで書き出す
export default memo(MonthLabels);
