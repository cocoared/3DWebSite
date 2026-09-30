import { describe, expect, test, vi } from "vitest";
import { returnFocusToMonth } from "@/lib/focus";

// テストは Node.js 上で動き本物の DOM が無いので、使う関数（contains・querySelector・focus）だけを持つ偽物を渡して確かめる
// （lib/textures.test.ts の偽物の canvas と同じやり方）

// inside: 詳細パネルの中にある要素の目印
const inside = {} as Element;
// outside: 詳細パネルの外にある要素（スライダーなど）の目印
const outside = {} as Element;
// panel: inside だけを含む、偽物の詳細パネル
const panel = { contains: (node: Node | null) => node === inside } as unknown as HTMLElement;

// fakePicker: 押されている月のボタン（無ければ null）を返す、偽物の月のボタン列
function fakePicker(button: { focus: () => void } | null) {
  // querySelector だけを持ち、呼ばれ方を記録する
  return { querySelector: vi.fn(() => button) };
}

// returnFocusToMonth: 詳細パネルを閉じる前に、パネルの中のフォーカスを選んでいる月のボタンへ逃がす
describe("returnFocusToMonth", () => {
  // パネルの中にフォーカスがあれば、パネルが消える前に月のボタンへ移す
  test("パネルの中にフォーカスがあれば、押されている月のボタンへ移して true を返す", () => {
    // Arrange: フォーカスを受け取るボタン
    const button = { focus: vi.fn() };
    // Arrange: そのボタンを返す月のボタン列
    const picker = fakePicker(button);
    // Act: パネルの中にフォーカスがある状態で呼ぶ
    const moved = returnFocusToMonth(panel, picker as unknown as HTMLElement, inside);
    // Assert: 移した
    expect(moved).toBe(true);
    // Assert: ボタンにフォーカスした
    expect(button.focus).toHaveBeenCalledTimes(1);
    // Assert: 押されている（選んでいる）ボタンを探した
    expect(picker.querySelector).toHaveBeenCalledWith('button[aria-pressed="true"]');
  });

  // スライダーなど、パネルの外を操作している人のフォーカスは動かさない
  test("パネルの外にフォーカスがあれば、何もせず false を返す", () => {
    // Arrange: フォーカスを受け取るボタン
    const button = { focus: vi.fn() };
    // Act: パネルの外にフォーカスがある状態で呼ぶ
    const moved = returnFocusToMonth(panel, fakePicker(button) as unknown as HTMLElement, outside);
    // Assert: 移さない
    expect(moved).toBe(false);
    // Assert: ボタンにフォーカスしていない
    expect(button.focus).not.toHaveBeenCalled();
  });

  // 押されているボタンが無ければ（ふつうは起きない）、何もしない
  test("押されている月のボタンが見つからなければ、何もせず false を返す", () => {
    // Act / Assert: 移さない
    expect(returnFocusToMonth(panel, fakePicker(null) as unknown as HTMLElement, inside)).toBe(
      false,
    );
  });

  // パネルや月のボタン列がまだ描かれていないとき
  test("パネルや月のボタン列が無い（null）ときは、何もせず false を返す", () => {
    // Arrange: フォーカスを受け取るボタン
    const button = { focus: vi.fn() };
    // Act / Assert: パネルが無い
    expect(returnFocusToMonth(null, fakePicker(button) as unknown as HTMLElement, inside)).toBe(
      false,
    );
    // Act / Assert: 月のボタン列が無い
    expect(returnFocusToMonth(panel, null, inside)).toBe(false);
    // Assert: どちらでもフォーカスしていない
    expect(button.focus).not.toHaveBeenCalled();
  });
});
