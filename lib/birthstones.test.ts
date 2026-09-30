import { describe, expect, test } from "vitest";
import {
  BIRTHSTONE_IDS,
  BIRTHSTONES,
  type BirthstoneId,
  birthstoneById,
  birthstoneByMonth,
  birthstoneSpecs,
  MONTH_NAMES,
  monthName,
  monthShortLabel,
  parseBirthstones,
} from "@/lib/birthstones";
import raw from "@/lib/birthstones.json";

// validClone: 実データを深くコピーする（異常系のテストで 1 か所だけ壊すため。元のデータは書き換えない）
function validClone(): Record<string, unknown>[] {
  // JSON を経由して、入れ子の配列（origins）まで含めて複製する
  return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>[];
}

// withChange: index 番目の石の 1 項目だけを差し替えたデータを作る
function withChange(index: number, key: string, value: unknown): Record<string, unknown>[] {
  // 実データの複製
  const data = validClone();
  // 対象の石だけ、指定の項目を差し替えた新しいオブジェクトにする
  data[index] = { ...data[index], [key]: value };
  // 差し替えたデータを返す
  return data;
}

// 参照画像（.claude/references/birthstone-chart.jpg）どおりの月・石・石言葉の対応
describe("誕生石の実データ", () => {
  // 参照画像の表を、そのまま月の順に並べたもの（[月, 英名, 石言葉]）
  const chart: [number, string, string][] = [
    // 1 月
    [1, "Garnet", "Protection"],
    // 2 月
    [2, "Amethyst", "Wisdom"],
    // 3 月
    [3, "Aquamarine", "Serenity"],
    // 4 月
    [4, "Diamond", "Strength"],
    // 5 月
    [5, "Emerald", "Hope"],
    // 6 月
    [6, "Pearl", "Love"],
    // 7 月
    [7, "Ruby", "Vitality"],
    // 8 月
    [8, "Peridot", "Beauty"],
    // 9 月
    [9, "Sapphire", "Truth"],
    // 10 月
    [10, "Pink Tourmaline", "Healing"],
    // 11 月
    [11, "Citrine", "Joy"],
    // 12 月
    [12, "Blue Topaz", "Friendship"],
  ];

  // 1 月から 12 月までそろい、参照画像の石と石言葉になっている
  test.each(chart)("%i 月は %s（石言葉 %s）", (month, name, meaning) => {
    // Arrange / Act: その月の石を取り出す
    const stone = BIRTHSTONES[month - 1];
    // Assert: 月の番号が並び順と一致する
    expect(stone.month).toBe(month);
    // Assert: 英名が参照画像と同じ
    expect(stone.name).toBe(name);
    // Assert: 石言葉が参照画像と同じ
    expect(stone.meaning).toBe(meaning);
  });

  // カットは参照画像の形に合わせる（丸 4・楕円 6・しずく 1・球 1）
  test("カットの内訳が参照画像と同じ", () => {
    // Arrange: カットごとの数を入れる表（このテストの中だけで使う入れ物なので、直接数を足していく）
    const counts: Record<string, number> = {};
    // Act: 1 つずつカットを数える
    for (const stone of BIRTHSTONES) {
      // そのカットの数に 1 を足す
      counts[stone.cut] = (counts[stone.cut] ?? 0) + 1;
    }
    // Assert: 丸・楕円・しずく・球の数
    expect(counts).toEqual({ round: 4, oval: 6, pear: 1, sphere: 1 });
  });

  // id の一覧（型の定義）とデータの並びが同じ
  test("BIRTHSTONE_IDS がデータの id と同じ順で並ぶ", () => {
    // Assert: データの id の並びと一致する
    expect(BIRTHSTONES.map((stone) => stone.id)).toEqual([...BIRTHSTONE_IDS]);
  });
});

