// 誕生石シーン（THE JEWELS）の「ロジック」を集約したモジュール（描画/JSX は components/scenes/JewelsScene.tsx 側）。
// 12 個の誕生石を時計の文字盤の位置に並べ、月を選ぶとその石へカメラを寄せる。
// 石の形は Blender の JewelCraft で作った public/jewels/jewels.glb、石とパールの照明は Cycles で焼いた public/jewels/studio.hdr を使う
// （背景は真っ白。components/scenes/JewelsScene.tsx の BACKGROUND_COLOR）。
// 「床」は高さ 0 の基準面のこと（床のメッシュは置いていない。石の影を映す板（ContactShadows）は、その 0.01 mm 下）。
// 長さの単位はミリメートル（Blender で 1 単位 = 1 mm として作った .glb をそのまま使うため）。

import * as THREE from "three";
import {
  BIRTHSTONE_IDS,
  BIRTHSTONES,
  type Birthstone,
  type BirthstoneId,
  monthJaLabel,
} from "@/lib/birthstones";
import { HERO, type HeroContent, isCompactLayout } from "@/lib/scene";

/**
 * 3 次元の位置や向き（x, y, z）。単位は mm。
 *
 * 読み取り専用のタプル。`OVERVIEW_POSE` のようにモジュールで共有する値を、受け取った側がうっかり書き換えないようにする
 * （R3F の `position` などの props は、読み取り専用のタプルもそのまま受け付ける）。
 */
export type Vec3 = readonly [x: number, y: number, z: number];

/** 石の形（Blender の JewelCraft で作り、build_jewels.py で書き出した glTF）の URL。 */
export const JEWELS_GLB_URL = "/jewels/jewels.glb";

/** 石の屈折とパールの映り込みに使う環境マップ（Cycles でスタジオの照明を全方向に焼いた Radiance HDR）の URL。 */
export const JEWELS_ENV_URL = "/jewels/studio.hdr";

/** 12 石を並べる時計の文字盤の半径（mm）。隣の石の中心の間隔（直線で約 15.5 mm）が、いちばん長い石（8 mm）の 2 倍ほどになる大きさ。 */
export const RING_RADIUS_MM = 30;

/** 石の一番下（キューレット）を床から浮かせる高さ（mm）。台に載せずに宙に浮かせて見せる。 */
export const STONE_LIFT_MM = 0.8;

/** 指（マウス）を乗せた石が浮き上がる高さ（mm）。 */
export const HOVER_LIFT_MM = 1.2;

/** 選んだ石が回る速さ（ラジアン/秒）。0.35 だと約 18 秒で 1 周する。 */
export const SPIN_SPEED = 0.35;

/** 石を選んだときのカメラと石の距離を、石を包む球の半径の何倍にするか。大きいほど引いて写る。 */
export const FOCUS_DISTANCE_FACTOR = 4.4;

/** MeshRefractionMaterial に渡す色のずれ（aberrationStrength）の最小値。0 を渡さないための下限。 */
export const MIN_ABERRATION = 0.0001;

/**
 * 屈折の色（`tintFromColor`）を濃くするための指数。正規化した色をこの値で累乗すると、一番明るい成分以外が小さくなる。
 * MeshRefractionMaterial は石の中を通った距離による色の濃さ（Cycles の吸収ボリューム）を再現できないので、その代わりに色を濃くする。
 * 大きいほど色があざやかで深くなるが、淡い石（アクアマリンなど）まで濃く見えるようになる。
 */
export const TINT_POWER = 1.6;

/**
 * 石を選んでいる間の、ほかの石の不透明度（1 = 不透明）。真っ白な背景へ溶かすように薄くして、主役の石を浮かび上がらせる。0 にはせず、文字盤の並びは見えるように残す。
 * 大きくすると、ほかの石の色がはっきり残り、主役の石と張り合う。
 */
export const FADED_OPACITY = 0.15;

/**
 * カメラが目標の姿勢へ移るときの時間の目安（秒）。drei の `CameraControls` の `smoothTime` に渡す。大きいほどゆっくり回り込む。
 * 解説カードを閉じたあと、月のラベルへフォーカスを返す約束の期限（`FOCUS_PROMISE_MS`）は、これで一覧へ戻りきるのを待てる長さにする（テストで照らし合わせる）。
 */
export const CAMERA_SMOOTH_TIME = 0.8;

// JEWELS_DPR: 誕生石のタブのキャンバスの解像度の倍率の範囲 [下限, 上限]（ふだん）。屈折の石は 1 ピクセルごとに光線を追うので、
// 切子面の境目は 1 ピクセル単位の階段になる（キャンバスのアンチエイリアスは輪郭にしか効かない）。上限を 1.25 倍にしていたころは、
// スマホ（ピクセル比 3）で階段が約 2.4 倍に引き伸ばされてギザギザに見えたので、2 倍まで上げる（スマホで描くピクセル数は 1.25 倍のときの約 2.6 倍）。
// 下限 1 は「ピクセル比が 1 未満の画面（ブラウザの縮小表示など）でも、等倍より粗くは描かない」
const JEWELS_DPR = [1, 2] as const;
// JEWELS_REDUCED_DPR: フレームレートが落ちた端末で使う範囲。以前の上限（1.25 倍。太陽・浜辺の 1.6 倍より描くピクセル数が約 4 割少ない）
const JEWELS_REDUCED_DPR = [1, 1.25] as const;

/**
 * 誕生石のタブのキャンバスの解像度の倍率（デバイスピクセル比）の範囲 [下限, 上限] を返す。R3F の `<Canvas dpr>` に渡す。
 * R3F は端末のピクセル比（`window.devicePixelRatio`）をこの範囲に収めて使う（ピクセル比 1 のパソコンは 1 のまま、3 のスマホは上限まで）。
 * 呼ぶたびに新しい配列を返す（書き換えても次の呼び出しに影響しない。R3F は配列ではなく、収めたあとの数で変化を比べるので、毎回作っても描き直しは増えない）。
 *
 * @param isReduced - フレームレートが `JEWELS_MIN_FPS` を下回ったので軽くするなら `true`
 */
