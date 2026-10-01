import * as THREE from "three";
import { describe, expect, test, vi } from "vitest";
import {
  createMonthLabelHandles,
  dropFocusPromiseIfMoved,
  endFocusPromise,
  FOCUS_PROMISE_MS,
  type LabelElement,
  placeMonthLabel,
  placeMonthLabels,
  requestLabelFocus,
} from "@/lib/monthLabels";
import { projectToScreen, type ScreenPoint } from "@/lib/scenes/jewelLabels";
import { CAMERA_SMOOTH_TIME, type Vec3 } from "@/lib/scenes/jewels";

// テストは Node.js 上で動き本物の DOM が無いので、使うもの（style・focus・contains）だけを持つ偽物を渡して確かめる

// fakeLabel: スタイルとフォーカスの呼ばれ方を記録する、偽物のラベル（LabelElement として渡せる形）
function fakeLabel() {
  // 最初は何も書かれていない。focus は呼ばれ方を記録する偽物
  return {
    style: { transform: "", visibility: "" },
    focus: vi.fn<LabelElement["focus"]>(),
  };
}
// shown: 画面の中の点（x は切り捨てでは 400、四捨五入では 401 になる値にして、丸め方の取り違えを拾う）
const shown: ScreenPoint = { x: 400.6, y: 299.6, isVisible: true };
// offscreen: 画面の外の点
const offscreen: ScreenPoint = { x: 0, y: 0, isVisible: false };

// createMonthLabelHandles: ラベルの入れ物を作る
describe("createMonthLabelHandles", () => {
  // 12 か月ぶんの空き（null）と、フォーカスの約束なし
  test("12 個の null と、約束なし（null）で始まる", () => {
    // Act: 作る
    const handles = createMonthLabelHandles();
    // Assert: 12 個の null
    expect(handles.elements).toEqual(Array(12).fill(null));
    // Assert: 約束なし
    expect(handles.focusMonth).toBeNull();
    // Assert: フォーカスを預けている見出しも無い
    expect(handles.focusHolder).toBeNull();
  });

  // 呼ぶたびに新しい入れ物（ほかの画面と共有しない）。中の要素の配列も別もの
  test("呼ぶたびに別のオブジェクトと、別の要素の配列を返す", () => {
    // Act: 2 つ作る
    const first = createMonthLabelHandles();
    // もう 1 つ
    const second = createMonthLabelHandles();
    // Assert: 入れ物が別
    expect(first).not.toBe(second);
    // Assert: 要素の配列も別（片方に入れた要素が、もう片方に見えない）
    expect(first.elements).not.toBe(second.elements);
  });
});

