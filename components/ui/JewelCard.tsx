"use client";

import { type CSSProperties, type Ref, useEffect, useId, useRef, useState } from "react";
import {
  type Birthstone,
  type BirthstoneId,
  birthstoneSpecs,
  monthShortLabel,
} from "@/lib/birthstones";
import { adjacentStone, jewelHero } from "@/lib/scenes/jewels";

/** JewelCard の props。 */
interface JewelCardProps {
  /** 解説を出す石。替わってもカードは作り直さない（前後の月のボタンにフォーカスが残るように）。 */
  stone: Birthstone;
  /** 前後の月のボタンが押されたときに、その月の石の id で呼ぶ。 */
  onSelect: (id: BirthstoneId) => void;
  /** × ボタンが押されたときに呼ぶ（文字盤の一覧に戻す）。 */
  onClose: () => void;
  /** 回すボタンが押されたときに、向き（-1 = 左へ、1 = 右へ。視点が石のまわりを回り込む向き）で呼ぶ。ドラッグできない人が石をいろいろな向きから見るため。 */
  onRotate: (direction: -1 | 1) => void;
  /** カードの `<section>` 要素を受け取る ref。閉じるときに、フォーカスがカードの中にあるかを呼び出し側が調べるために使う。 */
  ref?: Ref<HTMLElement>;
}

// NAV_BUTTON_CLASS: 前後の月のボタンの見た目（2 つで同じ）。押せる的は高さ 28px 以上。キーボードで選んだときは石の色の枠を出す
const NAV_BUTTON_CLASS =
  "flex min-h-7 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-transparent px-3 py-1 font-mono text-[11px] text-paper/85 uppercase tracking-[0.12em] transition-colors hover:text-white focus-visible:outline-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2";

// ROTATE_BUTTON_CLASS: 視点を回すボタンの見た目（丸い 28px。× ボタンと同じ形）。キーボードで選んだときは石の色の枠を出す
const ROTATE_BUTTON_CLASS =
  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-transparent text-paper/85 text-sm transition-colors hover:text-white focus-visible:outline-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2";

// twoDigits: 月を 2 桁にする（例: 3 → "03"）
function twoDigits(month: number): string {
  // 1 桁なら頭に 0 を付ける
  return String(month).padStart(2, "0");
}

