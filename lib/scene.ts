// このモジュールは、3つのシーンを横断して使う「型」と「定数データ」を1か所に集約する。
// UI(ナビ・見出し・操作パネル)をこのデータから組み立てることで、文言や範囲の変更をここだけで完結できる。

/** 表示中のシーンの識別子。`"sun"` = 太陽、`"oce"` = 浜辺（ocean）、`"jewel"` = 誕生石（THE JEWELS）。 */
export type SceneTab = "sun" | "oce" | "jewel";

// SunParams: 太陽シーンの操作パラメータ。amb=明るさ, rot=自動回転速度, mera=炎(コロナ)の揺らぎ量。
export interface SunParams {
  // 明るさ。0〜3。シェーダーの uBright に渡る
  amb: number;
  // 自動回転の速さ。0〜2
  rot: number;
  // 炎（コロナ）の揺らぎの量。0〜1。シェーダーの uMera に渡る
  mera: number;
}

// OceParams: 浜辺シーンの操作パラメータ。amb=環境光(昼夜), wave=波の高さ, speed=波の速さ。
export interface OceParams {
  // 環境光。0 = 夜 〜 1 = 昼
  amb: number;
  // 波の高さ。0〜1
  wave: number;
  // 波の速さ。0〜1
  speed: number;
}

/** 誕生石シーン（THE JEWELS）の操作パラメータ。 */
export interface JewelParams {
  /** 光量。0〜3。レンダラーの露出（toneMappingExposure）は 2 × 光量になる（光量 1 で露出 2。Blender の jewels.blend の露出 +1 段と同じ）。 */
  amb: number;
  /** 分散（虹色のきらめき＝ファイア）の強さ。0〜1。石ごとの分散の値に掛けて MeshRefractionMaterial に渡す。 */
  fire: number;
}

// SceneParams: 3シーンぶんのパラメータをまとめた全体の状態。
export interface SceneParams {
  // 太陽シーン
  sun: SunParams;
  // 浜辺シーン
  oce: OceParams;
  // 誕生石シーン
  jewel: JewelParams;
}

// DEFAULT_PARAMS: 初期表示時のパラメータ値。
export const DEFAULT_PARAMS: SceneParams = {
  // 太陽: 明るさ 1.5・自動回転 0.5・揺らぎ 0.55
  sun: { amb: 1.5, rot: 0.5, mera: 0.55 },
  // 浜辺: 昼寄り 0.85・波の高さ 0.5・速さ 0.45
  oce: { amb: 0.85, wave: 0.5, speed: 0.45 },
  // 誕生石: 光量 1（露出 2 倍）・分散 0.5（控えめなファイア）
  jewel: { amb: 1, fire: 0.5 },
};

// STORAGE_KEY: 最後に開いていたシーンを localStorage に保存するときのキー名。
export const STORAGE_KEY = "scene-tab";

/**
 * パソコン向けの配置にする画面の幅の下限（CSS の px）。この幅以上で、しかも高さが `COMPACT_MAX_HEIGHT_PX` より高ければパソコン向けにする。
 *
 * app/globals.css の `compact:` / `roomy:`（独自の Tailwind の条件）と同じ値にしておく（48rem = 768px。lib/scene.test.ts が照らし合わせる）。
 * 画面の部品はその CSS の条件で、3D（誕生石シーンで石を上へずらす量や、月のラベルを石の外と内のどちらに置くか）は `isCompactLayout` で切り替えるので、食い違うとシートと石が重なる。
 * ただし CSS は rem なのでブラウザの文字の大きさの設定で動き、3D 側はキャンバスの大きさで比べる。
 * また CSS の画面の幅はスクロールバーを含み、スマホでは高さがアドレスバーの出し入れで変わる。キャンバスは全画面（<main> いっぱい）なのでほぼ同じ値になるが、
 * 文字の大きさを既定から変えている人などでは、切り替わる大きさが少しずれることがある。
 */
export const ROOMY_MIN_WIDTH_PX = 768;

/**
 * この高さ（CSS の px）以下の画面は、幅が広くてもスマホ向けの配置にする（30rem = 480px）。
 * スマホの横持ち（例: 844 × 390）は幅が 768px を超えるが、パソコン向けの横並びでは解説カードと操作パネルが縦に入りきらないため。
 */
export const COMPACT_MAX_HEIGHT_PX = 480;

/**
 * スマホ向けの配置（下の段を縦に積み、解説カードは下のシート、操作パネルは開閉式）にする画面か。
 * app/globals.css の `compact:` と同じ条件（幅が `ROOMY_MIN_WIDTH_PX` 未満、または高さが `COMPACT_MAX_HEIGHT_PX` 以下）。
 *
 * 幅と高さは有限な正の値を渡す前提（NaN を渡すと、その比べは成り立たず false になり、結果がもう一方の値だけで決まる）。
 * 呼び出し側で先に確かめる（例: lib/scenes/jewels.ts の `focusViewShift`）。
 *
 * @param width - 画面の幅（CSS の px）
 * @param height - 画面の高さ（CSS の px）
 */
export function isCompactLayout(width: number, height: number): boolean {
  // 幅が狭いか、高さが低ければスマホ向け
  return width < ROOMY_MIN_WIDTH_PX || height <= COMPACT_MAX_HEIGHT_PX;
}

// TABS: 画面上部のタブ切り替えボタンの定義(識別子と表示ラベル)。
export const TABS: { id: SceneTab; label: string }[] = [
  // 太陽
  { id: "sun", label: "Sun" },
  // 浜辺
  { id: "oce", label: "Beach" },
  // 誕生石
  { id: "jewel", label: "Jewels" },
];

