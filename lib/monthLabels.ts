// このモジュールは、誕生石シーンの月のラベル（3D の石のそばに浮かべる HTML のボタン）を動かす処理と、閉じたあとにフォーカスを返す処理を集める。
// DOM の要素を受け取るが React には依存しないので、テストでは使うもの（style・focus・contains）だけを持つ偽物を渡して確かめられる。

import type * as THREE from "three";
import { projectToScreen, type ScreenPoint } from "@/lib/scenes/jewelLabels";
import type { Vec3 } from "@/lib/scenes/jewels";

// MONTH_COUNT: 月の数（ラベルの数）
const MONTH_COUNT = 12;

/**
 * 解説カードを閉じたあと、月のラベルへフォーカスを返す約束を待つ時間（ミリ秒）。
 * 閉じた直後はカメラが石に寄ったままで、ラベルが画面の外にある。カメラが一覧へ戻る（約 1〜2 秒）までは約束を残し、見えたら返す。
 * カメラの移る時間（`CAMERA_SMOOTH_TIME`）を延ばしたら、これも延ばす（テストで、期限までにカメラが 95% 以上戻ることを照らし合わせている）。
 * これを過ぎたら約束を捨てる（あとでカメラを回して見えたときに、別の操作をしている人のフォーカスを奪わないように）。大きくすると長く待つ。
 */
export const FOCUS_PROMISE_MS = 3000;

/** ラベルの要素のうち、ここで使うものだけ（テストで偽物を渡せるように、HTMLElement の一部に絞る）。 */
export interface LabelElement {
  /** 位置（transform）と見え方（visibility）を書き込むスタイル。 */
  readonly style: { transform: string; visibility: string };
  /** フォーカスを移す。 */
  focus(options?: FocusOptions): void;
}

/**
 * 月のラベルの DOM 要素と、次に見えたときにフォーカスを移す月をまとめた入れ物。
 *
 * `PortfolioExperience` が 1 つだけ作り、ラベルの部品（`MonthLabels`）が要素を入れ、
 * 3D 側（`JewelsScene`）が毎フレーム読み書きする。state ではないので、書き換えても描き直しは起きない。
 */
export interface MonthLabelHandles {
  /** 1 月〜12 月のラベルのボタン（添え字は 月 - 1）。まだ描かれていない・消えたときは null。 */
  readonly elements: (LabelElement | null)[];
  /**
   * 次にそのラベルが見えたときにフォーカスを移す月（1〜12）。約束が無ければ null。
   * 移したとき、期限を過ぎたとき、待つ間に利用者がフォーカスを動かしたとき、石やタブを選び直したときに null に戻る（`endFocusPromise`）。
   */
  focusMonth: number | null;
  /** 約束の期限（`performance.now()` と同じ、ページを開いてからのミリ秒）。これを過ぎたら約束を捨てる。 */
  focusUntil: number;
  /**
   * 約束を待つ間にフォーカスを預けている要素（一覧の見出し）。預けていなければ null。
   * `PortfolioExperience` が、カードを閉じたあとに見出しへフォーカスを移すときに入れる。ここにフォーカスがある間は、約束を待ち続ける（`dropFocusPromiseIfMoved`）。
   * 約束が終わるとき（`endFocusPromise`）と、新しく約束するとき（`requestLabelFocus`）に null に戻る。
   */
  focusHolder: Element | null;
}

/**
 * 空の入れ物を作る（12 個の null と、約束なし）。`useState` の初期化関数として 1 回だけ呼ぶ前提。
 */
export function createMonthLabelHandles(): MonthLabelHandles {
  // 12 か月ぶんの空きと、約束なし
  return {
    elements: Array<LabelElement | null>(MONTH_COUNT).fill(null),
    focusMonth: null,
    focusUntil: 0,
    focusHolder: null,
  };
}

/**
 * フォーカスの約束を終わらせる（約束の月と、フォーカスの預け先をどちらも null に戻す）。
 * 約束を果たしたとき・捨てたとき・石やタブを選び直したときに呼ぶ。`handles` を**書き換える**。
 *
 * @param handles - フォーカスの約束の入れ物
 */
export function endFocusPromise(handles: MonthLabelHandles): void {
  // 約束を消す（性能のため入れ物を直接書き換える）
  handles.focusMonth = null;
  // 預け先も外す（約束が無いのに預け先だけが残らないように）
  handles.focusHolder = null;
}

