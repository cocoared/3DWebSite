import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { BIRTHSTONES } from "@/lib/birthstones";
import {
  advanceSpotlight,
  BEAM_BOTTOM_RADIUS_MM,
  BEAM_OPACITY,
  BEAM_VISIBLE_LEVEL,
  createBeamMaterial,
  createPoolMaterial,
  createSpotlightState,
  POOL_OPACITY,
  POOL_RADIUS_MM,
  SPOTLIGHT_ANGLE_RAD,
  SPOTLIGHT_COLOR,
  SPOTLIGHT_HEIGHT_MM,
  SPOTLIGHT_SNAP_LEVEL,
  setGlowStrength,
  spotlightAim,
} from "@/lib/scenes/jewelSpotlight";
import { CAMERA_SMOOTH_TIME, RING_RADIUS_MM, ringPosition } from "@/lib/scenes/jewels";

// spotlightAim: 選んだ石の真上に光源を置き、真下の床へ向ける
describe("spotlightAim", () => {
  // 12 か月とも、石の真上から真下を照らす
  test.each(BIRTHSTONES.map((stone) => [stone.month]))(
    "%i 月の石の真上の高さ SPOTLIGHT_HEIGHT_MM に光源を置き、真下の床へ向ける",
    (month) => {
      // Arrange: 石の床の上の位置
      const [x, , z] = ringPosition(month);
      // Act: 置き方を求める
      const aim = spotlightAim(month);
      // Assert: 光源は石の真上
      expect(aim.position).toEqual([x, SPOTLIGHT_HEIGHT_MM, z]);
      // Assert: 向ける先は石の真下の床
      expect(aim.target).toEqual([x, 0, z]);
    },
  );
});

