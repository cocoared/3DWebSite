// このモジュールは、キーボードで操作している人のフォーカス（操作が届く場所）を守るための処理を集める。
// DOM の要素を受け取るが React には依存しないので、テストでは使う関数だけを持つ偽物を渡して確かめられる。

/**
 * 閉じようとしている詳細パネルの中にフォーカスがあれば、選んでいる月のボタンへフォーカスを移す。
 *
 * フォーカスのある要素が画面から消えると、フォーカスが `<body>` に落ちて、キーボードで操作していた場所を見失う（WCAG 2.4.3）。
 * そこで、パネルが消える前（選択を外す前）に呼ぶ。パネルの外（スライダーなど）にフォーカスがあるときは動かさない。
 *
 * @param panel - 閉じようとしている詳細パネル
 * @param picker - 月のボタン列。詳細パネルが出ている間は、同じ選択の状態から描いているので、押されている（`aria-pressed="true"`）ボタンが必ず 1 つある
 * @param active - 今フォーカスのある要素（`document.activeElement`）
 * @returns フォーカスを移したら `true`
 */
export function returnFocusToMonth(
  panel: HTMLElement | null,
  picker: HTMLElement | null,
  active: Element | null,
): boolean {
  // パネルが無い、またはパネルの外にフォーカスがあるなら、動かさない
  if (!panel?.contains(active)) return false;
  // 押されている（選んでいる）月のボタン。focus しか使わないので HTMLElement として受け取る
  const pressed = picker?.querySelector<HTMLElement>('button[aria-pressed="true"]');
  // 見つからなければ何もしない（上の前提どおりなら起きない）
  if (!pressed) return false;
  // フォーカスを移す
  pressed.focus();
  // 移したことを返す
  return true;
}