export function jewelsDpr(isReduced: boolean): [number, number] {
  // 軽くするなら以前の上限、ふだんは 2 倍まで
  const [min, max] = isReduced ? JEWELS_REDUCED_DPR : JEWELS_DPR;
  // 新しい配列にして返す
  return [min, max];
}

/**
 * 誕生石のタブで、解像度を下げる目安のフレームレート（fps）。60 fps の画面で、カクつきが目に見えてくる値。
 * drei の `PerformanceMonitor` は、測った値（0.25 秒以上たった最初のフレームまでの枚数から求めるので、実際より数 fps 高めに出る。実際の約 36 fps で 40）の
 * 10 回中 8 回以上がこれを下回ったら知らせる。省電力モードなどでフレームレートが 30 fps に抑えられた端末では、いつも下がる。
 */
export const JEWELS_MIN_FPS = 40;

/**
 * drei の `PerformanceMonitor` の `bounds` に渡す、フレームレートの [下限, 上限]（fps）。
 * drei の既定は、測った最高のフレームレートが 100 を超える画面（120 Hz など）で下限を 60 にするので、50〜59 fps で十分なめらかに動く端末まで下げてしまう。
 * そのため、画面に関係なく下限を `JEWELS_MIN_FPS` にする。上限は無限大にして、上げる知らせ（`onIncline`）を出させない（一度下げたら戻さない）。
 */
export function jewelsFpsBounds(): [number, number] {
  // 下限と、届かない上限
  return [JEWELS_MIN_FPS, Number.POSITIVE_INFINITY];
}

/**
 * 誕生石シーンのレンダラーの露出（`toneMappingExposure`。2 倍 = +1 段）。Blender の jewels.blend の露出（+1 段）と同じ。
 * 光量スライダーでは変えない（スライダーは環境マップの強さ `envIntensityFor` を変える）。
 */
export const STUDIO_EXPOSURE = 2;

// FOCUS_ELEVATION: 石を選んだときにカメラが石を見下ろす角度（ラジアン）。0.5 ≒ 29°。少し低めにして、テーブル面だけでなく切子面の側面も見せる
const FOCUS_ELEVATION = 0.5;
// SPIN_SETTLE: 選ばれなくなった石が元の向きへ戻る速さ（大きいほど早く戻る。MathUtils.damp の係数）
const SPIN_SETTLE = 3;
// LIFT_SMOOTHING: 浮き上がり・戻りの速さ（MathUtils.damp の係数）
const LIFT_SMOOTHING = 10;
// VIEW_SHIFT_SMOOTHING: 描く範囲をずらす速さ（MathUtils.damp の係数）。5 だと約 0.8 秒でほぼ着き、カメラの移動（CAMERA_SMOOTH_TIME）とそろう
const VIEW_SHIFT_SMOOTHING = 5;
// VIEW_SHIFT_SNAP_PX: 目標までこれより近ければ、ぴったり目標にする（px）。1 px 未満の動きは目に見えないので、描き直しを止めるため
const VIEW_SHIFT_SNAP_PX = 0.5;
// OPACITY_SMOOTHING: 石を薄くする・戻す速さ（MathUtils.damp の係数）。カメラの移動（約 0.8 秒）と同じくらいの時間で変わる値
const OPACITY_SMOOTHING = 5;
// TURN: 1 周のラジアン（2π）
const TURN = Math.PI * 2;

/**
 * 時計の文字盤で、その月の位置の角度（ラジアン）。12 時の方向から時計回りに、1 か月で π/6（30°）ずつ進む。
 *
 * @param month - 誕生月（1〜12）
 */
export function ringAngle(month: number): number {
  // 12 か月で 1 周
  return (month / 12) * TURN;
}

/**
 * 月ごとの石の位置（床の上、y = 0）。上から見ると時計の文字盤と同じ並びになる。
 * 12 時 = 奥（-Z）、3 時 = 右（+X）、6 時 = 手前（+Z）、9 時 = 左（-X）。全体を見るカメラは手前（+Z 側）に置く。
 *
 * @param month - 誕生月（1〜12）
 * @param radius - 文字盤の半径（mm）
 */
export function ringPosition(month: number, radius: number = RING_RADIUS_MM): Vec3 {
  // 月の角度
  const angle = ringAngle(month);
  // 右へ sin、奥へ cos の分だけ進んだ位置（奥は -Z なので符号を反転する）
  return [radius * Math.sin(angle), 0, -radius * Math.cos(angle)];
}

/**
 * 石を y 軸まわりに回す角度（ラジアン）。楕円やしずく形の長い向き（glTF のローカル -Z）が、文字盤の外側を向く。
 * Blender の build_jewels.py で確認用に並べたときの回転と同じ向き。
 *
 * @param month - 誕生月（1〜12）
 */
export function stoneYaw(month: number): number {
  // 文字盤の角度と逆向きに回すと、ローカル -Z が外向きになる
  return -ringAngle(month);
}

/** 石の形の上下の範囲と、形を包む球の半径（どれも mm）。three.js の Box3 / Sphere から作る。 */
export interface StoneBounds {
  /** 形のいちばん下の y。 */
  minY: number;
  /** 形のいちばん上の y。 */
  maxY: number;
  /** 形を包む球の半径。 */
  radius: number;
}

/** 石を置く高さと、カメラが見る中心の高さ（どれも mm）。 */
export interface StonePlacement {
  /** メッシュの y 位置。形のいちばん下が、床から `STONE_LIFT_MM` 浮く。 */
  baseY: number;
  /** 形の上下の中心の、床からの高さ（石を選んだときのカメラの注視点）。 */
  centerY: number;
  /** 形を包む球の半径（カメラの距離を決めるのに使う）。 */
  radius: number;
}