// JewelCard: 石を選んだときに、左下（スマホ向けの配置では画面の下のシート）へ出す解説カード。
// 月と名前・石言葉・説明・特徴の表（折りたたみ）・前後の月のボタンを 1 枚にまとめる
export default function JewelCard({ stone, onSelect, onClose, onRotate, ref }: JewelCardProps) {
  // heading: 名前の見出し（カードが出たときに、ここへフォーカスを移す）
  const heading = useRef<HTMLHeadingElement>(null);
  // titleId: 見出しの id（カードの名前として aria-labelledby から指す）
  const titleId = useId();
  // specsId: 特徴の表の id（開閉ボタンの aria-controls から指す）
  const specsId = useId();
  // isSpecsOpen: 特徴の表を開いているか。月を替えても開いた状態を保つ（カードを作り直さないので）
  const [isSpecsOpen, setIsSpecsOpen] = useState(false);
  // hero: 月・名前・石言葉の文（lib/scenes/jewels.ts の jewelHero。読み上げの知らせと同じ元から作る）
  const hero = jewelHero(stone);
  // specs: 特徴の一覧（硬度・成分・屈折率・分散・産地。並び方は lib/birthstones.ts の birthstoneSpecs）
  const specs = birthstoneSpecs(stone);
  // previous: 前の月の石（1 月の前は 12 月）
  const previous = adjacentStone(stone, -1);
  // next: 次の月の石（12 月の次は 1 月）
  const next = adjacentStone(stone, 1);
  // accentStyle: この石の色を CSS 変数 --accent へ流し込む（点やフォーカスの枠の色に使う）
  const accentStyle = { "--accent": stone.uiColor } as CSSProperties;

  // カードが出たときに 1 回だけ、見出しへフォーカスを移す。
  // 押した月のラベルは石を選ぶと隠れるので、そのままだとフォーカスが <body> に落ちて、キーボードで操作していた場所を見失うため。
  // 画面は動かさない（スマホのシートの中で、見出しまでスクロールさせない）。開発時は Strict Mode で 2 回走るが、同じ場所へ移すだけ
  useEffect(() => {
    // 見出しへ移す
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    // card: 半透明のガラス風のカード。高さに収まらないときは中だけスクロールする。
    // スマホ向けの配置（compact:）: 幅いっぱい・高さは最大で画面の 45%（45dvh）のシート。見出しの行を上に固定する。キーボードで移った先が固定の行に隠れないよう、行の高さ（約 54px。高さ 480px 以下では約 44px）より少し大きい 56px / 48px の scroll-pt をあける。
    // パソコン向けの配置（roomy:）: 左下に幅 340px。上はナビの下まで伸ばせて、はみ出す分は中でスクロールする。
    // 高さ 256px 未満の画面（tiny:）: カードの中ではスクロールさせず、UI の層ごとスクロールする（PortfolioExperience の tiny:overflow-y-auto）
    <section
      ref={ref}
      aria-labelledby={titleId}
      style={accentStyle}
      className="pointer-events-auto flex max-h-[45dvh] roomy:max-h-full tiny:max-h-none min-h-0 roomy:w-85 w-full compact:scroll-pt-14 short:scroll-pt-12 flex-col tiny:overflow-visible overflow-y-auto rounded-[18px] border border-white/15 bg-[rgba(9,10,16,0.66)] px-5 pt-0 roomy:pt-4.5 pb-4 shadow-[0_26px_64px_-26px_rgba(0,0,0,0.8)] backdrop-blur-lg [scrollbar-color:rgba(255,255,255,0.25)_transparent] [scrollbar-width:thin]"
    >
      {/* head: 月のラベルと閉じるボタンの行。
          スマホ向けの配置では上の端に固定し、× ボタンをいつでも押せるようにする（スマホには Esc キーがないため）。
          -mx-5 と px-5 で左右の余白まで濃い背景を広げ、下を流れる中身が透けないようにする。高さ 480px 以下の画面では上の余白を 8px に詰める。下の余白（mb-2 = 8px）は、名前のフォーカスの枠（名前から 4px 外）がこの行に隠れない広さ。
          高さ 256px 未満の画面（tiny:）では固定しない（tiny:static）。そこではカードではなく UI の層ごとスクロールするので、固定すると、
          キーボードで戻った先のボタンがこの行の下に隠れてしまう（WCAG 2.4.11） */}
      <div className="tiny:static compact:sticky compact:top-0 compact:z-10 compact:-mx-5 mb-2 flex items-center justify-between compact:bg-[rgb(12,13,20)] compact:px-5 compact:pt-4.5 short:pt-2 compact:pb-2 font-mono text-[11px] uppercase tracking-[0.26em]">
        {/* 月のラベル（例: 04 — APRIL）。点の色は石の色。英語として読み上げさせる */}
        <span lang="en" className="flex items-center gap-2 opacity-85">
          {/* 石の色の点（飾りなので読み上げない） */}
          <span aria-hidden="true" className="h-1.75 w-1.75 rounded-full bg-(--accent)" />
          {hero.eyebrow}
        </span>
        {/* 閉じて一覧に戻るボタン（Esc キーでも戻れる） */}
        <button
          // type="button": フォームの送信ボタンにならないよう明示する
          type="button"
          // 押したら閉じる
          onClick={onClose}
          // 記号だけなので、読み上げの名前を付ける
          aria-label="閉じて文字盤に戻る"
          // 丸い小さなボタン（28px）。キーボードで選んだときは石の色の枠を出す
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-transparent text-paper/75 text-sm transition-colors hover:text-white focus-visible:outline-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          ×
        </button>
      </div>
      {/* 名前（例: DIAMOND）。石を選んでいる間は、左下の見出しの代わりにこれがページの h1 になる。英語として読み上げさせる。
          文字は 32px（パソコン向けの配置では 40px）。一覧のときの大きな見出し（44px / 76px）より小さくして、カードの幅に収める。
          tabIndex={-1}: Tab キーでは止まらないが、カードが出たときにプログラムからフォーカスを当てられるようにする。
          フォーカスの枠は、キーボードで月のラベルを押して移ってきたとき（:focus-visible）だけ石の色で出し、マウスやタッチのときは出さない。
          ふだんは outline-0（幅 0）にする（outline-none は線の種類を消してしまい、focus-visible で太さを付けても枠が出なくなる） */}
      <h1
        id={titleId}
        ref={heading}
        tabIndex={-1}
        lang="en"
        className="m-0 font-bold font-display roomy:text-[40px] text-[32px] leading-[0.95] tracking-[-0.03em] outline-0 focus-visible:outline-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {hero.title}
      </h1>
      {/* 石言葉の文（例: 4月の誕生石、ダイヤモンド。石言葉は「強さ」（Strength）。） */}
      <p className="mt-2 font-jp font-medium text-[13px] leading-[1.7] opacity-90">{hero.tag}</p>
      {/* 説明文 */}
      <p className="mt-2 font-jp text-[13.5px] leading-[1.85] opacity-90">{stone.description}</p>
      {/* 特徴の開閉ボタン。aria-expanded で開いているかを読み上げに伝える */}
      <button
        // type="button": フォームの送信ボタンにならないよう明示する
        type="button"
        // 開いているか
        aria-expanded={isSpecsOpen}
        // 開け閉めする表
        aria-controls={specsId}
        // 押すたびに開く・閉じるを切り替える
        onClick={() => setIsSpecsOpen((open) => !open)}
        // 区切り線の下に、三角と「特徴」を並べる。押せる的は高さ 28px 以上。キーボードで選んだときは石の色の枠を出す
        className="mt-3 flex min-h-7 w-full cursor-pointer items-center gap-2 border-0 border-white/10 border-t bg-transparent pt-3 text-left font-jp text-[13px] text-paper focus-visible:outline-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {/* 開閉の向きを示す三角（開いていると下向き）。飾りなので読み上げない。動きを減らす設定では回転の動きを止める */}
        <span
          aria-hidden="true"
          className={`text-[10px] transition-transform motion-reduce:transition-none ${isSpecsOpen ? "rotate-90" : ""}`}
        >
          ▸
        </span>
        特徴
      </button>
      {/* 特徴の表（見出しと値の 2 列）。閉じていれば hidden（読み上げからも外れる）。
          クラスで切り替える（hidden 属性と grid クラスを両方付けると、どちらが勝つかが CSS の読み込み順に左右されるため） */}
      <dl
        id={specsId}
        className={`${isSpecsOpen ? "grid" : "hidden"} mt-2 grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs`}
      >
        {specs.map(([label, value]) => (
          // 見出しと値の組をまとめる div（display: contents なので 2 列の並びには影響しない）
          <div key={label} className="contents">
            {/* 見出し */}
            <dt className="font-mono uppercase tracking-[0.12em] opacity-55">{label}</dt>
            {/* 値 */}
            <dd className="m-0 font-jp leading-relaxed">{value}</dd>
          </div>
        ))}
      </dl>
      {/* 前後の月へ移るボタンと、視点を回すボタン。カードは作り直さないので、押したボタンにフォーカスが残る */}
      <div className="mt-3 flex items-center justify-between gap-2 border-white/10 border-t pt-3">
        {/* 前の月（例: ‹ 03 MAR）。読み上げの名前は見えている文字（03 MAR）で始める（WCAG 2.5.3） */}
        <button type="button" onClick={() => onSelect(previous.id)} className={NAV_BUTTON_CLASS}>
          {/* 向きの記号（飾りなので読み上げない） */}
          <span aria-hidden="true">‹</span>
          {/* 見えている月。英語として読み上げさせる */}
          <span lang="en">
            {twoDigits(previous.month)} {monthShortLabel(previous.month)}
          </span>
          {/* 読み上げだけに足す説明 */}
          <span className="sr-only">
            {" "}
            前の月、{previous.month}月 {previous.nameJa}
          </span>
        </button>
        {/* 視点を回すボタン 2 つ（ドラッグの代わり。WCAG 2.5.7）。1 回で ORBIT_STEP_RAD（lib/scenes/jewels.ts）だけ回り込む */}
        <div className="flex items-center gap-1.5">
          {/* 左へ回す。記号だけなので、読み上げの名前を付ける */}
          <button
            // type="button": フォームの送信ボタンにならないよう明示する
            type="button"
            // 押したら左へ回り込む
            onClick={() => onRotate(-1)}
            // 読み上げの名前
            aria-label="視点を左へ回す"
            // マウスを乗せたときにも名前を出す（記号だけでは何のボタンかわからないため）
            title="視点を左へ回す"
            // 丸い小さなボタン
            className={ROTATE_BUTTON_CLASS}
          >
            {/* 左回りの矢印（名前は aria-label が持つので読み上げない） */}
            <span aria-hidden="true">↶</span>
          </button>
          {/* 右へ回す */}
          <button
            // type="button": フォームの送信ボタンにならないよう明示する
            type="button"
            // 押したら右へ回り込む
            onClick={() => onRotate(1)}
            // 読み上げの名前
            aria-label="視点を右へ回す"
            // マウスを乗せたときにも名前を出す
            title="視点を右へ回す"
            // 丸い小さなボタン
            className={ROTATE_BUTTON_CLASS}
          >
            {/* 右回りの矢印（名前は aria-label が持つので読み上げない） */}
            <span aria-hidden="true">↷</span>
          </button>
        </div>
        {/* 次の月（例: 05 MAY ›） */}
        <button type="button" onClick={() => onSelect(next.id)} className={NAV_BUTTON_CLASS}>
          {/* 見えている月。英語として読み上げさせる */}
          <span lang="en">
            {twoDigits(next.month)} {monthShortLabel(next.month)}
          </span>
          {/* 読み上げだけに足す説明 */}
          <span className="sr-only">
            {" "}
            次の月、{next.month}月 {next.nameJa}
          </span>
          {/* 向きの記号（飾りなので読み上げない） */}
          <span aria-hidden="true">›</span>
        </button>
      </div>
      {/* 操作のヒント（例: Drag to rotate · Esc to return）。Esc キーのあるパソコン向けの配置だけで見せる。英語として読み上げさせる */}
      <p
        lang="en"
        className="mt-3 roomy:block hidden font-mono text-[10px] uppercase tracking-[0.2em] opacity-60"
      >
        {hero.hint}
      </p>
    </section>
  );
}
