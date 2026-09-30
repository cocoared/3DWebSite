import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { describe, expect, test, vi } from "vitest";
import { BIRTHSTONE_IDS, type BirthstoneId, birthstoneById } from "@/lib/birthstones";
import { COMPACT_MAX_HEIGHT_PX, HERO } from "@/lib/scene";
import {
  aberrationFor,
  advanceBrightness,
  advanceLift,
  advanceSpin,
  advanceViewShift,
  applyStoneBrightness,
  applyViewShift,
  BASE_FOV_DEG,
  DIMMED_BRIGHTNESS,
  disposeRefractionBvh,
  exposureFor,
  FOCUS_DISTANCE_FACTOR,
  FOV_REFERENCE_ASPECT,
  fitFov,
  focusPose,
  focusViewShift,
  geometryBounds,
  HOVER_LIFT_MM,
  JEWELS_ENV_URL,
  JEWELS_GLB_URL,
  jewelHero,
  MAX_FOV_DEG,
  MIN_ABERRATION,
  nearestAngle,
  OVERVIEW_POSE,
  orbitAngles,
  overviewHero,
  pickStoneGeometries,
  RING_RADIUS_MM,
  ringAngle,
  ringPosition,
  SHEET_VIEW_SHIFT,
  SPIN_SPEED,
  STONE_LIFT_MM,
  stoneBrightness,
  stonePlacement,
  stoneYaw,
  TINT_POWER,
  tintFromColor,
  toggleStone,
  type Vec3,
} from "@/lib/scenes/jewels";

// PUBLIC_DIR: Next.js が / の URL で配信するフォルダ（テストはリポジトリのルートで動く）
const PUBLIC_DIR = join(process.cwd(), "public");

// 時計の文字盤の配置: 12 時が奥（-Z）、3 時が右（+X）、6 時が手前（+Z）、9 時が左（-X）
describe("ringPosition / ringAngle / stoneYaw", () => {
  // [月, 期待する x, 期待する z]（半径 1 のとき）
  const clock: [number, number, number][] = [
    // 12 月は 12 時の位置（奥）
    [12, 0, -1],
    // 3 月は 3 時の位置（右）
    [3, 1, 0],
    // 6 月は 6 時の位置（手前）
    [6, 0, 1],
    // 9 月は 9 時の位置（左）
    [9, -1, 0],
  ];

  // 月ごとに、時計の文字盤と同じ位置へ置く
  test.each(clock)("%i 月は x=%d, z=%d の位置", (month, x, z) => {
    // Act: 半径 1 の円の上の位置
    const [px, py, pz] = ringPosition(month, 1);
    // Assert: 横の位置
    expect(px).toBeCloseTo(x);
    // Assert: 高さは床の上（0）
    expect(py).toBe(0);
    // Assert: 奥行きの位置
    expect(pz).toBeCloseTo(z);
  });

  // 半径を省略すると既定の半径の円に並ぶ
  test("どの月も既定の半径の円の上にある", () => {
    // 1〜12 月を確認する
    for (let month = 1; month <= 12; month++) {
      // Act: 位置を求める
      const [x, , z] = ringPosition(month);
      // Assert: 原点からの距離が半径と同じ
      expect(Math.hypot(x, z)).toBeCloseTo(RING_RADIUS_MM);
    }
  });

  // 角度は 1 か月で 30°（π/6）ずつ時計回りに進む
  test("ringAngle は 1 か月で π/6 ずつ増える", () => {
    // Assert: 1 月と 2 月の差
    expect(ringAngle(2) - ringAngle(1)).toBeCloseTo(Math.PI / 6);
  });

  // 石の長い向き（ローカルの -Z）が文字盤の外側を向く回転
  test("stoneYaw で回すと、石のローカル -Z が外向きになる", () => {
    // 1〜12 月を確認する
    for (let month = 1; month <= 12; month++) {
      // Arrange: ローカルの -Z 方向
      const axis = new THREE.Vector3(0, 0, -1);
      // Act: 石の回転（y 軸まわり）をかける
      axis.applyEuler(new THREE.Euler(0, stoneYaw(month), 0));
      // Arrange: 文字盤の中心から石へ向かう向き
      const [x, , z] = ringPosition(month, 1);
      // Assert: 横の向きが一致する
      expect(axis.x).toBeCloseTo(x);
      // Assert: 奥行きの向きが一致する
      expect(axis.z).toBeCloseTo(z);
    }
  });
});

// geometryBounds: three.js の形から、上下の範囲と包む球の半径を取り出す
describe("geometryBounds", () => {
  // 幅 2・高さ 4・奥行き 6 の箱（原点が中心）
  test("箱の上下の範囲と、角までの距離を半径として返す", () => {
    // Act: 範囲を求める
    const bounds = geometryBounds(new THREE.BoxGeometry(2, 4, 6));
    // Assert: 下端
    expect(bounds.minY).toBeCloseTo(-2);
    // Assert: 上端
    expect(bounds.maxY).toBeCloseTo(2);
    // Assert: 中心から角までの距離（√(1² + 2² + 3²)）
    expect(bounds.radius).toBeCloseTo(Math.sqrt(14));
  });

  // 形がすでに範囲を持っていれば、計算し直さずにそれを使う（three.js が計算済みの値を持たせている場合）
  test("計算済みの境界ボックスと境界球があれば、それを使う", () => {
    // Arrange: 箱の形に、わざと違う値の範囲を持たせておく
    const geometry = new THREE.BoxGeometry(2, 4, 6);
    // Arrange: 上下が -10〜10 の境界ボックス
    geometry.boundingBox = new THREE.Box3(
      // 最小の角
      new THREE.Vector3(-1, -10, -1),
      // 最大の角
      new THREE.Vector3(1, 10, 1),
    );
    // Arrange: 半径 99 の境界球
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 99);
    // Act: 範囲を求める
    const bounds = geometryBounds(geometry);
    // Assert: 持たせておいた値がそのまま返る
    expect(bounds).toEqual({ minY: -10, maxY: 10, radius: 99 });
  });

  // 頂点が無い形では three.js が「空の範囲」（下端 +∞・上端 -∞・半径 -1）を入れるので、そのまま使うと石が無限の高さに置かれる
  test("頂点が無い形はエラーを投げる", () => {
    // Act / Assert: 頂点が無いことを知らせるエラー
    expect(() => geometryBounds(new THREE.BufferGeometry())).toThrow("頂点がありません");
  });
});

// stonePlacement: 石の形の上下の範囲から、床から浮かせる高さと中心の高さを求める
describe("stonePlacement", () => {
  // 形の一番下が、床から STONE_LIFT_MM の高さに来る
  test("一番下が床から STONE_LIFT_MM 浮き、中心の高さも求まる", () => {
    // Act: 形が y = -2 〜 1、半径 3 の石
    const placement = stonePlacement({ minY: -2, maxY: 1, radius: 3 });
    // Assert: 置く高さ = 浮かせる量 − 形の最下点
    expect(placement.baseY).toBeCloseTo(STONE_LIFT_MM + 2);
    // Assert: 中心の高さ = 置く高さ + 形の上下の中点
    expect(placement.centerY).toBeCloseTo(STONE_LIFT_MM + 2 - 0.5);
    // Assert: 半径はそのまま
    expect(placement.radius).toBe(3);
  });
});

