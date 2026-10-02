import { useSyncExternalStore } from "react";

// REDUCED_MOTION_QUERY: OS の「視差効果を減らす／動きを減らす」設定が有効かを調べるメディアクエリ
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** 設定を見張るオブジェクトのうち、ここで使う部分（ブラウザの `MediaQueryList` と同じ形。テストで偽物を渡せるよう、使う部分だけにしている）。 */
export interface MediaQueryWatcher {
  /** 設定が有効か。 */
  readonly matches: boolean;
  /** 設定が切り替わったときに呼ぶ関数を登録する。 */
  addEventListener(type: "change", listener: () => void): void;
  /** 登録した関数を外す。 */
  removeEventListener(type: "change", listener: () => void): void;
}

/** `useSyncExternalStore` に渡す、「動きを減らす」設定を読むための関数の組。 */
export interface ReducedMotionStore {
  /** 設定の切り替わりを購読する。返した関数を呼ぶと購読をやめる。 */
  subscribe: (onChange: () => void) => () => void;
  /** 今の設定（有効なら `true`）。 */
  getSnapshot: () => boolean;
}

/**
 * 「動きを減らす」設定を読む関数の組を作る。
 *
 * メディアクエリは最初に使うときに 1 回だけ作り、使い回す（`getSnapshot` は再レンダーのたびに呼ばれるので、毎回作らない）。
 *
 * @param matchMedia - `window.matchMedia`。無い環境では `undefined` を渡す（そのときは常に「動きを減らさない」とみなす）
 */
export function createReducedMotionStore(
  matchMedia: ((query: string) => MediaQueryWatcher) | undefined,
): ReducedMotionStore {
  // query: 作ったメディアクエリ（undefined = まだ作っていない、null = matchMedia が無くて作れない）
  let query: MediaQueryWatcher | null | undefined;
  // watcher: メディアクエリを返す。最初の 1 回だけ作る
  const watcher = (): MediaQueryWatcher | null => {
    // まだ作っていなければ作る（作れなければ null）
    if (query === undefined) query = matchMedia?.(REDUCED_MOTION_QUERY) ?? null;
    // 作ったものを返す
    return query;
  };
  // 関数の組を返す
  return {
    // subscribe: 切り替わったら onChange を呼ぶよう登録し、登録を外す関数を返す
    subscribe: (onChange) => {
      // 見張るオブジェクト
      const current = watcher();
      // 見張れなければ、何もしない後始末を返す
      if (!current) return () => {};
      // 切り替わったら知らせる
      current.addEventListener("change", onChange);
      // 後始末: 同じ関数の登録を外す
      return () => current.removeEventListener("change", onChange);
    },
    // getSnapshot: 今の設定。見張れない環境では、動かしてよいとみなす
    getSnapshot: () => watcher()?.matches ?? false,
  };
}

// browserStore: アプリ全体で共有する関数の組。最初に使うときに作る（モジュールを読み込んだだけでは window に触らない）
let browserStore: ReducedMotionStore | undefined;

// store: 共有の関数の組を返す（まだ無ければ、ブラウザの matchMedia から作る）
function store(): ReducedMotionStore {
  // 最初の 1 回だけ作る。matchMedia が無い古い環境では undefined を渡す
  browserStore ??= createReducedMotionStore(window.matchMedia?.bind(window));
  // 共有の組を返す
  return browserStore;
}

// subscribe / getSnapshot: useSyncExternalStore に渡す関数。再レンダーのたびに同じ関数を渡す
// （毎回新しい関数を渡すと、React が購読をやり直してしまう）
function subscribe(onChange: () => void): () => void {
  // 共有の組で購読する
  return store().subscribe(onChange);
}

// 今の設定を読む
function getSnapshot(): boolean {
  // 共有の組で読む
  return store().getSnapshot();
}

// getServerSnapshot: サーバーで描画するときの値。このアプリの 3D はクライアントだけで描くが、useSyncExternalStore が求めるので用意する
function getServerSnapshot(): boolean {
  // サーバーには OS の設定が無いので、動かしてよいとみなす
  return false;
}

/**
 * OS の「動きを減らす」設定（`prefers-reduced-motion: reduce`）が有効かを返すフック。
 *
 * 設定が途中で切り替わると再レンダーされる。有効なときは、自動で始まる動きを止める（カメラは飛ばずにその場で切り替え、選んだ石は回さず、描く範囲のずらしもすぐに切り替える。動きではない、ほかの石を薄くする変化と、利用者の操作への小さな反応である、指を乗せた石の浮き上がりは止めない）。
 * `window` を読むので、クライアントで描画するコンポーネントから呼ぶ。
 */
export function usePrefersReducedMotion(): boolean {
  // ブラウザの設定を React の状態として読む（React 18 以降の、外部の値を購読する標準の方法）
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