/**
 * 形（BufferGeometry）の上下の範囲と、形を包む球の半径を求める。
 *
 * 形が境界ボックス・境界球をまだ持っていなければ計算して、形に持たせる（three.js の仕組みで、画面外の判定などにも使われる）。
 *
 * @throws 形に頂点が無いとき（範囲が空になり、そのまま使うと石が無限の高さに置かれるため）
 */
export function geometryBounds(geometry: THREE.BufferGeometry): StoneBounds {
  // 境界ボックスが無ければ計算する
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  // 境界球が無ければ計算する
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  // 計算した境界ボックス
  const box = geometry.boundingBox;
  // 計算した境界球
  const sphere = geometry.boundingSphere;
  // 頂点が無い形では、three.js は null ではなく「空の範囲」（下端 +∞・上端 -∞ の箱、半径 -1 の球）を入れるので、
  // isEmpty() でそれも見分けて、どこがおかしいかわかるエラーにする
  if (!box || !sphere || box.isEmpty() || sphere.isEmpty())
    throw new Error("形の範囲を計算できません（頂点がありません）");
  // 上下の範囲と半径を返す
  return { minY: box.min.y, maxY: box.max.y, radius: sphere.radius };
}

/**
 * 石の形の上下の範囲から、置く高さと中心の高さを求める。
 */
export function stonePlacement(bounds: StoneBounds): StonePlacement {
  // 最下点が床から STONE_LIFT_MM に来るよう、形全体を持ち上げる量
  const baseY = STONE_LIFT_MM - bounds.minY;
  // 持ち上げたあとの、上下の中点の高さ
  const centerY = baseY + (bounds.minY + bounds.maxY) / 2;
  // 求めた値をまとめて返す
  return { baseY, centerY, radius: bounds.radius };
}

/** 横長の画面で使うカメラの縦の画角（度）。 */
export const BASE_FOV_DEG = 40;

/**
 * 縦の画角を広げ始める縦横比（幅 / 高さ）。これより細い画面では、横に見える範囲がこの縦横比のときと同じになるよう縦の画角を広げる。
 * 1（正方形）で、今の全体を見るカメラ（`OVERVIEW_POSE`・`BASE_FOV_DEG`）の注視点の深さで横に約 ±39 mm 見え、
 * 文字盤の 3 時・9 時の石（中心から 30 mm）が収まる。カメラの位置や基準の画角を変えたら、この値も確かめ直す。大きくすると細い画面でより引いて写る。
 */
export const FOV_REFERENCE_ASPECT = 1;

/**
 * 縦の画角の上限（度）。極端に細い画面でも、これより広げない（広げすぎると魚眼のように端がゆがむ）。
 * スマホの縦持ち（約 0.46）では約 76° なので、ふつうの画面では上限に届かない。
 * 縦横比が約 0.36（tan 20°）より細いと上限に当たり、それより細くなるほど横に見える範囲が狭まって、約 0.32 より細いと左右の石（3 時と 9 時。中心から 30 mm、石の半分の大きさ 約 4 mm）の外側の端が画面の端に掛かり始める（全体の構図のカメラから石までの奥行き 約 108 mm で、(30 + 4) / 108 ≒ 0.31）。
 */
export const MAX_FOV_DEG = 90;

/**
 * 画面の縦横比に合わせた、カメラの縦の画角（度）を求める。画面の大きさが変わるたびに呼ぶ。
 *
 * 縦長の画面（スマホ）では横に見える範囲が狭くなり、文字盤の左右の石が切れてしまう。
 * カメラを遠ざけると寄り引きの上限（`maxDistance`）に当たり、石も小さく写るので、代わりに縦の画角を広げて、横に見える範囲を `FOV_REFERENCE_ASPECT` のときと同じに保つ。
 * 石を選んだときのカメラの距離は変えないので、選んだ石は画面の高さに対しては小さく写るが、画面の幅に対する大きさは正方形の画面と同じになる。
 *
 * @param aspect - 画面の幅 / 高さ。0 以下・無限大・NaN（描き始めで大きさが 0 のときなど）なら基準の画角を返す
 * @returns 縦の画角（度）。`BASE_FOV_DEG` 以上 `MAX_FOV_DEG` 以下
 */
export function fitFov(aspect: number): number {
  // 使えない縦横比や、基準より横長の画面では、基準の画角のまま
  if (!Number.isFinite(aspect) || aspect <= 0 || aspect >= FOV_REFERENCE_ASPECT)
    return BASE_FOV_DEG;
  // 基準の縦横比のときの、横の半分の画角の tan（縦の半分の画角の tan × 縦横比）
  const halfWidth = Math.tan(THREE.MathUtils.degToRad(BASE_FOV_DEG) / 2) * FOV_REFERENCE_ASPECT;
  // 横の広がりを保つ縦の画角（tan(縦 / 2) = 横の広がり / 縦横比）を度に直す
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfWidth / aspect));
  // 上限を超えないようにする
  return Math.min(fov, MAX_FOV_DEG);
}

/**
 * スマホで解説カードのシートが開いているとき、描く範囲を上へずらす量を、画面の高さに対する割合で表したもの。
 * ナビの下の端と、シート（高さは最大 45dvh）の上の端の、ちょうど中間に石が来るように合わせた値（高さ 844px の画面で約 194px）。
 * 390 × 844・375 × 667・844 × 390 で測ると 0.228〜0.231 だった（どの石も説明文が長く、シートは最大の高さまで伸びる）。
 * シートの中身が短いときや、画面の高さが違うときは、石の位置が少しずれる。大きくすると石がより上に写る。
 */
export const SHEET_VIEW_SHIFT = 0.23;

