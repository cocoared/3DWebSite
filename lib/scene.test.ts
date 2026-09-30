import { describe, expect, test } from "vitest";
import { DEFAULT_PARAMS, HERO, PANEL_ACCENT, parseSceneTab, SLIDERS, TABS } from "@/lib/scene";

// parseSceneTab: localStorage などから読んだ文字列を、実在するタブの id だけ通す
describe("parseSceneTab", () => {
  // 実在するタブの id はそのまま返す
  test.each(["sun", "oce", "jewel"])("%s はタブの id として受け入れる", (value) => {
    // Assert: 同じ値が返る
    expect(parseSceneTab(value)).toBe(value);
  });

  // 改名前の "gem" や、空・null・文字列でない値は受け入れない（呼び出し側が初期のタブに戻す）
  test.each([["gem"], [""], [null], [undefined], [42]])("%s は null を返す", (value) => {
    // Assert: 受け入れない
    expect(parseSceneTab(value)).toBeNull();
  });
});

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

  // タブを切り替えたときに読み上げる短い知らせ（画面には出さない）。見出し全体を読み上げると長いので、どのシーンかだけを伝える
  test("すべてのシーンに、何を表示しているかを伝える日本語の短い知らせがある", () => {
    // 各シーンについて確認する
    for (const id of tabIds) {
      // 「〜を表示しています。」の形の文（空ではない）
      expect(HERO[id].announcement).toMatch(/^.+を表示しています。$/);
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