// カメラの位置と向き
describe("OVERVIEW_POSE / focusPose / orbitAngles", () => {
  // 全体を見るカメラは、手前の斜め上から文字盤の中心を見る
  test("OVERVIEW_POSE は手前の上から中心を見る", () => {
    // Act: 見下ろす角度などを求める
    const { polar, distance } = orbitAngles(OVERVIEW_POSE);
    // Assert: 真上でも真横でもない（斜め上から見る）
    expect(polar).toBeGreaterThan(0.3);
    // Assert: 水平より上から見る
    expect(polar).toBeLessThan(Math.PI / 2);
    // Assert: 文字盤全体が入るよう、半径より十分遠い
    expect(distance).toBeGreaterThan(RING_RADIUS_MM * 2);
  });

  // 月を選んだときのカメラは、文字盤の外側から、その石を見る
  test("focusPose は石の外側・斜め上から石の中心を見る", () => {
    // Arrange: 半径 5、中心の高さ 2 の石（3 月 = 右側）
    const placement = { baseY: 3, centerY: 2, radius: 5 };
    // Act: カメラの位置と注視点
    const pose = focusPose(3, placement);
    // Assert: 注視点は石の中心（右側、高さ 2）
    expect(pose.target[0]).toBeCloseTo(RING_RADIUS_MM);
    // Assert: 注視点の高さは石の中心
    expect(pose.target[1]).toBeCloseTo(2);
    // Assert: カメラは石より外側（さらに右）にある
    expect(pose.position[0]).toBeGreaterThan(RING_RADIUS_MM);
    // Assert: 奥行きは石と同じ（外向きの直線の上）
    expect(pose.position[2]).toBeCloseTo(0);
    // Assert: 石より上にある
    expect(pose.position[1]).toBeGreaterThan(2);
    // Assert: 石からの距離は、半径に決まった倍率をかけた値
    expect(orbitAngles(pose).distance).toBeCloseTo(5 * FOCUS_DISTANCE_FACTOR);
  });

  // 3・6・9・12 月だけだと x か z の片方が 0 になり、x と z の取り違えに気づけないので、斜めの月でも確かめる
  test("斜めの月（5 月）でも、文字盤の中心から石へ向かう直線の延長上にカメラを置く", () => {
    // Arrange: 半径 5、中心の高さ 2 の石
    const placement = { baseY: 3, centerY: 2, radius: 5 };
    // Act: 5 月の石を見るカメラ
    const pose = focusPose(5, placement);
    // Arrange: 5 月の石の位置と、文字盤の中心から石へ向かう向き（長さ 1）
    const [stoneX, , stoneZ] = ringPosition(5);
    // 外向きの向き
    const [outX, , outZ] = ringPosition(5, 1);
    // 注視点からカメラへの、横の差
    const dx = pose.position[0] - pose.target[0];
    // 注視点からカメラへの、奥行きの差
    const dz = pose.position[2] - pose.target[2];
    // 水平の距離（向きを長さ 1 にそろえるため）
    const flat = Math.hypot(dx, dz);
    // Assert: 注視点の横の位置は 5 月の石
    expect(pose.target[0]).toBeCloseTo(stoneX);
    // Assert: 注視点の奥行きの位置も 5 月の石
    expect(pose.target[2]).toBeCloseTo(stoneZ);
    // Assert: カメラは石から外向きに離れている（横の向き）
    expect(dx / flat).toBeCloseTo(outX);
    // Assert: 奥行きの向きも外向き
    expect(dz / flat).toBeCloseTo(outZ);
  });

  // カメラと注視点が重なると向きが決まらない。0 で割らずに、水平に見ている（π/2）とみなす
  test("カメラと注視点が同じ位置のときは、極角を π/2・距離を 0 にする", () => {
    // Act: 同じ位置から同じ位置を見る
    const angles = orbitAngles({ position: [1, 2, 3], target: [1, 2, 3] });
    // Assert: 極角は水平
    expect(angles.polar).toBeCloseTo(Math.PI / 2);
    // Assert: 距離は 0
    expect(angles.distance).toBe(0);
    // Assert: 方位角も数値になる（NaN にならない）
    expect(Number.isNaN(angles.azimuth)).toBe(false);
  });

  // camera-controls と同じ角度の決め方（方位角 = +Z から +X へ、極角 = 真上からの角度）
  test.each<[Vec3, number, number, number]>([
    // 手前（+Z）から水平に見る
    [[0, 0, 10], 0, Math.PI / 2, 10],
    // 右（+X）から水平に見る
    [[10, 0, 0], Math.PI / 2, Math.PI / 2, 10],
    // 真上から見る
    [[0, 10, 0], 0, 0, 10],
  ])("位置 %j から原点を見るときの角度", (position, azimuth, polar, distance) => {
    // Act: 角度と距離を求める
    const angles = orbitAngles({ position, target: [0, 0, 0] });
    // Assert: 方位角
    expect(angles.azimuth).toBeCloseTo(azimuth);
    // Assert: 極角
    expect(angles.polar).toBeCloseTo(polar);
    // Assert: 距離
    expect(angles.distance).toBeCloseTo(distance);
  });
});

// nearestAngle: カメラが遠回りしないよう、同じ向きを表す角度のうち今の角度に一番近いものを選ぶ
describe("nearestAngle", () => {
  // [今の角度, 行きたい向き, 期待する値]
  test.each([
    // 近いときはそのまま
    [0, 0.5, 0.5],
    // 179° → -179° は、-358° 回るより +2° 回るほうが近い
    [3.0, -3.0, -3.0 + Math.PI * 2],
    // 何周もしたあと（10π）でも、その周の中で一番近い値になる
    [Math.PI * 10 + 0.1, 0.2, Math.PI * 10 + 0.2],
  ])("今 %d のとき %d へ向かうなら %d", (current, desired, expected) => {
    // Assert: 期待する角度
    expect(nearestAngle(current, desired)).toBeCloseTo(expected);
  });

  // どんな組み合わせでも、差は半周（π）以内になる
  test("結果と今の角度の差は π 以内で、向きは変わらない", () => {
    // いくつかの組み合わせを試す
    for (const [current, desired] of [
      // 大きく離れた角度
      [-20, 17],
      // 負の方向に何周もしている
      [-7.5, 2],
      // ちょうど反対向き付近
      [0, Math.PI - 0.01],
    ]) {
      // Act: 近い角度を求める
      const result = nearestAngle(current, desired);
      // Assert: 差は半周以内
      expect(Math.abs(result - current)).toBeLessThanOrEqual(Math.PI + 1e-9);
      // Assert: 2π の倍数だけずらした同じ向き
      expect(Math.cos(result)).toBeCloseTo(Math.cos(desired));
      // Assert: sin も一致する（向きが同じ）
      expect(Math.sin(result)).toBeCloseTo(Math.sin(desired));
    }
  });
});

