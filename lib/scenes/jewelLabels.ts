// このモジュールは、誕生石シーンの月のラベル（3D の石のそばに浮かべる HTML のボタン）を置く場所の計算を集める。
// 3D の位置（labelAnchor・labelSide）と、それを画面の座標に直す投影（projectToScreen）。React には依存しない。
// DOM への書き込みとフォーカスの約束は lib/monthLabels.ts にある。

import * as THREE from "three";
import { isCompactLayout } from "@/lib/scene";
import { RING_RADIUS_MM, ringPosition, type StonePlacement, type Vec3 } from "@/lib/scenes/jewels";

/**
 * 月のラベルを、石の中心から文字盤の外向きにどれだけ離して浮かべるか（mm）。
 * いちばん長い石（8 mm）の半分より大きくして、ラベルが石に重ならないようにする。大きくするとラベルが石から離れる。
 */
export const LABEL_OFFSET_MM = 9;

/**
 * 月のラベルを浮かべる 3D の位置（mm）。石の中心と同じ高さで、石から文字盤の外向き（または内向き）に `LABEL_OFFSET_MM` だけ離れた点。
 *
 * どちらに置くかは `labelSide` が決める（パソコン向けの配置の横長の画面では外側、それ以外は内側 = 時計の数字の位置）。文字盤の石は `fitFov` が画面に収めるので、内側のラベルも画面に収まる。
 *
 * @param month - 誕生月（1〜12）
 * @param placement - その石の置き方（中心の高さ `centerY` を使う）
 * @param side - `1` で外側（既定）、`-1` で内側
 */
export function labelAnchor(month: number, placement: StonePlacement, side: 1 | -1 = 1): Vec3 {
  // 文字盤の半径を LABEL_OFFSET_MM だけ広げた（内側なら狭めた）円の上の、その月の位置
  const [x, , z] = ringPosition(month, RING_RADIUS_MM + side * LABEL_OFFSET_MM);
  // 高さは石の中心にそろえる
  return [x, placement.centerY, z];
}

/**
 * 月のラベルを石の外側に置いてよい、画面の縦横比（幅 / 高さ）の下限。これより縦長・正方形に近い画面では内側に置く。
 * `fitFov` は縦横比 1 以下で横に見える範囲を一定に保つので、縦長や正方形では外側のラベル（中心から 39 mm）が画面の端にかかる。
 * 1.2 なら、横に見える範囲が 2 割広がり、外側のラベルの幅（約 54px）が入る余白ができる。小さくすると外側に置く画面が増える。
 */
export const LABEL_OUTSIDE_MIN_ASPECT = 1.2;

/**
 * 月のラベルを石の外側（`1`）と内側（`-1`）のどちらに置くか。`labelAnchor` の `side` に渡す。
 * パソコン向けの配置で、しかも横長（縦横比 `LABEL_OUTSIDE_MIN_ASPECT` 以上）の画面だけ外側。それ以外（スマホ向けの配置、縦長や正方形に近い窓）は内側。
 * 外側だと、石が小さく写る画面や横に余裕がない画面で、3・4・8・9 時のラベルが画面の端から切れるため。
 * 幅や高さが 0 以下・NaN のときは内側（スマホ向けの配置と同じ扱い）になる。
 *
 * @param width - 画面の幅（CSS の px）
 * @param height - 画面の高さ（CSS の px）
 */
export function labelSide(width: number, height: number): 1 | -1 {
  // パソコン向けの配置で、横長なら外側
  if (!isCompactLayout(width, height) && width / height >= LABEL_OUTSIDE_MIN_ASPECT) return 1;
  // それ以外は内側
  return -1;
}

/** 3D の点を画面に写した位置（CSS の px。左上が原点）。`projectToScreen` が書き換え、毎フレーム使い回す。 */
export interface ScreenPoint {
  /** 左からの位置（px）。`isVisible` が false のときは使わない。 */
  x: number;
  /** 上からの位置（px）。`isVisible` が false のときは使わない。 */
  y: number;
  /** 画面の中に写っているか（カメラの後ろ・横・画面の外・大きさや点が壊れているときは false）。 */
  isVisible: boolean;
}

// projectScratch: projectToScreen が使い回す一時的なベクトル（毎フレーム new しないため）
const projectScratch = new THREE.Vector3();

/**
 * 3D の点を画面の座標（CSS の px）に直す。月のラベルを石のそばに置くために、`useFrame` から毎フレーム呼ぶ前提。
 *
 * `out` を**直接書き換えて**返す（毎フレームの割り当てを避けるため）。中で使う一時的なベクトルはモジュールで 1 つだけなので、同時に呼び出さない前提。
 * カメラの行列は呼び出し側で最新にしておく。`matrixWorldInverse` は `camera.updateMatrixWorld()` で、
 * `projectionMatrix` は画角や `setViewOffset` を変えたときに three.js / drei が `updateProjectionMatrix()` で更新する。
 * 近くの切り取り面（near）より手前の点や、遠くの切り取り面（far）より奥の点は、画面の中なら見えることにする（ラベルを置く位置の判定なので、描かれるかどうかは問わない）。
 *
 * @param point - 3D の点（mm）
 * @param camera - 写すカメラ
 * @param width - 画面の幅（CSS の px）
 * @param height - 画面の高さ（CSS の px）
 * @param out - 結果を書き込む入れ物
 * @returns 書き換えた `out`
 */
export function projectToScreen(
  point: Vec3,
  camera: THREE.Camera,
  width: number,
  height: number,
  out: ScreenPoint,
): ScreenPoint {
  // 大きさが使えない値（0 以下・無限大・NaN）なら、写っていないことにする
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) {
    // 見えない（性能のため入れ物を直接書き換える）
    out.isVisible = false;
    // 書き換えた入れ物を返す
    return out;
  }
  // カメラから見た位置に直す（カメラは自分の -Z の向きを見ている）
  projectScratch.set(point[0], point[1], point[2]).applyMatrix4(camera.matrixWorldInverse);
  // z が 0 以上ならカメラの横か後ろ。投影すると上下左右が裏返って画面の中に来てしまうので、ここで外す
  if (!(projectScratch.z < 0)) {
    // 見えない（NaN もここで外れる）
    out.isVisible = false;
    // 書き換えた入れ物を返す
    return out;
  }
  // 画面上の位置（-1〜1 の正規化デバイス座標）に直す。applyMatrix4 は遠近の割り算（w で割る）もする
  projectScratch.applyMatrix4(camera.projectionMatrix);
  // 左からの px（-1 が左の端、1 が右の端）。性能のため入れ物を直接書き換える
  out.x = ((projectScratch.x + 1) / 2) * width;
  // 上からの px（1 が上の端、-1 が下の端）
  out.y = ((1 - projectScratch.y) / 2) * height;
  // 画面の中（-1〜1）に入っていれば見える（NaN なら比べると false になり、見えない）
  out.isVisible = Math.abs(projectScratch.x) <= 1 && Math.abs(projectScratch.y) <= 1;
  // 書き換えた入れ物を返す
  return out;
}
