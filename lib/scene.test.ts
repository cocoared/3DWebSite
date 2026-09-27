import { describe, expect, test } from "vitest";
import { DEFAULT_PARAMS, HERO, PANEL_ACCENT, SLIDERS, TABS } from "@/lib/scene";

// lib/scene.ts の定数どうしの整合性を確かめる。
// UI はこれらの定数を組み合わせて描画するため、1 か所だけ書き換えて食い違うと画面が壊れる（例：初期値がスライダーの範囲外）
describe("lib/scene の定数", () => {
  // TABS に並ぶシーンの識別子の一覧（以降のテストで使う）
  const tabIds = TABS.map((tab) => tab.id);

  // シーンを足したときに、見出し・スライダー・色・初期値のどれかを書き忘れていないか
  test("すべてのタブに見出し・スライダー・装飾色・初期値が定義されている", () => {
    // 各シーンについて確認する
    for (const id of tabIds) {
      // 見出しの文言がある
      expect(HERO[id]).toBeDefined();
      // スライダーが 1 本以上ある
      expect(SLIDERS[id].length).toBeGreaterThan(0);
      // 装飾色が #rrggbb 形式で入っている
      expect(PANEL_ACCENT[id]).toMatch(/^#[0-9a-f]{6}$/i);
      // 初期値のオブジェクトがある
      expect(DEFAULT_PARAMS[id]).toBeDefined();
    }
  });

  // スライダーの field 名が初期値のプロパティ名と一致しているか（一致しないとスライダーを動かしても何も変わらない）
  test("各スライダーの field に対応する初期値が数値で存在する", () => {
    // 各シーンについて確認する
    for (const id of tabIds) {
      // 初期値をプロパティ名で引けるように、文字列キーの辞書として扱う
      const defaults = DEFAULT_PARAMS[id] as unknown as Record<string, unknown>;
      // そのシーンのスライダーを 1 本ずつ確認する
      for (const slider of SLIDERS[id]) {
        // 初期値が数値として存在する
        expect(typeof defaults[slider.field]).toBe("number");
      }
    }
  });

  // 初期値がスライダーの範囲外だと、つまみが端に張り付き、表示と実際の値が食い違う
  test("初期値がスライダーの最小値〜最大値の範囲に収まっている", () => {
    // 各シーンについて確認する
    for (const id of tabIds) {
      // 初期値を文字列キーの辞書として扱う
      const defaults = DEFAULT_PARAMS[id] as unknown as Record<string, number>;
      // そのシーンのスライダーを 1 本ずつ確認する
      for (const slider of SLIDERS[id]) {
        // 最小値以上である
        expect(defaults[slider.field]).toBeGreaterThanOrEqual(slider.min);
        // 最大値以下である
        expect(defaults[slider.field]).toBeLessThanOrEqual(slider.max);
      }
    }
  });

  // min >= max や step <= 0 だと <input type="range"> が動かない
  test("スライダーの範囲と刻み幅が正しい向きになっている", () => {
    // すべてのシーンのスライダーをまとめて確認する
    for (const slider of Object.values(SLIDERS).flat()) {
      // 最小値は最大値より小さい
      expect(slider.min).toBeLessThan(slider.max);
      // 刻み幅は正の数
      expect(slider.step).toBeGreaterThan(0);
    }
  });
});
