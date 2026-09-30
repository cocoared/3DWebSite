import { describe, expect, test, vi } from "vitest";
import { createReducedMotionStore } from "@/lib/usePrefersReducedMotion";

// fakeQuery: 偽物の MediaQueryList（テストは Node.js 上で動き、本物の window.matchMedia が無いため）。
// 設定の値（matches）と、変化を知らせる関数の登録・解除だけを持ち、呼ばれ方を記録する
function fakeQuery(matches: boolean) {
  // 使う部分だけを持つオブジェクト
  return {
    // 設定が有効か
    matches,
    // 変化を知らせる関数の登録（呼ばれ方を記録する）
    addEventListener: vi.fn(),
    // 登録の解除（呼ばれ方を記録する）
    removeEventListener: vi.fn(),
  };
}

// createReducedMotionStore: OS の「動きを減らす」設定を読む関数の組（useSyncExternalStore に渡すもの）を作る
describe("createReducedMotionStore", () => {
  // 古いブラウザなど、matchMedia が無い環境
  test("matchMedia が無い環境では、動きを減らさない（false）とみなし、購読しても何もしない", () => {
    // Arrange: matchMedia が無い
    const store = createReducedMotionStore(undefined);
    // Act: 購読する
    const unsubscribe = store.subscribe(() => {});
    // Assert: 動きを減らさない
    expect(store.getSnapshot()).toBe(false);
    // Assert: 後始末の関数も呼べる
    expect(() => unsubscribe()).not.toThrow();
  });

  // 設定の値をそのまま返す
  test.each([true, false])("設定が %s なら getSnapshot も同じ値を返す", (matches) => {
    // Arrange: その設定の偽物
    const store = createReducedMotionStore(() => fakeQuery(matches));
    // Act / Assert: 同じ値
    expect(store.getSnapshot()).toBe(matches);
  });

  // getSnapshot は再レンダーのたびに呼ばれるので、メディアクエリを毎回作らない
  test("prefers-reduced-motion のメディアクエリは 1 回だけ作って使い回す", () => {
    // Arrange: 呼ばれ方を記録する matchMedia
    const matchMedia = vi.fn(() => fakeQuery(true));
    // Arrange: 関数の組を作る
    const store = createReducedMotionStore(matchMedia);
    // Act: 何度も読み、購読もする
    store.getSnapshot();
    // 2 回目
    store.getSnapshot();
    // 購読
    store.subscribe(() => {});
    // Assert: matchMedia は 1 回だけ
    expect(matchMedia).toHaveBeenCalledTimes(1);
    // Assert: 「動きを減らす」設定を調べるメディアクエリ
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  // 設定が切り替わったら知らせ、後始末で知らせるのをやめる（登録したままだと、画面を離れたあとも呼ばれ続ける）
  test("購読は change に登録し、後始末で同じ関数の登録を外す", () => {
    // Arrange: 偽物のメディアクエリ
    const query = fakeQuery(false);
    // Arrange: 関数の組
    const store = createReducedMotionStore(() => query);
    // Arrange: 知らせを受け取る関数
    const onChange = vi.fn();
    // Act: 購読する
    const unsubscribe = store.subscribe(onChange);
    // Assert: change に登録された
    expect(query.addEventListener).toHaveBeenCalledWith("change", onChange);
    // Act: 後始末
    unsubscribe();
    // Assert: 同じ関数の登録が外された
    expect(query.removeEventListener).toHaveBeenCalledWith("change", onChange);
  });
});
