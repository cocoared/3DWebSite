import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { BIRTHSTONE_IDS } from "@/lib/birthstones";
import {
  autoplayFrame,
  autoplayFrameAt,
  autoplayOriginFor,
  dragFrame,
  originAfterManualTurn,
  TURNTABLE_AUTOPLAY_MS,
  TURNTABLE_FRAMES,
  TURNTABLE_RESUME_DELAY_MS,
  turntableFrameUrl,
  turntableFrameUrls,
  turntableLoadingMessage,
  wrapFrame,
} from "@/lib/turntable";

// PUBLIC_DIR: Next.js が / の URL で配信するフォルダ（テストはリポジトリのルートで動く）
const PUBLIC_DIR = join(process.cwd(), "public");

// 連番画像の URL（Blender の render_turntables.py が書き出す名前と同じ）
describe("turntableFrameUrl / turntableFrameUrls", () => {
  // 番号は 2 桁のゼロ埋め
  test("番号を 2 桁にそろえた URL を返す", () => {
    // Assert: 最初の 1 枚
    expect(turntableFrameUrl("diamond", 0)).toBe("/jewels/turntable/diamond/00.webp");
    // Assert: 最後の 1 枚
    expect(turntableFrameUrl("blue-topaz", 47)).toBe("/jewels/turntable/blue-topaz/47.webp");
  });

  // 1 周ぶんの URL を順に並べる
  test("1 周ぶん（TURNTABLE_FRAMES 枚）の URL を順に返す", () => {
    // Act: ルビーの一覧
    const urls = turntableFrameUrls("ruby");
    // Assert: 枚数
    expect(urls).toHaveLength(TURNTABLE_FRAMES);
    // Assert: 重複が無い
    expect(new Set(urls).size).toBe(TURNTABLE_FRAMES);
    // Assert: 2 枚目は 01
    expect(urls[1]).toBe("/jewels/turntable/ruby/01.webp");
  });
});

// wrapFrame: 1 周を超えた番号や負の番号を 0〜(枚数-1) に戻す
describe("wrapFrame", () => {
  // [入力, 期待する番号]（48 枚のとき）
  test.each([
    // 範囲内はそのまま
    [5, 5],
    // ちょうど 1 周で 0 に戻る
    [48, 0],
    // 1 つ戻ると最後の 1 枚
    [-1, 47],
    // 2 周目の最後
    [95, 47],
    // 負の方向に 1 周以上
    [-49, 47],
    // 小数は近い番号に丸める
    [2.6, 3],
    // 負のちょうど半分は 0 へ丸める（Math.round は大きいほうへ丸めるので -0.5 → -0 → 0）
    [-0.5, 0],
    // 半分を超えて負なら、1 つ戻った最後の 1 枚
    [-0.6, 47],
  ])("wrapFrame(%d) は %d", (frame, expected) => {
    // Assert: 期待する番号
    expect(wrapFrame(frame, 48)).toBe(expected);
  });
});

// dragFrame: ドラッグした距離（px）から表示する番号を決める
describe("dragFrame", () => {
  // 動かさなければ同じ番号
  test("ドラッグ 0 px なら始めの番号のまま", () => {
    // Assert: そのまま
    expect(dragFrame(10, 0, 8, 48)).toBe(10);
  });

  // 右へドラッグすると番号が進む（石の手前の面が右へ動くように見える）
  test("右へ 1 コマぶん（8 px）動かすと 1 つ進み、左へ動かすと 1 つ戻る", () => {
    // Assert: 右へ
    expect(dragFrame(10, 8, 8, 48)).toBe(11);
    // Assert: 左へ
    expect(dragFrame(10, -8, 8, 48)).toBe(9);
  });

  // 1 周を超えても番号は範囲内に収まる
  test("大きく動かしても 0〜47 に収まる", () => {
    // Assert: 右へ 1 周 + 2 コマ
    expect(dragFrame(0, 8 * 50, 8, 48)).toBe(2);
    // Assert: 左へ 1 コマ（0 の手前）
    expect(dragFrame(0, -8, 8, 48)).toBe(47);
  });
});

// autoplayFrame: 触っていない間の自動回転。経過時間から番号を決める
describe("autoplayFrame", () => {
  // 1 コマの時間ごとに 1 つ進む
  test("経過時間を 1 コマの時間で割った分だけ進む", () => {
    // Assert: 1 コマ未満はそのまま
    expect(autoplayFrame(3, 99, 100, 48)).toBe(3);
    // Assert: 2.5 コマぶんで 2 つ進む
    expect(autoplayFrame(3, 250, 100, 48)).toBe(5);
    // Assert: 1 周を超えたら戻る
    expect(autoplayFrame(47, 100, 100, 48)).toBe(0);
  });
});

// autoplayOriginFor: 画面の更新ごとに、自動回転の起点（いつ・どの番号から回すか）を決める
describe("autoplayOriginFor", () => {
  // ドラッグ中は指の動きを優先し、自動回転の起点を捨てる
  test("ドラッグ中は起点を捨てる（null を返す）", () => {
    // Act / Assert: 起点があっても捨てる
    expect(autoplayOriginFor({ startTime: 0, startFrame: 3 }, 500, 7, true)).toBeNull();
  });

  // 起点が無ければ、今の時刻と今の番号から回し始める
  test("起点が無ければ、今の時刻と番号を起点にする", () => {
    // Act / Assert: 今（1000 ms）の番号 7 から
    expect(autoplayOriginFor(null, 1000, 7, false)).toEqual({ startTime: 1000, startFrame: 7 });
  });

  // 起点があれば、そのまま使い続ける（同じオブジェクトを返し、毎回作り直さない）
  test("起点があれば、そのまま返す", () => {
    // Arrange: 今ある起点
    const origin = { startTime: 200, startFrame: 3 };
    // Act / Assert: 同じもの
    expect(autoplayOriginFor(origin, 1000, 7, false)).toBe(origin);
  });
});