/**
 * 解説カードのシートに石が隠れないよう、描く範囲を上へずらす量（px）を求める。画面の大きさか選択が変わるたびに呼ぶ。
 *
 * スマホ向けの配置（lib/scene.ts の `isCompactLayout`。縦持ちも横持ちも）で、シートが開いているときだけずらす。
 * パソコン向けの配置では解説カードは左下にあり、真ん中の石に重ならないのでずらさない。
 *
 * @param width - 画面の幅（CSS の px）
 * @param height - 画面の高さ（CSS の px）
 * @param isSheetOpen - 解説カードのシートが開いているか（石を選んでいるか）
 * @returns 上へずらす量（px、整数）。ずらさないとき、幅や高さが 0 以下・無限大・NaN のときは 0
 */
export function focusViewShift(width: number, height: number, isSheetOpen: boolean): number {
  // シートが無いときはずらさない
  if (!isSheetOpen) return 0;
  // 幅か高さが使えない値（0 以下・無限大・NaN）ならずらさない。NaN を返すと、カメラの投影が壊れて何も描かれなくなる
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) return 0;
  // パソコン向けの配置では、解説カードは左下にあり真ん中の石に重ならないので、ずらさない
  if (!isCompactLayout(width, height)) return 0;
  // 画面の高さの一定の割合だけずらす（半端な px で文字や線がにじまないよう整数にする）
  return Math.round(height * SHEET_VIEW_SHIFT);
}

/** カメラの位置と注視点（どれも mm）。読み取り専用（`OVERVIEW_POSE` はモジュールで共有するので、丸ごと差し替えられないようにする）。 */
export interface CameraPose {
  /** カメラの位置。 */
  readonly position: Vec3;
  /** カメラが見る点。 */
  readonly target: Vec3;
}

/** 全体（12 石の文字盤）を見るカメラ。手前（6 時側）の斜め上から、中心を見下ろす。 */
export const OVERVIEW_POSE: CameraPose = {
  // 手前 88 mm・高さ 70 mm。注視点（下の target）から見て、距離 約 108 mm・仰角 約 40°
  position: [0, 70, 88],
  // 文字盤の中心より少し手前を見て、画面の上寄りに文字盤を置く（下に見出しとパネルがあるため）
  target: [0, 0, 6],
};

/**
 * 月を選んだときのカメラ。文字盤の外側・斜め上から、その石の中心を見る。
 * 文字盤の中心から石へ向かう直線の延長上にカメラを置くので、背景には向かい側の石が小さく並ぶ。
 *
 * @param month - 誕生月（1〜12）
 */
export function focusPose(month: number, placement: StonePlacement): CameraPose {
  // 石の床の上の位置
  const [x, , z] = ringPosition(month);
  // 文字盤の中心から石へ向かう向き（長さ 1）
  const [outX, , outZ] = ringPosition(month, 1);
  // カメラと石の中心の距離
  const distance = placement.radius * FOCUS_DISTANCE_FACTOR;
  // 水平方向の距離
  const flat = distance * Math.cos(FOCUS_ELEVATION);
  // 石の中心より上の高さ
  const rise = distance * Math.sin(FOCUS_ELEVATION);
  // 注視点は石の中心
  const target: Vec3 = [x, placement.centerY, z];
  // カメラは石から外向きに flat、上へ rise だけ離れた位置
  const position: Vec3 = [x + outX * flat, placement.centerY + rise, z + outZ * flat];
  // 位置と注視点を返す
  return { position, target };
}

/** camera-controls と同じ決め方の角度と距離。 */
export interface OrbitAngles {
  /** 方位角（ラジアン）。注視点から見て +Z の向きが 0、+X の向きが π/2。 */
  azimuth: number;
  /** 極角（ラジアン）。真上から見下ろすと 0、水平に見ると π/2。 */
  polar: number;
  /** カメラと注視点の距離（mm）。 */
  distance: number;
}

/**
 * カメラの位置と注視点から、camera-controls の `rotateTo` に渡す角度と距離を求める。
 */
export function orbitAngles(pose: CameraPose): OrbitAngles {
  // 注視点からカメラへ向かう差
  const dx = pose.position[0] - pose.target[0];
  // 高さの差
  const dy = pose.position[1] - pose.target[1];
  // 奥行きの差
  const dz = pose.position[2] - pose.target[2];
  // 距離
  const distance = Math.hypot(dx, dy, dz);
  // 方位角は +Z から +X へ回る向き（three.js の Spherical と同じ）
  const azimuth = Math.atan2(dx, dz);
  // 極角は真上（+Y）からの角度。距離 0 のときは水平とみなす
  const polar = distance > 0 ? Math.acos(THREE.MathUtils.clamp(dy / distance, -1, 1)) : Math.PI / 2;
  // まとめて返す
  return { azimuth, polar, distance };
}

/**
 * 同じ向きを表す角度（2π の倍数だけ違う値）のうち、今の角度に一番近いものを返す。
 * camera-controls の方位角は回した分だけ増え続けるので、そのまま目標の角度を渡すと何周も逆回りすることがある。
 *
 * @param current - 今の角度（ラジアン。何周ぶんでもよい）
 * @param desired - 向きたい方向の角度（ラジアン）
 * @returns `desired` と同じ向きで、`current` との差が π 以内の角度
 */
export function nearestAngle(current: number, desired: number): number {
  // 差を 1 周の単位で丸めた分だけ、目標の角度をずらす
  return desired + TURN * Math.round((current - desired) / TURN);
}

/**
 * 分散スライダーを 1 にしたとき、石の分散（赤と青の屈折率の差）を実物の何倍にして見せるか。
 * 実物の分散のままでは、画面の上で虹色のずれが 1 ピクセルにも満たず、ほとんど見えない。
 * 大きいほど虹色（ファイア）が強く出る。スライダーの初期値 0.5 では、この値の半分の倍率になる。
 */
export const FIRE_GAIN = 4;