// createSpotlightState / advanceSpotlight: 点く・消える・次の石へ移る
describe("advanceSpotlight", () => {
  // 最初は消えている
  test("createSpotlightState は明るさ 0 で作る", () => {
    // Assert: 消えている
    expect(createSpotlightState().level).toBe(0);
  });

  // 消えている状態から点くときは、前の石から滑らせずに、新しい石の上へすぐ移す
  test("消えている状態で石を選ぶと、光源と向ける先がすぐその石の上・下へ移る", () => {
    // Arrange: 消えた状態（前は 1 月の石の上にあったことにする）
    const state = createSpotlightState();
    // Arrange: 前の位置
    state.position.set(...spotlightAim(1).position);
    // Act: 7 月を選んで 1 フレーム進める
    advanceSpotlight(state, spotlightAim(7), 1 / 60);
    // Assert: 光源は 7 月の石の上
    expect(state.position.toArray()).toEqual([...spotlightAim(7).position]);
    // Assert: 向ける先は 7 月の石の下
    expect(state.target.toArray()).toEqual([...spotlightAim(7).target]);
    // Assert: 少し明るくなる（いきなり 1 にはしない）
    expect(state.level).toBeGreaterThan(0);
    // Assert: まだ 1 より小さい
    expect(state.level).toBeLessThan(1);
  });

  // 点いている状態で別の石を選ぶと、光源は滑るように移る（位置と向ける先は同じ割合で動く）
  test("点いている状態で別の石を選ぶと、光源と向ける先が同じ割合で少しずつ移る", () => {
    // Arrange: 1 月の石の上で点いている
    const state = createSpotlightState();
    // Arrange: 明るさ 1
    state.level = 1;
    // Arrange: 1 月の石の上
    state.position.set(...spotlightAim(1).position);
    // Arrange: 1 月の石の下
    state.target.set(...spotlightAim(1).target);
    // Act: 2 月へ 1 フレーム進める
    advanceSpotlight(state, spotlightAim(2), 1 / 60);
    // Arrange: 1 月の位置
    const [x1, , z1] = ringPosition(1);
    // Arrange: 2 月の位置
    const [x2, , z2] = ringPosition(2);
    // Arrange: 光源の進み具合（0〜1。x で測る）
    const positionRatio = (state.position.x - x1) / (x2 - x1);
    // Arrange: 光源の進み具合（z で測る。x と同じ割合でなければ、斜めにずれて動いている）
    const positionRatioZ = (state.position.z - z1) / (z2 - z1);
    // Arrange: 向ける先の進み具合（0〜1）
    const targetRatio = (state.target.x - x1) / (x2 - x1);
    // Assert: 途中まで進む
    expect(positionRatio).toBeGreaterThan(0);
    // Assert: まだ着かない
    expect(positionRatio).toBeLessThan(1);
    // Assert: 光源と向ける先は同じ割合（光が斜めに傾かない）
    expect(targetRatio).toBeCloseTo(positionRatio, 10);
    // Assert: x と z も同じ割合（2 つの石を結ぶまっすぐな線の上を動く）
    expect(positionRatioZ).toBeCloseTo(positionRatio, 10);
    // Assert: 高さは光源の高さのまま
    expect(state.position.y).toBeCloseTo(SPOTLIGHT_HEIGHT_MM, 10);
  });

  // 消えかけ（SPOTLIGHT_SNAP_LEVEL 未満）なら、点いていないものとして新しい石へすぐ移す
  test("明るさが SPOTLIGHT_SNAP_LEVEL 未満なら、新しい石へすぐ移り、以上なら滑る", () => {
    // Arrange: 境目のすぐ下
    const below = createSpotlightState();
    // Arrange: 消えかけの明るさ
    below.level = SPOTLIGHT_SNAP_LEVEL - 0.001;
    // Arrange: 境目ちょうど
    const at = createSpotlightState();
    // Arrange: 境目の明るさ
    at.level = SPOTLIGHT_SNAP_LEVEL;
    // Act: どちらも 3 月へ 1 フレーム進める
    advanceSpotlight(below, spotlightAim(3), 1 / 60);
    // Act: 境目ちょうど
    advanceSpotlight(at, spotlightAim(3), 1 / 60);
    // Assert: 境目の下はすぐ着く
    expect(below.position.x).toBe(spotlightAim(3).position[0]);
    // Assert: 境目ちょうどは、まだ着かない（滑る）
    expect(at.position.x).toBeLessThan(spotlightAim(3).position[0]);
  });

  // 選択を外すと、その場で暗くなる（位置は動かない）
  test("石を選んでいなければ、位置はそのままで明るさだけ下がる", () => {
    // Arrange: 5 月の石の上で点いている
    const state = createSpotlightState();
    // Arrange: 明るさ 1
    state.level = 1;
    // Arrange: 5 月の石の上
    state.position.set(...spotlightAim(5).position);
    // Act: 選択なしで 1 フレーム
    advanceSpotlight(state, null, 1 / 60);
    // Assert: 暗くなる
    expect(state.level).toBeLessThan(1);
    // Assert: 位置は動かない
    expect(state.position.toArray()).toEqual([...spotlightAim(5).position]);
  });

  // カメラが石へ寄りきる頃には、ほぼ点ききっている
  test("CAMERA_SMOOTH_TIME 経つと、明るさが 0.95 を超える", () => {
    // Arrange: 消えた状態
    const state = createSpotlightState();
    // Act: カメラの移動の時間ぶん、1/60 秒ずつ進める
    for (let t = 0; t < CAMERA_SMOOTH_TIME; t += 1 / 60)
      advanceSpotlight(state, spotlightAim(4), 1 / 60);
    // Assert: ほぼ点いている
    expect(state.level).toBeGreaterThan(0.95);
  });

  // 動きを減らす設定では、経過秒数に Infinity を渡して、その場で点ける・移す
  test("経過秒数が Infinity なら、その場で目標の明るさと位置になる", () => {
    // Arrange: 6 月の石の上で点いている
    const state = createSpotlightState();
    // Arrange: 明るさ 1
    state.level = 1;
    // Arrange: 6 月の石の上
    state.position.set(...spotlightAim(6).position);
    // Act: 8 月へ一度に
    advanceSpotlight(state, spotlightAim(8), Number.POSITIVE_INFINITY);
    // Assert: 8 月の石の上
    expect(state.position.toArray()).toEqual([...spotlightAim(8).position]);
    // Assert: 明るさ 1
    expect(state.level).toBe(1);
  });

  // 動きを減らす設定で選択を外したら、その場で消える（位置は動かない）
  test("経過秒数が Infinity で石を選んでいなければ、その場で明るさ 0 になる", () => {
    // Arrange: 5 月の石の上で点いている
    const state = createSpotlightState();
    // Arrange: 明るさ 1
    state.level = 1;
    // Arrange: 5 月の石の上
    state.position.set(...spotlightAim(5).position);
    // Act: 選択なしで一度に
    advanceSpotlight(state, null, Number.POSITIVE_INFINITY);
    // Assert: 消えた
    expect(state.level).toBe(0);
    // Assert: 位置は動かない
    expect(state.position.toArray()).toEqual([...spotlightAim(5).position]);
  });

  // 動きを減らす設定で、消えた状態から石を選んだら、その場で点いて、その石の上・下にいる
  test("経過秒数が Infinity なら、消えた状態からその場で点き、光源と向ける先が石の上・下になる", () => {
    // Arrange: 消えた状態
    const state = createSpotlightState();
    // Act: 10 月を一度に
    advanceSpotlight(state, spotlightAim(10), Number.POSITIVE_INFINITY);
    // Assert: 点いた
    expect(state.level).toBe(1);
    // Assert: 光源
    expect(state.position.toArray()).toEqual([...spotlightAim(10).position]);
    // Assert: 向ける先
    expect(state.target.toArray()).toEqual([...spotlightAim(10).target]);
  });

  // 次の石へ滑っている途中で選択を外すと、途中の位置のまま消えていく
  test("滑っている途中で選択を外すと、光源も向ける先もその場に止まる", () => {
    // Arrange: 1 月で点いている
    const state = createSpotlightState();
    // Arrange: 1 月を選んで、点ききるまで進める
    for (let i = 0; i < 120; i++) advanceSpotlight(state, spotlightAim(1), 1 / 60);
    // Arrange: 2 月へ 5 フレームだけ滑らせる
    for (let i = 0; i < 5; i++) advanceSpotlight(state, spotlightAim(2), 1 / 60);
    // Arrange: 途中の位置を控える
    const position = state.position.toArray();
    // Arrange: 途中の向ける先を控える
    const target = state.target.toArray();
    // Act: 選択を外して 1 フレーム
    advanceSpotlight(state, null, 1 / 60);
    // Assert: 光源はその場
    expect(state.position.toArray()).toEqual(position);
    // Assert: 向ける先もその場
    expect(state.target.toArray()).toEqual(target);
  });

  // 消えかけのうちに別の石を選び直すと、前の位置から滑り、消えきってから選ぶと、すぐ移る
  test("選択を外してすぐ選び直すと滑り、消えきってから選ぶとすぐ移る", () => {
    // Arrange: 3 月で点ききった状態を 2 つ作る
    const early = createSpotlightState();
    // Arrange: 1 つ目
    for (let i = 0; i < 120; i++) advanceSpotlight(early, spotlightAim(3), 1 / 60);
    // Arrange: 2 つ目
    const late = createSpotlightState();
    // Arrange: 2 つ目も点ききらせる
    for (let i = 0; i < 120; i++) advanceSpotlight(late, spotlightAim(3), 1 / 60);
    // Arrange: 1 つ目は 0.1 秒だけ消していく（まだ明るい）
    for (let i = 0; i < 6; i++) advanceSpotlight(early, null, 1 / 60);
    // Arrange: 2 つ目は 2 秒消していく（消えきる）
    for (let i = 0; i < 120; i++) advanceSpotlight(late, null, 1 / 60);
    // Act: どちらも 9 月を選んで 1 フレーム
    advanceSpotlight(early, spotlightAim(9), 1 / 60);
    // Act: 消えきったほう
    advanceSpotlight(late, spotlightAim(9), 1 / 60);
    // Assert: すぐ選び直したほうは、まだ 9 月の石の上に着いていない（滑っている）
    expect(early.position.x).not.toBeCloseTo(spotlightAim(9).position[0], 3);
    // Assert: 消えきってから選んだほうは、すぐ 9 月の石の上
    expect(late.position.toArray()).toEqual([...spotlightAim(9).position]);
  });

  // 明るさが壊れていたら（NaN）、消えているものとして立て直す（NaN のままだと光の筋がずっと出なくなる）
  test("明るさが NaN なら、消えているものとして新しい石へすぐ移り、明るさが数に戻る", () => {
    // Arrange: 壊れた明るさ
    const state = createSpotlightState();
    // Arrange: NaN
    state.level = Number.NaN;
    // Act: 11 月を選んで 1 フレーム
    advanceSpotlight(state, spotlightAim(11), 1 / 60);
    // Assert: 明るさが数に戻る
    expect(Number.isFinite(state.level)).toBe(true);
    // Assert: すぐ 11 月の石の上
    expect(state.position.toArray()).toEqual([...spotlightAim(11).position]);
  });

  // 壊れた経過秒数では何もしない（NaN が入ると明るさと位置がずっと NaN のまま戻らない）
  test.each([[0], [Number.NaN], [-1]])("経過秒数 %d では明るさも位置も変えない", (delta) => {
    // Arrange: 消えた状態
    const state = createSpotlightState();
    // Act: 9 月を選んで進めようとする
    advanceSpotlight(state, spotlightAim(9), delta);
    // Assert: 明るさは 0 のまま（0 秒では、すぐ移すのも明るくするのも起きない）
    expect(state.level).toBe(0);
    // Assert: 位置も原点のまま
    expect(state.position.toArray()).toEqual([0, 0, 0]);
  });
});

