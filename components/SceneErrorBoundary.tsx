"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/** SceneErrorBoundary の props。 */
interface SceneErrorBoundaryProps {
  /** この値が変わったら、エラーの表示を消して中身を描き直す（例: タブの切り替え）。 */
  resetKey: string;
  /** 守る中身（3D のキャンバス）。 */
  children: ReactNode;
}

// SceneErrorBoundaryState: 捕まえたエラー（無ければ null）
interface SceneErrorBoundaryState {
  // 表示中のエラー
  error: Error | null;
}

// SceneErrorBoundary: 3D のキャンバスの中で起きたエラー（宝石の .glb が読めない、データが壊れている など）を捕まえ、
// 画面が真っ白にならないよう、代わりに知らせを出す。R3F は <Canvas> の中のエラーを外側の React に投げ直すので、<Canvas> を囲めば捕まえられる。
// エラーバウンダリは React 19 でもクラスでしか書けないため、このファイルだけクラスのコンポーネントにしている
export default class SceneErrorBoundary extends Component<
  SceneErrorBoundaryProps,
  SceneErrorBoundaryState
> {
  // state: 最初はエラー無し
  state: SceneErrorBoundaryState = { error: null };

  // getDerivedStateFromError: 子でエラーが起きたら、描画する前にエラーを状態へ入れる（React が呼ぶ）
  static getDerivedStateFromError(error: Error): SceneErrorBoundaryState {
    // 捕まえたエラーを入れた新しい状態
    return { error };
  }

  // componentDidCatch: 原因を調べられるよう、エラーとコンポーネントの場所を開発者ツールに残す（React が呼ぶ）
  componentDidCatch(error: Error, info: ErrorInfo): void {
    // どの部品で起きたかも合わせて出す
    console.error("[SceneErrorBoundary] 3D シーンの表示に失敗しました", error, info.componentStack);
  }

  // componentDidUpdate: resetKey が変わったら（別のタブを選んだら）、エラーを消して描き直す
  componentDidUpdate(previous: SceneErrorBoundaryProps): void {
    // キーが変わっていて、エラーを表示中のときだけ消す
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      // エラー無しの新しい状態にする
      this.setState({ error: null });
    }
  }

  // render: エラーがあれば知らせを、無ければ中身を描く
  render(): ReactNode {
    // エラーが無ければ中身をそのまま描く
    if (!this.state.error) return this.props.children;
    return (
      // alert: 読み上げですぐに伝える。画面の中央に出す
      <div
        role="alert"
        className="absolute inset-0 flex items-center justify-center px-8 text-center"
      >
        {/* 知らせの文言 */}
        <p className="max-w-110 font-jp text-sm leading-[1.8] opacity-85">
          3D シーンを表示できませんでした。ページを再読み込みするか、別のシーンを選んでください。
        </p>
      </div>
    );
  }
}
