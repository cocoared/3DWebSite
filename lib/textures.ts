import * as THREE from "three";

// このモジュールは、2D の <canvas> に放射状グラデーションを描いてテクスチャ化するヘルパーを提供する。
// スプライト(常にカメラを向く板)や点(パーティクル)の見た目に使う、柔らかい発光の丸を作る。
// いずれもブラウザの Canvas API を使うため、クライアント側でのみ呼び出す。

// makeGlow: 太陽の外周に重ねる、暖色(白→黄→橙→透明)の大きな光のにじみテクスチャを作る。
export function makeGlow(): THREE.CanvasTexture {
  const c = document.createElement("canvas"); // 描画先の一時 canvas 要素を生成する
  c.width = c.height = 256; // 256×256 ピクセルの正方形にする(スプライト用に十分な解像度)
  const x = c.getContext("2d")!; // 2D 描画コンテキストを取得する(必ず存在する前提で ! を付ける)
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128); // 中心(128,128)から半径128へ広がる放射状グラデーションを作る
  g.addColorStop(0, "rgba(255,244,210,0.9)"); // 中心はほぼ白い暖色で不透明度0.9
  g.addColorStop(0.2, "rgba(255,192,86,0.6)"); // 20%地点は黄橙色で半透明
  g.addColorStop(0.5, "rgba(255,116,40,0.24)"); // 50%地点は濃い橙色でごく薄く
  g.addColorStop(1, "rgba(255,80,20,0)"); // 外周は赤橙色で完全に透明(=にじんで消える)
  x.fillStyle = g; // 塗りつぶしスタイルに上のグラデーションを設定する
  x.fillRect(0, 0, 256, 256); // canvas 全面を塗って光の円を描画する
  return new THREE.CanvasTexture(c); // 描いた canvas を three.js のテクスチャに変換して返す
}

// makeSoft: 白から透明へ滑らかに消える汎用の「柔らかい丸」テクスチャ。宝石シーンの背景の光などに使う。
export function makeSoft(): THREE.CanvasTexture {
  const c = document.createElement("canvas"); // 一時 canvas を生成する
  c.width = c.height = 128; // 128×128 ピクセル(発光ボケ用なので低めの解像度で十分)
  const x = c.getContext("2d")!; // 2D コンテキストを取得する
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); // 中心(64,64)から半径64の放射状グラデーション
  g.addColorStop(0, "rgba(255,255,255,1)"); // 中心は不透明な白
  g.addColorStop(0.4, "rgba(255,255,255,0.4)"); // 40%地点で白のまま半透明に
  g.addColorStop(1, "rgba(255,255,255,0)"); // 外周は完全に透明
  x.fillStyle = g; // グラデーションを塗りに設定する
  x.fillRect(0, 0, 128, 128); // 全面を塗って柔らかい光の円を描く
  return new THREE.CanvasTexture(c); // three.js のテクスチャにして返す
}

// makeStar: 中心が鋭く光り、周囲へ暖色ににじむ「星/きらめき」用の小さなテクスチャ。点群やきらめきスプライトに使う。
export function makeStar(): THREE.CanvasTexture {
  const c = document.createElement("canvas"); // 一時 canvas を生成する
  c.width = c.height = 64; // 64×64 ピクセル(小さな点なので低解像度でよい)
  const x = c.getContext("2d")!; // 2D コンテキストを取得する
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); // 中心(32,32)から半径30の放射状グラデーション
  g.addColorStop(0, "rgba(255,255,255,1)"); // 中心は不透明な白(星の芯)
  g.addColorStop(0.3, "rgba(255,255,255,0.5)"); // 30%地点で白の半透明
  g.addColorStop(0.6, "rgba(255,225,180,0.14)"); // 60%地点で暖色のごく薄いにじみ
  g.addColorStop(1, "rgba(255,225,180,0)"); // 外周は暖色で透明
  x.fillStyle = g; // グラデーションを塗りに設定する
  x.fillRect(0, 0, 64, 64); // 全面を塗って星の光を描く
  return new THREE.CanvasTexture(c); // three.js のテクスチャにして返す
}