// placeMonthLabel: ラベルを画面の位置へ動かし、見せるか隠すかを決める
describe("placeMonthLabel", () => {
  // 見える点なら、その位置に中心を合わせて見せる（px は整数に丸める）
  test("出す場面で画面の中なら、位置を書き込んで見せる", () => {
    // Arrange: ラベル
    const label = fakeLabel();
    // Act: 置く
    const isVisible = placeMonthLabel(label, shown, true, createMonthLabelHandles(), 4, 0);
    // Assert: 見えている
    expect(isVisible).toBe(true);
    // Assert: 見せた
    expect(label.style.visibility).toBe("visible");
    // Assert: 丸めた位置に、ラベルの中心を合わせた
    expect(label.style.transform).toBe("translate(401px, 300px) translate(-50%, -50%)");
  });

  // 石を選んでいる間はラベルを出さない
  test("出さない場面なら隠し、位置は書き換えない", () => {
    // Arrange: ラベル
    const label = fakeLabel();
    // Act: 出さない場面で置く
    const isVisible = placeMonthLabel(label, shown, false, createMonthLabelHandles(), 4, 0);
    // Assert: 見えていない
    expect(isVisible).toBe(false);
    // Assert: 隠した
    expect(label.style.visibility).toBe("hidden");
    // Assert: 位置は触っていない
    expect(label.style.transform).toBe("");
  });

  // カメラの後ろや画面の外
  test("画面の外の点なら隠す", () => {
    // Arrange: ラベル
    const label = fakeLabel();
    // Act: 画面の外の点で置く
    placeMonthLabel(label, offscreen, true, createMonthLabelHandles(), 4, 0);
    // Assert: 隠した
    expect(label.style.visibility).toBe("hidden");
  });

  // 閉じたあとに返す約束の月のラベルが見えたら、フォーカスを移して約束を消す
  test("約束の月のラベルが見えたら、画面を動かさずにフォーカスを移し、約束を消す", () => {
    // Arrange: 4 月に返す約束
    const handles = createMonthLabelHandles();
    // 約束を書く
    handles.focusMonth = 4;
    // ラベル
    const label = fakeLabel();
    // Act: 4 月のラベルを見せる
    placeMonthLabel(label, shown, true, handles, 4, 0);
    // Assert: 画面を動かさずにフォーカスした
    expect(label.focus).toHaveBeenCalledWith({ preventScroll: true });
    // Assert: 約束を消した
    expect(handles.focusMonth).toBeNull();
  });

  // ブラウザは visibility: hidden の要素へのフォーカスを受け付けないので、見せてからフォーカスする順番でなければならない
  test("フォーカスを移すときには、ラベルはもう見える状態になっている", () => {
    // Arrange: 4 月に返す約束
    const handles = createMonthLabelHandles();
    // 約束を書く
    handles.focusMonth = 4;
    // visibilitiesAtFocus: フォーカスを移した瞬間ごとの見え方
    const visibilitiesAtFocus: string[] = [];
    // フォーカスされた瞬間の見え方を記録するラベル（最初は隠れている）
    const label = {
      style: { transform: "", visibility: "hidden" },
      focus: vi.fn<LabelElement["focus"]>(() => {
        // 呼ばれた瞬間の見え方を覚える
        visibilitiesAtFocus.push(label.style.visibility);
      }),
    };
    // Act: 4 月のラベルを見せる
    placeMonthLabel(label, shown, true, handles, 4, 0);
    // Assert: 1 回だけ、見える状態でフォーカスされた
    expect(visibilitiesAtFocus).toEqual(["visible"]);
  });

  // 隠れているラベルにはフォーカスできないので、見えるまで約束を残す
  test("約束の月でも、隠れているならフォーカスせず、約束を残す", () => {
    // Arrange: 4 月に返す約束
    const handles = createMonthLabelHandles();
    // 約束を書く
    handles.focusMonth = 4;
    // ラベル
    const label = fakeLabel();
    // Act: まだ出さない場面で置く
    placeMonthLabel(label, shown, false, handles, 4, 0);
    // Assert: フォーカスしていない
    expect(label.focus).not.toHaveBeenCalled();
    // Assert: 約束は残る
    expect(handles.focusMonth).toBe(4);
  });

  // カードを閉じた直後は、カメラが石に寄ったままでラベルが画面の外にある。期限までは約束を残し、カメラが戻ってラベルが見えたら返す
  test("期限までは、約束の月のラベルが画面の外でも約束を残す", () => {
    // Arrange: 時刻 1000 に約束した（期限は 1000 + FOCUS_PROMISE_MS）
    const handles = createMonthLabelHandles();
    // 約束する
    requestLabelFocus({ contains: () => true }, {} as Element, handles, 4, 1000);
    // ラベル
    const label = fakeLabel();
    // Act: 期限の前に、画面の外の点で置く
    placeMonthLabel(label, offscreen, true, handles, 4, 1000 + FOCUS_PROMISE_MS - 1);
    // Assert: フォーカスしていない
    expect(label.focus).not.toHaveBeenCalled();
    // Assert: 約束は残る
    expect(handles.focusMonth).toBe(4);
  });

  // 期限を過ぎた約束は捨てる（あとでカメラを回して見えたときに、別の操作をしている人のフォーカスを奪わないように）
  test("期限を過ぎたら、ラベルが見えてもフォーカスせずに約束を捨てる", () => {
    // Arrange: 時刻 1000 に約束した
    const handles = createMonthLabelHandles();
    // 約束する
    requestLabelFocus({ contains: () => true }, {} as Element, handles, 4, 1000);
    // ラベル
    const label = fakeLabel();
    // Act: 期限を過ぎてから、画面の中の点で置く
    placeMonthLabel(label, shown, true, handles, 4, 1000 + FOCUS_PROMISE_MS + 1);
    // Assert: フォーカスしていない
    expect(label.focus).not.toHaveBeenCalled();
    // Assert: 約束を捨てた
    expect(handles.focusMonth).toBeNull();
  });

  // 約束を果たしたら、見出しに預けていたフォーカスの預け先も外す（約束が無いのに預け先だけが残らないように）
  test("約束の月のラベルへフォーカスを移したら、預け先も外す", () => {
    // Arrange: 4 月の約束があり、見出しに預けている
    const handles = { ...createMonthLabelHandles(), focusMonth: 4, focusHolder: {} as Element };
    // Act: 4 月のラベルを画面の中に置く
    placeMonthLabel(fakeLabel(), shown, true, handles, 4, 0);
    // Assert: 預け先が外れる
    expect(handles.focusHolder).toBeNull();
  });

  // 期限切れで捨てたときも、預け先を外す
  test("期限を過ぎて約束を捨てたら、預け先も外す", () => {
    // Arrange: 時刻 1000 に約束し、見出しに預けた
    const handles = createMonthLabelHandles();
    // 約束する
    requestLabelFocus({ contains: () => true }, {} as Element, handles, 4, 1000);
    // 見出しに預ける
    handles.focusHolder = {} as Element;
    // Act: 期限を過ぎてから、画面の外の点で置く
    placeMonthLabel(fakeLabel(), offscreen, true, handles, 4, 1000 + FOCUS_PROMISE_MS + 1);
    // Assert: 預け先が外れる
    expect(handles.focusHolder).toBeNull();
  });

  // 期限を過ぎて、まだ画面の外でも捨てる
  test("期限を過ぎたら、画面の外のままでも約束を捨てる", () => {
    // Arrange: 時刻 1000 に約束した
    const handles = createMonthLabelHandles();
    // 約束する
    requestLabelFocus({ contains: () => true }, {} as Element, handles, 4, 1000);
    // Act: 期限を過ぎてから、画面の外の点で置く
    placeMonthLabel(fakeLabel(), offscreen, true, handles, 4, 1000 + FOCUS_PROMISE_MS + 1);
    // Assert: 約束を捨てた
    expect(handles.focusMonth).toBeNull();
  });

  // ほかの月のラベルは約束と関係ない
  test("約束と違う月のラベルにはフォーカスしない", () => {
    // Arrange: 4 月に返す約束
    const handles = createMonthLabelHandles();
    // 約束を書く
    handles.focusMonth = 4;
    // 5 月のラベル
    const label = fakeLabel();
    // Act: 5 月のラベルを見せる
    placeMonthLabel(label, shown, true, handles, 5, 0);
    // Assert: フォーカスしていない
    expect(label.focus).not.toHaveBeenCalled();
    // Assert: 4 月の約束は残る
    expect(handles.focusMonth).toBe(4);
  });
});