// parseBirthstones: 外から読んだ JSON を、形と値の範囲を確かめてから型付きのデータにする
describe("parseBirthstones", () => {
  // 正しいデータはそのまま受け入れる
  test("正しいデータを 12 件の誕生石として返す", () => {
    // Act: 実データを検証する
    const stones = parseBirthstones(validClone());
    // Assert: 12 件になる
    expect(stones).toHaveLength(12);
    // Assert: 値が変わらずに入っている
    expect(stones[3]).toMatchObject({ id: "diamond", month: 4, ior: 2.417, cut: "round" });
  });

  // 検証は入力を書き換えず、新しいオブジェクトを作る
  test("入力のオブジェクトをそのまま返さず、新しいオブジェクトを作る", () => {
    // Arrange: 入力を用意する
    const input = validClone();
    // Act: 検証する
    const stones = parseBirthstones(input);
    // Assert: 別のオブジェクトになっている
    expect(stones[0]).not.toBe(input[0]);
    // Assert: 入れ子の配列も別物になっている
    expect(stones[0].origins).not.toBe(input[0].origins);
  });

  // 配列でないものは受け付けない
  test("配列でないとエラーを投げる", () => {
    // Act / Assert: オブジェクトを渡すとエラー
    expect(() => parseBirthstones({})).toThrow("配列");
  });

  // 12 か月ぶんそろっていないものは受け付けない
  test("件数が 12 でないとエラーを投げる", () => {
    // Act / Assert: 11 件だとエラー
    expect(() => parseBirthstones(validClone().slice(0, 11))).toThrow("12");
  });

  // 異常な値の例（[説明, 何番目の石か, 項目名, 値, エラーに含まれる語]）
  const broken: [string, number, string, unknown, string][] = [
    // 型の一覧に無い id
    ["知らない id", 0, "id", "opal", "id"],
    // 月の並びが崩れている
    ["月が並び順と違う", 1, "month", 3, "month"],
    // 月が整数でない（並び順の 1 と近くても受け付けない）
    ["月が整数でない", 0, "month", 1.5, "month"],
    // 空の英名
    ["英名が空", 2, "name", "", "name"],
    // 知らないカット
    ["知らないカット", 3, "cut", "heart", "cut"],
    // 0 以下の大きさ
    ["大きさが 0", 4, "sizeMm", 0, "sizeMm"],
    // #rrggbb ではない色
    ["色が #rrggbb ではない", 5, "color", "red", "color"],
    // #rrggbb ではない UI の色
    ["UI の色が 3 桁", 6, "uiColor", "#f00", "uiColor"],
    // 空気（1.0）より小さい屈折率
    ["屈折率が 1 未満", 7, "ior", 0.9, "ior"],
    // ありえないほど大きい分散
    ["分散が大きすぎる", 8, "dispersion", 0.5, "dispersion"],
    // 産地が 1 つも無い
    ["産地が空", 9, "origins", [], "origins"],
    // 産地に文字列でないものが混じる
    ["産地に数値が混じる", 10, "origins", ["ブラジル", 1], "origins"],
    // 説明が文字列でない
    ["説明が文字列でない", 11, "description", 42, "description"],
  ];

  // 1 項目だけ壊したデータは、どの石のどの項目が悪いかをエラーで知らせる
  test.each(broken)("%s ときはエラーを投げる", (_label, index, key, value, word) => {
    // Act / Assert: 壊した項目名を含むエラーになる
    expect(() => parseBirthstones(withChange(index, key, value))).toThrow(word);
  });

  // 同じ id が 2 回出てくるデータは受け付けない（2 件目は「amethyst」のはずなので、並び順の誤りとして見つかる）
  test("id が重複しているとエラーを投げる", () => {
    // Arrange: 2 番目の石の id を 1 番目と同じにする
    const data = withChange(1, "id", "garnet");
    // Act / Assert: 2 件目の id の誤りを知らせるエラーになる
    expect(() => parseBirthstones(data)).toThrow("2 件目の id");
  });

  // 重複が無くても、id の並びが月の順（BIRTHSTONE_IDS）と違えば受け付けない。
  // id だけが入れ替わると、1 月のデータがアメジストの .glb のノードや連番画像と結び付いてしまうため
  test("id が入れ替わっている（重複は無い）とエラーを投げる", () => {
    // Arrange: 1 件目と 2 件目の id だけを入れ替える（月や色などはそのまま）
    const data = withChange(0, "id", "amethyst");
    // 2 件目の id を 1 件目のものにする
    data[1] = { ...data[1], id: "garnet" };
    // Act / Assert: 1 件目の id の誤りを知らせるエラーになる
    expect(() => parseBirthstones(data)).toThrow("1 件目の id");
  });

  // 配列の中身がオブジェクトでない（null など）ときは、項目を読む前に知らせる
  test("石のデータがオブジェクトでない（null）とエラーを投げる", () => {
    // Arrange: 1 件目を null にしたデータ（どんな値でも入れられるよう unknown の配列として扱う）
    const data: unknown[] = validClone();
    // 1 件目を壊す
    data[0] = null;
    // Act / Assert: オブジェクトでないことを知らせるエラーになる
    expect(() => parseBirthstones(data)).toThrow("オブジェクトではありません");
  });
});

