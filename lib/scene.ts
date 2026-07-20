// このモジュールは、3つのシーンを横断して使う「型」と「定数データ」を1か所に集約する。
// UI(ナビ・見出し・操作パネル)をこのデータから組み立てることで、文言や範囲の変更をここだけで完結できる。

// SceneTab: 表示中のシーンを表す識別子。'sun'=太陽, 'oce'=浜辺(ocean), 'gem'=宝石。
export type SceneTab = "sun" | "oce" | "gem";

// SunParams: 太陽シーンの操作パラメータ。amb=明るさ, rot=自動回転速度, mera=炎(コロナ)の揺らぎ量。
export interface SunParams {
  amb: number;
  rot: number;
  mera: number;
}

// OceParams: 浜辺シーンの操作パラメータ。amb=環境光(昼夜), wave=波の高さ, speed=波の速さ。
export interface OceParams {
  amb: number;
  wave: number;
  speed: number;
}

// GemParams: 宝石シーンの操作パラメータ。amb=光量, spark=きらめきの強さ。
export interface GemParams {
  amb: number;
  spark: number;
}

// SceneParams: 3シーンぶんのパラメータをまとめた全体の状態。
export interface SceneParams {
  sun: SunParams;
  oce: OceParams;
  gem: GemParams;
}

// DEFAULT_PARAMS: 初期表示時のパラメータ値(元HTMLの初期 state と同じ値)。
export const DEFAULT_PARAMS: SceneParams = {
  sun: { amb: 1.5, rot: 0.5, mera: 0.55 },
  oce: { amb: 0.85, wave: 0.5, speed: 0.45 },
  gem: { amb: 1.4, spark: 0.6 },
};

// STORAGE_KEY: 最後に開いていたシーンを localStorage に保存するときのキー名。
export const STORAGE_KEY = "scene-tab";

// TABS: 画面上部のタブ切り替えボタンの定義(識別子と表示ラベル)。
export const TABS: { id: SceneTab; label: string }[] = [
  { id: "sun", label: "Sun" },
  { id: "oce", label: "Beach" },
  { id: "gem", label: "Gems" },
];

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
}

// HERO: シーンごとの見出し文言をまとめたテーブル。
export const HERO: Record<SceneTab, HeroContent> = {
  sun: {
    eyebrow: "Scene 01 — Solar",
    title: "THE SUN",
    tag: "燃えつづける恒星。燃えさかる表面と、そこから噴き上がるプロミネンス。すべてリアルタイム描画。",
    hint: "Drag to orbit · Click to flare",
  },
  oce: {
    eyebrow: "Scene 02 — Beach",
    title: "THE SHORE",
    tag: "白い砂浜に、寄せては返す透きとおった波。環境光を落とせば夜が訪れ、満天の星が浮かびあがる。",
    hint: "Drag to look around · Dim to night",
  },
  gem: {
    eyebrow: "Scene 03 — Gems",
    title: "THE GEMS",
    tag: "ルビーからアンバーまで、七つの宝石。光を閉じこめた切子面が、静かにきらめく。",
    hint: "Drag to rotate · Click to sparkle",
  },
};

// SliderDef: 操作パネル1本ぶんのスライダー設定。
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
  sun: [
    { field: "amb", name: "光量", unit: "brightness", min: 0, max: 3, step: 0.05 },
    { field: "rot", name: "自動回転", unit: "orbit", min: 0, max: 2, step: 0.05 },
    { field: "mera", name: "炎のゆらめき", unit: "corona", min: 0, max: 1, step: 0.02 },
  ],
  oce: [
    { field: "amb", name: "環境光", unit: "day / night", min: 0, max: 1, step: 0.01 },
    { field: "wave", name: "波の高さ", unit: "swell", min: 0, max: 1, step: 0.02 },
    { field: "speed", name: "速さ", unit: "speed", min: 0, max: 1, step: 0.02 },
  ],
  gem: [
    { field: "amb", name: "光量", unit: "light", min: 0, max: 3, step: 0.05 },
    { field: "spark", name: "きらめき", unit: "sparkle", min: 0, max: 1, step: 0.02 },
  ],
};

// PANEL_ACCENT: シーンごとの操作パネルの装飾色（スライダーのつまみ・数値・脈動点に使う）。
// ControlPanel が CSS 変数 --accent へ流し込み、globals.css のつまみと数値表示がこれを読む。
export const PANEL_ACCENT: Record<SceneTab, string> = {
  // 太陽: 黄
  sun: "#ffc93c",
  // 浜辺: 水色
  oce: "#66d9ff",
  // 宝石: 藤色
  gem: "#e8b4ff",
};
