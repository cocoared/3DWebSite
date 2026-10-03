// screenAntialias.ts: 描き終えた画面に、後処理のアンチエイリアス（SMAA）をかける仕組み。
// 屈折の石の切子面の境目は、シェーダーが 1 ピクセルに光線 1 本で求めた色の切り替わりなので、
// キャンバスのアンチエイリアス（MSAA。ポリゴンの輪郭にしか効かない）では滑らかにならない。描き終えた画像の色の境目を見つけて混ぜる SMAA なら効く。
//
// ふつうの後処理（EffectComposer）は、画像（レンダーターゲット）へ描いてから最後にまとめてトーンマッピングするので、
// 真っ白な背景・薄くした石・影の、白との混ざり方が今と変わってしまう。そこで、今まで通り画面へ描いたあと、
// その画面を画像として写し取り（copyFramebufferToTexture）、SMAA をかけて画面へ描き戻す。見た目は今のまま、境目だけが滑らかになる。
// SMAA が受け取るのは、トーンマッピングと sRGB への変換が済んだ画面の値（three.js の SMAAPass の説明は「変換前に置く」だが、
// SMAA のシェーダーは色を変換しないので、変換済みの値を受け取って変換済みのまま描き戻せば二重にはかからない。境目の見つけ方は、人の目に近いこの値の方がむしろ合う）

import * as THREE from "three";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";

/** 画像の大きさを持つもの（`THREE.Texture` の `image` の部分だけ）。 */
interface SizedImage {
  /** 画像の大きさ（ピクセル） */
  image: {
    /** 幅（ピクセル） */
    width: number;
    /** 高さ（ピクセル） */
    height: number;
  };
}

/**
 * 写し取り用の画像を、今の描画の大きさのまま使えるかを返す。`false` なら作り直す（画面を回したとき、解像度の倍率を変えたときなど）。
 *
 * @param texture - 今の写し取り用の画像（まだ作っていなければ `null`）
 * @param width - 描画の幅（ピクセル。`renderer.getDrawingBufferSize` の値。CSS のピクセル数ではない）
 * @param height - 描画の高さ（ピクセル）
 */
export function matchesDrawingBuffer(
  texture: SizedImage | null,
  width: number,
  height: number,
): boolean {
  // 画像があり、幅も高さも同じときだけ使い回せる
  return texture !== null && texture.image.width === width && texture.image.height === height;
}

/**
 * この端末で SMAA をかけられるかを返す。SMAA の途中の画像は半精度の浮動小数点なので、それへ描く拡張機能が要る
 * （無い端末で SMAA をかけると、途中の画像が描けず、画面が真っ黒になる）。
 *
 * @param hasExtension - WebGL の拡張機能があるかを答える関数（three.js の `renderer.extensions.has`）
 */
export function supportsSmaa(hasExtension: (name: string) => boolean): boolean {
  // 半精度の画像へ描く拡張機能か、32 ビットの浮動小数点の画像へ描く拡張機能（WebGL2 では、これで半精度にも描ける）があればよい
  return hasExtension("EXT_color_buffer_half_float") || hasExtension("EXT_color_buffer_float");
}

/**
 * 今の描画の大きさで SMAA をかけられるかを返す。幅か高さが 0（キャンバスが隠れた・つぶれた）なら `false`
 * （0 × 0 の画像は作れず、SMAA の 1 ピクセルの大きさ（1 ÷ 幅）も無限大になる）。
 *
 * @param width - 描画の幅（ピクセル）
 * @param height - 描画の高さ（ピクセル）
 */
export function canDrawAntialias(width: number, height: number): boolean {
  // 幅も高さも 1 ピクセル以上のときだけ
  return width > 0 && height > 0;
}

/** `createScreenAntialias` が返す、画面を描いて SMAA をかける仕組み。 */
export interface ScreenAntialias {
  /**
   * シーンを画面へ描き、SMAA をかけて描き戻す。R3F の自動の描画の代わりに、優先度 1 以上の `useFrame` から毎フレーム呼ぶ前提。
   * SMAA をかけられない端末（`supportsSmaa`）や、描画の大きさが 0 のとき（`canDrawAntialias`）は、描くだけにする。
   * 描画の大きさが変わったら、写し取り用の画像と SMAA の途中の画像の大きさを合わせ直す（そのフレームだけ GPU のメモリを確保し直す）。
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
  /** GPU のメモリ（SMAA の途中の画像・調べ表の画像・シェーダー、写し取り用の画像）を片付ける。使い終わったら呼び出し側が呼ぶ。 */
  dispose(): void;
}