// 光の筋と光だまりの大きさ: 選んだ石だけを照らし、隣の石にはかからない
describe("光の筋と光だまりの大きさ", () => {
  // 隣の石の中心どうしの距離（文字盤の弦の長さ）
  const neighborGap = 2 * RING_RADIUS_MM * Math.sin(Math.PI / 12);
  // いちばん大きい石の大きさ（mm）
  const largest = Math.max(...BIRTHSTONES.map((stone) => stone.sizeMm));

  // 筋の下端は、光の円すいが床に届く所の半径
  test("筋の下端の半径は、高さ × tan(広がりの角度)", () => {
    // Assert: 円すいの形と一致する
    expect(BEAM_BOTTOM_RADIUS_MM).toBeCloseTo(
      SPOTLIGHT_HEIGHT_MM * Math.tan(SPOTLIGHT_ANGLE_RAD),
      10,
    );
  });

  // 光だまりは石のまわりに見える（石より大きい）が、隣の石には届かない
  test("光だまりの半径は、いちばん大きい石の半分より大きく、隣の石との間隔の半分より小さい", () => {
    // Assert: 石より大きい
    expect(POOL_RADIUS_MM).toBeGreaterThan(largest / 2);
    // Assert: 隣の石にかからない
    expect(POOL_RADIUS_MM).toBeLessThan(neighborGap / 2);
  });

  // 筋も隣の石にかからない
  test("筋の下端の半径は、隣の石との間隔の半分より小さい", () => {
    // Assert: 隣の石にかからない
    expect(BEAM_BOTTOM_RADIUS_MM).toBeLessThan(neighborGap / 2);
  });

  // 消えかけ（SPOTLIGHT_SNAP_LEVEL 未満）のまま新しい石へすぐ移るとき、筋と光だまりはまだ描かれていることがあるが、
  // その濃さは 1% 未満なので、瞬間移動は目に見えない
  test("すぐ移るときの筋と光だまりの濃さは 1% 未満", () => {
    // Assert: 濃いほうでも 1% 未満
    expect(SPOTLIGHT_SNAP_LEVEL * Math.max(BEAM_OPACITY, POOL_OPACITY)).toBeLessThan(0.01);
  });

  // 描かなくなる明るさは、すぐ移る明るさより小さい（消えきる前に描くのをやめて、すぐ移る範囲を狭めない）
  test("BEAM_VISIBLE_LEVEL は SPOTLIGHT_SNAP_LEVEL より小さい", () => {
    // Assert: 大小
    expect(BEAM_VISIBLE_LEVEL).toBeLessThan(SPOTLIGHT_SNAP_LEVEL);
  });
});