// FOCUS_PROMISE_MS: 約束の期限の長さ。カメラが一覧へ戻りきるより短いと、戻る途中で約束が切れ、フォーカスが <body> に落ちる
describe("FOCUS_PROMISE_MS", () => {
  // CameraControls の smoothTime は、臨界減衰のばね（Unity の SmoothDamp と同じ）の時間の目安。
  // 角振動数 ω = 2 / smoothTime のとき、t 秒後にまだ残っている距離の割合は (1 + ωt)·e^(−ωt) になる
  test("期限までに、カメラは一覧の姿勢までの距離の 95% 以上を戻っている", () => {
    // Arrange: ばねの角振動数（1/秒）と、期限の秒数
    const omega = 2 / CAMERA_SMOOTH_TIME;
    const seconds = FOCUS_PROMISE_MS / 1000;
    // Act: 期限の時点でまだ残っている距離の割合
    const remaining = (1 + omega * seconds) * Math.exp(-omega * seconds);
    // Assert: 残りが 5% 未満（一覧の姿勢でラベルが 12 個とも画面の中にあることは jewelLabels.test.ts で確かめている）
    expect(remaining).toBeLessThan(0.05);
  });
});

// endFocusPromise: フォーカスの約束を終わらせる（果たした・捨てた・選び直した）
describe("endFocusPromise", () => {
  // 約束の月と預け先をどちらも消す（預け先だけが残ると、次の約束で古い見出しを預け先と取り違えるおそれがあるため）
  test("約束の月と、フォーカスの預け先をどちらも消す", () => {
    // Arrange: 4 月の約束があり、見出しに預けている
    const handles = { ...createMonthLabelHandles(), focusMonth: 4, focusHolder: {} as Element };
    // Act: 終わらせる
    endFocusPromise(handles);
    // Assert: 約束なし
    expect(handles.focusMonth).toBeNull();
    // Assert: 預け先なし
    expect(handles.focusHolder).toBeNull();
  });
});