/**
 * 画面に SMAA をかける仕組みを作る。ブラウザでだけ呼ぶ（SMAA の調べ表の画像を `Image` で読み込むため）。
 * 作った時点で GPU のメモリは確保しない（最初の `render` で確保する）。使い終わったら `dispose` を呼ぶ。
 */
export function createScreenAntialias(): ScreenAntialias {
  // SMAA の 3 回の処理（境目を見つける → 混ぜる重みを求める → 境目を混ぜる）。最後の結果を画面へ直接描く
  const pass = new SMAAPass();
  // 最後の処理で、画像ではなく画面へ描く
  pass.renderToScreen = true;
  // source: SMAA に渡す入れ物。SMAA は入力の画像を「描画先（レンダーターゲット）の texture」として受け取るので、
  // 写し取った画像を texture に差し込んで渡す（この入れ物そのものへは描かない。1 × 1 で、奥行きも持たせない）
  const source = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  // placeholder: 入れ物が最初から持っている画像。差し込みで外れるので、念のため片付けられるよう控えておく（描画に使わないので GPU には載らない）
  const placeholder = source.texture;
  // texture: 画面を写し取る画像（描画の大きさが決まってから作る）
  let texture: THREE.FramebufferTexture | null = null;
  // size: 描画の大きさを受け取る入れ物（毎フレーム使い回す）
  const size = new THREE.Vector2();
  // isSupported: この端末で SMAA をかけられるか（最初の描画で、レンダラーに聞いて決める。null はまだ聞いていない）
  let isSupported: boolean | null = null;

  // resizeTexture: 写し取り用の画像を描画の大きさで作り直し、SMAA の途中の画像の大きさを合わせる
  const resizeTexture = (width: number, height: number): THREE.FramebufferTexture => {
    // 前の画像を片付ける
    texture?.dispose();
    // 描画と同じ大きさの画像
    const next = new THREE.FramebufferTexture(width, height);
    // 隣のピクセルとの間を補って読む（SMAA は境目を混ぜるときに、この補間を使う。既定の最近傍だと混ざらない）
    next.minFilter = THREE.LinearFilter;
    // 拡大するときも補間する
    next.magFilter = THREE.LinearFilter;
    // SMAA の途中の画像を同じ大きさにする
    pass.setSize(width, height);
    // 入れ物に差し込む
    source.texture = next;
    // 次のフレームから使い回す
    texture = next;
    // 作った画像を返す
    return next;
  };

  return {
    render(renderer, scene, camera) {
      // いつも通り、シーンを画面へ描く（トーンマッピングと sRGB への変換も、ここでいつも通りかかる）
      renderer.setRenderTarget(null);
      // 描く
      renderer.render(scene, camera);
      // 初めての描画なら、この端末で SMAA をかけられるかを聞いて覚える
      isSupported ??= supportsSmaa((name) => renderer.extensions.has(name));
      // かけられない端末では、描くだけにする（R3F の自動の描画と同じ見た目）
      if (!isSupported) return;
      // 描画の大きさ（ピクセル。CSS の大きさ × 解像度の倍率）
      renderer.getDrawingBufferSize(size);
      // 大きさが 0 なら、描くだけにする
      if (!canDrawAntialias(size.x, size.y)) return;
      // current: 今の大きさの写し取り用の画像（大きさが変わったら、または初めてなら、作り直す）
      const current = matchesDrawingBuffer(texture, size.x, size.y) ? texture : null;
      // target: このフレームで写し取る画像（使い回すか、新しく作る）
      const target = current ?? resizeTexture(size.x, size.y);
      // 描いたばかりの画面を画像へ写し取る（キャンバスの MSAA は、写すときにまとめられる）
      renderer.copyFramebufferToTexture(target);
      // SMAA をかけて画面へ描き戻す（最後の処理は画面へ描くので、書き込み先の引数は使われない。型を満たすため入れ物を渡す）
      pass.render(renderer, source, source, 0, false);
    },
    dispose() {
      // SMAA の途中の画像・調べ表の画像・シェーダーを片付ける
      pass.dispose();
      // 写し取り用の画像を片付ける
      texture?.dispose();
      // 入れ物が最初に持っていた画像を片付ける
      placeholder.dispose();
      // 入れ物を片付ける
      source.dispose();
      // 次に使われたときは作り直す（開発時の Strict Mode で、片付けたあとにもう一度使われることがある）
      texture = null;
    },
  };
}