// 月や id から石を取り出す関数
describe("誕生石の検索", () => {
  // 4 月はダイヤモンド
  test("birthstoneByMonth は月の番号から石を返す", () => {
    // Assert: 4 月の石
    expect(birthstoneByMonth(4)?.id).toBe("diamond");
  });

  // 範囲外の月は石が無い
  test.each([0, 13, 1.5])("birthstoneByMonth(%s) は undefined を返す", (month) => {
    // Assert: 見つからない
    expect(birthstoneByMonth(month)).toBeUndefined();
  });

  // id から石を返す
  test("birthstoneById は id から石を返す", () => {
    // Assert: 10 月の石
    expect(birthstoneById("pink-tourmaline").month).toBe(10);
  });

  // 月名の略称はボタンの表示に使う
  test("monthShortLabel は英語の月名の頭 3 文字を大文字で返す", () => {
    // Assert: 1 月と 12 月
    expect([monthShortLabel(1), monthShortLabel(12)]).toEqual(["JAN", "DEC"]);
  });

  // 月名は見出し（例: 04 — April）に使う
  test("monthName は英語の月名を返す", () => {
    // Assert: 4 月と 12 月
    expect([monthName(4), monthName(12)]).toEqual(["April", "December"]);
  });

  // 範囲外や整数でない月は、"undefined" のような文字を出さずに誤りとして知らせる
  test.each([0, 13, -1, 1.5])(
    "monthName(%s) と monthShortLabel(%s) は RangeError を投げる",
    (month) => {
      // Act / Assert: 月名
      expect(() => monthName(month)).toThrow(RangeError);
      // Act / Assert: 略称
      expect(() => monthShortLabel(month)).toThrow(RangeError);
    },
  );

  // 月名は 12 個
  test("MONTH_NAMES は 12 か月ぶんある", () => {
    // Assert: 最初と最後
    expect([MONTH_NAMES.length, MONTH_NAMES[0], MONTH_NAMES[11]]).toEqual([
      12,
      "January",
      "December",
    ]);
  });
});

// birthstoneSpecs: 詳細パネルの特徴の一覧（見出しと値の組）
describe("birthstoneSpecs", () => {
  // labelsOf: 一覧から見出しだけを取り出す
  function labelsOf(id: BirthstoneId): string[] {
    // 見出しの列
    return birthstoneSpecs(birthstoneById(id)).map(([label]) => label);
  }

  // 透明な石は、硬度・成分・屈折率・分散・産地の順に並ぶ
  test("パール以外は分散の行を含み、決まった順に並ぶ", () => {
    // Assert: ダイヤモンドの見出しの並び
    expect(labelsOf("diamond")).toEqual(["硬度", "成分", "屈折率", "分散", "産地"]);
  });

  // パールは透明な石ではなく分散が 0 なので、「分散 0.000」の行は出さない
  test("パールは分散の行を出さない", () => {
    // Assert: 分散の無い並び
    expect(labelsOf("pearl")).toEqual(["硬度", "成分", "屈折率", "産地"]);
  });

  // 行を出すかどうかは石の名前ではなく分散の値で決める（パール以外でも分散が 0 なら出さない）
  test("分散が 0 の石なら、パールでなくても分散の行を出さない", () => {
    // Arrange: 分散だけを 0 にしたダイヤモンド（元のデータは書き換えず、新しいオブジェクトを作る）
    const stone = { ...birthstoneById("diamond"), dispersion: 0 };
    // Act: 見出しだけを取り出す
    const labels = birthstoneSpecs(stone).map(([label]) => label);
    // Assert: 分散の行が無い
    expect(labels).not.toContain("分散");
  });

  // 値の書き方（桁数やつなぎ方）
  test("硬度にはモースを付け、屈折率は小数 2 桁、分散は小数 3 桁、産地は中黒でつなぐ", () => {
    // Arrange: ダイヤモンド
    const stone = birthstoneById("diamond");
    // Act: 見出し → 値の表にする
    const specs = new Map(birthstoneSpecs(stone));
    // Assert: 硬度
    expect(specs.get("硬度")).toBe(`モース ${stone.hardness}`);
    // Assert: 屈折率（2.417 → 2.42）
    expect(specs.get("屈折率")).toBe("2.42");
    // Assert: 分散（0.044 → 0.044）
    expect(specs.get("分散")).toBe("0.044");
    // Assert: 産地
    expect(specs.get("産地")).toBe(stone.origins.join("・"));
  });
});
