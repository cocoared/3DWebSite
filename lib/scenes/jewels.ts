// 誕生石シーン（THE JEWELS）の「ロジック」を集約したモジュール（描画/JSX は components/scenes/JewelsScene.tsx 側）。
// 12 個の誕生石を時計の文字盤の位置に並べ、月を選ぶとその石へカメラを寄せる。
// 石の形は Blender の JewelCraft で作った public/jewels/jewels.glb、照明は Cycles で焼いた public/jewels/studio.hdr を使う。
// 長さの単位はミリメートル（Blender で 1 単位 = 1 mm として作った .glb をそのまま使うため）。

import * as THREE from "three";
import { BIRTHSTONE_IDS, type Birthstone, type BirthstoneId, monthName } from "@/lib/birthstones";
import { HERO, type HeroContent } from "@/lib/scene";

/**
 * 3 次元の位置や向き（x, y, z）。単位は mm。
 *
 * 読み取り専用のタプル。`OVERVIEW_POSE` のようにモジュールで共有する値を、受け取った側がうっかり書き換えないようにする
 * （R3F の `position` などの props は、読み取り専用のタプルもそのまま受け付ける）。
 */
export type Vec3 = readonly [x: number, y: number, z: number];

/** 石の形（Blender の JewelCraft で作り、build_jewels.py で書き出した glTF）の URL。 */
export const JEWELS_GLB_URL = "/jewels/jewels.glb";

/** 環境マップ（Cycles でスタジオの照明を全方向に焼いた Radiance HDR）の URL。 */
export const JEWELS_ENV_URL = "/jewels/studio.hdr";

/** 12 石を並べる時計の文字盤の半径（mm）。石の間隔（約 15.7 mm）が、いちばん長い石（8 mm）の 2 倍ほどになる大きさ。 */
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
 * 石を選んでいる間の、ほかの石の明るさ（1 = ふつう）。暗く沈めて主役の石を浮かび上がらせる。0 にはせず、文字盤の並びは見えるように残す。
 * 環境マップには明るさ 80 の点光源などの非常に明るい光が入っているので、0.2 程度ではトーンマッピングで飽和して暗く見えない。
 * 0.06 にすると、ストリップの映り込みは沈み、点光源の小さな光だけが残る（暗い部屋で主役にだけ光を当てたような見え方）。
 */
export const DIMMED_BRIGHTNESS = 0.06;

// FOCUS_ELEVATION: 石を選んだときにカメラが石を見下ろす角度（ラジアン）。0.5 ≒ 29°。Cycles の連番（35°）より少し低くして、切子面の側面も見せる
const FOCUS_ELEVATION = 0.5;
// FIRE_GAIN: 分散（宝石学の値）を MeshRefractionMaterial の aberrationStrength に直す倍率。
// 大きいほど虹色のずれが強くなる。ダイヤ（0.044）で分散スライダー 0.5 のとき 0.0176 になり、drei の作例の値（0.01〜0.02）に近い
const FIRE_GAIN = 0.8;
// BASE_EXPOSURE: 光量スライダー 1 のときの露出。Cycles の連番を描いた露出（+1 段 = 2 倍）に合わせる
const BASE_EXPOSURE = 2;
// SPIN_SETTLE: 選ばれなくなった石が元の向きへ戻る速さ（大きいほど早く戻る。MathUtils.damp の係数）
const SPIN_SETTLE = 3;
// LIFT_SMOOTHING: 浮き上がり・戻りの速さ（MathUtils.damp の係数）
const LIFT_SMOOTHING = 10;
// BRIGHTNESS_SMOOTHING: 石を暗く沈める・戻す速さ（MathUtils.damp の係数）。カメラの移動（約 0.8 秒）と同じくらいの時間で変わる値
const BRIGHTNESS_SMOOTHING = 5;
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

/** カメラの位置と注視点（どれも mm）。読み取り専用（`OVERVIEW_POSE` はモジュールで共有するので、丸ごと差し替えられないようにする）。 */
export interface CameraPose {
  /** カメラの位置。 */
  readonly position: Vec3;
  /** カメラが見る点。 */
  readonly target: Vec3;
}

