import { describe, expect, test } from "vitest";
import { canDrawAntialias, matchesDrawingBuffer, supportsSmaa } from "@/lib/screenAntialias";

// 写し取り用の画像（FramebufferTexture）を、今の描画の大きさのまま使えるか（大きさが変わったら作り直す）
describe("matchesDrawingBuffer", () => {
  // まだ作っていないときは、作る必要がある
  test("画像がまだ無ければ false", () => {
    // Assert: 使えない
    expect(matchesDrawingBuffer(null, 780, 1688)).toBe(false);
  });

  // 幅と高さが同じなら、そのまま使い回す
  test("幅と高さが同じなら true", () => {
    // Arrange: 780 × 1688 の画像
    const texture = { image: { width: 780, height: 1688 } };
    // Assert: 使える
    expect(matchesDrawingBuffer(texture, 780, 1688)).toBe(true);
  });

  // 画面を回したとき（幅が変わる）や、解像度の倍率を下げたとき（両方変わる）は作り直す
  test.each([
    // 幅だけ違う
    [1688, 1688],
    // 高さだけ違う
    [780, 780],
    // 幅と高さが入れ替わった（画面を横に回した）
    [1688, 780],
    // 両方違う（倍率を 2 から 1.25 へ下げた）
    [487, 1055],
  ])("%d × %d になったら false", (width, height) => {
    // Arrange: 780 × 1688 の画像
    const texture = { image: { width: 780, height: 1688 } };
    // Assert: 使えない
    expect(matchesDrawingBuffer(texture, width, height)).toBe(false);
  });
});

// SMAA の途中の画像（半精度の浮動小数点）に描ける端末か。描けない端末で SMAA をかけると、画面が真っ黒になる
describe("supportsSmaa", () => {
  // 半精度か 32 ビットの浮動小数点の画像へ描く拡張機能のどちらかがあればよい
  test.each([
    // 半精度だけ
    [["EXT_color_buffer_half_float"], true],
    // 32 ビットだけ（WebGL2 では、これで半精度にも描ける）
    [["EXT_color_buffer_float"], true],
    // 両方
    [["EXT_color_buffer_half_float", "EXT_color_buffer_float"], true],
    // どちらも無い
    [["OES_texture_float_linear"], false],
    // 何も無い
    [[], false],
  ])("拡張機能 %j なら %s", (names, expected) => {
    // Arrange: 持っている拡張機能だけを「ある」と答える問い合わせ
    const has = (name: string) => names.includes(name);
    // Assert: 使えるか
    expect(supportsSmaa(has)).toBe(expected);
  });
});

// 描画の大きさが 0（キャンバスが隠れた・つぶれた）なら、SMAA をかけない（0 × 0 の画像は作れず、GL のエラーになる）
describe("canDrawAntialias", () => {
  // ふつうの大きさなら、かけられる
  test("780 × 1688 なら true", () => {
    // Assert: かけられる
    expect(canDrawAntialias(780, 1688)).toBe(true);
  });

  // 幅か高さのどちらかが 0 なら、かけない
  test.each([
    // 幅が 0
    [0, 1688],
    // 高さが 0
    [780, 0],
    // 両方 0
    [0, 0],
  ])("%d × %d なら false", (width, height) => {
    // Assert: かけない
    expect(canDrawAntialias(width, height)).toBe(false);
  });
});
