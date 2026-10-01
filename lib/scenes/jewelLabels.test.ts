import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { BIRTHSTONE_IDS, BIRTHSTONES } from "@/lib/birthstones";
import {
  LABEL_OFFSET_MM,
  labelAnchor,
  labelSide,
  projectToScreen,
  type ScreenPoint,
} from "@/lib/scenes/jewelLabels";
import {
  applyViewShift,
  fitFov,
  OVERVIEW_POSE,
  RING_RADIUS_MM,
  ringPosition,
  type StonePlacement,
} from "@/lib/scenes/jewels";

// labelAnchor: 月のラベルを浮かべる 3D の位置
describe("labelAnchor", () => {
  // placement: テスト用の置き方（床からの持ち上げ 1 mm、中心の高さ 3 mm、包む球の半径 4 mm）
  const placement: StonePlacement = { baseY: 1, centerY: 3, radius: 4 };

  // 3 月（3 時 = 右）の石の外側
  test("3 月のラベルは、石より右の外側で、石の中心と同じ高さ", () => {
    // Act: 3 月のラベルの位置
    const [x, y, z] = labelAnchor(3, placement);
    // Assert: 文字盤の半径 + 離す距離だけ右
    expect(x).toBeCloseTo(RING_RADIUS_MM + LABEL_OFFSET_MM, 10);
    // Assert: 石の中心の高さ
    expect(y).toBe(3);
    // Assert: 奥行きは真ん中
    expect(z).toBeCloseTo(0, 10);
  });

  // どの月も、石から外向きに同じ距離だけ離れる（ラベルと石の並びがずれない）
  test.each(BIRTHSTONE_IDS.map((_, index) => index + 1))(
    "%i 月のラベルは、石から外向きに LABEL_OFFSET_MM だけ離れる",
    (month) => {
      // Act: ラベルの位置
      const [x, , z] = labelAnchor(month, placement);
      // 石の床の上の位置
      const [stoneX, , stoneZ] = ringPosition(month);
      // Assert: 石からの距離
      expect(Math.hypot(x - stoneX, z - stoneZ)).toBeCloseTo(LABEL_OFFSET_MM, 10);
      // Assert: 文字盤の中心からの距離（外向きに離れている）
      expect(Math.hypot(x, z)).toBeCloseTo(RING_RADIUS_MM + LABEL_OFFSET_MM, 10);
    },
  );

  // スマホ向けの配置や縦長・正方形の窓では、外側だと端のラベルが画面から切れるので、内側（時計の数字の位置）に置く
  test.each(BIRTHSTONE_IDS.map((_, index) => index + 1))(
    "内側（side = -1）なら、%i 月のラベルは石から中心向きに LABEL_OFFSET_MM だけ離れる",
    (month) => {
      // Act: 内側のラベルの位置
      const [x, y, z] = labelAnchor(month, placement, -1);
      // 石の床の上の位置
      const [stoneX, , stoneZ] = ringPosition(month);
      // Assert: 石からの距離
      expect(Math.hypot(x - stoneX, z - stoneZ)).toBeCloseTo(LABEL_OFFSET_MM, 10);
      // Assert: 文字盤の中心からの距離（内向きに寄っている）
      expect(Math.hypot(x, z)).toBeCloseTo(RING_RADIUS_MM - LABEL_OFFSET_MM, 10);
      // Assert: 高さは石の中心のまま
      expect(y).toBe(3);
    },
  );
});