/** 全体（12 石の文字盤）を見るカメラ。手前（6 時側）の斜め上から、中心を見下ろす。 */
export const OVERVIEW_POSE: CameraPose = {
  // 手前 88 mm・高さ 70 mm（仰角 約 38°・距離 約 112 mm）
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
 * 分散スライダーと石の分散から、MeshRefractionMaterial の `aberrationStrength`（虹色のずれ）を求める。
 * drei の実装では 0 と正の値を行き来するとマテリアルが作り直され、屈折の計算に使う BVH が失われるので、0 は返さない。
 *
 * @param dispersion - 石の分散（宝石学の B–G 間の値。ダイヤは 0.044）
 * @param fire - 分散スライダーの値（0〜1。範囲外は収める）
 */
export function aberrationFor(dispersion: number, fire: number): number {
  // スライダーの値を 0〜1 に収める
  const amount = THREE.MathUtils.clamp(fire, 0, 1);
  // 石の分散 × スライダー × 倍率。下限を付けて 0 にしない
  return Math.max(MIN_ABERRATION, dispersion * amount * FIRE_GAIN);
}

/**
 * 光量スライダーから、レンダラーの露出（`toneMappingExposure`）を求める。光量 1 で Cycles の連番と同じ明るさ（2 倍）。
 *
 * @param amb - 光量スライダーの値（0〜3。負の値は 0 にする）
 */
export function exposureFor(amb: number): number {
  // 基準の露出に光量を掛ける（負の値は 0）
  return Math.max(0, amb) * BASE_EXPOSURE;
}

/**
 * 石の色（`#rrggbb`）から、屈折のマテリアルに掛ける色（線形 RGB）を作る。
 * 一番明るい成分が 1 になるよう割って色味だけを残し（Cycles の吸収ボリュームの色の作り方と同じ）、
 * さらに `TINT_POWER` 乗して、石の中を通るほど色が濃くなる吸収に近い深さを出す。
 * 明るさは環境マップと露出で決まるので、暗い色の石でも光が弱まりすぎないようにする。
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
 * 石の明るさの目標（1 = ふつう）。何も選んでいなければ全部ふつう、石を選んでいる間はその石だけふつうで、ほかは `DIMMED_BRIGHTNESS`。
 *
 * @param id - 明るさを決める石
 * @param selected - 選んでいる石（選んでいなければ `null`）
 */
export function stoneBrightness(id: BirthstoneId, selected: BirthstoneId | null): number {
  // 選んでいないか、この石が選ばれていればふつうの明るさ、それ以外は暗くする
  return selected === null || selected === id ? 1 : DIMMED_BRIGHTNESS;
}

/**
 * 石の明るさを 1 フレーム進める（目標の明るさへなめらかに近づける）。
 *
 * @param brightness - 今の明るさ
 * @param delta - 前フレームからの経過秒数
 * @param target - 目標の明るさ（`stoneBrightness` の値）
 * @returns 次のフレームの明るさ
 */
export function advanceBrightness(brightness: number, delta: number, target: number): number {
  // 目標へなめらかに近づける（行き過ぎない）
  return THREE.MathUtils.damp(brightness, target, BRIGHTNESS_SMOOTHING, delta);
}

/**
 * 石のマテリアルに明るさを当てはめる。`useFrame` から毎フレーム呼ぶ前提で、渡した `material` を**直接書き換える**（毎フレームの割り当てを避けるため）。
 *
 * - 色（`color`）を持つマテリアル: 色を「元の色 × 明るさ」にする（MeshRefractionMaterial の屈折の色、パールの地の色）
 * - `envMapIntensity` を持つマテリアル（パールの MeshPhysicalMaterial）: 環境マップの映り込みも明るさにする（色だけだとツヤの反射が明るいまま残る）
 * - `baseFresnel` を渡し、`fresnel` を持つマテリアル（MeshRefractionMaterial）: 縁を白く光らせる強さを「基準の強さ × 明るさ」にする
 *   （Fresnel は石の色と関係なく白を足すので、弱めないと暗くした石に白い輪郭が残る）
 * - どれも持たないものや空の値、マテリアルの配列（石は 1 つのマテリアルしか使わないので対象外）では何もしない
 *
 * @param material - メッシュのマテリアル（型が決まらないものとして受け取る）
 * @param base - 明るさ 1 のときの色（線形 RGB）。書き換えない
 * @param brightness - 明るさ（1 = ふつう）
 * @param baseFresnel - 明るさ 1 のときの Fresnel の強さ。省略すると Fresnel は変えない
 */
export function applyStoneBrightness(
  material: unknown,
  base: THREE.Color,
  brightness: number,
  baseFresnel?: number,
): void {
  // オブジェクトでない、または配列（複数のマテリアル）なら何もしない
  if (typeof material !== "object" || material === null || Array.isArray(material)) return;
  // 色の uniform（three.js の Color）を持つなら、元の色 × 明るさにする
  if ("color" in material && material.color instanceof THREE.Color)
    material.color.copy(base).multiplyScalar(brightness);
  // 映り込みの強さ（数値）を持つなら、それも明るさにする（in と typeof で型が絞り込まれるので、キャストは要らない）
  if ("envMapIntensity" in material && typeof material.envMapIntensity === "number") {
    // 映り込みの強さを書き換える（性能のため直接書き換える）
    material.envMapIntensity = brightness;
  }
  // 基準の強さが渡されていて、Fresnel の強さ（数値）を持つなら、明るさに合わせて弱める
  if (baseFresnel !== undefined && "fresnel" in material && typeof material.fresnel === "number") {
    // Fresnel の強さを書き換える（性能のため直接書き換える）
    material.fresnel = baseFresnel * brightness;
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
 * 月のボタンを押したときの、次の選択。選んでいる石の月をもう一度押すと選択を外す（`aria-pressed` の切り替えボタンと同じ動き）。
 *
 * 3D の石をクリックしたときはこれを使わず、いつもその石を選ぶ（寄っている石に触れて回そうとしたときに、全体へ戻ってしまわないように）。
 *
 * @param current - 今選んでいる石（選んでいなければ `null`）
 * @param pressed - 押された月の石
 * @returns 次に選ぶ石。選択を外すときは `null`
 */
export function toggleStone(
  current: BirthstoneId | null,
  pressed: BirthstoneId,
): BirthstoneId | null {
  // 同じ石なら外し、違う石（または未選択）なら押された月の石にする
  return current === pressed ? null : pressed;
}

/**
 * 石を選んだときに、左下の見出し（SceneHero）へ出す文言を作る。
 */
export function jewelHero(stone: Birthstone): HeroContent {
  // 2 桁の月番号（例: 04）
  const number = String(stone.month).padStart(2, "0");
  // 見出しの文言をまとめて返す
  return {
    // 上付きラベル（例: 04 — April）。月名は範囲外の月なら RangeError になる（"undefined" を出さない）
    eyebrow: `${number} — ${monthName(stone.month)}`,
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