// dropFocusPromiseIfMoved: 約束を待つ間に、利用者がフォーカスをほかへ動かしていたら約束を捨てる
describe("dropFocusPromiseIfMoved", () => {
  // body: ページの <body> の目印
  const body = {} as Element;
  // heading: フォーカスを預けている一覧の見出しの目印
  const heading = {} as Element;
  // slider: 利用者が Tab で移った先（操作パネルのスライダーなど）の目印
  const slider = {} as Element;
  // waiting: 4 月の約束があり、まだ見出しに預けていない入れ物（カードが消えた直後）
  const waiting = () => ({ ...createMonthLabelHandles(), focusMonth: 4 });
  // holding: 4 月の約束があり、見出しにフォーカスを預けている入れ物
  const holding = () => ({ ...createMonthLabelHandles(), focusMonth: 4, focusHolder: heading });

  // 約束が無ければ、どこにフォーカスがあっても何もしない
  test("約束が無ければ何もせず、false を返す", () => {
    // Arrange: 約束の無い入れ物
    const handles = createMonthLabelHandles();
    // Act: スライダーにフォーカスがある
    const isDropped = dropFocusPromiseIfMoved(handles, slider, body);
    // Assert: 捨てていない
    expect(isDropped).toBe(false);
    // Assert: 約束なしのまま
    expect(handles.focusMonth).toBeNull();
  });

  // 見出しに預ける前は、カードが消えてフォーカスが <body> に落ちているのがふつう
  test("見出しに預ける前は、フォーカスが <body> にあれば約束を残す", () => {
    // Arrange: 預ける前
    const handles = waiting();
    // Act: <body> にある
    const isDropped = dropFocusPromiseIfMoved(handles, body, body);
    // Assert: 捨てていない
    expect(isDropped).toBe(false);
    // Assert: 約束が残る
    expect(handles.focusMonth).toBe(4);
  });

  // フォーカスがどこにも無い（null）ときも、預ける前なら待つ
  test("見出しに預ける前は、フォーカスがどこにも無い（null）なら約束を残す", () => {
    // Arrange: 預ける前
    const handles = waiting();
    // Act: どこにも無い
    const isDropped = dropFocusPromiseIfMoved(handles, null, body);
    // Assert: 捨てていない
    expect(isDropped).toBe(false);
    // Assert: 約束が残る
    expect(handles.focusMonth).toBe(4);
  });

  // 預ける前でも、利用者がほかの要素へ動かしていたら奪い返さない
  test("見出しに預ける前でも、ほかの要素へ移っていたら約束を捨てる", () => {
    // Arrange: 預ける前
    const handles = waiting();
    // Act: スライダーへ移っている
    const isDropped = dropFocusPromiseIfMoved(handles, slider, body);
    // Assert: 捨てた
    expect(isDropped).toBe(true);
    // Assert: 約束が消える
    expect(handles.focusMonth).toBeNull();
  });

  // 預けた見出しにあるのは、待っている間のふつうの状態
  test("フォーカスが預けた見出しにあれば、約束を残す", () => {
    // Arrange: 見出しに預けている
    const handles = holding();
    // Act: 見出しにある
    const isDropped = dropFocusPromiseIfMoved(handles, heading, body);
    // Assert: 捨てていない
    expect(isDropped).toBe(false);
    // Assert: 約束が残る
    expect(handles.focusMonth).toBe(4);
  });

  // 待つ間に Tab などで移った先から、あとでラベルへ奪い返さない（WCAG 2.4.3）
  test("見出しからほかの要素へ移っていたら、約束と預け先を捨てて true を返す", () => {
    // Arrange: 見出しに預けている
    const handles = holding();
    // Act: スライダーへ移っている
    const isDropped = dropFocusPromiseIfMoved(handles, slider, body);
    // Assert: 捨てた
    expect(isDropped).toBe(true);
    // Assert: 約束が消える
    expect(handles.focusMonth).toBeNull();
    // Assert: 預け先も外れる
    expect(handles.focusHolder).toBeNull();
  });

  // 見出しに預けたあとで <body> にあるのは、利用者が 3D の画面をクリックするなどして見出しから外した印。読み上げソフトに飛び先を告げさせないよう、奪い返さない
  test("見出しに預けたあとで <body> へ外れていたら、約束を捨てる", () => {
    // Arrange: 見出しに預けている
    const handles = holding();
    // Act: <body> にある
    const isDropped = dropFocusPromiseIfMoved(handles, body, body);
    // Assert: 捨てた
    expect(isDropped).toBe(true);
    // Assert: 約束が消える
    expect(handles.focusMonth).toBeNull();
  });
});

