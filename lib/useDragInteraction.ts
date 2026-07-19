import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";

// DragState: 1シーンぶんのポインタ操作の生データを保持する入れ物。
// アニメーションループ(useFrame)側が毎フレーム読み取り、mx/my/tap を消費(リセット)して使う。
export interface DragState {
  drag: boolean; // 現在ドラッグ中かどうか
  mx: number; // 前回の消費以降にたまった横方向の移動量(ピクセル)
  my: number; // 前回の消費以降にたまった縦方向の移動量(ピクセル)
  tap: boolean; // ほぼ動かさずに押して離した=「タップ(クリック)」が起きたら true になる
}

// useDragInteraction: R3F キャンバスの DOM 要素にポインタ操作を配線し、DragState の ref を返すフック。
// 元コードの wire() 関数(pointerdown/move/up/cancel の登録)を React 流に置き換えたもの。
export function useDragInteraction(): { current: DragState } {
  // gl: R3F が管理する WebGL レンダラー。gl.domElement が実際の <canvas> 要素になる。
  const gl = useThree((state) => state.gl);
  // state: ドラッグの生データ。再レンダーを起こさない ref に保持し、ループから直接読み書きする。
  const state = useRef<DragState>({ drag: false, mx: 0, my: 0, tap: false });
  // px/py: 直前のポインタ座標。フレーム間の移動量(dx,dy)を求めるために覚えておく。
  const px = useRef(0);
  const py = useRef(0);
  // moved: 1回の押下〜離すまでの総移動距離。小さければ「タップ」とみなす。
  const moved = useRef(0);

  // マウント時にキャンバスへポインタイベントを登録し、アンマウント時に解除する。
  useEffect(() => {
    // el: イベントを貼り付ける対象の canvas 要素。
    const el = gl.domElement;

    // 押下: ドラッグ開始。移動量をリセットし、開始座標を記録し、ポインタを捕捉して要素外へ出ても追従させる。
    const onDown = (e: PointerEvent) => {
      state.current.drag = true; // ドラッグ中フラグを立てる
      moved.current = 0; // 累積移動距離をリセットする
      px.current = e.clientX; // 開始時の横座標を記録する
      py.current = e.clientY; // 開始時の縦座標を記録する
      try {
        el.setPointerCapture(e.pointerId); // 要素外へドラッグしても pointermove を受け取れるよう捕捉する
      } catch {
        // 一部環境で捕捉に失敗しても操作自体は続行できるので無視する
      }
    };

    // 移動: ドラッグ中のみ、前回座標との差分を移動量へ加算し、現在座標を更新する。
    const onMove = (e: PointerEvent) => {
      if (!state.current.drag) return; // ドラッグしていなければ何もしない(早期リターン)
      const dx = e.clientX - px.current; // 前フレームからの横移動量
      const dy = e.clientY - py.current; // 前フレームからの縦移動量
      px.current = e.clientX; // 現在の横座標を次回用に保存する
      py.current = e.clientY; // 現在の縦座標を次回用に保存する
      state.current.mx += dx; // 横移動を消費待ちの累積へ足す
      state.current.my += dy; // 縦移動を消費待ちの累積へ足す
      moved.current += Math.abs(dx) + Math.abs(dy); // 移動距離(絶対値)を累積してタップ判定に使う
    };

    // 離す: 総移動距離が小さければタップとみなし tap フラグを立てる。ドラッグは終了。
    const onUp = () => {
      if (state.current.drag && moved.current < 5) state.current.tap = true; // 5px 未満ならクリック扱い
      state.current.drag = false; // ドラッグ終了
    };

    // キャンセル: OS 等にジェスチャを奪われた場合。ドラッグを安全に終了する。
    const onCancel = () => {
      state.current.drag = false; // ドラッグ終了のみ行う
    };

    el.addEventListener("pointerdown", onDown); // 押下ハンドラを登録する
    el.addEventListener("pointermove", onMove); // 移動ハンドラを登録する
    el.addEventListener("pointerup", onUp); // 離すハンドラを登録する
    el.addEventListener("pointercancel", onCancel); // キャンセルハンドラを登録する

    // クリーンアップ: アンマポイント時に全リスナーを解除してメモリリークを防ぐ。
    return () => {
      el.removeEventListener("pointerdown", onDown); // 押下ハンドラを解除する
      el.removeEventListener("pointermove", onMove); // 移動ハンドラを解除する
      el.removeEventListener("pointerup", onUp); // 離すハンドラを解除する
      el.removeEventListener("pointercancel", onCancel); // キャンセルハンドラを解除する
    };
  }, [gl]); // レンダラー(=canvas)が変わったら貼り直す

  return state; // ループ側が参照する DragState の ref を返す
}