/**
 * 分散スライダーと石の分散・屈折率から、MeshRefractionMaterial の `aberrationStrength`（虹色のずれ）を求める。
 * `fastChroma` を使わないとき、drei は赤を「屈折率 × (1 - 値)」、青を「屈折率 × (1 + 値)」で屈折させるので、
 * 赤と青の屈折率の差（2 × 屈折率 × 値）が、石の分散 × スライダー × `FIRE_GAIN` になるよう逆算する。
 * drei の実装では 0 と正の値を行き来するとマテリアルが作り直され、屈折の計算に使う BVH が失われるので、0 は返さない。
 *
 * @param dispersion - 石の分散（宝石学の B–G 間の屈折率の差。ダイヤは 0.044）
 * @param ior - 石の屈折率（1 以上。1 未満や数でない値なら `MIN_ABERRATION` を返す）
 * @param fire - 分散スライダーの値（0〜1。範囲外は収める。数でない値なら `MIN_ABERRATION` を返す）
 * @returns drei の `aberrationStrength` に渡す値（`MIN_ABERRATION` 以上。実際の 12 石では 0.04 未満）
 */
export function aberrationFor(dispersion: number, ior: number, fire: number): number {
  // 数でない値や 1 未満の屈折率では式が成り立たない（NaN や無限大を drei に渡すと屈折が壊れる）ので、下限の値にする
  if (!Number.isFinite(dispersion) || !Number.isFinite(fire) || !(ior >= 1)) return MIN_ABERRATION;
  // スライダーの値を 0〜1 に収める
  const amount = THREE.MathUtils.clamp(fire, 0, 1);
  // 見せたい赤と青の屈折率の差（石の分散 × スライダー × 倍率）
  const spread = dispersion * amount * FIRE_GAIN;
  // 差が 2 × 屈折率 × 値 になる値。下限を付けて 0 にしない
  return Math.max(MIN_ABERRATION, spread / (2 * ior));
}

/**
 * 光量スライダーから、環境マップ（スタジオの光。`studio.hdr`）の強さの倍率を求める。1 でスタジオの光そのまま。
 * 屈折の石には `refractionColor` で色に掛け、パールには `envMapIntensity` として渡す。露出（`STUDIO_EXPOSURE`）は変えない。
 *
 * @param amb - 光量スライダーの値（0〜3。負の値は 0 にする。NaN や無限大は 1 にする）
 */
export function envIntensityFor(amb: number): number {
  // 数でない値がシェーダーへ渡ると石とパールが壊れて写るので、スタジオそのままの強さにする
  if (!Number.isFinite(amb)) return 1;
  // 負の値は 0（光なし）
  return Math.max(0, amb);
}

/**
 * 石の色（`#rrggbb`）から、屈折のマテリアルに掛ける色（線形 RGB）を作る。
 * 一番明るい成分が 1 になるよう割って色味だけを残し（Cycles の吸収ボリュームの色の作り方と同じ）、
 * さらに `TINT_POWER` 乗して、石の中を通るほど色が濃くなる吸収に近い深さを出す。
 * 明るさは環境マップ・その強さ（光量スライダー。`refractionColor`）・露出で決まるので、暗い色の石でも光が弱まりすぎないようにする。
 *
 * @returns 線形 RGB（各成分 0〜1。一番明るい成分は 1）
 */
export function tintFromColor(hex: string): Vec3 {
  // sRGB の 16 進数の色を、線形 RGB に直して読み込む（three.js の色管理が変換する）
  const color = new THREE.Color(hex);
  // 一番明るい成分（0 除算を避けるため下限を付ける）
  const peak = Math.max(color.r, color.g, color.b, 1e-4);
  // deepen: 一番明るい成分で割ってから累乗する（1 のままの成分は変わらず、ほかの成分ほど小さくなる）
  const deepen = (channel: number) => (channel / peak) ** TINT_POWER;
  // 赤・緑・青それぞれに当てはめる
  return [deepen(color.r), deepen(color.g), deepen(color.b)];
}

/**
 * 屈折の石（MeshRefractionMaterial）の `color` に渡す色（線形 RGB）を求める。石の色（`tintFromColor`）に環境マップの強さを掛ける。
 * drei の MeshRefractionMaterial は「`color` × 環境マップから拾った光」で色を出す（環境マップの強さを変える uniform は無い）ので、
 * 色に掛けると、環境マップの強さを変えたのと同じになる。縁を白く光らせる `fresnel` は、この色とは別に白を混ぜるので強さに左右されない。
 *
 * @param hex - 石の色（`#rrggbb`）
 * @param intensity - 環境マップの強さの倍率。`envIntensityFor` を通した、有限で 0 以上の値を渡す（NaN や無限大はそのまま成分に伝わる）
 * @returns 線形 RGB の新しい配列（呼ぶたびに作る）。各成分は 0〜`intensity` で、光量 1 を超えると 1 を超える（`THREE.Color` に数値 3 つで渡す前提）
 */
export function refractionColor(hex: string, intensity: number): Vec3 {
  // 石の色味
  const [r, g, b] = tintFromColor(hex);
  // 各成分に強さを掛ける
  return [r * intensity, g * intensity, b * intensity];
}

/**
 * 石を薄くするか（ほかの石を選んでいる間は `true`）。不透明度の目標（`stoneOpacity`）と、影を落とすかの判定（`castsShadow`）の入力の両方に使う。
 *
 * @param id - 判定する石
 * @param selected - 選んでいる石（選んでいなければ `null`）
 */
export function isFadedStone(id: BirthstoneId, selected: BirthstoneId | null): boolean {
  // 何かを選んでいて、それがこの石でなければ薄くする
  return selected !== null && selected !== id;
}

/**
 * 選択を外して石が不透明へ戻るとき、影を落とすようにする不透明度（0〜1）。`FADED_OPACITY` より大きく 1 より小さい。
 * すぐ戻すと、まだ薄い石の下に濃い影だけが先に出るので、ほぼ不透明になってから戻す。小さくすると影が早く出る。
 */