// requestLabelFocus: 閉じようとしているカードの中にフォーカスがあれば、月のラベルへ返す約束をする
describe("requestLabelFocus", () => {
  // inside: カードの中の要素の目印
  const inside = {} as Element;
  // outside: カードの外の要素（スライダーなど）の目印
  const outside = {} as Element;
  // card: inside だけを含む、偽物のカード
  const card = { contains: (node: Node | null) => node === inside };

  // カードの中にフォーカスがあれば約束する
  test("カードの中にフォーカスがあれば、その月を約束して true を返す", () => {
    // Arrange: 入れ物
    const handles = createMonthLabelHandles();
    // Act: 4 月のカードを閉じる
    const requested = requestLabelFocus(card, inside, handles, 4, 0);
    // Assert: 約束した
    expect(requested).toBe(true);
    // Assert: 4 月
    expect(handles.focusMonth).toBe(4);
  });

  // 新しい約束は、見出しに預ける前の状態から始める（前の待ち時間の預け先を、この約束の預け先と取り違えないように）
  test("約束するときは、前の預け先を外す", () => {
    // Arrange: 前の預け先が残っている入れ物
    const handles = { ...createMonthLabelHandles(), focusHolder: {} as Element };
    // Act: カードの中にフォーカスがある状態で約束する
    requestLabelFocus(card, inside, handles, 4, 0);
    // Assert: 預け先が外れる
    expect(handles.focusHolder).toBeNull();
  });

  // 約束には期限を付ける（今の時刻 + FOCUS_PROMISE_MS）
  test("約束の期限を、今の時刻 + FOCUS_PROMISE_MS にする", () => {
    // Arrange: 入れ物
    const handles = createMonthLabelHandles();
    // Act: 時刻 500 に約束する
    requestLabelFocus(card, inside, handles, 4, 500);
    // Assert: 期限
    expect(handles.focusUntil).toBe(500 + FOCUS_PROMISE_MS);
  });

  // スライダーなど、カードの外を操作している人のフォーカスは動かさない
  test("カードの外にフォーカスがあれば、約束せず false を返す", () => {
    // Arrange: 入れ物
    const handles = createMonthLabelHandles();
    // Act: カードの外にフォーカスがある
    const requested = requestLabelFocus(card, outside, handles, 4, 0);
    // Assert: 約束しない
    expect(requested).toBe(false);
    // Assert: 約束なしのまま
    expect(handles.focusMonth).toBeNull();
  });

  // どこにもフォーカスが無い（document.activeElement が null）とき
  test("フォーカスがどこにも無い（null）ときは、約束せず false を返す", () => {
    // Arrange: 入れ物
    const handles = createMonthLabelHandles();
    // Act / Assert: 約束しない
    expect(requestLabelFocus(card, null, handles, 4, 0)).toBe(false);
    // Assert: 約束なしのまま
    expect(handles.focusMonth).toBeNull();
  });

  // カードがまだ描かれていないとき
  test("カードが無い（null）ときは、約束せず false を返す", () => {
    // Act / Assert: 約束しない
    expect(requestLabelFocus(null, inside, createMonthLabelHandles(), 4, 0)).toBe(false);
  });
});

