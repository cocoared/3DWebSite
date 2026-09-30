// このモジュールは、詳細パネルの「写真の石を回す」ビューア（components/ui/TurntableViewer.tsx）の計算を集める。
// 連番画像は Blender の blender/render_turntables.py が、カメラを石のまわりに 1 周させながら Cycles で描いたもの。
// 番号が 1 つ進むと、カメラが 360° / TURNTABLE_FRAMES だけ回った写真になる。

import type { BirthstoneId } from "@/lib/birthstones";

/** 1 周の枚数。render_turntables.py の `--frames` の既定値（48 枚 = 7.5° ずつ）と同じにする。 */
export const TURNTABLE_FRAMES = 48;

/** 連番画像の一辺（px）。render_turntables.py の `--size` の既定値と同じにする。 */
export const TURNTABLE_IMAGE_SIZE = 640;

/** ドラッグで 1 コマ進めるのに必要な横の移動量（px）。小さいほど少しのドラッグでよく回る。 */
export const TURNTABLE_PX_PER_FRAME = 8;

/** 触っていない間の自動回転で、1 コマを表示する時間（ミリ秒）。110 ms × 48 枚 ≒ 5.3 秒で 1 周する。 */
export const TURNTABLE_AUTOPLAY_MS = 110;

/** ドラッグやボタンで手で回したあと、自動回転を再開するまでの待ち時間（ミリ秒）。短いと、見ている途中で勝手に回り出す。 */
export const TURNTABLE_RESUME_DELAY_MS = 2500;

/**
 * 写真の読み込みがこれより長くかかったら、スクリーンリーダーに「読み込み中」と知らせる（ミリ秒）。
 * これより早く読み込めたときは何も知らせない。短くすると、すぐ終わる読み込みでも知らせが入るようになる。
 */
export const TURNTABLE_SLOW_LOADING_MS = 1000;

/** 自動回転の起点。この時刻に、この番号から回り始める。 */
export interface AutoplayOrigin {
  /** 回り始める時刻（ミリ秒。`requestAnimationFrame` の時刻や `performance.now()` と同じ時計）。未来の時刻なら、その時刻まで待つ。 */
  readonly startTime: number;
  /** 回り始めるときの番号。 */
  readonly startFrame: number;
}

/**
 * 連番画像 1 枚の URL（`public/` からの配信パス）。
 *
 * @param frame - 0 始まりの番号。ファイル名は 2 桁のゼロ埋め（`00.webp` 〜）
 */
export function turntableFrameUrl(id: BirthstoneId, frame: number): string {
  // 2 桁にそろえた番号のファイル名にする
  return `/jewels/turntable/${id}/${String(frame).padStart(2, "0")}.webp`;
}

/** 1 周ぶん（`TURNTABLE_FRAMES` 枚）の URL を、番号の順に返す。 */
export function turntableFrameUrls(id: BirthstoneId): string[] {
  // 0 〜 (枚数 - 1) の番号それぞれの URL
  return Array.from({ length: TURNTABLE_FRAMES }, (_, frame) => turntableFrameUrl(id, frame));
}

/**
 * 1 周を超えた番号や負の番号を、0 〜 (count - 1) に戻す。小数は近い番号に丸める。
 *
 * @param count - 1 周の枚数
 */
export function wrapFrame(frame: number, count: number = TURNTABLE_FRAMES): number {
  // 近い整数に丸める
  const rounded = Math.round(frame);
  // 負の数でも 0 〜 (count - 1) に収まるよう、余りをもう一度 count で割る
  return ((rounded % count) + count) % count;
}

/**
 * ドラッグした距離から、表示する番号を決める。右へのドラッグで番号が進み、石の手前の面が右へ動くように見える。
 *
 * @param startFrame - ドラッグを始めたときの番号
 * @param dragPx - ドラッグを始めてからの横の移動量（px。右が正）
 * @param pxPerFrame - 1 コマ進めるのに必要な移動量（px）
 * @param count - 1 周の枚数
 */
export function dragFrame(
  startFrame: number,
  dragPx: number,
  pxPerFrame: number = TURNTABLE_PX_PER_FRAME,
  count: number = TURNTABLE_FRAMES,
): number {
  // 移動量をコマ数に直して足し、範囲内に戻す
  return wrapFrame(startFrame + dragPx / pxPerFrame, count);
}