// createBeamMaterial / createPoolMaterial / setGlowStrength: 白い背景の上でも見える、暖かい色を重ねて塗るマテリアル
describe("光の筋と光だまりのマテリアル", () => {
  // 白の上では光を足しても白のままなので、暖かい色をふつうに重ねて塗る（足し合わせない）
  test.each([
    ["筋", createBeamMaterial],
    ["光だまり", createPoolMaterial],
  ])("%s は半透明・ふつうの重ね塗り・奥行きを書き込まない・トーンマッピングしない", (_, create) => {
    // Act: 作る
    const material = create();
    // Assert: 半透明
    expect(material.transparent).toBe(true);
    // Assert: ふつうの重ね塗り（足し合わせると白の上で見えない）
    expect(material.blending).toBe(THREE.NormalBlending);
    // Assert: 奥行きを書き込まない（向こうの石を隠さない）
    expect(material.depthWrite).toBe(false);
    // Assert: トーンマッピングしない（露出 2 倍で暖色が白に飛ばないように）
    expect(material.toneMapped).toBe(false);
    // Assert: 色は SPOTLIGHT_COLOR
    expect(material.uniforms.uColor.value.getHexString()).toBe(
      new THREE.Color(SPOTLIGHT_COLOR).getHexString(),
    );
    // Assert: 最初は見えない
    expect(material.uniforms.uOpacity.value).toBe(0);
    // 後始末
    material.dispose();
  });

  // 筋は内側の面も描き（厚みがあるように見せる）、光だまりは上から見る表の面だけ
  test("筋は両面、光だまりは表の面だけを描く", () => {
    // Act: 作る
    const beam = createBeamMaterial();
    // Act: 光だまり
    const pool = createPoolMaterial();
    // Assert: 筋は両面
    expect(beam.side).toBe(THREE.DoubleSide);
    // Assert: 光だまりは表だけ
    expect(pool.side).toBe(THREE.FrontSide);
    // 後始末
    beam.dispose();
    // 後始末
    pool.dispose();
  });

  // シェーダーの約束: uniform の名前と型、色空間の変換をすること、トーンマッピングをしないこと
  test.each([
    ["筋", createBeamMaterial],
    ["光だまり", createPoolMaterial],
  ])(
    "%s のシェーダーは uColor と uOpacity を受け取り、sRGB に直し、トーンマッピングはしない",
    (_, create) => {
      // Act: 作る
      const material = create();
      // Assert: 色の uniform
      expect(material.fragmentShader).toContain("uniform vec3 uColor;");
      // Assert: 濃さの uniform
      expect(material.fragmentShader).toContain("uniform float uOpacity;");
      // Assert: 出力の色空間に直す
      expect(material.fragmentShader).toContain("#include <colorspace_fragment>");
      // Assert: トーンマッピングしない（露出で暖色が白へ飛ばないように）
      expect(material.fragmentShader).not.toContain("tonemapping_fragment");
      // Assert: 読んでいる uv は頂点シェーダーが渡している
      expect(material.vertexShader).toContain("varying vec2 vUv;");
      // 後始末
      material.dispose();
    },
  );

  // 濃さは、スポットライトの明るさ × 点いているときの濃さ
  test.each([
    [0, 0],
    [0.5, 0.5],
    [1, 1],
  ])("setGlowStrength は明るさ %d で、最大の濃さの %d 倍にする", (level, ratio) => {
    // Arrange: 筋と光だまり
    const beam = createBeamMaterial();
    // Arrange: 光だまり
    const pool = createPoolMaterial();
    // Act: 明るさを当てはめる
    setGlowStrength(beam, level, BEAM_OPACITY);
    // Act: 光だまりにも
    setGlowStrength(pool, level, POOL_OPACITY);
    // Assert: 筋
    expect(beam.uniforms.uOpacity.value).toBeCloseTo(BEAM_OPACITY * ratio, 10);
    // Assert: 光だまり
    expect(pool.uniforms.uOpacity.value).toBeCloseTo(POOL_OPACITY * ratio, 10);
    // 後始末
    beam.dispose();
    // 後始末
    pool.dispose();
  });

  // 濃さは見える範囲（0 より大きく 1 以下）
  test("BEAM_OPACITY と POOL_OPACITY は 0 より大きく 1 以下", () => {
    // Assert: 筋
    expect(BEAM_OPACITY).toBeGreaterThan(0);
    // Assert: 筋の上限
    expect(BEAM_OPACITY).toBeLessThanOrEqual(1);
    // Assert: 光だまり
    expect(POOL_OPACITY).toBeGreaterThan(0);
    // Assert: 光だまりの上限
    expect(POOL_OPACITY).toBeLessThanOrEqual(1);
  });
});