/**
 * フォーカスの約束を待つ間に、利用者がフォーカスをほかへ動かしていたら約束を捨てる。`useFrame` から毎フレーム、ラベルを置く前に呼ぶ前提。
 *
 * 見出しに預ける前（カードが消えた直後）のフォーカスは、どこにも無い状態（null・`<body>`）にあるはず。
 * 見出しに預けたあと（`handles.focusHolder` がある）は、その見出しにあるはず。
 * それ以外にあれば、利用者が Tab やクリックで動かしたので、あとでラベルが見えても奪い返さない（WCAG 2.4.3）。
 * 預けたあとで `<body>` にあるのも、3D の画面をクリックするなどして見出しから外した印として捨てる。
 * 捨てたら `handles` を**書き換える**（`endFocusPromise`）。
 *
 * @param handles - フォーカスの約束の入れ物
 * @param active - 今フォーカスのある要素（`document.activeElement`）
 * @param body - ページの `<body>`（`document.body`。フォーカスがどこにも無いときは、ここにあることになる）
 * @returns 約束を捨てたら true
 */
export function dropFocusPromiseIfMoved(
  handles: MonthLabelHandles,
  active: Element | null,
  body: Element | null,
): boolean {
  // 約束が無ければ何もしない
  if (handles.focusMonth === null) return false;
  // isWaiting: まだ待っている場所にフォーカスがあるか。
  // 見出しに預けたあとは、その見出しにあるときだけ。預ける前は、どこにも無い（null）か <body> にあるときだけ
  const isWaiting =
    handles.focusHolder !== null
      ? active === handles.focusHolder
      : active === null || active === body;
  // まだ待っているなら何もしない
  if (isWaiting) return false;
  // 利用者が動かしたので、約束を捨てる（性能のため入れ物を直接書き換える）
  endFocusPromise(handles);
  // 捨てた
  return true;
}

/**
 * 月のラベルを 1 つ、画面の位置へ動かし、見せるか隠すかを決める。`placeMonthLabels` から毎フレーム、12 個ぶん呼ばれる。
 *
 * `element` のスタイルを**直接書き換える**（毎フレーム変わるので React の state を通さない）。
 * 見えるようになったラベルが `handles.focusMonth` の月なら、フォーカスを移して約束を終わらせる（`endFocusPromise`。預け先も外す）
 * （解説カードを閉じたあと、隠れていたラベルが見えるようになってからでないとフォーカスできないため）。
 * 約束の期限（`handles.focusUntil`）を過ぎていたら、見えていてもフォーカスせずに約束を捨てる。
 * 期限の前なら、ラベルが画面の外にあっても約束を残す（カードを閉じた直後は、カメラが石に寄ったままでラベルが画面の外にあるため）。
 *
 * @param element - ラベルのボタン
 * @param point - ラベルを置く画面の位置（`projectToScreen` の結果）
 * @param isShown - ラベルを出す場面か（石を選んでいる間は false）
 * @param handles - フォーカスの約束を持つ入れ物（約束を果たしたとき・期限を過ぎたときに `focusMonth` と `focusHolder` を**書き換える**）
 * @param month - このラベルの月（1〜12）
 * @param now - 今の時刻（`performance.now()` のミリ秒。約束の期限と比べる）
 * @returns ラベルが見えているか
 */