/**
 * 自動回転の番号を、始めてからの経過時間で決める（フレームの間隔がばらついても回る速さが一定になる）。
 *
 * @param startFrame - 自動回転を始めたときの番号
 * @param elapsedMs - 自動回転を始めてからの経過時間（ミリ秒）
 * @param msPerFrame - 1 コマを表示する時間（ミリ秒）
 * @param count - 1 周の枚数
 */
export function autoplayFrame(
  startFrame: number,
  elapsedMs: number,
  msPerFrame: number = TURNTABLE_AUTOPLAY_MS,
  count: number = TURNTABLE_FRAMES,
): number {
  // 経過したコマ数（途中のコマは切り捨てる）を足し、範囲内に戻す
  return wrapFrame(startFrame + Math.floor(elapsedMs / msPerFrame), count);
}

/**
 * 画面の更新ごとに、自動回転の起点を決める。`requestAnimationFrame` から毎回呼ぶ前提。
 *
 * - ドラッグ中は指の動きを優先して、起点を捨てる（`null`）
 * - 起点が無ければ、今の時刻と今の番号から回し始める
 * - 起点があれば、同じオブジェクトをそのまま返す（毎回作り直さない）
 *
 * @param origin - 今の起点（無ければ `null`）
 * @param now - 今の時刻（ミリ秒）
 * @param frame - 今表示している番号
 * @param isDragging - ドラッグ中か
 */
export function autoplayOriginFor(
  origin: AutoplayOrigin | null,
  now: number,
  frame: number,
  isDragging: boolean,
): AutoplayOrigin | null {
  // ドラッグ中は起点を捨てる（ドラッグを終えたら originAfterManualTurn が作り直す）
  if (isDragging) return null;
  // 起点があればそのまま、無ければ今から今の番号で始める
  return origin ?? { startTime: now, startFrame: frame };
}

/**
 * 起点と今の時刻から、自動回転で表示する番号を決める。
 * 起点の時刻より前（手で回したあとの待ち時間）は、今の番号 `frame` のまま進めない。
 *
 * @param now - 今の時刻（ミリ秒）
 * @param frame - 今表示している番号
 */
export function autoplayFrameAt(origin: AutoplayOrigin, now: number, frame: number): number {
  // 待ち時間の間は今の番号のまま
  if (now < origin.startTime) return frame;
  // 起点からの経過時間の分だけ進める
  return autoplayFrame(origin.startFrame, now - origin.startTime);
}

/**
 * ドラッグやボタンで手で回したあとの、自動回転の起点を作る。
 * 自動回転中なら、`TURNTABLE_RESUME_DELAY_MS` だけ待ってから、今の番号で再開する起点にする。
 * 止めている間は起点を作らない（作ると、あとで再開したときに古い起点から時間を数えてしまい、番号が一気に飛ぶ）。
 *
 * @param now - 今の時刻（ミリ秒）
 * @param frame - 手で回したあとの番号
 * @param isPlaying - 自動回転が有効か（一時停止ボタンで止めていれば `false`）
 */
export function originAfterManualTurn(
  now: number,
  frame: number,
  isPlaying: boolean,
): AutoplayOrigin | null {
  // 止めていれば起点を作らない。回していれば、待ち時間のあとに今の番号から再開する
  return isPlaying ? { startTime: now + TURNTABLE_RESUME_DELAY_MS, startFrame: frame } : null;
}

/**
 * スクリーンリーダー向けの、写真の読み込みの知らせ（画面には出さない）。
 *
 * 読み上げ用の場所（`role="status"`）は、中の文が「替わった」ときに読み上げられ、作られたときから入っている文は読み上げられないことが多い。
 * そこで最初は空にしておき、読み込みが長引いたとき（`TURNTABLE_SLOW_LOADING_MS` を過ぎても終わらないとき）だけ「読み込み中」、
 * そのあとで「読み込みました」と知らせる。すぐ読み込めたときは何も知らせない。
 * 枚数（1/48〜48/48）は、毎回読み上げると邪魔になるので入れない。
 *
 * @param ready - 1 周ぶんすべて読み込めたか
 * @param failed - 読み込みに失敗したか（失敗は `role="alert"` の表示が伝えるので、ここでは空にする）
 * @param isSlow - 読み込みが長引いたか
 */
export function turntableLoadingMessage(ready: boolean, failed: boolean, isSlow: boolean): string {
  // 失敗したとき、または長引かなかったときは知らせない
  if (failed || !isSlow) return "";
  // 長引いたときは、読み込めたかどうかで文を替える
  return ready ? "写真を読み込みました。" : "写真を読み込み中です。";
}
