import { describe, expect, test } from "vitest";
import { get2dContext } from "@/lib/textures";

// get2dContext のテスト。
// テストは Node.js 上で動き本物の <canvas> が無いので、getContext だけを持つ偽物の canvas を渡して確かめる
describe("get2dContext", () => {
  // 2D コンテキストを取得できる環境では、それをそのまま返す
  test("取得できたコンテキストをそのまま返す", () => {
    // 本物の代わりに使う、目印だけのコンテキスト
    const fakeCtx = {} as CanvasRenderingContext2D;
    // getContext("2d") で上のコンテキストを返す偽物の canvas
    const canvas = { getContext: () => fakeCtx } as unknown as HTMLCanvasElement;

    // 同じオブジェクトが返ってくる
    expect(get2dContext(canvas)).toBe(fakeCtx);
  });

  // 取得できない環境では、null のまま返さず理由付きのエラーにする
  test("取得できない（null が返る）ときはエラーを投げる", () => {
    // getContext("2d") が null を返す偽物の canvas（2D 描画に対応していないブラウザを再現する）
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;

    // 理由がわかるメッセージのエラーになる
    expect(() => get2dContext(canvas)).toThrow("Canvas 2D コンテキストを取得できませんでした");
  });
});