// スライダーの値から、マテリアルとレンダラーに渡す値を作る
describe("aberrationFor / exposureFor / tintFromColor", () => {
  // 分散スライダーが 0 でも、MeshRefractionMaterial には 0 を渡さない（0 と正の値を行き来すると drei の実装で屈折が壊れるため）
  test("分散スライダーが 0 のときも MIN_ABERRATION（正の値）になる", () => {
    // Assert: 最小値になる
    expect(aberrationFor(0.044, 0)).toBe(MIN_ABERRATION);
    // Assert: 最小値は正
    expect(MIN_ABERRATION).toBeGreaterThan(0);
  });

  // スライダーを上げるほど色のずれが強くなり、分散の大きい石ほど強い
  test("分散スライダーと石の分散が大きいほど値が大きい", () => {
    // Assert: スライダーを上げると大きくなる
    expect(aberrationFor(0.044, 1)).toBeGreaterThan(aberrationFor(0.044, 0.5));
    // Assert: ダイヤ（0.044）はアメジスト（0.013）より大きい
    expect(aberrationFor(0.044, 1)).toBeGreaterThan(aberrationFor(0.013, 1));
  });

  // 範囲外の値はスライダーの範囲（0〜1）に収める
  test("分散スライダーの値は 0〜1 に収める", () => {
    // Assert: 1 を超えても 1 と同じ
    expect(aberrationFor(0.044, 5)).toBe(aberrationFor(0.044, 1));
    // Assert: 負の値は 0 と同じ（最小値になり、負の値は渡さない）
    expect(aberrationFor(0.044, -5)).toBe(MIN_ABERRATION);
  });

  // 光量スライダーは露出の倍率。Cycles の露出（+1 段 = 2 倍）に合わせた基準にかける
  test("exposureFor は光量 1 で 2 倍（Cycles の +1 段）になり、負の値は 0 にする", () => {
    // Assert: 光量 1
    expect(exposureFor(1)).toBeCloseTo(2);
    // Assert: 光量 0.5
    expect(exposureFor(0.5)).toBeCloseTo(1);
    // Assert: 負の値
    expect(exposureFor(-1)).toBe(0);
  });

  // 屈折のマテリアルに掛ける色は、線形 RGB で一番明るい成分が 1 になるよう正規化する
  test.each<[string, Vec3]>([
    // 純粋な赤
    ["#ff0000", [1, 0, 0]],
    // 灰色は明るさに関係なく白になる（色味だけを残す）
    ["#808080", [1, 1, 1]],
  ])("tintFromColor(%s) は %j", (hex, expected) => {
    // Act: 色を求める
    const tint = tintFromColor(hex);
    // Assert: 各成分（赤・緑・青）が期待どおり
    for (const [index, value] of tint.entries()) {
      // 1 成分ずつ比べる
      expect(value).toBeCloseTo(expected[index]);
    }
  });

  // 濃い赤でも、赤の成分は 1 になり、ほかの成分は小さい
  test("ルビーの色は赤が 1 で、緑と青はごく小さい", () => {
    // Act: ルビーの色から求める
    const [r, g, b] = tintFromColor(birthstoneById("ruby").color);
    // Assert: 赤は 1
    expect(r).toBeCloseTo(1);
    // Assert: 緑は小さい
    expect(g).toBeLessThan(0.1);
    // Assert: 青も小さい
    expect(b).toBeLessThan(0.1);
  });

  // 正規化したあと TINT_POWER 乗して、一番明るい成分以外を抑える（石の中を通るほど色が濃くなる吸収に近づける）
  test("一番明るい成分以外は、正規化しただけの値より小さくなる", () => {
    // Arrange: 淡い赤（線形 RGB で約 (1, 0.216, 0.216)）
    const plain = 0.2158605;
    // Act: 色を求める
    const [r, g, b] = tintFromColor("#ff8080");
    // Assert: 赤は 1 のまま
    expect(r).toBeCloseTo(1);
    // Assert: 緑は正規化しただけの値を TINT_POWER 乗した値
    expect(g).toBeCloseTo(plain ** TINT_POWER, 4);
    // Assert: 青も同じ
    expect(b).toBeCloseTo(plain ** TINT_POWER, 4);
    // Assert: 元より濃くなっている（1 より大きい乗数で小さくなる）
    expect(g).toBeLessThan(plain);
  });
});