// labelSide: 月のラベルを石の外側と内側のどちらに置くか
describe("labelSide", () => {
  // パソコン向けの配置の横長の画面は外側、スマホ向けの配置（縦持ち・横持ち）と縦長・正方形に近い窓は内側
  test.each<[number, number, 1 | -1, string]>([
    // [幅, 高さ, 期待, 説明]
    [1600, 900, 1, "パソコン"],
    [1024, 768, 1, "タブレットの横持ち"],
    [390, 844, -1, "スマホの縦持ち"],
    [844, 390, -1, "スマホの横持ち"],
    [768, 1024, -1, "タブレットの縦持ち（パソコン向けの配置だが縦長）"],
    [800, 800, -1, "正方形の窓（パソコン向けの配置だが横に余裕がない）"],
    [960, 800, 1, "縦横比がちょうど 1.2（外側にしてよい下限）"],
    [959, 800, -1, "縦横比が 1.2 をわずかに下回る"],
    [700, 500, -1, "幅が 768px 未満の横長の窓（スマホ向けの配置）"],
    [0, 0, -1, "大きさが 0（描き始めの一瞬）"],
    [Number.NaN, 800, -1, "幅が NaN"],
  ])("%i × %i は %i（%s）", (width, height, expected) => {
    // Act / Assert: 期待する向き
    expect(labelSide(width, height)).toBe(expected);
  });

  // 実際の全体のカメラ（OVERVIEW_POSE と fitFov の画角）で写すと、どの大きさの画面でも 12 個のラベルが画面の中に収まる。
  // カメラの位置・画角・ラベルの距離・切り替えの条件のどれかを変えて、端のラベルが画面から切れたらここで落ちる
  test.each([
    [390, 844],
    [320, 568],
    [375, 667],
    [667, 375],
    [568, 320],
    [844, 390],
    [932, 430],
    [1024, 768],
    [1600, 900],
    [320, 256],
    [320, 180],
    [768, 1024],
    [820, 1180],
    [800, 800],
    [960, 800],
    [1280, 1024],
  ])("%i × %i の全体の構図で、12 個のラベルが画面の端から切れずに写る", (width, height) => {
    // Arrange: 全体を見るカメラ（JewelsScene と同じ置き方）
    const camera = new THREE.PerspectiveCamera(fitFov(width / height), width / height, 0.5, 2000);
    // 位置
    camera.position.set(...OVERVIEW_POSE.position);
    // 注視点
    camera.lookAt(...OVERVIEW_POSE.target);
    // 行列を最新にする
    camera.updateMatrixWorld();
    // 置き方（中心の高さ 3 mm。実際の石はおよそ 2〜5 mm）
    const placement: StonePlacement = { baseY: 0.8, centerY: 3, radius: 4 };
    // 結果の入れ物
    const out: ScreenPoint = { x: 0, y: 0, isVisible: false };
    // Act / Assert: 12 か月ぶん
    for (const month of BIRTHSTONE_IDS.map((_, index) => index + 1)) {
      // この画面での向きに置いたラベルを写す
      projectToScreen(
        labelAnchor(month, placement, labelSide(width, height)),
        camera,
        width,
        height,
        out,
      );
      // 見える
      expect(out.isVisible, `${month} 月`).toBe(true);
      // 左右の端からの余白。外側のラベル（幅 約 54px）は 32px 以上、内側のラベルは 24px 以上（スマホ向けの配置の幅 約 36px（幅か高さが 360px 未満では 約 28px）の半分 + 数 px。パソコン向けの配置で内側になる窓は石が大きく写り、余白に余裕がある）
      const margin = labelSide(width, height) === 1 ? 32 : 24;
      // 左右の端から余白以上
      expect(Math.min(out.x, width - out.x), `${month} 月の左右`).toBeGreaterThanOrEqual(margin);
      // 上下の端から 24px 以上（ラベルの高さの半分 約 14px が入る）
      expect(Math.min(out.y, height - out.y), `${month} 月の上下`).toBeGreaterThanOrEqual(24);
    }
  });
});

