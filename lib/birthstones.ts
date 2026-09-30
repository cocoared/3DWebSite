// このモジュールは、12 か月の誕生石のデータ（lib/birthstones.json）に型を付けて検証し、アプリ全体へ配る。
// JSON は Blender のスクリプト（blender/build_jewels.py など）も読む共通のデータなので、値を変えたら Blender 側も作り直す。
// 参照画像: .claude/references/birthstone-chart.jpg（月・石・石言葉・カットの対応の出どころ）

import raw from "./birthstones.json";

/** 誕生石の id。1 月〜12 月の順に並べた一覧。glTF（jewels.glb）のノード名や、連番画像のフォルダ名にもなる。 */
export const BIRTHSTONE_IDS = [
  // 1 月: ガーネット
  "garnet",
  // 2 月: アメジスト
  "amethyst",
  // 3 月: アクアマリン
  "aquamarine",
  // 4 月: ダイヤモンド
  "diamond",
  // 5 月: エメラルド
  "emerald",
  // 6 月: パール
  "pearl",
  // 7 月: ルビー
  "ruby",
  // 8 月: ペリドット
  "peridot",
  // 9 月: サファイア
  "sapphire",
  // 10 月: ピンクトルマリン
  "pink-tourmaline",
  // 11 月: シトリン
  "citrine",
  // 12 月: ブルートパーズ
  "blue-topaz",
] as const;

/** 誕生石の id の型（`BIRTHSTONE_IDS` のどれか）。 */
export type BirthstoneId = (typeof BIRTHSTONE_IDS)[number];

/** カット（形）の種類。`"sphere"` はカットの無いパール（JewelCraft に型が無いので Blender で球として作る）。 */
export type JewelCut = "round" | "oval" | "pear" | "sphere";

// JEWEL_CUTS: カットの種類の一覧（検証に使う）
const JEWEL_CUTS: readonly JewelCut[] = ["round", "oval", "pear", "sphere"];

/**
 * 誕生石 1 つぶんのデータ。
 *
 * どの項目も読み取り専用。`BIRTHSTONES` の同じオブジェクトをアプリ全体（3D・月のボタン・詳細パネル）で共有するので、
 * 受け取った側がうっかり書き換えて、ほかの場所の表示まで変えてしまわないようにする。
 */
export interface Birthstone {
  /** 石の id。 */
  readonly id: BirthstoneId;
  /** 誕生月（1〜12 の整数）。 */
  readonly month: number;
  /** 英名（参照画像の表記。画面では大文字にして見出しに使う）。 */
  readonly name: string;
  /** 和名（カタカナ）。 */
  readonly nameJa: string;
  /** 英語の石言葉（参照画像の表記）。 */
  readonly meaning: string;
  /** 石言葉の日本語訳。 */
  readonly meaningJa: string;
  /** カット（形）。 */
  readonly cut: JewelCut;
  /** 石の長さ（mm）。パールは直径。Blender の JewelCraft に渡すサイズ。 */
  readonly sizeMm: number;
  /** 描画用の本体の色（`#rrggbb`）。Cycles の吸収の色と、リアルタイムの屈折の色の両方に使う。 */
  readonly color: string;
  /** 暗い背景の上の UI（月のボタンの点、詳細パネルの飾り）に使う、明るめの色（`#rrggbb`）。 */
  readonly uiColor: string;
  /** 屈折率（IOR）。光が石に入るときに曲がる強さ。空気は 1、ダイヤは 2.417。 */
  readonly ior: number;
  /** 分散（宝石学の B–G 間の屈折率の差）。大きいほど光が虹色に分かれる。ダイヤは 0.044。パールは 0。 */
  readonly dispersion: number;
  /** モース硬度（表示用の文字列。「6.5〜7.5」のように幅があるものもある）。 */
  readonly hardness: string;
  /** 主な成分（表示用）。 */
  readonly composition: string;
  /** 主な産地（表示用。1 つ以上）。 */
  readonly origins: readonly string[];
  /** 詳細パネルに出す説明文（日本語）。 */
  readonly description: string;
}

// HEX_COLOR: "#rrggbb" の形の色
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
// MIN_IOR / MAX_IOR: 屈折率として受け付ける範囲（空気の 1 から、ダイヤより少し上まで）
const MIN_IOR = 1;
// 屈折率の上限
const MAX_IOR = 3;
// MAX_DISPERSION: 分散として受け付ける上限（宝石で大きいものでも 0.1 に届かない）
const MAX_DISPERSION = 0.1;