// stoneBrightness / advanceBrightness: 石を選んでいる間は、ほかの石を暗く沈めて主役の石を浮かび上がらせる
describe("stoneBrightness / advanceBrightness", () => {
  // 何も選んでいなければ、全部の石がふつうの明るさ
  test("何も選んでいないときは 1", () => {
    // Assert: ふつうの明るさ
    expect(stoneBrightness("ruby", null)).toBe(1);
  });

  // 選んだ石はふつうの明るさ、それ以外は暗くする
  test("選んだ石は 1、ほかの石は DIMMED_BRIGHTNESS", () => {
    // Assert: 選んだ石
    expect(stoneBrightness("ruby", "ruby")).toBe(1);
    // Assert: ほかの石
    expect(stoneBrightness("pearl", "ruby")).toBe(DIMMED_BRIGHTNESS);
    // Assert: 暗くした明るさは 0 より大きく 1 より小さい（真っ黒にはせず、文字盤の並びは残す）
    expect(DIMMED_BRIGHTNESS).toBeGreaterThan(0);
    // Assert: 1 より小さい
    expect(DIMMED_BRIGHTNESS).toBeLessThan(1);
  });

  // 屈折のマテリアル（色の uniform を持つ）は、元の色 × 明るさにする
  test("applyStoneBrightness は色を元の色 × 明るさにし、元の色は書き換えない", () => {
    // Arrange: 元の色と、色を持つ偽物のマテリアル
    const base = new THREE.Color(1, 0.5, 0.25);
    // Arrange: マテリアル（最初は白）
    const material = { color: new THREE.Color(1, 1, 1) };
    // Act: 半分の明るさにする
    applyStoneBrightness(material, base, 0.5);
    // Assert: 色が半分になっている
    expect(material.color.toArray()).toEqual([0.5, 0.25, 0.125]);
    // Assert: 元の色はそのまま
    expect(base.toArray()).toEqual([1, 0.5, 0.25]);
  });

  // パール（MeshPhysicalMaterial）は、環境マップの映り込みの強さも明るさに合わせる（色だけだとツヤの反射が明るいまま残る）
  test("applyStoneBrightness は envMapIntensity を持つマテリアルならそれも明るさにする", () => {
    // Arrange: パールと同じ種類のマテリアル
    const material = new THREE.MeshPhysicalMaterial();
    // Act: 暗くする
    applyStoneBrightness(material, new THREE.Color(1, 1, 1), DIMMED_BRIGHTNESS);
    // Assert: 映り込みの強さ
    expect(material.envMapIntensity).toBeCloseTo(DIMMED_BRIGHTNESS);
    // Assert: 色も暗くなっている
    expect(material.color.r).toBeCloseTo(DIMMED_BRIGHTNESS);
  });

  // 縁を白く光らせる Fresnel は石の色と関係なく白を足すので、暗くした石にも白い輪郭が残る。明るさに合わせて弱める
  test("applyStoneBrightness は fresnel を持つマテリアルなら、基準の強さ × 明るさにする", () => {
    // Arrange: 色と fresnel を持つ偽物のマテリアル（MeshRefractionMaterial と同じ名前）
    const material = { color: new THREE.Color(1, 1, 1), fresnel: 0.6 };
    // Act: 基準の強さ 0.6 のまま、明るさ 0.5 にする
    applyStoneBrightness(material, new THREE.Color(1, 1, 1), 0.5, 0.6);
    // Assert: 半分の強さ
    expect(material.fresnel).toBeCloseTo(0.3);
  });

  // 基準の強さを渡さなければ fresnel は変えない（パールなど）
  test("applyStoneBrightness は基準の fresnel を渡さなければ fresnel を変えない", () => {
    // Arrange: fresnel を持つ偽物のマテリアル
    const material = { color: new THREE.Color(1, 1, 1), fresnel: 0.6 };
    // Act: 基準の強さを渡さずに暗くする
    applyStoneBrightness(material, new THREE.Color(1, 1, 1), 0.5);
    // Assert: そのまま
    expect(material.fresnel).toBe(0.6);
  });

  // 空の値では何もしない
  test.each([[null], [undefined]])("%j では何もしない（エラーにならない）", (material) => {
    // Act / Assert: エラーにならない
    expect(() => applyStoneBrightness(material, new THREE.Color(), 0.5)).not.toThrow();
  });

  // 対象の項目を持たないオブジェクトは、中身を変えない
  test.each([
    // 何も持たない
    [{}],
    // color が three.js の Color ではない
    [{ color: "red" }],
    // envMapIntensity や fresnel が数値ではない
    [{ envMapIntensity: "strong", fresnel: null }],
  ])("%j の中身は変えない", (material) => {
    // Arrange: 呼ぶ前の中身を控える
    const before = JSON.stringify(material);
    // Act: 暗くしようとする（基準の Fresnel も渡す）
    applyStoneBrightness(material, new THREE.Color(1, 1, 1), 0.5, 0.6);
    // Assert: 中身は同じ
    expect(JSON.stringify(material)).toBe(before);
  });

  // three.js のメッシュは複数のマテリアル（配列）を持てるが、石は 1 つしか使わないので、配列は対象外
  test("マテリアルの配列を渡しても、中のマテリアルは変えない", () => {
    // Arrange: 色を持つマテリアル 1 つだけの配列
    const inner = { color: new THREE.Color(1, 1, 1) };
    // Act: 配列ごと渡して暗くしようとする
    applyStoneBrightness([inner], new THREE.Color(1, 1, 1), 0.5);
    // Assert: 中のマテリアルの色は白のまま
    expect(inner.color.toArray()).toEqual([1, 1, 1]);
  });

  // 明るさはなめらかに変わる
  test("advanceBrightness は目標の明るさへなめらかに近づき、行き過ぎない", () => {
    // Act / Assert: 1 フレームでは途中まで
    expect(advanceBrightness(1, 1 / 60, DIMMED_BRIGHTNESS)).toBeGreaterThan(DIMMED_BRIGHTNESS);
    // Act / Assert: 1 フレームでも少しは暗くなる
    expect(advanceBrightness(1, 1 / 60, DIMMED_BRIGHTNESS)).toBeLessThan(1);
    // Act / Assert: 十分な時間が経つと目標に落ち着く
    expect(advanceBrightness(1, 10, DIMMED_BRIGHTNESS)).toBeCloseTo(DIMMED_BRIGHTNESS);
  });
});

// advanceSpin / advanceLift: 毎フレームの小さな動き（選んだ石の回転、指を乗せた石の浮き上がり）
describe("advanceSpin / advanceLift", () => {
  // 選ばれている間は一定の速さで回る
  test("選ばれている石は SPIN_SPEED で回り続ける", () => {
    // Assert: 0.5 秒で SPIN_SPEED × 0.5 だけ進む
    expect(advanceSpin(1, 0.5, true)).toBeCloseTo(1 + SPIN_SPEED * 0.5);
  });

  // 選ばれなくなったら、一番近い「元の向き」（2π の倍数）へ静かに戻る
  test.each([
    // 少し回った状態からは 0 へ戻る
    [1, 0],
    // ほぼ 1 周した状態からは 2π へ進んで戻る（逆回転しない）
    [6, Math.PI * 2],
  ])("選ばれていない石は %d から %d へ戻っていく", (start, rest) => {
    // Act: 1 フレーム（1/60 秒）進める
    const next = advanceSpin(start, 1 / 60, false);
    // Assert: 元の向きに近づいている
    expect(Math.abs(next - rest)).toBeLessThan(Math.abs(start - rest));
    // Assert: 十分な時間が経つと元の向きに落ち着く
    expect(advanceSpin(start, 10, false)).toBeCloseTo(rest);
  });

  // 指（マウス）を乗せると少し浮き、離すと戻る
  test("advanceLift は指を乗せると HOVER_LIFT_MM へ、離すと 0 へ近づく", () => {
    // Act / Assert: 乗せている間は上へ
    expect(advanceLift(0, 10, true)).toBeCloseTo(HOVER_LIFT_MM);
    // Act / Assert: 離すと下へ
    expect(advanceLift(HOVER_LIFT_MM, 10, false)).toBeCloseTo(0);
    // Act / Assert: 1 フレームでは途中まで
    expect(advanceLift(0, 1 / 60, true)).toBeLessThan(HOVER_LIFT_MM);
  });
});

// toggleStone: 月のボタンで石を選ぶ。選んでいる月をもう一度押すと選択を外す（aria-pressed の切り替えボタンと同じ動き）
describe("toggleStone", () => {
  // [今選んでいる石, 押した月の石, 期待する選択]
  test.each<[BirthstoneId | null, BirthstoneId, BirthstoneId | null]>([
    // 何も選んでいなければ、押した月の石を選ぶ
    [null, "ruby", "ruby"],
    // 別の石を選んでいれば、押した月の石に替える
    ["pearl", "ruby", "ruby"],
    // 同じ月をもう一度押したら、選択を外して全体に戻る
    ["ruby", "ruby", null],
  ])("%s を選んでいるときに %s を押すと %s になる", (current, pressed, expected) => {
    // Act / Assert: 期待する選択になる
    expect(toggleStone(current, pressed)).toBe(expected);
  });
});

// jewelHero: 石を選んだときに、左下の見出しへ出す文言
describe("jewelHero", () => {
  // 4 月のダイヤモンドの見出し
  test("月番号・英語の月名・大文字の英名・和名・石言葉を並べる", () => {
    // Act: ダイヤモンドの見出しを作る
    const hero = jewelHero(birthstoneById("diamond"));
    // Assert: 上付きのラベル
    expect(hero.eyebrow).toBe("04 — April");
    // Assert: 大きな英字のタイトル
    expect(hero.title).toBe("DIAMOND");
    // Assert: 説明文に月・和名・石言葉が入る
    expect(hero.tag).toContain("4月");
    // Assert: 和名
    expect(hero.tag).toContain("ダイヤモンド");
    // Assert: 石言葉（日本語）
    expect(hero.tag).toContain("強さ");
    // Assert: 操作のヒントがある
    expect(hero.hint.length).toBeGreaterThan(0);
  });

  // 読み上げ専用の知らせは、見出し全体ではなく、何月の何を選んだかだけを伝える
  test("読み上げの知らせは、月と和名だけの短い文にする", () => {
    // Act / Assert: ダイヤモンドを選んだとき
    expect(jewelHero(birthstoneById("diamond")).announcement).toBe(
      "4月の誕生石、ダイヤモンドを表示しています。",
    );
  });
});

