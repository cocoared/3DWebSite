import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  COMPACT_MAX_HEIGHT_PX,
  DEFAULT_PARAMS,
  HERO,
  isCompactLayout,
  PANEL_ACCENT,
  parseSceneTab,
  ROOMY_MIN_WIDTH_PX,
  SLIDERS,
  TABS,
} from "@/lib/scene";

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

// isCompactLayout: スマホ向けの配置（幅が狭い、または高さが低い画面）にするか。CSS の compact: と同じ条件でなければならない
describe("isCompactLayout", () => {
  // 縦持ちのスマホは幅で、横持ちのスマホは高さでスマホ向けになる
  test.each([
    // [幅, 高さ, スマホ向けか, 説明]
    [390, 844, true, "縦持ちのスマホ（幅が狭い）"],
    [844, 390, true, "横持ちのスマホ（高さが低い）"],
    [1600, 900, false, "パソコン"],
    [1024, 768, false, "タブレットの横持ち"],
    [ROOMY_MIN_WIDTH_PX - 1, 900, true, "幅がちょうど境目の 1px 手前"],
    [ROOMY_MIN_WIDTH_PX, 900, false, "幅がちょうど境目"],
    [1280, COMPACT_MAX_HEIGHT_PX, true, "高さがちょうど境目"],
    [1280, COMPACT_MAX_HEIGHT_PX + 1, false, "高さが境目より 1px 高い"],
  ])("%i × %i は %s（%s）", (width, height, expected) => {
    // Act / Assert
    expect(isCompactLayout(width, height)).toBe(expected);
  });
});

// CSS の compact: / roomy: / short: の条件が、3D 側の定数と同じ値で書かれているか（食い違うとシートと石が重なる）
describe("globals.css のスマホ向け・パソコン向けの条件", () => {
  // css: 全体の CSS（テストはリポジトリのルートで動く）
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  // remToPx: "48rem" のような値を px に直す（ルートの文字の大きさ 16px のとき）
  const remToPx = (rem: string) => Number.parseFloat(rem) * 16;

  // compact: 幅が ROOMY_MIN_WIDTH_PX 未満、または高さが COMPACT_MAX_HEIGHT_PX 以下
  test("compact: は、幅が境目未満か、高さが境目以下の画面", () => {
    // Arrange: compact の条件の書き方（値の部分を取り出す）
    const pattern =
      /@custom-variant compact \{\s*@media \(width < ([\d.]+rem)\), \(height <= ([\d.]+rem)\)/;
    // Assert: この書き方で見つかる（見つからないときは、正規表現と CSS が失敗の表示に出る）
    expect(css).toMatch(pattern);
    // Act: 値を取り出す
    const match = css.match(pattern);
    // 幅の境目
    expect(remToPx(match?.[1] ?? "")).toBe(ROOMY_MIN_WIDTH_PX);
    // 高さの境目
    expect(remToPx(match?.[2] ?? "")).toBe(COMPACT_MAX_HEIGHT_PX);
  });

  // roomy: は compact: のちょうど反対（どちらにも当てはまらない画面、両方に当てはまる画面が無いように）
  test("roomy: は、幅が境目以上で、高さが境目より高い画面", () => {
    // Arrange: roomy の条件の書き方（値の部分を取り出す）
    const pattern =
      /@custom-variant roomy \{\s*@media \(width >= ([\d.]+rem)\) and \(height > ([\d.]+rem)\)/;
    // Assert: この書き方で見つかる（見つからないときは、正規表現と CSS が失敗の表示に出る）
    expect(css).toMatch(pattern);
    // Act: 値を取り出す
    const match = css.match(pattern);
    // 幅の境目
    expect(remToPx(match?.[1] ?? "")).toBe(ROOMY_MIN_WIDTH_PX);
    // 高さの境目
    expect(remToPx(match?.[2] ?? "")).toBe(COMPACT_MAX_HEIGHT_PX);
  });

  // short: は高さだけの条件（スマホの横持ちで、さらに詰める）
  test("short: は、高さが境目以下の画面", () => {
    // Arrange: short の条件の書き方（値の部分を取り出す）
    const pattern = /@custom-variant short \{\s*@media \(height <= ([\d.]+rem)\)/;
    // Assert: この書き方で見つかる（見つからないときは、正規表現と CSS が失敗の表示に出る）
    expect(css).toMatch(pattern);
    // Act: 値を取り出す
    const match = css.match(pattern);
    // 高さの境目
    expect(remToPx(match?.[1] ?? "")).toBe(COMPACT_MAX_HEIGHT_PX);
  });
});

// 画面の部品は、幅だけで切り替える Tailwind の条件（md: など）ではなく、高さも見る compact: / roomy: / short: を使う。
// md: などが混ざると、横持ちのスマホでその部品だけパソコン向けの配置になり、3D 側（isCompactLayout）とも食い違う
describe("画面の部品のレイアウトの切り替え", () => {
  // files: components/ と app/ の下の .tsx をすべて（テストはリポジトリのルートで動く）
  const files = ["components", "app"].flatMap((dir) =>
    readdirSync(join(process.cwd(), dir), { recursive: true, encoding: "utf8" })
      // .tsx だけにする
      .filter((file) => file.endsWith(".tsx"))
      // ルートからのパスにする
      .map((file) => join(dir, file)),
  );
  // widthOnlyVariant: クラス名の頭に付く、幅だけの条件（sm: / md: / lg: / xl: / 2xl: と、その max- 版）。
  // 行頭・空白・引用符の直後だけを見て、"compact:" などの一部に当たらないようにする
  const widthOnlyVariant = /(^|[\s"'`])(max-)?(sm|md|lg|xl|2xl):/m;

  // 読むファイルが見つかっている（パスを取り違えて 0 件のまま通るのを防ぐ）
  test("調べる .tsx が見つかる", () => {
    // Assert: 少なくとも 1 つ
    expect(files.length).toBeGreaterThan(0);
  });

  // 1 ファイルずつ確かめる（失敗したときにファイル名が出るように）
  test.each(files)("%s は幅だけの条件（md: など）を使っていない", (file) => {
    // Arrange: ファイルを読む
    const source = readFileSync(join(process.cwd(), file), "utf8");
    // Assert: 幅だけの条件が無い
    expect(source).not.toMatch(widthOnlyVariant);
  });
});