// placeMonthLabels: 12 個のラベルを、それぞれの 3D の位置へまとめて置く（毎フレーム呼ぶ）
describe("placeMonthLabels", () => {
  // makeCamera: 手前 100 mm から原点を正面に見るカメラ（画面 800 × 600）
  function makeCamera(): THREE.PerspectiveCamera {
    // 本物のカメラで投影する
    const camera = new THREE.PerspectiveCamera(40, 800 / 600, 0.5, 2000);
    // 手前に置く
    camera.position.set(0, 0, 100);
    // 原点を見る
    camera.lookAt(0, 0, 0);
    // 行列を最新にする
    camera.updateMatrixWorld();
    // できたカメラを返す
    return camera;
  }
  // anchors: 12 か月ぶんの 3D の位置（月ごとに横へ 5 mm ずつずらし、どれも画面の中に写る）
  const anchors: Vec3[] = Array.from({ length: 12 }, (_, index) => [(index - 5.5) * 5, 0, 0]);
  // withLabels: 12 個の偽物のラベルを入れた入れ物
  function withLabels() {
    // 入れ物
    const handles = createMonthLabelHandles();
    // 12 個のラベル
    const labels = Array.from({ length: 12 }, () => ({
      style: { transform: "", visibility: "" },
      focus: vi.fn<LabelElement["focus"]>(),
    }));
    // 入れ物に入れる（テストの準備なので直接書き換える）
    labels.forEach((label, index) => {
      // 月の順の位置に入れる
      handles.elements[index] = label;
    });
    // 両方を返す
    return { handles, labels };
  }

  // 添え字 = 月 - 1 の対応がずれると、ラベルが別の石のそばに出る
  test("それぞれのラベルを、同じ添え字の 3D の位置に置く", () => {
    // Arrange: ラベルとカメラ
    const { handles, labels } = withLabels();
    // カメラ
    const camera = makeCamera();
    // Act: まとめて置く
    placeMonthLabels(handles, anchors, camera, 800, 600, true, { x: 0, y: 0, isVisible: false }, 0);
    // Assert: 12 個とも、自分の位置を写した場所にある
    labels.forEach((label, index) => {
      // 期待する位置
      const expected = projectToScreen(anchors[index], camera, 800, 600, {
        x: 0,
        y: 0,
        isVisible: false,
      });
      // 見えている
      expect(label.style.visibility).toBe("visible");
      // その位置に置いた
      expect(label.style.transform).toBe(
        `translate(${Math.round(expected.x)}px, ${Math.round(expected.y)}px) translate(-50%, -50%)`,
      );
    });
  });

  // 約束の月（12 月）のラベルだけにフォーカスする（月 = 添え字 + 1 の取り違えを拾う）
  test("約束が 12 月なら、12 番目のラベルだけにフォーカスする", () => {
    // Arrange: ラベルと、12 月の約束
    const { handles, labels } = withLabels();
    // 約束を書く
    handles.focusMonth = 12;
    // Act: まとめて置く
    placeMonthLabels(
      handles,
      anchors,
      makeCamera(),
      800,
      600,
      true,
      {
        x: 0,
        y: 0,
        isVisible: false,
      },
      0,
    );
    // Assert: 12 番目（添え字 11）だけ
    labels.forEach((label, index) => {
      // 12 月だけ呼ばれた
      expect(label.focus).toHaveBeenCalledTimes(index === 11 ? 1 : 0);
    });
    // Assert: 約束を消した
    expect(handles.focusMonth).toBeNull();
  });

  // 石を選んでいる間は、12 個とも隠す
  test("出さない場面なら、12 個とも隠す", () => {
    // Arrange: ラベル
    const { handles, labels } = withLabels();
    // Act: 出さない場面で置く
    placeMonthLabels(
      handles,
      anchors,
      makeCamera(),
      800,
      600,
      false,
      {
        x: 0,
        y: 0,
        isVisible: false,
      },
      0,
    );
    // Assert: どれも隠れている
    for (const label of labels) expect(label.style.visibility).toBe("hidden");
  });

  // 画面の外のラベルは前の位置のまま隠れ、使い回しの入れ物のせいで隣のラベルの位置が狂わない
  test("12 個のうち画面の外の 1 個だけ隠し、ほかは自分の位置に置く", () => {
    // Arrange: ラベルと、5 番目だけ画面の外（右へ 1000 mm）にした位置
    const { handles, labels } = withLabels();
    // 位置の一覧を写し替える（元の一覧は書き換えない）
    const shifted: Vec3[] = anchors.map((anchor, index) => (index === 4 ? [1000, 0, 0] : anchor));
    // 12 月に返す約束（画面の外の 5 月のラベルが、別の月の約束を捨ててしまわないかを確かめる）
    handles.focusMonth = 12;
    // カメラ
    const camera = makeCamera();
    // Act: まとめて置く
    placeMonthLabels(handles, shifted, camera, 800, 600, true, { x: 0, y: 0, isVisible: false }, 0);
    // Assert: 5 番目は隠れていて、位置は書いていない
    expect(labels[4].style.visibility).toBe("hidden");
    // 位置は空のまま
    expect(labels[4].style.transform).toBe("");
    // Assert: 12 月の約束は 5 月に捨てられず、12 月のラベルにフォーカスが返った
    expect(labels[11].focus).toHaveBeenCalledTimes(1);
    // 約束は果たされて消えた
    expect(handles.focusMonth).toBeNull();
    // Assert: 6 番目は自分の位置
    const expected = projectToScreen(shifted[5], camera, 800, 600, {
      x: 0,
      y: 0,
      isVisible: false,
    });
    // 期待する位置と同じ
    expect(labels[5].style.transform).toBe(
      `translate(${Math.round(expected.x)}px, ${Math.round(expected.y)}px) translate(-50%, -50%)`,
    );
  });

  // まだ描かれていない約束の月のラベルは、描かれるまで約束を残す（カードを閉じた直後は、ラベルがまだ描かれていないことがある）
  test("約束の月のラベルがまだ描かれていなければ、約束を残す", () => {
    // Arrange: 4 月だけ描かれていない
    const { handles } = withLabels();
    // 4 月を空にする
    handles.elements[3] = null;
    // 4 月に返す約束
    handles.focusMonth = 4;
    // Act: まとめて置く
    placeMonthLabels(
      handles,
      anchors,
      makeCamera(),
      800,
      600,
      true,
      {
        x: 0,
        y: 0,
        isVisible: false,
      },
      0,
    );
    // Assert: 約束は残る
    expect(handles.focusMonth).toBe(4);
  });

  // まだ描かれていないラベル（null）は飛ばし、ほかのラベルは置く
  test("描かれていないラベルは飛ばし、残りは置く", () => {
    // Arrange: 3 番目だけ描かれていない
    const { handles, labels } = withLabels();
    // 3 番目を空にする
    handles.elements[2] = null;
    // Act / Assert: 投げない
    expect(() =>
      placeMonthLabels(
        handles,
        anchors,
        makeCamera(),
        800,
        600,
        true,
        {
          x: 0,
          y: 0,
          isVisible: false,
        },
        0,
      ),
    ).not.toThrow();
    // Assert: 4 番目は置いた
    expect(labels[3].style.visibility).toBe("visible");
  });
});