export const SHADOW_RETURN_OPACITY = 0.9;

/**
 * 石が影を落とすか。薄くする石は（まだ不透明でも）すぐ影を消し、戻る石は不透明度が `SHADOW_RETURN_OPACITY` 以上になってから影を出す。
 * 呼び出し側は、`false` の石を影を撮るカメラに写らないレイヤーへ移す。
 *
 * @param isFaded - 薄くする石か（`isFadedStone`）
 * @param opacity - 今の不透明度（0〜1）
 */
export function castsShadow(isFaded: boolean, opacity: number): boolean {
  // 薄くしない石で、ほぼ不透明になっていれば影を落とす
  return !isFaded && opacity >= SHADOW_RETURN_OPACITY;
}

/**
 * 石の不透明度の目標（1 = 不透明）。何も選んでいなければ全部不透明、石を選んでいる間はその石だけ不透明で、ほかは `FADED_OPACITY`。
 *
 * @param id - 不透明度を決める石
 * @param selected - 選んでいる石（選んでいなければ `null`）
 */
export function stoneOpacity(id: BirthstoneId, selected: BirthstoneId | null): number {
  // 薄くする石なら FADED_OPACITY、それ以外（選んでいない・この石を選んでいる）は不透明
  return isFadedStone(id, selected) ? FADED_OPACITY : 1;
}

/**
 * 石の不透明度を 1 フレーム進める（目標の不透明度へなめらかに近づける）。
 *
 * @param opacity - 今の不透明度
 * @param delta - 前フレームからの経過秒数。0 以下・NaN なら今の不透明度のまま（負の値で 0〜1 の外へ飛び出さないように）
 * @param target - 目標の不透明度（`stoneOpacity` の値）
 * @returns 次のフレームの不透明度。今の不透明度が有限でない（NaN・±Infinity）なら目標（NaN のままだと石が消えたまま戻らないため）
 */
export function advanceOpacity(opacity: number, delta: number, target: number): number {
  // 今の値が壊れていたら、目標に置き直して立て直す
  if (!Number.isFinite(opacity)) return target;
  // 経過時間が 0 以下・NaN なら、今の値のまま
  if (!(delta > 0)) return opacity;
  // 目標へなめらかに近づける（行き過ぎない）
  return THREE.MathUtils.damp(opacity, target, OPACITY_SMOOTHING, delta);
}

/**
 * 石のマテリアルに不透明度を当てはめる。`useFrame` から毎フレーム呼ぶ前提で、渡した `material` を**直接書き換える**（毎フレームの割り当てを避けるため）。
 *
 * - `opacity`（数値）を持つマテリアル（MeshRefractionMaterial の uniform、パールの MeshPhysicalMaterial）: 不透明度を書き換える。色は変えない
 * - 持たないものや空の値、マテリアルの配列（石は 1 つのマテリアルしか使わないので対象外）では何もしない
 *
 * 呼び出し側の責任: マテリアルを `transparent` にしておく（しないと three.js が不透明として描き、薄くならない）。
 *
 * @param material - メッシュのマテリアル（型が決まらないものとして受け取る）
 * @param opacity - 不透明度（0〜1）
 */
export function applyStoneOpacity(material: unknown, opacity: number): void {
  // オブジェクトでない、または配列（複数のマテリアル）なら何もしない
  if (typeof material !== "object" || material === null || Array.isArray(material)) return;
  // 不透明度（数値）を持つなら書き換える（in と typeof で型が絞り込まれるので、キャストは要らない。性能のため直接書き換える）
  if ("opacity" in material && typeof material.opacity === "number") material.opacity = opacity;
}

/**
 * drei の MeshRefractionMaterial の `resolution`（描く大きさ）を、実際の描画のピクセル数（CSS の大きさ × 解像度の倍率）にする。
 * `useFrame` から毎フレーム呼ぶ前提で、渡した `material` の uniform を**直接書き換える**（割り当ては無い）。
 *
 * drei は CSS のピクセル数（`size.width`）を渡すが、シェーダーは `gl_FragCoord`（描画のピクセル数）をこれで割って画面上の位置（0〜1）を求め、
 * その変化の大きさで環境マップの細かさ（ミップマップの段）を選ぶ。倍率 2 だと位置が 0〜2 になり、1 段ぶん粗い（ぼやけた）環境マップを拾ってしまう。
 * drei の props の型には `resolution` が無く、drei はキャンバスの大きさが変わったときやマテリアルを作り直したとき（分散の 0 をまたいだときなど）に CSS の値へ戻すので、描く直前の毎フレームに上書きする。
 *
 * - `uniforms.resolution.value` が `THREE.Vector2` のマテリアル（MeshRefractionMaterial）: 書き換える
 * - 持たないもの（パールの MeshPhysicalMaterial など）や空の値、マテリアルの配列では何もしない
 *
 * @param material - メッシュのマテリアル（型が決まらないものとして受け取る）
 * @param width - キャンバスの幅（CSS のピクセル数。R3F の `size.width`）
 * @param height - キャンバスの高さ（CSS のピクセル数。R3F の `size.height`）
 * @param dpr - 解像度の倍率（R3F の `viewport.dpr`。端末のピクセル比を `jewelsDpr` の範囲に収めた値）
 */