// halfWidthSlope: 縦の画角（度）と縦横比から、横方向に見える範囲の広がり（tan(横の画角 / 2)）を求める
function halfWidthSlope(fovDeg: number, aspect: number): number {
  // 縦の半分の画角の tan に縦横比を掛けると、横の半分の画角の tan になる
  return Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2) * aspect;
}

// fitFov: 画面の縦横比に合わせた、カメラの縦の画角
describe("fitFov", () => {
  // 横長の画面（パソコン）では、基準の画角のまま
  test("基準より横長の画面では、基準の画角を返す", () => {
    // Act / Assert: 16:9 と、ちょうど基準の縦横比
    expect(fitFov(16 / 9)).toBe(BASE_FOV_DEG);
    // ちょうど基準の縦横比でも同じ
    expect(fitFov(FOV_REFERENCE_ASPECT)).toBe(BASE_FOV_DEG);
  });

  // 縦長の画面（スマホ）では、横に見える範囲が基準の縦横比のときと同じになるよう、縦の画角を広げる
  test("縦長の画面では、横に見える範囲が基準の縦横比のときと同じになる", () => {
    // Arrange: スマホの縦持ち（390 × 844）
    const aspect = 390 / 844;
    // Act: 縦の画角を求める
    const fov = fitFov(aspect);
    // Assert: 基準より広い
    expect(fov).toBeGreaterThan(BASE_FOV_DEG);
    // Assert: 横に見える範囲は、基準の縦横比・基準の画角のときと同じ
    expect(halfWidthSlope(fov, aspect)).toBeCloseTo(
      halfWidthSlope(BASE_FOV_DEG, FOV_REFERENCE_ASPECT),
      10,
    );
  });

  // 式の性質だけでなく、具体的な値も固定する（基準の縦横比を取り違えても、上の性質のテストは通ってしまうため）
  test("スマホの縦持ち（390 × 844）では、約 76.45° にする", () => {
    // Act / Assert: 差が 0.05° 未満
    expect(fitFov(390 / 844)).toBeCloseTo(76.45, 1);
  });

  // 基準の縦横比をまたいでも、画角が跳ばない（窓の幅を変えたときに、画面が急に引いたり寄ったりしない）
  test("基準の縦横比のすぐ手前では、基準の画角とほぼ同じ", () => {
    // Act / Assert: 0.999 のときの画角は、基準との差が 0.05° 未満
    expect(Math.abs(fitFov(FOV_REFERENCE_ASPECT - 0.001) - BASE_FOV_DEG)).toBeLessThan(0.05);
  });

  // 上限に当たる境目（tan 20° ≈ 0.364）の前後で、上限より手前なら上限未満、奥なら上限ちょうど
  test("縦横比が約 0.364 より細いと上限に当たる", () => {
    // Act / Assert: 境目より少し太い 0.37 では上限未満
    expect(fitFov(0.37)).toBeLessThan(MAX_FOV_DEG);
    // 境目より少し細い 0.36 では上限ちょうど
    expect(fitFov(0.36)).toBe(MAX_FOV_DEG);
  });

  // 極端に細い画面では、魚眼のようにゆがまないよう、広げすぎない
  test("極端に細い画面でも、MAX_FOV_DEG を超えない", () => {
    // Act / Assert: 縦横比 0.05（幅が高さの 1/20）
    expect(fitFov(0.05)).toBe(MAX_FOV_DEG);
  });

  // 細くなるほど広げる（画面の向きを変えたり、窓の幅を変えたりしたときに、なめらかに変わる）
  test("画面が細いほど、縦の画角を広くする", () => {
    // Act / Assert: 縦横比 0.8 より 0.5 のほうが広い
    expect(fitFov(0.5)).toBeGreaterThan(fitFov(0.8));
  });

  // 描き始めの一瞬など、大きさが 0 の画面から求めた縦横比でも、壊れた値を返さない
  test("縦横比が 0・負・無限大・NaN のときは、基準の画角を返す", () => {
    // Act / Assert: 幅 0（縦横比 0）
    expect(fitFov(0)).toBe(BASE_FOV_DEG);
    // 負の値
    expect(fitFov(-1)).toBe(BASE_FOV_DEG);
    // 高さ 0（縦横比 無限大）
    expect(fitFov(Number.POSITIVE_INFINITY)).toBe(BASE_FOV_DEG);
    // 幅も高さも 0（0 / 0）
    expect(fitFov(Number.NaN)).toBe(BASE_FOV_DEG);
  });
});

// focusViewShift: スマホで詳細のシートが開いているとき、描く範囲を上へずらす量（px）
describe("focusViewShift", () => {
  // スマホ向けの配置でシートが開いていれば、画面の高さの SHEET_VIEW_SHIFT 倍だけずらす
  test("スマホの縦持ちでシートが開いているときは、画面の高さに比例してずらす", () => {
    // Act / Assert: 390 × 844 でシートが開いている（844 × 0.18 = 151.92 → 152）
    expect(focusViewShift(390, 844, true)).toBe(152);
    // 高さが変われば、ずらす量も変わる（667 × 0.18 = 120.06 → 120）
    expect(focusViewShift(375, 667, true)).toBe(120);
  });

  // シートが無ければ、石は画面の真ん中でよい
  test("シートが閉じているときは、ずらさない", () => {
    // Act / Assert: スマホでもシートが無ければ 0
    expect(focusViewShift(390, 844, false)).toBe(0);
  });

  // 横持ちのスマホ（幅は 768px 以上でも高さが低い）もスマホ向けの配置で、シートが下に出る
  test("横持ちのスマホ（844 × 390）でも、シートが開いていればずらす", () => {
    // Act / Assert: 390 × 0.18 = 70.2 → 70
    expect(focusViewShift(844, 390, true)).toBe(70);
  });

  // パソコン向けの配置では詳細は右側のパネルなので、石を上へずらす必要がない
  test("幅が 768px 以上で高さも十分な画面（パソコン向けの配置）では、シートが開いていてもずらさない", () => {
    // Act / Assert: ちょうど境目の 768px
    expect(focusViewShift(768, 900, true)).toBe(0);
    // その 1px 手前はスマホ扱い
    expect(focusViewShift(767, 900, true)).toBe(Math.round(900 * SHEET_VIEW_SHIFT));
  });

  // 高さの境目（480px）は isCompactLayout と同じ。ちょうど 480px まではスマホ向けの配置（シートが下に出る）
  test("幅が広くても、高さが 480px 以下ならずらし、481px ならずらさない", () => {
    // Act / Assert: ちょうど境目（480 × 0.18 = 86.4 → 86）
    expect(focusViewShift(1280, COMPACT_MAX_HEIGHT_PX, true)).toBe(86);
    // 1px 高い
    expect(focusViewShift(1280, COMPACT_MAX_HEIGHT_PX + 1, true)).toBe(0);
  });

  // 描き始めの一瞬など、大きさが 0 の画面でも壊れた値を返さない
  test("高さが 0 のときは、ずらさない", () => {
    // Act / Assert: 高さ 0
    expect(focusViewShift(390, 0, true)).toBe(0);
  });

  // 壊れた大きさで NaN を返すと、カメラの投影が NaN になって何も描かれなくなるので、0 にする
  test("幅や高さが NaN・負・無限大のときは、ずらさない", () => {
    // Act / Assert: 高さが NaN
    expect(focusViewShift(390, Number.NaN, true)).toBe(0);
    // 幅が NaN
    expect(focusViewShift(Number.NaN, 844, true)).toBe(0);
    // 幅が負
    expect(focusViewShift(-1, 844, true)).toBe(0);
    // 高さが無限大
    expect(focusViewShift(390, Number.POSITIVE_INFINITY, true)).toBe(0);
    // 幅が 0
    expect(focusViewShift(0, 844, true)).toBe(0);
    // 幅が無限大
    expect(focusViewShift(Number.POSITIVE_INFINITY, 390, true)).toBe(0);
  });
});

