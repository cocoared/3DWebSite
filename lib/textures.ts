import * as THREE from "three";

// このモジュールは、2D の <canvas> に放射状グラデーションを描いてテクスチャ化するヘルパーを提供する。
// スプライト(常にカメラを向く板)や点(パーティクル)の見た目に使う、柔らかい発光の丸を作る。
// いずれもブラウザの Canvas API を使うため、クライアント側でのみ呼び出す。

/**
 * `<canvas>` から 2D 描画コンテキストを取り出す。
 *
 * ブラウザが 2D 描画に対応していない（またはメモリ不足などで作れない）場合、
 * `getContext("2d")` は `null` を返す。そのまま使うと原因のわかりにくい TypeError になるため、ここで理由付きのエラーにする。
 *
 * @throws {Error} 2D コンテキストを取得できなかった場合
 */
export function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  // 2D 描画コンテキストを要求する（対応していなければ null が返る）
  const ctx = canvas.getContext("2d");
  // 取得できなければ、何が起きたかわかるメッセージで止める（null のまま進めて後で落ちるのを防ぐ）
  if (!ctx) {
    // 原因がわかるメッセージ付きでエラーを投げる
    throw new Error("Canvas 2D コンテキストを取得できませんでした（テクスチャを生成できません）");
  }
  // 取得できたコンテキストを返す
  return ctx;
}

// makeGlow: 太陽の外周に重ねる、暖色(白→黄→橙→透明)の大きな光のにじみテクスチャを作る。
export function makeGlow(): THREE.CanvasTexture {
  // 描画先の一時 canvas 要素を生成する
  const c = document.createElement("canvas");
  // 256×256 ピクセルの正方形にする(スプライト用に十分な解像度)
  c.width = c.height = 256;
  // 2D 描画コンテキストを取得する(取得できなければ get2dContext がエラーにする)
  const x = get2dContext(c);
  // 中心(128,128)から半径128へ広がる放射状グラデーションを作る
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  // 中心はほぼ白い暖色で不透明度0.9
  g.addColorStop(0, "rgba(255,244,210,0.9)");
  // 20%地点は黄橙色で半透明
  g.addColorStop(0.2, "rgba(255,192,86,0.6)");
  // 50%地点は濃い橙色でごく薄く
  g.addColorStop(0.5, "rgba(255,116,40,0.24)");
  // 外周は赤橙色で完全に透明(=にじんで消える)
  g.addColorStop(1, "rgba(255,80,20,0)");
  // 塗りつぶしスタイルに上のグラデーションを設定する
  x.fillStyle = g;
  // canvas 全面を塗って光の円を描画する
  x.fillRect(0, 0, 256, 256);
  // 描いた canvas を three.js のテクスチャに変換して返す
  return new THREE.CanvasTexture(c);
}

// makeStar: 中心が鋭く光り、周囲へ暖色ににじむ「星/きらめき」用の小さなテクスチャ。点群やきらめきスプライトに使う。
export function makeStar(): THREE.CanvasTexture {
  // 一時 canvas を生成する
  const c = document.createElement("canvas");
  // 64×64 ピクセル(小さな点なので低解像度でよい)
  c.width = c.height = 64;
  // 2D コンテキストを取得する(取得できなければ get2dContext がエラーにする)
  const x = get2dContext(c);
  // 中心(32,32)から半径30の放射状グラデーション
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
  // 中心は不透明な白(星の芯)
  g.addColorStop(0, "rgba(255,255,255,1)");
  // 30%地点で白の半透明
  g.addColorStop(0.3, "rgba(255,255,255,0.5)");
  // 60%地点で暖色のごく薄いにじみ
  g.addColorStop(0.6, "rgba(255,225,180,0.14)");
  // 外周は暖色で透明
  g.addColorStop(1, "rgba(255,225,180,0)");
  // グラデーションを塗りに設定する
  x.fillStyle = g;
  // 全面を塗って星の光を描く
  x.fillRect(0, 0, 64, 64);
  // three.js のテクスチャにして返す
  return new THREE.CanvasTexture(c);
}