// projectToScreen: 3D の点を画面の座標（CSS の px）に直す
describe("projectToScreen", () => {
  // makeCamera: 手前 100 mm から原点を正面に見るカメラ（縦の画角 40°、画面 800 × 600）
  function makeCamera(): THREE.PerspectiveCamera {
    // 本物のカメラで投影を確かめる
    const camera = new THREE.PerspectiveCamera(40, 800 / 600, 0.5, 2000);
    // 手前に置く
    camera.position.set(0, 0, 100);
    // 原点を見る
    camera.lookAt(0, 0, 0);
    // 行列を最新にする（呼び出し側の責任）
    camera.updateMatrixWorld();
    // できたカメラを返す
    return camera;
  }
  // newPoint: 結果の入れ物。見えるはずの場面は「見えない」から、見えないはずの場面は「見える」から始める
  // （入れ物は毎フレーム使い回すので、前のフレームの値が残ったままだと、隠すべきラベルが古い位置に見え続ける。その取り違えを拾う）
  const newPoint = (isVisible = false): ScreenPoint => ({ x: 0, y: 0, isVisible });

  // 正面の点は画面の真ん中
  test("カメラの正面の点は、画面の真ん中に写る", () => {
    // Act: 原点を写す
    const out = projectToScreen([0, 0, 0], makeCamera(), 800, 600, newPoint());
    // Assert: 見える
    expect(out.isVisible).toBe(true);
    // Assert: 左右の真ん中
    expect(out.x).toBeCloseTo(400, 6);
    // Assert: 上下の真ん中
    expect(out.y).toBeCloseTo(300, 6);
  });

  // 画面の上の端にちょうど写る高さ（100 mm × tan 20°）の点は、y = 0 に来る（上下の向きと大きさの取り違えを拾う）
  test("画角の上の端の点は、画面の上の端（y = 0）に写る", () => {
    // Arrange: 上の端の高さ
    const top = 100 * Math.tan(THREE.MathUtils.degToRad(20));
    // Act: 写す
    const out = projectToScreen([0, top, 0], makeCamera(), 800, 600, newPoint());
    // Assert: 上の端
    expect(out.y).toBeCloseTo(0, 4);
    // Act: 端の 1% 内側の点（端ちょうどは、浮動小数の誤差で 1 をわずかに超えることがあるので使わない）
    const inside = projectToScreen([0, top * 0.99, 0], makeCamera(), 800, 600, newPoint());
    // Assert: 画面の中なので見える
    expect(inside.isVisible).toBe(true);
  });

  // 左右の向き（右の点は右に、左の点は左に写る）。真ん中と上の端だけでは、左右が裏返っていても通ってしまうため
  test("右の点は画面の右半分に、左の点は左半分に写る", () => {
    // Act: 右へ 10 mm の点
    const right = projectToScreen([10, 0, 0], makeCamera(), 800, 600, newPoint());
    // Act: 左へ 10 mm の点
    const left = projectToScreen([-10, 0, 0], makeCamera(), 800, 600, newPoint());
    // Assert: 右の点は真ん中より右
    expect(right.x).toBeGreaterThan(400);
    // Assert: 左の点は真ん中より左
    expect(left.x).toBeLessThan(400);
  });

  // 同じ入れ物を使い回して、見えていた点が見えなくなったら、見えないに書き換わる（毎フレームの使い方と同じ）
  test("見えていた入れ物を使い回しても、カメラの後ろの点では見えないに書き換わる", () => {
    // Arrange: 一度、見える点で書き込んだ入れ物
    const out = projectToScreen([0, 0, 0], makeCamera(), 800, 600, newPoint());
    // Act: 同じ入れ物で、カメラの後ろの点を写す
    projectToScreen([0, 0, 200], makeCamera(), 800, 600, out);
    // Assert: 見えない
    expect(out.isVisible).toBe(false);
  });

  // カメラの後ろの点は、投影すると裏返って画面の中に来てしまうので、見えないことにする
  test("カメラの後ろの点は見えない", () => {
    // Act / Assert: カメラ（z = 100）より後ろ
    expect(projectToScreen([0, 0, 200], makeCamera(), 800, 600, newPoint(true)).isVisible).toBe(
      false,
    );
  });

  // 上下左右の端のすぐ外（1%）は見えない。判定の範囲が広すぎたり、上下の判定が抜けたりするのを拾う
  test("上下左右の端の 1% 外側の点は見えない", () => {
    // Arrange: 上の端の高さと、左右の端の距離（100 mm 先で、縦の半分は tan 20°、横の半分はその 800/600 倍）
    const top = 100 * Math.tan(THREE.MathUtils.degToRad(20));
    // 左右の端
    const side = top * (800 / 600);
    // Act / Assert: 上
    expect(
      projectToScreen([0, top * 1.01, 0], makeCamera(), 800, 600, newPoint(true)).isVisible,
    ).toBe(false);
    // 下
    expect(
      projectToScreen([0, -top * 1.01, 0], makeCamera(), 800, 600, newPoint(true)).isVisible,
    ).toBe(false);
    // 右
    expect(
      projectToScreen([side * 1.01, 0, 0], makeCamera(), 800, 600, newPoint(true)).isVisible,
    ).toBe(false);
    // 左
    expect(
      projectToScreen([-side * 1.01, 0, 0], makeCamera(), 800, 600, newPoint(true)).isVisible,
    ).toBe(false);
  });

  // 画面の外に大きく外れた点
  test("画面の外の点は見えない", () => {
    // Act / Assert: 右へ 1000 mm（画面の横の端は 約 48.5 mm）
    expect(projectToScreen([1000, 0, 0], makeCamera(), 800, 600, newPoint(true)).isVisible).toBe(
      false,
    );
  });

  // 毎フレームの割り当てを避けるため、渡した入れ物に書き込む
  test("結果は渡した入れ物に書き込み、同じオブジェクトを返す", () => {
    // Arrange: 入れ物
    const out = newPoint();
    // Act / Assert: 同じもの
    expect(projectToScreen([0, 0, 0], makeCamera(), 800, 600, out)).toBe(out);
  });

  // 描き始めの一瞬など、壊れた大きさでは写せない
  test.each([
    [0, 600],
    [800, 0],
    [Number.NaN, 600],
    [800, Number.POSITIVE_INFINITY],
  ])("画面の大きさが %s × %s なら見えない", (width, height) => {
    // Act / Assert: 見えない
    expect(projectToScreen([0, 0, 0], makeCamera(), width, height, newPoint(true)).isVisible).toBe(
      false,
    );
  });

  // 壊れた点（NaN）を画面の中に置かない
  test("点が NaN なら見えない", () => {
    // Act / Assert: 見えない
    expect(
      projectToScreen([Number.NaN, 0, 0], makeCamera(), 800, 600, newPoint(true)).isVisible,
    ).toBe(false);
  });
});