// advanceViewShift: 描く範囲をずらす量を、1 フレームぶん目標へ近づける（カメラの移動となめらかにそろえる）
describe("advanceViewShift", () => {
  // 一気に跳ばず、目標へ少しずつ近づく
  test("目標へ近づくが、1 フレームでは届かない", () => {
    // Act: 0 px から 150 px へ、60 fps の 1 フレームぶん進める
    const next = advanceViewShift(0, 150, 1 / 60);
    // Assert: 0 より進み、150 には届かない
    expect(next).toBeGreaterThan(0);
    // 届かない
    expect(next).toBeLessThan(150);
  });

  // 戻るとき（シートを閉じたとき）も同じように近づく
  test("目標が小さいほうでも近づく", () => {
    // Act: 150 px から 0 px へ 1 フレーム
    const next = advanceViewShift(150, 0, 1 / 60);
    // Assert: 150 より小さく、0 より大きい
    expect(next).toBeLessThan(150);
    // まだ 0 ではない
    expect(next).toBeGreaterThan(0);
  });

  // 目標のすぐ近く（0.5 px 未満）まで来たら、ぴったり目標にする（いつまでも小さく動き続けて毎フレーム描き直さないように）
  test("目標まで 0.5 px 未満なら、目標そのものを返す", () => {
    // Act / Assert: 残り 0.4 px
    expect(advanceViewShift(149.6, 150, 1 / 60)).toBe(150);
    // 下向きでも同じ
    expect(advanceViewShift(0.3, 0, 1 / 60)).toBe(0);
  });

  // 着いたあとは、目標とぴったり同じ値を返し続ける（呼び出し側は === で比べて、同じなら描き直さないため）
  test("目標に着いているときは、目標そのものを返す", () => {
    // Act / Assert: 0 のまま（-0 にもならない。toBe は Object.is で比べる）
    expect(advanceViewShift(0, 0, 1 / 60)).toBe(0);
    // 152 のまま
    expect(advanceViewShift(152, 152, 1 / 60)).toBe(152);
  });

  // 1 フレームの進み方を、なめらかさの係数から求めた値で固定する（速すぎ・遅すぎの取り違えを拾う）
  test("60 fps の 1 フレームでは、残りの約 8% だけ進む", () => {
    // Act / Assert: 0 → 150 で約 12 px（150 × (1 − e^(−5/60))）
    expect(advanceViewShift(0, 150, 1 / 60)).toBeCloseTo(12, 0);
  });

  // 目標のすぐ近くでなければ、ぴったりにはしない（しきい値を大きくしすぎる取り違えを拾う）
  test("目標まで 0.5 px 以上残っていれば、目標にはしない", () => {
    // Act: 残り 20 px から 1 フレーム（進んだあとも 1 px 以上残る）
    const next = advanceViewShift(130, 150, 1 / 60);
    // Assert: 目標ではない
    expect(next).not.toBe(150);
  });

  // タブを離れて戻ったときなど、前のフレームから長い時間が経っていても、行き過ぎずに目標に着く
  test("経過時間がとても長いときは、行き過ぎずに目標に着く", () => {
    // Act / Assert: 5 秒ぶんを 1 回で進める
    expect(advanceViewShift(0, 150, 5)).toBe(150);
    // 下向きでも同じ
    expect(advanceViewShift(150, 0, 5)).toBe(0);
  });

  // 経過時間が壊れているときは動かさない（負の時間では目標から遠ざかり、NaN では値が NaN のまま戻らなくなるため）
  test("経過時間が 0・負・NaN のときは、今の値のまま", () => {
    // Act / Assert: 0 秒
    expect(advanceViewShift(40, 150, 0)).toBe(40);
    // 負の時間
    expect(advanceViewShift(40, 150, -1 / 60)).toBe(40);
    // NaN
    expect(advanceViewShift(40, 150, Number.NaN)).toBe(40);
  });

  // 今の値が壊れていたら、目標に置き直して立て直す（NaN のまま毎フレーム描き直し続けないように）
  test("今の値が NaN のときは、目標そのものを返す", () => {
    // Act / Assert: 今が NaN
    expect(advanceViewShift(Number.NaN, 150, 1 / 60)).toBe(150);
  });

  // 下向き（シートを閉じたとき）も、途中で行き過ぎず、戻らずに 0 へ着く
  test("下向きにフレームを重ねても、0 を下回らず、戻らずに着く", () => {
    // Arrange: 150 px から始める
    let shift = 150;
    // Act: 60 fps で 2 秒ぶん進める
    for (let frame = 0; frame < 120; frame++) {
      // 1 フレーム進める
      const next = advanceViewShift(shift, 0, 1 / 60);
      // Assert: 前のフレームより大きくならない（行ったり来たりしない）
      expect(next).toBeLessThanOrEqual(shift);
      // Assert: 0 を下回らない
      expect(next).toBeGreaterThanOrEqual(0);
      // 次のフレームへ
      shift = next;
    }
    // Assert: 2 秒後には 0 に着いている
    expect(shift).toBe(0);
  });

  // 十分な時間が経てば目標に着く（途中で止まったり行き過ぎたりしない）
  test("フレームを重ねると、行き過ぎずに目標へ着く", () => {
    // Arrange: 0 px から始める
    let shift = 0;
    // Act: 60 fps で 2 秒ぶん進める
    for (let frame = 0; frame < 120; frame++) {
      // 1 フレーム進める
      shift = advanceViewShift(shift, 150, 1 / 60);
      // Assert: どのフレームでも目標を超えない
      expect(shift).toBeLessThanOrEqual(150);
    }
    // Assert: 2 秒後には目標に着いている
    expect(shift).toBe(150);
  });
});