export function applyRefractionResolution(
  material: unknown,
  width: number,
  height: number,
  dpr: number,
): void {
  // オブジェクトでない、または配列（複数のマテリアル）なら何もしない
  if (typeof material !== "object" || material === null || Array.isArray(material)) return;
  // uniforms を持たなければ何もしない（three.js の標準のマテリアル）
  if (
    !("uniforms" in material) ||
    typeof material.uniforms !== "object" ||
    material.uniforms === null
  )
    return;
  // resolution の uniform（無ければ undefined）
  const resolution = "resolution" in material.uniforms ? material.uniforms.resolution : undefined;
  // 値が Vector2 のときだけ書き換える（性能のため直接書き換える）
  if (
    typeof resolution === "object" &&
    resolution !== null &&
    "value" in resolution &&
    resolution.value instanceof THREE.Vector2
  ) {
    // 描画のピクセル数にする
    resolution.value.set(width * dpr, height * dpr);
  }
}

/**
 * 石の回転を 1 フレーム進める。選ばれている間は一定の速さで回り、選ばれなくなったら一番近い元の向き（2π の倍数）へ静かに戻る。
 *
 * @param spin - 今の回転（ラジアン。元の向きからのずれ）
 * @param delta - 前フレームからの経過秒数
 * @param isSpinning - 選ばれていて回り続けるか
 * @returns 次のフレームの回転
 */
export function advanceSpin(spin: number, delta: number, isSpinning: boolean): number {
  // 選ばれている間は速さ × 時間だけ進む
  if (isSpinning) return spin + SPIN_SPEED * delta;
  // 一番近い元の向き（逆回りせずに戻れる向き）
  const rest = TURN * Math.round(spin / TURN);
  // 元の向きへなめらかに近づける（時間が長いほど近づき、行き過ぎない）
  return THREE.MathUtils.damp(spin, rest, SPIN_SETTLE, delta);
}

/**
 * 指（マウス）を乗せた石の浮き上がりを 1 フレーム進める。
 *
 * @param lift - 今の浮き上がり（mm）
 * @param delta - 前フレームからの経過秒数
 * @param isHovered - 指が乗っているか
 * @returns 次のフレームの浮き上がり（`0` 〜 `HOVER_LIFT_MM`）
 */
export function advanceLift(lift: number, delta: number, isHovered: boolean): number {
  // 乗っていれば HOVER_LIFT_MM、離れていれば 0 へなめらかに近づける
  return THREE.MathUtils.damp(lift, isHovered ? HOVER_LIFT_MM : 0, LIFT_SMOOTHING, delta);
}

/**
 * 描く範囲をずらす量（`focusViewShift` の結果）を、1 フレームぶん目標へ近づける。`useFrame` から毎フレーム呼ぶ前提。
 * 一気に切り替えると、なめらかに動くカメラと違って画面が跳ぶので、同じくらいの速さで近づける。
 *
 * @param current - 今のずらす量（px）。NaN などの壊れた値なら、目標に置き直す
 * @param target - 目標のずらす量（px）
 * @param delta - 前フレームからの経過秒数。0 以下や NaN なら動かさない（負の時間では目標から遠ざかってしまうため）
 * @returns 次のフレームのずらす量（px）。目標まで `VIEW_SHIFT_SNAP_PX` 未満なら目標そのもの
 */
export function advanceViewShift(current: number, target: number, delta: number): number {
  // 今の値が壊れていたら、目標に置き直して立て直す（NaN のまま毎フレーム描き直し続けないように）
  if (!Number.isFinite(current)) return target;
  // 経過時間が 0 以下・NaN なら、今の値のまま
  if (!(delta > 0)) return current;
  // 目標へなめらかに近づける
  const next = THREE.MathUtils.damp(current, target, VIEW_SHIFT_SMOOTHING, delta);
  // 目標のすぐ近くまで来たら、ぴったり目標にする
  return Math.abs(target - next) < VIEW_SHIFT_SNAP_PX ? target : next;
}

/**
 * 描く範囲を上へずらす量を、カメラに反映する（three.js の `setViewOffset` を使う「レンズシフト」）。`useFrame` から毎フレーム呼ぶ前提。
 *
 * カメラの向きは変えずに、写る範囲だけを動かす。`setViewOffset` は「大きな画像の一部を切り取って描く」仕組みで、
 * 切り取る窓を下へずらすと、写るものは上へ動く。量も画面の大きさも前と同じなら、投影を作り直さない。
 *
 * 渡したカメラを**直接書き換える**（`view` と投影行列）。
 *
 * @param camera - 書き換えるカメラ
 * @param shift - 上へずらす量（px）。0・NaN・無限大ならずらしを解く（壊れた量で切り取ると、投影が NaN になって何も描かれなくなるため）
 * @param width - 画面の幅（CSS の px）
 * @param height - 画面の高さ（CSS の px）。幅か高さが 0 以下なら、ずらしを解く（投影が壊れるため）
 * @returns 投影を作り直したら `true`、何もしなかったら `false`
 */
export function applyViewShift(
  camera: THREE.PerspectiveCamera,
  shift: number,
  width: number,
  height: number,
): boolean {
  // カメラが今使っている切り取りの設定（一度も設定していなければ null）
  const view = camera.view;
  // ずらさないとき（量が 0 か壊れている、または画面の大きさが無いとき）は、ずらしが残っていれば解く
  if (shift === 0 || !Number.isFinite(shift) || !(width > 0 && height > 0)) {
    // ずらしていなければ何もしない
    if (!view?.enabled) return false;
    // ずらしを解く（投影が作り直される）
    camera.clearViewOffset();
    // 作り直した
    return true;
  }
  // 量も画面の大きさも前と同じなら、作り直さない（毎フレームの無駄な計算を避ける）
  if (
    view?.enabled &&
    view.offsetY === shift &&
    view.fullWidth === width &&
    view.fullHeight === height
  ) {
    // 何もしなかった
    return false;
  }
  // 画面と同じ大きさの窓を、下へ shift だけずらして切り取る（写るものは上へ動く）
  camera.setViewOffset(width, height, 0, shift, width, height);
  // 作り直した
  return true;
}