// LABEL_OFFSET_MM: ラベルを石の中心から離す距離
describe("LABEL_OFFSET_MM", () => {
  // 石の半分より近いと、ラベルが石の上に重なる（石の追加やデータの変更で大きい石が増えたときに、ここで気づける）
  test("いちばん大きい石の長さの半分より大きい", () => {
    // Arrange: いちばん大きい石の長さ（mm）
    const largest = Math.max(...BIRTHSTONES.map((stone) => stone.sizeMm));
    // Assert: 半分より大きい
    expect(LABEL_OFFSET_MM).toBeGreaterThan(largest / 2);
  });
});

// 描く範囲のずらし（レンズシフト）と投影の組み合わせ: ずらしが残っているフレームでも、ラベルは石と同じだけ上へ動く
describe("projectToScreen と applyViewShift", () => {
  // 解説カードを閉じた直後は、ずらしが 0 へ戻る途中でラベルが見える。ずらしを反映した行列で投影しないと、ラベルが石からずれる
  test("194 px ずらしたカメラでは、正面の点は画面の真ん中より 194 px 上に写る", () => {
    // Arrange: 390 × 844 の画面で原点を見るカメラ
    const camera = new THREE.PerspectiveCamera(40, 390 / 844, 0.5, 2000);
    // 手前に置く
    camera.position.set(0, 0, 100);
    // 原点を見る
    camera.lookAt(0, 0, 0);
    // 行列を最新にする
    camera.updateMatrixWorld();
    // 描く範囲を 194 px ずらす（SHEET_VIEW_SHIFT 0.23 × 844）
    applyViewShift(camera, 194, 390, 844);
    // Act: 原点を写す
    const out = projectToScreen([0, 0, 0], camera, 390, 844, { x: 0, y: 0, isVisible: false });
    // Assert: 真ん中（422 px）より 194 px 上
    expect(out.y).toBeCloseTo(422 - 194, 4);
  });
});