// autoplayFrameAt: 起点と今の時刻から、表示する番号を決める
describe("autoplayFrameAt", () => {
  // 手で回したあとの待ち時間（起点の時刻が未来）の間は進めない
  test("起点の時刻より前は、今の番号のまま", () => {
    // Act / Assert: 起点は 3000 ms、今は 2000 ms
    expect(autoplayFrameAt({ startTime: 3000, startFrame: 3 }, 2000, 9)).toBe(9);
  });

  // 起点の時刻を過ぎたら、起点の番号から経過時間の分だけ進む
  test("起点の時刻を過ぎたら、経過時間に応じて進む", () => {
    // Act: 起点から 1 コマ 2.5 つぶん経った
    const frame = autoplayFrameAt(
      { startTime: 1000, startFrame: 3 },
      1000 + TURNTABLE_AUTOPLAY_MS * 2.5,
      9,
    );
    // Assert: 起点の番号 3 から 2 つ進む（途中のコマは切り捨て）
    expect(frame).toBe(5);
  });
});

// originAfterManualTurn: ドラッグやボタンで手で回したあとの、自動回転の起点
describe("originAfterManualTurn", () => {
  // 自動回転中なら、少し待ってから今の番号で再開する
  test("自動回転中なら、TURNTABLE_RESUME_DELAY_MS 後に今の番号から再開する起点を作る", () => {
    // Act / Assert: 1000 ms に番号 5 まで回した
    expect(originAfterManualTurn(1000, 5, true)).toEqual({
      // 待ち時間のあとに回り始める
      startTime: 1000 + TURNTABLE_RESUME_DELAY_MS,
      // 手で回した番号から
      startFrame: 5,
    });
  });

  // 止めている間は起点を作らない（作ると、再開したときに古い起点から数えて番号が飛ぶ）
  test("止めている間に手で回しても、起点を作らない（null を返す）", () => {
    // Act / Assert: 起点は無い
    expect(originAfterManualTurn(1000, 5, false)).toBeNull();
  });

  // React のレビューで見つかった不具合の再現: 止める → 手で回す → 2.5 秒以上待つ → 再開 で、番号が飛んでいた
  test("止めて手で回し、しばらく待ってから再開しても、番号は飛ばずに今の番号から回り始める", () => {
    // Arrange: 止めている間に、1000 ms の時点で番号 5 まで手で回した
    const afterTurn = originAfterManualTurn(1000, 5, false);
    // Act: 6000 ms に再開した、最初の画面の更新での起点
    const resumed = autoplayOriginFor(afterTurn, 6000, 5, false);
    // Assert: 起点は再開した時刻と今の番号
    expect(resumed).toEqual({ startTime: 6000, startFrame: 5 });
    // Assert: 最初に表示する番号は 5 のまま（古い起点から数えて 27 などへ飛ばない）
    expect(resumed && autoplayFrameAt(resumed, 6000, 5)).toBe(5);
  });
});

// turntableLoadingMessage: スクリーンリーダー向けの、写真の読み込みの知らせ
describe("turntableLoadingMessage", () => {
  // すぐ読み込めたときは知らせない（読み上げの場所は最初は空にしておき、替わったときだけ読み上げさせるため）
  test("読み込みが長引かなければ、読み込み中でも読み込めたあとでも空の文にする", () => {
    // Assert: 読み込み中
    expect(turntableLoadingMessage(false, false, false)).toBe("");
    // Assert: 読み込めたあと
    expect(turntableLoadingMessage(true, false, false)).toBe("");
  });

  // 長引いたときだけ、始まりと終わりの 2 回知らせる（枚数は毎回読み上げると邪魔なので出さない）
  test("読み込みが長引いたら「読み込み中」、そのあと読み込めたら「読み込みました」にする", () => {
    // Assert: 読み込み中
    expect(turntableLoadingMessage(false, false, true)).toBe("写真を読み込み中です。");
    // Assert: 読み込めたあと
    expect(turntableLoadingMessage(true, false, true)).toBe("写真を読み込みました。");
  });

  // 失敗は role="alert" の表示が伝えるので、ここでは重ねて知らせない
  test("読み込みに失敗したときは空の文にする", () => {
    // Assert: 長引いたあとに失敗
    expect(turntableLoadingMessage(false, true, true)).toBe("");
  });
});

// public/ に置いた連番画像が、12 石 × 1 周ぶんそろっているか（Blender の render_turntables.py で作る）
describe("public/jewels/turntable の資産", () => {
  // 12 石それぞれについて確かめる
  test.each([...BIRTHSTONE_IDS])("%s の連番画像が 1 周ぶんそろっている", (id) => {
    // Act: 無い画像の一覧
    const missing = turntableFrameUrls(id).filter((url) => !existsSync(join(PUBLIC_DIR, url)));
    // Assert: 無いものが 1 つも無い
    expect(missing).toEqual([]);
  });
});