// applyViewShift: 求めたずらす量をカメラに反映する（変わっていなければ何もしない）
describe("applyViewShift", () => {
  // projectedY: カメラから見て正面 10 mm 先の点が、画面のどの高さに写るか（-1 = 下端、0 = 真ん中、1 = 上端）
  function projectedY(camera: THREE.PerspectiveCamera): number {
    // 投影行列を最新にしてから、正面の点を画面の座標に直す
    camera.updateMatrixWorld();
    // カメラは原点から -Z を向いているので、(0, 0, -10) が正面
    return new THREE.Vector3(0, 0, -10).project(camera).y;
  }

  // 正のずらす量で、写るものが上へ動く（向きを取り違えると、石がシートに隠れる側へ動いてしまう）
  test("正の量をずらすと、正面の点が画面の上側に写る", () => {
    // Arrange: 390 × 844 の画面のカメラ
    const camera = new THREE.PerspectiveCamera(40, 390 / 844, 0.5, 2000);
    // Act: 152 px ずらす
    applyViewShift(camera, 152, 390, 844);
    // Assert: 正面の点が真ん中より上に写る
    expect(projectedY(camera)).toBeGreaterThan(0);
  });

  // 量も画面の大きさも同じなら、投影を作り直さない（毎フレーム呼ばれるので、無駄な計算をしない）
  test("同じ量と大きさでもう一度呼んでも、作り直さない", () => {
    // Arrange: 一度ずらしたカメラ
    const camera = new THREE.PerspectiveCamera(40, 390 / 844, 0.5, 2000);
    // 1 回目
    const first = applyViewShift(camera, 152, 390, 844);
    // Act: 同じ値で 2 回目
    const second = applyViewShift(camera, 152, 390, 844);
    // Assert: 1 回目は作り直し、2 回目は何もしない
    expect([first, second]).toEqual([true, false]);
  });

  // 画面の大きさが変わったら、同じ量でも作り直す（古い大きさのままだと、写る範囲がゆがむ）
  test("画面の大きさが変わったら、作り直す", () => {
    // Arrange: 一度ずらしたカメラ
    const camera = new THREE.PerspectiveCamera(40, 390 / 844, 0.5, 2000);
    // 1 回目
    applyViewShift(camera, 152, 390, 844);
    // Act: 高さだけが変わった
    const updated = applyViewShift(camera, 152, 390, 700);
    // Assert: 作り直し、新しい大きさを覚えている
    expect(updated).toBe(true);
    // 新しい高さ
    expect(camera.view?.fullHeight).toBe(700);
  });

  // アニメーション中は、毎フレーム 0 以外の量から別の 0 以外の量へ変わる。そのたびに作り直さないと、動きが止まって見える
  test("0 以外の量から別の 0 以外の量へ変えると、作り直す", () => {
    // Arrange: 152 px ずらしたカメラ
    const camera = new THREE.PerspectiveCamera(40, 390 / 844, 0.5, 2000);
    // 1 回目
    applyViewShift(camera, 152, 390, 844);
    // Act: 100 px に変える
    const updated = applyViewShift(camera, 100, 390, 844);
    // Assert: 作り直し、新しい量を覚えている
    expect(updated).toBe(true);
    // 新しい量
    expect(camera.view?.offsetY).toBe(100);
  });

  // ずらした量のぶんだけ、写る位置が動く（量や高さの取り違えを拾う）
  test("高さ 844 px で 152 px ずらすと、正面の点は画面の高さの約 36% 上に写る", () => {
    // Arrange: 390 × 844 の画面のカメラ
    const camera = new THREE.PerspectiveCamera(40, 390 / 844, 0.5, 2000);
    // Act: 152 px ずらす
    applyViewShift(camera, 152, 390, 844);
    // Assert: 画面の座標（-1〜1）で 2 × 152 / 844 ≈ 0.36 上
    expect(projectedY(camera)).toBeCloseTo((2 * 152) / 844, 5);
  });

  // 幅だけが変わっても作り直す（窓の幅だけを変えたとき）
  test("幅だけが変わっても、作り直す", () => {
    // Arrange: 一度ずらしたカメラ
    const camera = new THREE.PerspectiveCamera(40, 390 / 844, 0.5, 2000);
    // 1 回目
    applyViewShift(camera, 152, 390, 844);
    // Act: 幅だけを 375 に変える
    const updated = applyViewShift(camera, 152, 375, 844);
    // Assert: 作り直し、新しい幅を覚えている
    expect(updated).toBe(true);
    // 新しい幅
    expect(camera.view?.fullWidth).toBe(375);
  });

  // ずらしているときに画面の大きさが 0 になったら、ずらしを解く（大きさ 0 のまま切り取ると投影が壊れる）
  test("ずらしているカメラで画面の大きさが 0 になったら、ずらしを解く", () => {
    // Arrange: 一度ずらしたカメラ
    const camera = new THREE.PerspectiveCamera(40, 390 / 844, 0.5, 2000);
    // 1 回目
    applyViewShift(camera, 152, 390, 844);
    // Act: 幅が 0 になった
    const updated = applyViewShift(camera, 152, 0, 844);
    // Assert: 作り直し、ずらしが解けている
    expect(updated).toBe(true);
    // 解けている
    expect(camera.view?.enabled).toBe(false);
  });

  // 壊れた量（NaN・無限大）でずらすと投影が NaN になって何も描かれなくなるので、ずらさずに解く。
  // どの値も、ずらした状態から始める（前の値で解けたあとだと、解く処理を通ったかを確かめられないため）
  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "ずらす量が %s のときは、ずらしを解く",
    (shift) => {
      // Arrange: 一度ずらしたカメラ
      const camera = new THREE.PerspectiveCamera(40, 390 / 844, 0.5, 2000);
      // 1 回目
      applyViewShift(camera, 152, 390, 844);
      // Act: 壊れた量を渡す
      const updated = applyViewShift(camera, shift, 390, 844);
      // Assert: 作り直した
      expect(updated).toBe(true);
      // ずらしていない
      expect(camera.view?.enabled).toBe(false);
      // 正面の点は真ん中に写る（NaN にならない）
      expect(projectedY(camera)).toBeCloseTo(0, 10);
    },
  );

  // 0 にしたら、ずらしを解いて元の真ん中に戻す
  test("0 にすると、ずらしを解いて真ん中に戻す", () => {
    // Arrange: 一度ずらしたカメラ
    const camera = new THREE.PerspectiveCamera(40, 390 / 844, 0.5, 2000);
    // 1 回目
    applyViewShift(camera, 152, 390, 844);
    // Act: 0 にする
    const updated = applyViewShift(camera, 0, 390, 844);
    // Assert: 作り直した
    expect(updated).toBe(true);
    // ずらしが解けている
    expect(camera.view?.enabled).toBe(false);
    // 正面の点が真ん中に写る
    expect(projectedY(camera)).toBeCloseTo(0, 10);
  });

  // 一度もずらしていないカメラに 0 を渡しても、何もしない
  test("ずらしていないカメラに 0 を渡しても、何もしない", () => {
    // Arrange: 新しいカメラ
    const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
    // Act / Assert: 何もしない
    expect(applyViewShift(camera, 0, 390, 844)).toBe(false);
  });

  // 描き始めの一瞬など、画面の大きさが 0 のときにずらすと投影が壊れるので、ずらさない
  test("画面の大きさが 0 のときは、ずらさない", () => {
    // Arrange: 新しいカメラ
    const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
    // Act: 高さ 0 で 152 px
    applyViewShift(camera, 152, 390, 0);
    // Assert: ずらしていない
    expect(camera.view?.enabled ?? false).toBe(false);
  });
});