// isRecord: 値が普通のオブジェクト（配列や null ではない）かどうか
function isRecord(value: unknown): value is Record<string, unknown> {
  // typeof は null や配列でも "object" になるので、それらを除く
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// isJewelCut: 文字列が知っているカットの名前か（true を返したら、TypeScript は値を JewelCut として扱える）
function isJewelCut(value: string): value is JewelCut {
  // 一覧のどれかと同じなら知っているカット
  return JEWEL_CUTS.some((cut) => cut === value);
}

// fail: どの石のどの項目がおかしいかを書いたエラーを投げる
function fail(index: number, key: string, detail: string): never {
  // 例: "birthstones.json の 3 件目の ior: 1〜3 の数値ではありません"
  throw new Error(`birthstones.json の ${index + 1} 件目の ${key}: ${detail}`);
}

// readText: 空でない文字列の項目を取り出す
function readText(entry: Record<string, unknown>, index: number, key: string): string {
  // 項目の値
  const value = entry[key];
  // 文字列でない、または空（空白だけ）なら誤り
  if (typeof value !== "string" || value.trim() === "")
    fail(index, key, "空でない文字列ではありません");
  // 文字列として返す
  return value;
}

// readNumber: 指定の範囲に収まる有限の数値を取り出す
function readNumber(
  entry: Record<string, unknown>,
  index: number,
  key: string,
  min: number,
  max: number,
): number {
  // 項目の値
  const value = entry[key];
  // 数値でない、無限大や NaN、範囲外なら誤り
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    // 範囲を含めて知らせる
    fail(index, key, `${min}〜${max} の数値ではありません（${String(value)}）`);
  }
  // 数値として返す
  return value;
}

// readColor: "#rrggbb" の色を取り出す
function readColor(entry: Record<string, unknown>, index: number, key: string): string {
  // まず空でない文字列として読む
  const value = readText(entry, index, key);
  // 形が違えば誤り
  if (!HEX_COLOR.test(value)) fail(index, key, `#rrggbb の形ではありません（${value}）`);
  // 色として返す
  return value;
}

// readOrigins: 空でない文字列の配列（産地の一覧）を取り出す
function readOrigins(entry: Record<string, unknown>, index: number): string[] {
  // 項目の値
  const value = entry.origins;
  // 配列でない、空、空の文字列や文字列以外が混じるなら誤り
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => typeof item === "string" && item.trim() !== "")
  ) {
    // 何が違うかを知らせる
    fail(index, "origins", "空でない文字列の配列ではありません");
  }
  // 元の配列を共有しないよう、新しい配列にして返す
  return [...value];
}

// readStone: index 件目の 1 件を検証して、Birthstone の新しいオブジェクトにする。
// 呼び出し側（parseBirthstones）で件数が 12 件だと確かめてから呼ぶので、index は 0〜11
function readStone(entry: unknown, index: number): Birthstone {
  // オブジェクトでなければ誤り
  if (!isRecord(entry)) fail(index, "(全体)", "オブジェクトではありません");
  // この位置にあるべき id（BIRTHSTONE_IDS は 1 月から順に並ぶ）
  const expectedId = BIRTHSTONE_IDS[index];
  // id を読む
  const id = readText(entry, index, "id");
  // 並び順の id と違えば誤り。知らない id・重複・入れ替わりのどれもここで見つかる
  // （入れ替わったままだと、1 月のデータが別の石の .glb のノードや連番画像と結び付いてしまう）
  if (id !== expectedId)
    fail(index, "id", `${index + 1} 件目は「${expectedId}」のはずです（${id}）`);
  // カットを読む
  const cut = readText(entry, index, "cut");
  // 知らないカットは誤り（ここを通れば、TypeScript は cut を JewelCut として扱う）
  if (!isJewelCut(cut)) fail(index, "cut", `知らないカットです（${cut}）`);
  // 月を読む（1〜12）
  const month = readNumber(entry, index, "month", 1, 12);
  // 並び順（1 件目 = 1 月）と一致しない、または整数でない（1.5 など）なら誤り
  if (month !== index + 1) fail(index, "month", `並び順と月が一致しません（${month}）`);
  // 検証した値だけで新しいオブジェクトを組み立てる（知らない項目は持ち込まない）
  return {
    // id（並び順と一致することを確かめたので、型の付いた expectedId を使う）
    id: expectedId,
    // 月
    month,
    // 英名
    name: readText(entry, index, "name"),
    // 和名
    nameJa: readText(entry, index, "nameJa"),
    // 英語の石言葉
    meaning: readText(entry, index, "meaning"),
    // 日本語の石言葉
    meaningJa: readText(entry, index, "meaningJa"),
    // カット（検証済み）
    cut,
    // 大きさ（mm）。0 より大きく、宝石として大きすぎない範囲
    sizeMm: readNumber(entry, index, "sizeMm", Number.MIN_VALUE, 50),
    // 描画用の色
    color: readColor(entry, index, "color"),
    // UI 用の色
    uiColor: readColor(entry, index, "uiColor"),
    // 屈折率
    ior: readNumber(entry, index, "ior", MIN_IOR, MAX_IOR),
    // 分散
    dispersion: readNumber(entry, index, "dispersion", 0, MAX_DISPERSION),
    // 硬度
    hardness: readText(entry, index, "hardness"),
    // 成分
    composition: readText(entry, index, "composition"),
    // 産地
    origins: readOrigins(entry, index),
    // 説明文
    description: readText(entry, index, "description"),
  };
}

