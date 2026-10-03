import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { describe, expect, test, vi } from "vitest";
import { BIRTHSTONE_IDS, BIRTHSTONES, type BirthstoneId, birthstoneById } from "@/lib/birthstones";
import { COMPACT_MAX_HEIGHT_PX, DEFAULT_PARAMS, HERO, SLIDERS } from "@/lib/scene";
import {
  aberrationFor,
  adjacentStone,
  advanceLift,
  advanceOpacity,
  advanceSpin,
  advanceViewShift,
  applyRefractionResolution,
  applyStoneOpacity,
  applyViewShift,
  BASE_FOV_DEG,
  CAMERA_SMOOTH_TIME,
  castsShadow,
  disposeRefractionBvh,
  envIntensityFor,
  FADED_OPACITY,
  FIRE_GAIN,
  FOCUS_DISTANCE_FACTOR,
  FOV_REFERENCE_ASPECT,
  fitFov,
  focusPose,
  focusViewShift,
  geometryBounds,
  HOVER_LIFT_MM,
  isFadedStone,
  JEWELS_ENV_URL,
  JEWELS_GLB_URL,
  JEWELS_MIN_FPS,
  jewelHero,
  jewelsDpr,
  jewelsFpsBounds,
  MAX_FOV_DEG,
  MIN_ABERRATION,
  nearestAngle,
  OVERVIEW_POSE,
  orbitAngles,
  overviewHero,
  pickStoneGeometries,
  RING_RADIUS_MM,
  refractionColor,
  ringAngle,
  ringPosition,
  SHADOW_RETURN_OPACITY,
  SHEET_VIEW_SHIFT,
  SPIN_SPEED,
  STONE_LIFT_MM,
  STUDIO_EXPOSURE,
  stoneOpacity,
  stonePlacement,
  stoneYaw,
  TINT_POWER,
  tintFromColor,
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

  // 寄りすぎると石が画面の大半を占め、周りの石の並びも見えない（ユーザーの指摘）。引きすぎると主役の石が小さくなる。
  // 割合は角度どうしの比（画面の長さの比は tan で決まり、少しだけ小さい）。40〜50% は倍率で約 5.8〜7.2 倍に当たり、
  // 画面で見比べた 4.4 倍（約 66%。寄りすぎ）と 8 倍（約 36%。スマホで石が小さすぎた）を弾く
  test("選んだ石を包む球が見える角度は、基準の縦の画角（BASE_FOV_DEG）の 40〜50%", () => {
    // Arrange: 半径 5 の石（距離は半径の倍率で決まるので、半径の値によらず同じ割合になる）
    const placement = { baseY: 3, centerY: 2, radius: 5 };
    // Act: その石を見るカメラと石の距離
    const { distance } = orbitAngles(focusPose(3, placement));
    // 石を包む球が見える角度（度）。球の縁へ引いた接線どうしの角度
    const stoneDeg = THREE.MathUtils.radToDeg(2 * Math.asin(placement.radius / distance));
    // 縦の画角に対する割合
    const share = stoneDeg / BASE_FOV_DEG;
    // Assert: 寄りすぎない（以前の 4.4 倍では約 66% で、石を包む球が画角の 2/3 ほどを占めていた）
    expect(share).toBeLessThanOrEqual(0.5);
    // Assert: 引きすぎない（主役の石として大きく見せる）
    expect(share).toBeGreaterThanOrEqual(0.4);
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
describe("aberrationFor / envIntensityFor / tintFromColor / refractionColor", () => {
  // 分散スライダーが 0 でも、MeshRefractionMaterial には 0 を渡さない（0 と正の値を行き来すると drei の実装で屈折が壊れるため）
  test("分散スライダーが 0 のときも MIN_ABERRATION（正の値）になる", () => {
    // Assert: 最小値になる
    expect(aberrationFor(0.044, 2.42, 0)).toBe(MIN_ABERRATION);
    // Assert: 最小値は正
    expect(MIN_ABERRATION).toBeGreaterThan(0);
  });

  // drei は赤を「屈折率 × (1 - 値)」、青を「屈折率 × (1 + 値)」で計算する（fastChroma を使わないとき）。
  // その赤と青の屈折率の差が、石の分散（宝石学の B–G 間の屈折率の差）を FIRE_GAIN 倍・スライダー倍したものになる
  test("赤と青の屈折率の差が、石の分散 × スライダー × FIRE_GAIN になる", () => {
    // Arrange: ダイヤ（屈折率 2.42・分散 0.044）、スライダー 0.5
    const ior = 2.42;
    // Act: 色のずれ
    const strength = aberrationFor(0.044, ior, 0.5);
    // Assert: 青と赤の屈折率の差
    expect(ior * (1 + strength) - ior * (1 - strength)).toBeCloseTo(0.044 * 0.5 * FIRE_GAIN, 10);
  });

  // 実物の分散のままでは、画面の上で虹色がほとんど見えない。スライダーを上げたときは実物より強めて見せる
  test("FIRE_GAIN は 1 より大きい（スライダー 1 で実物より強い虹色）", () => {
    // Assert: 実物より強める
    expect(FIRE_GAIN).toBeGreaterThan(1);
  });

  // スライダーを上げるほど色のずれが強くなり、分散の大きい石ほど強い
  test("分散スライダーと石の分散が大きいほど値が大きい", () => {
    // Assert: スライダーを上げると大きくなる
    expect(aberrationFor(0.044, 2.42, 1)).toBeGreaterThan(aberrationFor(0.044, 2.42, 0.5));
    // Assert: 屈折率が同じなら、分散 0.044 は 0.013 より大きい
    expect(aberrationFor(0.044, 1.54, 1)).toBeGreaterThan(aberrationFor(0.013, 1.54, 1));
  });

  // 範囲外の値はスライダーの範囲（0〜1）に収める
  test("分散スライダーの値は 0〜1 に収める", () => {
    // Assert: 1 を超えても 1 と同じ
    expect(aberrationFor(0.044, 2.42, 5)).toBe(aberrationFor(0.044, 2.42, 1));
    // Assert: 負の値は 0 と同じ（最小値になり、負の値は渡さない）
    expect(aberrationFor(0.044, 2.42, -5)).toBe(MIN_ABERRATION);
  });

  // 屈折率が大きいほど、同じ色の広がりに必要な値は小さい（差 = 2 × 屈折率 × 値 なので、屈折率で割っている）
  test("分散とスライダーが同じなら、屈折率の小さい石ほど値が大きい", () => {
    // Assert: 屈折率 1.54 は 2.42 より大きい値になる
    expect(aberrationFor(0.044, 1.54, 0.5)).toBeGreaterThan(aberrationFor(0.044, 2.42, 0.5));
  });

  // 12 か月の実際の石では、どのスライダーの値でも、drei に渡せる範囲（有限・下限以上・0.1 未満）に収まる。
  // 0.1 未満なら、赤と青の屈折率は元の ±10% 以内（いちばん分散の大きいダイヤでもスライダー 1 で約 0.036）
  test.each([0, 0.5, 1])(
    "分散スライダー %f で、12 石とも有限で MIN_ABERRATION 以上、0.1 未満",
    (fire) => {
      // 12 石ぶん
      for (const stone of BIRTHSTONES) {
        // Act: 色のずれ
        const strength = aberrationFor(stone.dispersion, stone.ior, fire);
        // Assert: 有限
        expect(Number.isFinite(strength)).toBe(true);
        // Assert: 下限以上
        expect(strength).toBeGreaterThanOrEqual(MIN_ABERRATION);
        // Assert: 屈折率の ±10% 以内（大きすぎる値は虹色が強すぎて石の形がわからなくなる）
        expect(strength).toBeLessThan(0.1);
      }
    },
  );

  // 数でない値や、1 未満の屈折率（空気より曲がらない物）が来ても、壊れた値を drei に渡さない
  test.each([
    ["スライダーが NaN", 0.044, 2.42, Number.NaN],
    ["屈折率が NaN", 0.044, Number.NaN, 0.5],
    ["屈折率が 0", 0.044, 0, 0.5],
    ["屈折率が 1 未満", 0.044, 0.9, 0.5],
    ["分散が NaN", Number.NaN, 2.42, 0.5],
  ])("%s なら MIN_ABERRATION にする", (_, dispersion, ior, fire) => {
    // Assert: 下限の値
    expect(aberrationFor(dispersion, ior, fire)).toBe(MIN_ABERRATION);
  });

  // 屈折率がちょうど 1（空気と同じ）は受け付ける境目
  test("屈折率がちょうど 1 なら、式どおりの値を返す", () => {
    // Assert: 分散 0.044・スライダー 1 で、差 0.044 × FIRE_GAIN を 2 × 1 で割った値
    expect(aberrationFor(0.044, 1, 1)).toBeCloseTo((0.044 * FIRE_GAIN) / 2, 10);
  });

  // パールのように分散が 0 の石でも、0 は渡さない
  test("分散が 0 の石でも MIN_ABERRATION になる", () => {
    // Assert: 最小値
    expect(aberrationFor(0, 1.53, 1)).toBe(MIN_ABERRATION);
  });

  // 光量スライダーは、環境マップ（スタジオの光）の強さの倍率。露出は STUDIO_EXPOSURE に固定する
  test.each<[number, number]>([
    // 光量 1: スタジオの光そのまま
    [1, 1],
    // 光量 2.5: 2.5 倍
    [2.5, 2.5],
    // 光量 3（スライダーの上限）: 3 倍。上限で丸めない（スライダーの範囲は lib/scene.ts の SLIDERS が決める）
    [3, 3],
    // 光量 0: 光なし
    [0, 0],
    // 負の値は 0 にする
    [-1, 0],
  ])("envIntensityFor(%d) は %d", (amb, expected) => {
    // Assert: 強さの倍率
    expect(envIntensityFor(amb)).toBe(expected);
  });

  // 数でない値（NaN・無限大）がシェーダーへ渡ると、石とパールが真っ黒や真っ白に壊れるので、スタジオそのままの強さにする。
  // 負の無限大も「負の値は 0」ではなく 1 にする（壊れた入力として扱い、どの向きの無限大でもスタジオそのままに戻す）
  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "envIntensityFor(%d) は 1（スタジオそのまま）",
    (amb) => {
      // Assert: 1 に戻す
      expect(envIntensityFor(amb)).toBe(1);
    },
  );

  // 露出は、Blender の jewels.blend の露出（blender/build_jewels.py の VIEW_EXPOSURE。段数）に合わせた値で固定する（光量スライダーでは変えない）。
  // +1 段 = 2 倍なので、2 の VIEW_EXPOSURE 乗と一致するかを、Python のファイルから値を読んで照らし合わせる
  test("STUDIO_EXPOSURE は Blender の露出（VIEW_EXPOSURE 段）と同じ倍率", () => {
    // Arrange: Blender のスクリプトを読む
    const script = readFileSync(join(process.cwd(), "blender", "build_jewels.py"), "utf8");
    // 「VIEW_EXPOSURE = 数」の行から数を取り出す
    const match = /^VIEW_EXPOSURE = ([\d.]+)$/m.exec(script);
    // Assert: 行が見つかる
    expect(match).not.toBeNull();
    // Assert: 2 の段数乗が、Web の露出と同じ
    expect(STUDIO_EXPOSURE).toBeCloseTo(2 ** Number(match?.[1]));
  });

  // 光量スライダーの初期値と範囲（lib/scene.ts）が、環境マップの強さの約束と合っているか
  test("光量スライダーの初期値はスタジオそのまま（1）で、範囲は 0〜3 倍", () => {
    // Arrange: 誕生石の光量スライダーの定義
    const slider = SLIDERS.jewel.find((def) => def.field === "amb");
    // Assert: 定義がある
    expect(slider).toBeDefined();
    // Assert: 初期値は 1 倍
    expect(envIntensityFor(DEFAULT_PARAMS.jewel.amb)).toBe(1);
    // Assert: 下端は 0 倍（光なし。負の値にはならないので、envIntensityFor の 0 への切り上げは入口の守りだけ）
    expect(envIntensityFor(slider?.min ?? Number.NaN)).toBe(0);
    // Assert: 上端は 3 倍
    expect(envIntensityFor(slider?.max ?? Number.NaN)).toBe(3);
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

  // 屈折の石の色は「石の色 × 環境マップから拾った光」なので、色に強さを掛けると環境マップの強さを変えたのと同じになる
  test("refractionColor は石の色（tintFromColor）に環境マップの強さを掛ける", () => {
    // Arrange: ルビーの色
    const tint = tintFromColor(birthstoneById("ruby").color);
    // Act: 強さ 2.5 で求める
    const color = refractionColor(birthstoneById("ruby").color, 2.5);
    // Assert: 赤・緑・青の 3 成分（空の配列で下の比べ合わせが素通りしないように）
    expect(color).toHaveLength(3);
    // Assert: 各成分（赤・緑・青）が 2.5 倍
    for (const [index, value] of color.entries()) {
      // 1 成分ずつ比べる
      expect(value).toBeCloseTo(tint[index] * 2.5);
    }
  });

  // 強さ 1 はスタジオそのままなので、石の色（tintFromColor）と同じ
  test("refractionColor は強さ 1 なら tintFromColor と同じ", () => {
    // Assert: 同じ値
    expect(refractionColor("#ff8080", 1)).toEqual(tintFromColor("#ff8080"));
  });

  // 強さ 0 は光なし（真っ黒。縁の白い光 fresnel は別に足される）
  test("refractionColor は強さ 0 なら黒になる", () => {
    // Assert: 黒
    expect(refractionColor("#ff8080", 0)).toEqual([0, 0, 0]);
  });
});

// stoneOpacity / advanceOpacity / applyStoneOpacity: 石を選んでいる間は、ほかの石を白い背景へ溶かすように薄くして、主役の石を浮かび上がらせる
describe("stoneOpacity / advanceOpacity / applyStoneOpacity", () => {
  // 何も選んでいなければ、全部の石が不透明
  test("何も選んでいないときは 1", () => {
    // Assert: 不透明
    expect(stoneOpacity("ruby", null)).toBe(1);
  });

  // 選んだ石は不透明、それ以外は薄くする
  test("選んだ石は 1、ほかの石は FADED_OPACITY", () => {
    // Assert: 選んだ石
    expect(stoneOpacity("ruby", "ruby")).toBe(1);
    // Assert: ほかの石
    expect(stoneOpacity("pearl", "ruby")).toBe(FADED_OPACITY);
  });

  // 薄くした石は、消えはしないが、主役の石より目立たない
  test("FADED_OPACITY は 0 より大きく 0.3 以下", () => {
    // Assert: 0 にはしない（文字盤の並びが見えるように残す）
    expect(FADED_OPACITY).toBeGreaterThan(0);
    // Assert: 0.3 以下（これより濃いと、色の濃い石が白い背景の上で目立ち、主役の石と張り合う）
    expect(FADED_OPACITY).toBeLessThanOrEqual(0.3);
  });

  // パールと同じ MeshPhysicalMaterial の不透明度を書き換える（屈折のマテリアルの opacity の uniform は、下の偽物のマテリアルで確かめる。本物は WebGL が無いと作れない）
  test("applyStoneOpacity は opacity を持つマテリアルの opacity を書き換える", () => {
    // Arrange: パールと同じ種類のマテリアル
    const material = new THREE.MeshPhysicalMaterial();
    // Act: 薄くする
    applyStoneOpacity(material, FADED_OPACITY);
    // Assert: 不透明度
    expect(material.opacity).toBeCloseTo(FADED_OPACITY);
  });

  // 色は変えない（白い背景の上では、暗くすると黒い影のように目立つため、薄くするだけにする）
  test("applyStoneOpacity は色を変えない", () => {
    // Arrange: 色と opacity を持つ偽物のマテリアル（MeshRefractionMaterial と同じ名前）
    const material = { color: new THREE.Color(1, 0.5, 0.25), opacity: 1 };
    // Act: 薄くする
    applyStoneOpacity(material, 0.5);
    // Assert: 色はそのまま
    expect(material.color.toArray()).toEqual([1, 0.5, 0.25]);
    // Assert: 不透明度だけ変わる
    expect(material.opacity).toBe(0.5);
  });

  // 空の値では何もしない
  test.each([[null], [undefined]])("%j では何もしない（エラーにならない）", (material) => {
    // Act / Assert: エラーにならない
    expect(() => applyStoneOpacity(material, 0.5)).not.toThrow();
  });

  // 対象の項目を持たないオブジェクトは、中身を変えない
  test.each([
    // 何も持たない
    [{}],
    // opacity が数値ではない
    [{ opacity: "half" }],
  ])("%j の中身は変えない", (material) => {
    // Arrange: 呼ぶ前の中身を控える
    const before = JSON.stringify(material);
    // Act: 薄くしようとする
    applyStoneOpacity(material, 0.5);
    // Assert: 中身は同じ
    expect(JSON.stringify(material)).toBe(before);
  });

  // three.js のメッシュは複数のマテリアル（配列）を持てるが、石は 1 つしか使わないので、配列は対象外
  test("マテリアルの配列を渡しても、中のマテリアルは変えない", () => {
    // Arrange: opacity を持つマテリアル 1 つだけの配列
    const inner = { opacity: 1 };
    // Act: 配列ごと渡して薄くしようとする
    applyStoneOpacity([inner], 0.5);
    // Assert: 中のマテリアルは不透明のまま
    expect(inner.opacity).toBe(1);
  });

  // 不透明度はなめらかに変わる
  test("advanceOpacity は目標の不透明度へなめらかに近づき、行き過ぎない", () => {
    // Act / Assert: 1 フレームでは途中まで
    expect(advanceOpacity(1, 1 / 60, FADED_OPACITY)).toBeGreaterThan(FADED_OPACITY);
    // Act / Assert: 1 フレームでも少しは薄くなる
    expect(advanceOpacity(1, 1 / 60, FADED_OPACITY)).toBeLessThan(1);
    // Act / Assert: 十分な時間が経つと目標に落ち着く
    expect(advanceOpacity(1, 10, FADED_OPACITY)).toBeCloseTo(FADED_OPACITY);
  });

  // 速さはカメラの移動（約 0.8 秒）とそろえる（係数 5 の damp。1 フレームで残りの e^(-5/60) 倍が残る）
  test("advanceOpacity は 1 フレーム（1/60 秒）で、残りの差が e^(-5/60) 倍になる", () => {
    // Act: 不透明から 1 フレーム薄くする
    const next = advanceOpacity(1, 1 / 60, FADED_OPACITY);
    // Assert: 0.15 + 0.85 × e^(-5/60) ≒ 0.932
    expect(next).toBeCloseTo(FADED_OPACITY + (1 - FADED_OPACITY) * Math.exp(-5 / 60), 6);
  });

  // 選択を外したときは、薄い石が同じ速さで不透明へ戻る
  test("advanceOpacity は薄い状態から 1 へも戻り、0.8 秒で残りの差が 2% 未満になる", () => {
    // Act: 薄い状態から 0.8 秒進める
    const next = advanceOpacity(FADED_OPACITY, 0.8, 1);
    // Assert: 1 より小さい（行き過ぎない）
    expect(next).toBeLessThan(1);
    // Assert: 残りの差（1 - next）が、はじめの差（0.85）の 2% 未満
    expect(1 - next).toBeLessThan((1 - FADED_OPACITY) * 0.02);
  });

  // 壊れた経過秒数では、今の不透明度のまま（NaN が入ると石が消えたまま戻らず、負の値では 0〜1 の外へ飛び出すため）
  test.each([
    // 経過なし
    [0],
    // 数でない
    [Number.NaN],
    // 負の値
    [-1],
  ])("advanceOpacity は経過秒数 %d では今の不透明度のまま", (delta) => {
    // Act / Assert: 0.5 のまま
    expect(advanceOpacity(0.5, delta, FADED_OPACITY)).toBe(0.5);
  });

  // 今の不透明度が壊れていたら、目標に置き直して立て直す
  test("advanceOpacity は今の不透明度が NaN なら目標にする", () => {
    // Act / Assert: 目標に置き直す
    expect(advanceOpacity(Number.NaN, 1 / 60, FADED_OPACITY)).toBe(FADED_OPACITY);
  });

  // 影を落とすか: 薄くし始めたらすぐ消し、戻るときはほぼ不透明になってから出す（まだ薄い石の下に濃い影だけが先に出ないように）
  test.each([
    // 薄くする石は、まだ不透明でも影を落とさない（選んだ瞬間に影を消す）
    [true, 1, false],
    // 戻る途中で、まだ閾値の手前
    [false, SHADOW_RETURN_OPACITY - 0.01, false],
    // 閾値ちょうどで影を戻す
    [false, SHADOW_RETURN_OPACITY, true],
    // 不透明
    [false, 1, true],
  ])("castsShadow は薄くする石か %s・不透明度 %d のとき %s", (isFaded, opacity, expected) => {
    // Act / Assert: 影を落とすか
    expect(castsShadow(isFaded, opacity)).toBe(expected);
  });

  // 閾値は薄い不透明度と 1 の間にある（そうでないと、石が影を落とすレイヤーへ戻れないか、戻りを遅らせられない）
  test("FADED_OPACITY < SHADOW_RETURN_OPACITY < 1", () => {
    // Assert: 薄い不透明度より大きい
    expect(SHADOW_RETURN_OPACITY).toBeGreaterThan(FADED_OPACITY);
    // Assert: 1 より小さい
    expect(SHADOW_RETURN_OPACITY).toBeLessThan(1);
  });

  // 選択を外してから、カメラが一覧へ戻りきる（CAMERA_SMOOTH_TIME、約 0.8 秒）までに影が戻る
  test("薄い状態から 1/60 秒ずつ戻すと、カメラの移動の時間（CAMERA_SMOOTH_TIME）以内に影を落とすようになる", () => {
    // Arrange: 薄い状態から始める
    let opacity = FADED_OPACITY;
    // Arrange: 経過秒数
    let elapsed = 0;
    // Act: 影を落とすようになるまで（念のため 2 秒で打ち切る）1 フレームずつ進める
    while (!castsShadow(false, opacity) && elapsed < 2) {
      // 1 フレーム戻す
      opacity = advanceOpacity(opacity, 1 / 60, 1);
      // 時間を進める
      elapsed += 1 / 60;
    }
    // Assert: カメラが一覧へ戻りきる時間の目安以内
    expect(elapsed).toBeLessThanOrEqual(CAMERA_SMOOTH_TIME);
  });

  // 薄くするかどうかの判定（不透明度と、影を落とさないレイヤーへ移すかの両方が使う）
  test.each([
    // 何も選んでいない
    [null, false],
    // この石を選んでいる
    ["ruby", false],
    // ほかの石を選んでいる
    ["pearl", true],
  ] as const)(
    "isFadedStone は選んでいる石が %s のとき、ルビーを %s にする",
    (selected, expected) => {
      // Act / Assert: ルビーを薄くするか
      expect(isFadedStone("ruby", selected)).toBe(expected);
    },
  );
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

// adjacentStone: 解説カードの ‹ › で移る、前後の月の石
describe("adjacentStone", () => {
  // [今の石, 向き, 期待する石]
  test.each<[BirthstoneId, -1 | 1, BirthstoneId]>([
    // 4 月の前は 3 月
    ["diamond", -1, "aquamarine"],
    // 4 月の次は 5 月
    ["diamond", 1, "emerald"],
    // 12 月の次は 1 月に回り込む
    ["blue-topaz", 1, "garnet"],
    // 1 月の前は 12 月に回り込む
    ["garnet", -1, "blue-topaz"],
  ])("%s の %i（-1 = 前、1 = 次）の月の石は %s", (id, step, expected) => {
    // Act / Assert: 期待する石になる
    expect(adjacentStone(birthstoneById(id), step).id).toBe(expected);
  });

  // 次へ進んでから前へ戻ると、元の石になる（12 か月すべて）
  test.each(BIRTHSTONE_IDS)("%s は、次の月の石の前の月の石", (id) => {
    // Arrange: 石
    const stone = birthstoneById(id);
    // Act / Assert: 次の前は自分
    expect(adjacentStone(adjacentStone(stone, 1), -1)).toBe(stone);
  });

  // 壊れたデータ（1〜12 の整数でない月）で、別の石を黙って返さない
  test.each([0, 13, 4.5, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "月が %s なら RangeError を投げる",
    (month) => {
      // Arrange: 月だけを変えた石（元のデータは書き換えず、新しいオブジェクトを作る）
      const stone = { ...birthstoneById("diamond"), month };
      // Act / Assert: 範囲の外なので投げる
      expect(() => adjacentStone(stone, 1)).toThrow(RangeError);
    },
  );
});

// jewelHero: 石を選んだときに、解説カードと読み上げの知らせへ出す文言
describe("jewelHero", () => {
  // 4 月のダイヤモンドの見出し
  test("数字の月・大文字の英名・和名・石言葉を並べる", () => {
    // Act: ダイヤモンドの見出しを作る
    const hero = jewelHero(birthstoneById("diamond"));
    // Assert: 上付きのラベルは数字の月（2026-10-02 のユーザーの判断。英語の月名にはしない）
    expect(hero.eyebrow).toBe("4月");
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

  // 12 か月とも、頭に 0 を付けない数字の月（10〜12 月で 2 桁が崩れないことも確かめる）
  test.each(BIRTHSTONES.map((stone) => [stone.month, stone]))(
    "%i 月の石の上付きラベルは、その数字に「月」を付けたもの",
    (month, stone) => {
      // Act / Assert: 数字の月
      expect(jewelHero(stone).eyebrow).toBe(`${month}月`);
    },
  );

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

// focusViewShift: スマホで解説カードのシートが開いているとき、描く範囲を上へずらす量（px）
describe("focusViewShift", () => {
  // スマホ向けの配置でシートが開いていれば、画面の高さの SHEET_VIEW_SHIFT 倍だけずらす
  test("スマホの縦持ちでシートが開いているときは、画面の高さに比例してずらす", () => {
    // Act / Assert: 390 × 844 でシートが開いている（844 × 0.23 = 194.12 → 194）
    expect(focusViewShift(390, 844, true)).toBe(194);
    // 高さが変われば、ずらす量も変わる（667 × 0.23 = 153.41 → 153）
    expect(focusViewShift(375, 667, true)).toBe(153);
  });

  // シートが無ければ、石は画面の真ん中でよい
  test("シートが閉じているときは、ずらさない", () => {
    // Act / Assert: スマホでもシートが無ければ 0
    expect(focusViewShift(390, 844, false)).toBe(0);
  });

  // 横持ちのスマホ（幅は 768px 以上でも高さが低い）もスマホ向けの配置で、シートが下に出る
  test("横持ちのスマホ（844 × 390）でも、シートが開いていればずらす", () => {
    // Act / Assert: 390 × 0.23 = 89.7 → 90
    expect(focusViewShift(844, 390, true)).toBe(90);
  });

  // パソコン向けの配置では解説カードは左下にあり、真ん中の石に重ならないので、石を上へずらす必要がない
  test("幅が 768px 以上で高さも十分な画面（パソコン向けの配置）では、シートが開いていてもずらさない", () => {
    // Act / Assert: ちょうど境目の 768px
    expect(focusViewShift(768, 900, true)).toBe(0);
    // その 1px 手前はスマホ扱い
    expect(focusViewShift(767, 900, true)).toBe(Math.round(900 * SHEET_VIEW_SHIFT));
  });

  // 高さの境目（480px）は isCompactLayout と同じ。ちょうど 480px まではスマホ向けの配置（シートが下に出る）
  test("幅が広くても、高さが 480px 以下ならずらし、481px ならずらさない", () => {
    // Act / Assert: ちょうど境目（480 × 0.23 = 110.4 → 110）
    expect(focusViewShift(1280, COMPACT_MAX_HEIGHT_PX, true)).toBe(110);
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

// applyViewShift: 求めたずらす量をカメラに反映する（変わっていなければ何もしない）。
// 下のテストの 152 px は任意の量（以前の SHEET_VIEW_SHIFT 0.18 × 844 の名残。今の値は 194 px だが、ずらし方の確認には量は問わない）
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
  test("高さ 844 px で 152 px ずらすと、正面の点は -1〜1 の座標で約 0.36（画面の高さの約 18%）上に写る", () => {
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

// 誕生石のタブのキャンバスの解像度の倍率（デバイスピクセル比の範囲）。ふだんは 2 倍まで、重い端末では 1.25 倍まで
describe("jewelsDpr / jewelsFpsBounds", () => {
  // スマホ（ピクセル比 3）で 1.25 倍だと、屈折の切子面の境目の階段が約 2.4 倍に引き伸ばされてギザギザに見えたので、ふだんは 2 倍まで上げる
  test("ふだんは 1〜2 倍", () => {
    // Assert: 下限 1・上限 2
    expect(jewelsDpr(false)).toEqual([1, 2]);
  });

  // フレームレートが落ちた端末では、以前の上限（1.25 倍）へ戻して軽くする
  test("重い端末では 1〜1.25 倍", () => {
    // Assert: 下限 1・上限 1.25
    expect(jewelsDpr(true)).toEqual([1, 1.25]);
  });

  // どちらの範囲も、下限は等倍以上で、下限が上限を超えない
  test.each([false, true])("範囲（軽くする = %s）は 1 ≤ 下限 ≤ 上限", (isReduced) => {
    // Act: 範囲を求める
    const [min, max] = jewelsDpr(isReduced);
    // Assert: 下限は等倍以上
    expect(min).toBeGreaterThanOrEqual(1);
    // Assert: 下限は上限以下
    expect(min).toBeLessThanOrEqual(max);
  });

  // 下げた方が、描くピクセル数が少ない（上限が小さい）
  test("下げたときの上限は、ふだんの上限より小さい", () => {
    // Assert: 上限どうしを比べる
    expect(jewelsDpr(true)[1]).toBeLessThan(jewelsDpr(false)[1]);
  });

  // 返した配列を呼び出し側が書き換えても、次に返す値は変わらない（毎回新しい配列を返す）
  test("返した配列を書き換えても、次の呼び出しに影響しない", () => {
    // Arrange: 一度受け取って書き換える
    const first = jewelsDpr(false);
    // 上限を書き換える（呼び出し側の誤りのつもり）
    first[1] = 99;
    // Act: もう一度受け取る
    const second = jewelsDpr(false);
    // Assert: 上限は 2 のまま
    expect(second[1]).toBe(2);
  });

  // フレームレートの判定の [下限, 上限]。下限は JEWELS_MIN_FPS、上限は無限大（上げる知らせ onIncline を出させない）
  test("jewelsFpsBounds の下限は JEWELS_MIN_FPS、上限は無限大", () => {
    // Act: 範囲を求める
    const [lower, upper] = jewelsFpsBounds();
    // Assert: 下限
    expect(lower).toBe(JEWELS_MIN_FPS);
    // Assert: 上限（どんなフレームレートも上限以上にはならない）
    expect(upper).toBe(Number.POSITIVE_INFINITY);
  });

  // 下げる目安のフレームレートは、60 fps の画面でカクつきが目に見えてくる値。60 以上にすると、ふつうに動く端末まで下げてしまう
  test("JEWELS_MIN_FPS は 0 より大きく 60 未満", () => {
    // Assert: 0 より大きい
    expect(JEWELS_MIN_FPS).toBeGreaterThan(0);
    // Assert: 60 未満
    expect(JEWELS_MIN_FPS).toBeLessThan(60);
  });
});

// drei の MeshRefractionMaterial の resolution（描く大きさ）を、実際の描画のピクセル数にする
describe("applyRefractionResolution", () => {
  // drei は CSS のピクセル数（size.width）を渡すが、シェーダーの gl_FragCoord は描画のピクセル数なので、解像度の倍率を掛けた値にする
  test("屈折のマテリアルの resolution を、CSS の大きさ × 解像度の倍率にする", () => {
    // Arrange: resolution の uniform を持つ偽物のマテリアル（drei の値は CSS のピクセル数）
    const material = { uniforms: { resolution: { value: new THREE.Vector2(390, 844) } } };
    // Act: 390 × 844 の画面を 2 倍で描く
    applyRefractionResolution(material, 390, 844, 2);
    // Assert: 横は 780
    expect(material.uniforms.resolution.value.x).toBe(780);
    // Assert: 縦は 1688
    expect(material.uniforms.resolution.value.y).toBe(1688);
  });

  // パール（MeshPhysicalMaterial）には resolution の uniform が無いので、何もしない
  test.each([
    // ふつうのマテリアル（uniforms が無い）
    ["uniforms が無い", new THREE.MeshPhysicalMaterial()],
    // resolution が無いシェーダー
    ["resolution が無い", { uniforms: {} }],
    // マテリアルの配列
    ["配列", [new THREE.MeshBasicMaterial()]],
    // uniforms が null
    ["uniforms が null", { uniforms: null }],
    // 何も無い
    ["undefined", undefined],
  ])("%s なら何もせず、エラーも出さない", (_name, material) => {
    // Act / Assert: エラーを出さない
    expect(() => applyRefractionResolution(material, 390, 844, 2)).not.toThrow();
  });

  // resolution の値が Vector2 でなければ（別のシェーダーの同じ名前の uniform など）、書き換えない
  test("resolution の値が Vector2 でなければ書き換えない", () => {
    // Arrange: 値がふつうのオブジェクトの resolution
    const material = { uniforms: { resolution: { value: { x: 1, y: 2 } } } };
    // Act: 当てはめる
    applyRefractionResolution(material, 390, 844, 2);
    // Assert: 元のまま
    expect(material.uniforms.resolution.value).toEqual({ x: 1, y: 2 });
  });
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

  // 誕生石シーンは真っ白な空間なので、環境マップの下半分（床と壁）も白くしてある（blender/build_jewels.py の WORLD_GRADIENT）。
  // 床が暗いと、石の中で反射して下へ抜ける光線が黒を拾い、ダイヤのテーブル面の中心などが暗く沈む（床がほぼ黒の 0.01〜0.025 だったときに起きた）
  test("studio.hdr の下半分（床と壁）は、明るさの中央値も下位 10% の値も 0.3 以上", () => {
    // Arrange: ファイルを読む
    const file = readFileSync(join(PUBLIC_DIR, JEWELS_ENV_URL));
    // three.js の HDR の読み込み（GPU を使わずに、ピクセルの値だけを取り出せる）。32 ビットの浮動小数で受け取る
    const loader = new HDRLoader().setDataType(THREE.FloatType);
    // 画像の幅・高さ・ピクセル（RGBA の順。1 行目が真上）。ArrayBuffer の該当部分だけを渡す
    const { width, height, data } = loader.parse(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    );
    // 型の上では幅・高さ・ピクセルは省略できるので、実行時に確かめて絞る（半精度の Uint16Array などを黙って読まないように）
    if (!width || !height || !(data instanceof Float32Array)) {
      // 読めなかったときは、何が足りないかを知らせて止める
      throw new Error("studio.hdr を 32 ビットの浮動小数のピクセルとして読めなかった");
    }
    // Assert: ピクセルは RGBA の 4 つずつ（下の位置の計算の前提）
    expect(data.length).toBe(width * height * 4);
    // Act: 下半分（水平より下の向き）の各ピクセルの明るさ（輝度）
    const luminances = new Float32Array((height - Math.floor(height / 2)) * width);
    // 書き込む位置
    let count = 0;
    // 下半分の行
    for (let y = Math.floor(height / 2); y < height; y++) {
      // 1 行の各ピクセル
      for (let x = 0; x < width; x++) {
        // そのピクセルの先頭の位置（RGBA の 4 つずつ）
        const i = (y * width + x) * 4;
        // 人の目の感じ方に合わせた重み（Rec. 709）で輝度にする
        luminances[count++] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      }
    }
    // 小さい順に並べる（Float32Array の sort は数の順）
    luminances.sort();
    // Assert: 真ん中の値が、白い床と壁の明るさ（露出 2 倍でほぼ白く写る 0.5 前後）
    expect(luminances[Math.floor(count / 2)]).toBeGreaterThanOrEqual(0.3);
    // Assert: 下から 10% の値も同じ下限以上（床の一部だけが暗い帯になっても見逃さない）
    expect(luminances[Math.floor(count / 10)]).toBeGreaterThanOrEqual(0.3);
  });
});