// overviewHero: 石を選んでいないときの見出し（タブを切り替えてきたときと、選択を外して戻ったときで読み上げだけ変える）
describe("overviewHero", () => {
  // タブを切り替えて誕生石シーンに来たときは、シーンの見出しそのまま
  test("タブを切り替えてきたときは、シーンの見出しと読み上げをそのまま使う", () => {
    // Act: 選択を外して戻ったのではないときの見出し
    const hero = overviewHero(false);
    // Assert: シーンの見出し（HERO.jewel）そのもの（写しではなく同じオブジェクト）
    expect(hero).toBe(HERO.jewel);
  });

  // 同じタブのまま選択を外したときに「シーンを表示しています」と読み上げると、別のシーンへ移ったように聞こえる
  test("選択を外して戻ったときは、一覧に戻ったことだけを読み上げる", () => {
    // Act: 選択を外して戻ったときの見出し
    const hero = overviewHero(true);
    // Assert: 読み上げは「戻った」ことを伝える専用の文
    expect(hero.announcement).toBe("文字盤の一覧に戻りました。");
    // Assert: 画面に出す見出しは、シーンの見出しと同じ（読み上げの文だけが違う）
    expect({ ...hero, announcement: HERO.jewel.announcement }).toEqual(HERO.jewel);
  });

  // 読み上げは、文が替わったときにだけ読まれる。シーンの見出しと同じ文だと、選択を外しても何も読まれない
  test("戻ったときの読み上げは、シーンの見出しの読み上げとは違う文にする", () => {
    // Act / Assert: 2 つの文が異なる
    expect(overviewHero(true).announcement).not.toBe(HERO.jewel.announcement);
  });

  // 呼び出し側がうっかり書き換えても、共有している HERO.jewel が変わらないように、新しいオブジェクトを返す
  test("戻ったときは、HERO.jewel を書き換えずに新しいオブジェクトを返す", () => {
    // Act: 戻ったときの見出しを作る
    const hero = overviewHero(true);
    // Assert: 別のオブジェクト
    expect(hero).not.toBe(HERO.jewel);
    // Assert: 元のシーンの読み上げは変わっていない
    expect(HERO.jewel.announcement).toBe("12 か月の誕生石を並べたシーンを表示しています。");
  });
});

// pickStoneGeometries: 読み込んだ glTF から、12 石ぶんの形を名前で取り出す（外から来たデータなので中身を確かめる）
describe("pickStoneGeometries", () => {
  // meshNodes: すべての石の名前を持つ、偽物の glTF のノード一覧
  function meshNodes(): Record<string, THREE.Object3D> {
    // id ごとに小さな箱のメッシュを作る
    return Object.fromEntries(
      // 12 石ぶん
      BIRTHSTONE_IDS.map((id) => [id, new THREE.Mesh(new THREE.BoxGeometry())]),
    );
  }

  // 12 石すべての形を返す
  test("すべての石の形を id ごとに返す", () => {
    // Arrange: ノード一覧
    const nodes = meshNodes();
    // Act: 取り出す
    const geometries = pickStoneGeometries(nodes);
    // Assert: 各石のメッシュの形がそのまま入っている
    for (const id of BIRTHSTONE_IDS) {
      // ノードのメッシュと同じ形
      expect(geometries[id]).toBe((nodes[id] as THREE.Mesh).geometry);
    }
  });

  // 石が 1 つでも欠けていたら、どの石かわかるエラーにする
  test("石のノードが無いときは、その id を含むエラーを投げる", () => {
    // Arrange: ルビーを消したノード一覧
    const { ruby: _removed, ...nodes } = meshNodes();
    // Act / Assert: ルビーを知らせるエラー
    expect(() => pickStoneGeometries(nodes)).toThrow("ruby");
  });

  // メッシュでないノード（空のグループなど）も形として使えない
  test("メッシュでないノードはエラーにする", () => {
    // Arrange: パールだけ空のグループにする
    const nodes = { ...meshNodes(), pearl: new THREE.Group() };
    // Act / Assert: パールを知らせるエラー
    expect(() => pickStoneGeometries(nodes)).toThrow("pearl");
  });
});

// disposeRefractionBvh: MeshRefractionMaterial が内部で作る BVH（GPU のテクスチャを持つ）を片付ける
describe("disposeRefractionBvh", () => {
  // bvh.dispose() を呼ぶ
  test("bvh を持つマテリアルなら bvh.dispose() を呼ぶ", () => {
    // Arrange: dispose を記録する偽物の bvh
    const dispose = vi.fn();
    // Act: 片付ける
    disposeRefractionBvh({ bvh: { dispose } });
    // Assert: 1 回呼ばれた
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  // ほかのマテリアルや空の値では何もしない（エラーも出さない）
  test.each([[null], [undefined], [{}], [{ bvh: {} }], [new THREE.MeshBasicMaterial()]])(
    "%s では何もしない",
    (material) => {
      // Act / Assert: エラーにならない
      expect(() => disposeRefractionBvh(material)).not.toThrow();
    },
  );
});

// public/ に置いた 3D の資産が、コードの期待どおりにそろっているか（Blender のスクリプトで作り直したときの確認）
describe("public/jewels の資産", () => {
  // .glb は「ヘッダー 12 バイト → JSON のかたまり → バイナリのかたまり」の順に並ぶ
  test("jewels.glb に 12 石すべてのメッシュのノードがある", () => {
    // Arrange: ファイルを読む
    const file = readFileSync(join(PUBLIC_DIR, JEWELS_GLB_URL));
    // Assert: 先頭 4 バイトは "glTF"
    expect(file.toString("ascii", 0, 4)).toBe("glTF");
    // JSON のかたまりの長さ（ヘッダーの直後に 4 バイトで入っている）
    const jsonLength = file.readUInt32LE(12);
    // JSON のかたまりを文字列として取り出して読む
    const gltf = JSON.parse(file.toString("utf8", 20, 20 + jsonLength)) as {
      // ノードの一覧（名前とメッシュの番号）
      nodes: { name?: string; mesh?: number }[];
    };
    // Act: メッシュを持つノードの名前
    const names = gltf.nodes.filter((node) => node.mesh !== undefined).map((node) => node.name);
    // Assert: すべての石の id がある
    expect(names).toEqual(expect.arrayContaining([...BIRTHSTONE_IDS]));
  });

  // Radiance HDR は "#?RADIANCE" で始まる
  test("studio.hdr が Radiance HDR 形式である", () => {
    // Arrange: 先頭を読む
    const head = readFileSync(join(PUBLIC_DIR, JEWELS_ENV_URL)).toString("ascii", 0, 10);
    // Assert: 形式の目印
    expect(head).toBe("#?RADIANCE");
  });
});