/**
 * JSON から読んだ誕生石のデータを検証し、型付きの配列にする。
 *
 * 12 件・1 月から順に並ぶ（id と月が `BIRTHSTONE_IDS` の並びと一致する。重複もここで見つかる）・
 * 各項目の形と範囲が正しいことを確かめ、入力を書き換えずに新しいオブジェクトを作って返す。
 *
 * @param data - JSON を読んだ値（形はまだわからないものとして扱う）
 * @throws 形や値がおかしいとき。どの件のどの項目かをメッセージに含める
 */
export function parseBirthstones(data: unknown): Birthstone[] {
  // 配列でなければ誤り
  if (!Array.isArray(data)) throw new Error("birthstones.json: 配列ではありません");
  // 12 か月ぶんでなければ誤り
  if (data.length !== BIRTHSTONE_IDS.length) {
    // 件数を知らせる
    throw new Error(
      `birthstones.json: ${BIRTHSTONE_IDS.length} 件ではありません（${data.length} 件）`,
    );
  }
  // 1 件ずつ検証して、検証済みのデータを返す
  return data.map(readStone);
}

/** 12 か月の誕生石（1 月〜12 月の順）。読み込み時に `parseBirthstones` で検証済み。 */
export const BIRTHSTONES: readonly Birthstone[] = parseBirthstones(raw);

/** 英語の月名（1 月 = 添字 0）。見出しや月のボタンに使う。 */
export const MONTH_NAMES = [
  // 1 月
  "January",
  // 2 月
  "February",
  // 3 月
  "March",
  // 4 月
  "April",
  // 5 月
  "May",
  // 6 月
  "June",
  // 7 月
  "July",
  // 8 月
  "August",
  // 9 月
  "September",
  // 10 月
  "October",
  // 11 月
  "November",
  // 12 月
  "December",
] as const;

/**
 * 月の番号から誕生石を探す。
 *
 * @param month - 1〜12 の月
 * @returns その月の石。範囲外や整数でないときは `undefined`
 */
export function birthstoneByMonth(month: number): Birthstone | undefined {
  // 月の番号が一致する石を探す
  return BIRTHSTONES.find((stone) => stone.month === month);
}

/**
 * id から誕生石を取り出す。id は型で 12 種類に限られているので、必ず見つかる。
 */
export function birthstoneById(id: BirthstoneId): Birthstone {
  // id が一致する石を探す
  const stone = BIRTHSTONES.find((candidate) => candidate.id === id);
  // 型の上では起きないが、データと型が食い違ったときに気づけるようにする
  if (!stone) throw new Error(`誕生石が見つかりません: ${id}`);
  // 見つかった石を返す
  return stone;
}

/**
 * 英語の月名（例: `4` → `"April"`）。見出しの上付きラベルに使う。
 *
 * @param month - 1〜12 の月
 * @throws 範囲外や整数でない月のとき（RangeError）。画面に "undefined" と出さないようにする
 */
export function monthName(month: number): string {
  // 月名の一覧から取り出す（添字は 0 始まり。範囲外や小数の添字では undefined になる）
  const name = MONTH_NAMES[month - 1];
  // 見つからなければ誤り
  if (!name) throw new RangeError(`月は 1〜12 の整数で指定してください: ${month}`);
  // 月名を返す
  return name;
}

/**
 * 月のボタンに出す短い月名（英語の頭 3 文字の大文字。例: `"JAN"`）。
 *
 * @param month - 1〜12 の月
 * @throws 範囲外や整数でない月のとき（RangeError）
 */
export function monthShortLabel(month: number): string {
  // 月名の頭 3 文字を大文字にする（範囲外の月は monthName が RangeError にする）
  return monthName(month).slice(0, 3).toUpperCase();
}

/** 詳細パネルの特徴の一覧の 1 行（見出し, 値）。 */
export type SpecRow = readonly [label: string, value: string];

/**
 * 詳細パネルに並べる特徴の一覧（石言葉・硬度・成分・屈折率・分散・産地の順）。
 * パールは透明な石ではなく分散が 0 なので、「分散 0.000」の行は入れない。
 * 石言葉は見出し（SceneHero）の説明文にもあるが、スマホ向けの配置ではその説明文を見た目から隠すので、ここにも必ず入れる。
 */
export function birthstoneSpecs(stone: Birthstone): readonly SpecRow[] {
  // 分散の行。分散が 0 のパールでは空にして、行そのものを出さない
  const dispersionRow: SpecRow[] =
    stone.dispersion > 0 ? [["分散", stone.dispersion.toFixed(3)]] : [];
  // 見出しと値の組を、表示する順に並べる
  return [
    // 石言葉（日本語の後ろに英語をかっこで添える。例: 強さ（Strength））
    ["石言葉", `${stone.meaningJa}（${stone.meaning}）`],
    // 硬さ（モース硬度）
    ["硬度", `モース ${stone.hardness}`],
    // 主な成分
    ["成分", stone.composition],
    // 屈折率（小数 2 桁）
    ["屈折率", stone.ior.toFixed(2)],
    // 分散（小数 3 桁。パール以外）
    ...dispersionRow,
    // 主な産地（中黒でつなぐ）
    ["産地", stone.origins.join("・")],
  ];
}