export function placeMonthLabel(
  element: LabelElement,
  point: ScreenPoint,
  isShown: boolean,
  handles: MonthLabelHandles,
  month: number,
  now: number,
): boolean {
  // この月の約束が期限を過ぎていたら捨てる（預け先も外す。性能のため入れ物を直接書き換える）
  if (handles.focusMonth === month && now > handles.focusUntil) endFocusPromise(handles);
  // 出す場面で、しかも画面の中に写っているときだけ見せる
  const isVisible = isShown && point.isVisible;
  // 見えないラベルは visibility: hidden にする（押せず、Tab でも止まらず、読み上げからも外れる）。性能のため直接書き換える
  element.style.visibility = isVisible ? "visible" : "hidden";
  // 見えないなら位置は動かさない
  if (!isVisible) return false;
  // ラベルの中心が点に来るように置く（後ろの translate(-50%, -50%) で、ラベルの大きさの半分だけ戻す）。
  // px は整数に丸めて、文字のにじみを抑える
  element.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px) translate(-50%, -50%)`;
  // 閉じたあとにこのラベルへフォーカスを返す約束があれば、見えた今ここで返す
  if (handles.focusMonth === month) {
    // 画面を動かさずにフォーカスを移す
    element.focus({ preventScroll: true });
    // 約束を果たしたので、約束と預け先を消す（性能のため入れ物を直接書き換える）
    endFocusPromise(handles);
  }
  // 見えている
  return true;
}

/**
 * 12 個の月のラベルを、それぞれの 3D の位置（`anchors`。月の順）を写した画面の位置へまとめて置く。`useFrame` から毎フレーム呼ぶ前提。
 *
 * 添え字 `i` のラベル（`handles.elements[i]`）を `anchors[i]` に置き、月は `i + 1` として扱う（フォーカスの約束の照合に使う）。
 * まだ描かれていないラベル（null）は飛ばす。ラベルの `style` と `scratch` を**直接書き換える**（毎フレームの割り当てを避けるため）。
 * フォーカスの約束の月のラベルが見えたら、そのラベルへ `focus()` し、`handles.focusMonth` と `focusHolder` を**書き換える**（`placeMonthLabel`）。
 * カメラの行列は呼び出し側で最新にしておく（`projectToScreen` と同じ）。
 *
 * @param handles - ラベルの要素とフォーカスの約束の入れ物
 * @param anchors - 1 月〜12 月のラベルの 3D の位置（mm）
 * @param camera - 写すカメラ
 * @param width - 画面の幅（CSS の px）
 * @param height - 画面の高さ（CSS の px）
 * @param isShown - ラベルを出す場面か（石を選んでいる間は false）
 * @param scratch - 画面の位置を書き込む、使い回しの入れ物
 * @param now - 今の時刻（`performance.now()` のミリ秒。フォーカスの約束の期限と比べる）
 */
export function placeMonthLabels(
  handles: MonthLabelHandles,
  anchors: readonly Vec3[],
  camera: THREE.Camera,
  width: number,
  height: number,
  isShown: boolean,
  scratch: ScreenPoint,
  now: number,
): void {
  // 12 個のラベルを順に置く（forEach だと毎フレーム関数を作るので、for で回す）
  for (let index = 0; index < anchors.length; index += 1) {
    // この月のラベルのボタン
    const element = handles.elements[index];
    // まだ描かれていなければ飛ばす
    if (!element) continue;
    // 3D の位置を画面の座標に直す（性能のため入れ物を直接書き換える）
    projectToScreen(anchors[index], camera, width, height, scratch);
    // ボタンを動かし、見せるか隠すかを決める（月は添え字 + 1）
    placeMonthLabel(element, scratch, isShown, handles, index + 1, now);
  }
}

/**
 * 閉じようとしている解説カードの中にフォーカスがあれば、その月のラベルへフォーカスを返す約束をする。カードを閉じる直前に呼ぶ。
 *
 * カードが消えるとフォーカスが `<body>` に落ちて、キーボードで操作していた場所を見失う（WCAG 2.4.3）。
 * ラベルは石を選んでいる間は隠れていて、閉じたあとのフレームで見えるようになるので、ここでは移さず、
 * `placeMonthLabel` がラベルを見せたときに移す。カードの外（スライダーなど）にフォーカスがあるときは何もしない。
 *
 * @param card - 閉じようとしている解説カード
 * @param active - 今フォーカスのある要素（`document.activeElement`）
 * @param handles - 約束を書き込む入れ物（`focusMonth`・`focusUntil`・`focusHolder` を**書き換える**）
 * @param month - 閉じる石の月（1〜12）
 * @param now - 今の時刻（`performance.now()` のミリ秒）。約束の期限は、これに `FOCUS_PROMISE_MS` を足した時刻
 * @returns 約束したら true
 */
export function requestLabelFocus(
  card: Pick<HTMLElement, "contains"> | null,
  active: Element | null,
  handles: MonthLabelHandles,
  month: number,
  now: number,
): boolean {
  // カードが無い、またはカードの外にフォーカスがあるなら、何もしない
  if (!card?.contains(active)) return false;
  // 次にこの月のラベルが見えたら、フォーカスを移してもらう（性能のため入れ物を直接書き換える）
  handles.focusMonth = month;
  // 期限を決める（カメラが一覧へ戻るまで待てる長さ）
  handles.focusUntil = now + FOCUS_PROMISE_MS;
  // 見出しに預ける前の状態から始める（前の待ち時間の預け先を、この約束の預け先と取り違えないように）
  handles.focusHolder = null;
  // 約束した
  return true;
}