/**
 * localStorage などから読んだ値を、実在するタブの識別子として確かめる。
 *
 * @param value - 保存されていた値（文字列とは限らない）
 * @returns タブの識別子。知らない値（改名前の `"gem"` など）のときは `null` を返すので、呼び出し側で初期のタブに戻す
 */
export function parseSceneTab(value: unknown): SceneTab | null {
  // TABS に同じ id があるときだけ受け入れる（文字列でない値は一致しない）
  const tab = TABS.find((candidate) => candidate.id === value);
  // 見つかればその id、無ければ null
  return tab ? tab.id : null;
}

// HeroContent: 各シーンの左下に出す見出しブロックの文言。
export interface HeroContent {
  // 小さな上付きラベル(例: Scene 01 — Solar)
  eyebrow: string;
  // 大きな英字タイトル(例: THE SUN)
  title: string;
  // 日本語の説明文
  tag: string;
  // 操作方法のヒント(例: Drag to orbit · Click to flare)
  hint: string;
  // 読み上げ専用の短い知らせ（画面には出さない。例: 浜辺のシーンを表示しています。）。
  // タブを切り替えたときや石を選んだときに、見出し全体の代わりに「何を表示しているか」だけを読み上げさせる
  announcement: string;
}

// HERO: シーンごとの見出し文言をまとめたテーブル。
export const HERO: Record<SceneTab, HeroContent> = {
  // 太陽シーンの見出し
  sun: {
    // 上付きラベル
    eyebrow: "Scene 01 — Solar",
    // タイトル
    title: "THE SUN",
    // 説明文
    tag: "燃えつづける恒星。燃えさかる表面と、そこから噴き上がるプロミネンス。すべてリアルタイム描画。",
    // 操作のヒント
    hint: "Drag to orbit · Click to flare",
    // 読み上げの知らせ
    announcement: "太陽のシーンを表示しています。",
  },
  // 浜辺シーンの見出し
  oce: {
    // 上付きラベル
    eyebrow: "Scene 02 — Beach",
    // タイトル
    title: "THE SHORE",
    // 説明文
    tag: "白い砂浜に、寄せては返す透きとおった波。環境光を落とせば夜が訪れ、満天の星が浮かびあがる。",
    // 操作のヒント
    hint: "Drag to look around · Dim to night",
    // 読み上げの知らせ
    announcement: "浜辺のシーンを表示しています。",
  },
  // 誕生石シーンの見出し（石を選ぶ前。選んだあとは lib/scenes/jewels.ts の jewelHero が作る）
  jewel: {
    // 上付きラベル
    eyebrow: "Scene 03 — Jewels",
    // タイトル
    title: "THE JEWELS",
    // 説明文
    tag: "一月のガーネットから十二月のブルートパーズまで、十二の誕生石。月を選べば、その石のもとへ。",
    // 操作のヒント
    hint: "Drag to rotate · Pick a month",
    // 読み上げの知らせ（タブを切り替えてきたとき。石の選択を外して戻ったときは lib/scenes/jewels.ts の overviewHero が別の文にする）
    announcement: "12 か月の誕生石を並べたシーンを表示しています。",
  },
};

// SliderDef: 操作パネル1本ぶんのスライダー(つまみを左右にドラッグして数値を決める <input type="range">)の設定。
// field の文字列がパラメータ名になるので、ここに1行足すだけで ControlPanel に新しいスライダーが増える。
export interface SliderDef {
  // 対応するパラメータのプロパティ名(例: 'amb')
  field: string;
  // 日本語ラベル(例: 光量)
  name: string;
  // 英語の補足ラベル(例: brightness)
  unit: string;
  // スライダー最小値
  min: number;
  // スライダー最大値
  max: number;
  // スライダーの刻み幅
  step: number;
}

// SLIDERS: シーンごとの操作スライダー定義。UI はこの配列を回してパネルを描画する。
export const SLIDERS: Record<SceneTab, SliderDef[]> = {
  // 太陽シーンのスライダー
  sun: [
    // 光量
    { field: "amb", name: "光量", unit: "brightness", min: 0, max: 3, step: 0.05 },
    // 自動回転
    { field: "rot", name: "自動回転", unit: "orbit", min: 0, max: 2, step: 0.05 },
    // 炎のゆらめき
    { field: "mera", name: "炎のゆらめき", unit: "corona", min: 0, max: 1, step: 0.02 },
  ],
  // 浜辺シーンのスライダー
  oce: [
    // 環境光（昼夜）
    { field: "amb", name: "環境光", unit: "day / night", min: 0, max: 1, step: 0.01 },
    // 波の高さ
    { field: "wave", name: "波の高さ", unit: "swell", min: 0, max: 1, step: 0.02 },
    // 波の速さ
    { field: "speed", name: "速さ", unit: "speed", min: 0, max: 1, step: 0.02 },
  ],
  // 誕生石シーンのスライダー
  jewel: [
    // 光量（露出）
    { field: "amb", name: "光量", unit: "light", min: 0, max: 3, step: 0.05 },
    // 分散（虹色のきらめき）
    { field: "fire", name: "分散", unit: "fire", min: 0, max: 1, step: 0.02 },
  ],
};

// PANEL_ACCENT: シーンごとの操作パネルの装飾色（スライダーのつまみ・数値・脈動点に使う）。
// ControlPanel が CSS 変数 --accent へ流し込み、globals.css のつまみと数値表示がこれを読む。
export const PANEL_ACCENT: Record<SceneTab, string> = {
  // 太陽: 黄
  sun: "#ffc93c",
  // 浜辺: 水色
  oce: "#66d9ff",
  // 誕生石: 藤色（旧 GEMS の色を引き継ぐ）
  jewel: "#e8b4ff",
};