/**
 * 前後の月の誕生石。12 月の次は 1 月、1 月の前は 12 月に回り込む（解説カードの ‹ › ボタン）。
 *
 * @param stone - 今の石
 * @param step - `-1` で前の月、`1` で次の月
 * @returns 前後の月の石（`BIRTHSTONES` の中の同じオブジェクト）
 * @throws {RangeError} 石の月が 1〜12 の整数でないとき（壊れたデータで、別の石を黙って返さないため）
 */
export function adjacentStone(stone: Birthstone, step: -1 | 1): Birthstone {
  // 石の数（12）
  const count = BIRTHSTONES.length;
  // 月が 1〜12 の整数でなければ、並びの位置を求められない
  if (!Number.isInteger(stone.month) || stone.month < 1 || stone.month > count) {
    // 範囲の外であることを知らせる
    throw new RangeError(`月は 1〜${count} の整数です: ${stone.month}`);
  }
  // 並びの位置（BIRTHSTONES は 1 月から順に並ぶ。lib/birthstones.ts の parseBirthstones が確かめている）を step だけ進め、端で回り込ませる
  const index = (stone.month - 1 + step + count) % count;
  // その位置の石を返す
  return BIRTHSTONES[index];
}

/**
 * 石を選んだときの文言を作る。解説カード（`JewelCard`）の月のラベル・名前・石言葉の文・操作のヒントと、
 * 読み上げ専用の知らせ（`PortfolioExperience` の `role="status"`）に使う。
 */
export function jewelHero(stone: Birthstone): HeroContent {
  // 見出しの文言をまとめて返す
  return {
    // 上付きラベル（例: 4月）。範囲外の月なら RangeError になる（"0月" などを出さない）
    eyebrow: monthJaLabel(stone.month),
    // 大きな英字タイトル（例: DIAMOND）
    title: stone.name.toUpperCase(),
    // 説明文（例: 4月の誕生石、ダイヤモンド。石言葉は「強さ」（Strength）。）
    tag: `${stone.month}月の誕生石、${stone.nameJa}。石言葉は「${stone.meaningJa}」（${stone.meaning}）。`,
    // 操作のヒント
    hint: "Drag to rotate · Esc to return",
    // 読み上げの知らせ。見出し全体を読み上げると長いので、何月の何を選んだかだけを伝える（例: 4月の誕生石、ダイヤモンドを表示しています。）
    announcement: `${stone.month}月の誕生石、${stone.nameJa}を表示しています。`,
  };
}

/** 石の選択を外して文字盤の一覧に戻ったときの、読み上げ専用の知らせ。 */
export const OVERVIEW_RETURN_ANNOUNCEMENT = "文字盤の一覧に戻りました。";

/**
 * 誕生石シーンで石を選んでいないときに、左下の見出し（SceneHero）へ出す文言。
 *
 * 画面の見出しはいつも `HERO.jewel` と同じ。読み上げの文だけを、どうやって一覧に来たかで変える。
 * 同じタブのまま選択を外したときに「〜シーンを表示しています。」と読み上げると、別のシーンへ移ったように聞こえるため。
 *
 * @param isReturnFromStone - 同じタブのまま石の選択を外して戻ったか（タブを切り替えてきたときは `false`）
 * @returns `false` なら `HERO.jewel` そのもの、`true` なら読み上げだけ差し替えた新しいオブジェクト（`HERO.jewel` は書き換えない）
 */
export function overviewHero(isReturnFromStone: boolean): HeroContent {
  // タブを切り替えてきたときは、シーンの見出しをそのまま使う
  if (!isReturnFromStone) return HERO.jewel;
  // 選択を外して戻ったときは、見出しを写して、読み上げの文だけを「戻った」ことを伝える文に替える
  return { ...HERO.jewel, announcement: OVERVIEW_RETURN_ANNOUNCEMENT };
}

/**
 * 読み込んだ glTF のノードから、12 石ぶんの形（BufferGeometry）を id で取り出す。
 * .glb はアプリの外（Blender）で作るデータなので、足りない石やメッシュでないノードがあれば、どの石かがわかるエラーにする。
 *
 * @param nodes - drei の `useGLTF` が返す `nodes`（ノード名 → オブジェクト）
 * @throws 石のノードが無い、またはメッシュでないとき
 */
export function pickStoneGeometries(
  nodes: Record<string, THREE.Object3D | undefined>,
): Record<BirthstoneId, THREE.BufferGeometry> {
  // 石ごとに形を取り出して、id → 形の組を作る
  const entries = BIRTHSTONE_IDS.map((id) => {
    // ノード名は石の id（build_jewels.py でオブジェクト名を id にしている）
    const node = nodes[id];
    // メッシュでなければ形が無い
    if (!(node instanceof THREE.Mesh))
      throw new Error(`jewels.glb に「${id}」のメッシュがありません`);
    // id と形の組
    return [id, node.geometry] as const;
  });
  // 組の一覧をオブジェクトにする
  return Object.fromEntries(entries) as Record<BirthstoneId, THREE.BufferGeometry>;
}

/**
 * drei の MeshRefractionMaterial が内部で作る BVH（光線の当たり判定用の木構造。GPU のテクスチャを持つ）を片付ける。
 * マテリアルの `dispose()` は uniform のテクスチャまでは解放しないので、アンマウント時にこれを呼ぶ。
 * BVH を持たないマテリアルや空の値のときは何もしない。
 *
 * @param material - メッシュのマテリアル（型が決まらないものとして受け取る）
 */
export function disposeRefractionBvh(material: unknown): void {
  // オブジェクトでない、または bvh を持たなければ何もしない
  if (typeof material !== "object" || material === null || !("bvh" in material)) return;
  // bvh の中身（in で型が絞り込まれているので、キャストせずに読める）
  const bvh = material.bvh;
  // dispose を持つときだけ呼ぶ
  if (
    typeof bvh === "object" &&
    bvh !== null &&
    "dispose" in bvh &&
    typeof bvh.dispose === "function"
  )
    bvh.dispose();
}
