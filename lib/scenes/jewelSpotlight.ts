// 誕生石シーン（THE JEWELS）で、選んだ石を真上から照らすスポットライトのロジック。
// 光源の置き方と動き（点く・消える・次の石へ移る）、白い背景の上でも見える光の筋と足元の光だまりのマテリアル。
// 描画（JSX）は components/scenes/JewelsScene.tsx の JewelSpotlight。長さの単位はミリメートル（lib/scenes/jewels.ts と同じ）。
//
// 背景は真っ白なので、光を足し合わせる（加算合成）と白のままで見えない。そこで、暖かい色を薄く「重ねて塗る」（ふつうの半透明）ことで、
// 白の上に淡い暖色のにじみとして光を見せる（2026-10-02 のユーザーの選択「白のまま淡く当てる」）。

import * as THREE from "three";
import { ringPosition, type Vec3 } from "@/lib/scenes/jewels";

/** スポットライトを置く高さ（床から。mm）。高いほど光の筋が長く、真上から当たって見える。 */
export const SPOTLIGHT_HEIGHT_MM = 70;

/** スポットライトの光の広がり（中心から縁までの角度。ラジアン）。光の筋の下端の太さが決まる。大きいほど筋が太い。 */
export const SPOTLIGHT_ANGLE_RAD = 0.09;

/** 光の筋（円すい）の上端（光源のそば）の半径（mm）。0 にすると先がとがる。 */
export const BEAM_TOP_RADIUS_MM = 0.6;

/** 光の筋の下端（床）の半径（mm）。スポットライトの光の円すいが床に届く所の半径と同じにする。 */
export const BEAM_BOTTOM_RADIUS_MM = SPOTLIGHT_HEIGHT_MM * Math.tan(SPOTLIGHT_ANGLE_RAD);

/**
 * 足元の光だまり（床に置く円盤）の半径（mm）。石（いちばん大きい石で 8 mm）のまわりに見え、隣の石（中心の間隔 約 15.5 mm）にはかからない大きさ。
 * 大きくすると光だまりが広がり、隣の石の足元まで暖色になる。
 */
export const POOL_RADIUS_MM = 7;

/**
 * 光の筋・光だまり・スポットライトの光の色（`#rrggbb`。白熱灯のような暖かい色）。
 * 白い背景の上に薄く重ねて塗るので、白に近すぎると見えない。濃くするほど、筋と光だまりがはっきりした橙色になる。
 */
export const SPOTLIGHT_COLOR = "#ffc37a";

/**
 * スポットライトが点いているときの、光の筋のいちばん濃い所（光源のそばの芯）の不透明度（0〜1）。
 * 画面を見て決めた値。大きくすると筋がはっきり見えるが、石の手前を通る筋が石の色を濁らせる。
 */
export const BEAM_OPACITY = 0.35;

/**
 * スポットライトが点いているときの、足元の光だまりの中心の不透明度（0〜1）。画面を見て決めた値。
 * 大きいほど足元が濃い暖色になる（石の影の濃さ 0.55 のとき、0.45 では影と混ざって茶色く濁った）。
 */
export const POOL_OPACITY = 0.3;

/**
 * スポットライトの明るさがこれより小さいときは、光の筋と光だまりを描かない（`mesh.visible = false`。描く手間を省く）。
 * 濃さは明るさ × 最大の濃さなので、この明るさでは目に見えない。`SPOTLIGHT_SNAP_LEVEL` より小さくする
 * （その間の明るさで新しい石へすぐ移るときは、まだ描いているが、濃さは 1% 未満で瞬間移動は見えない）。
 */
export const BEAM_VISIBLE_LEVEL = 0.001;

/**
 * スポットライトの明るさがこれより小さければ、消えているとみなす。次に石を選んだとき、前の石から滑らせずに新しい石の上へすぐ移す。
 * 大きくすると、消えかけの光が残っているうちに選び直しても、すぐ移るようになる。
 */
export const SPOTLIGHT_SNAP_LEVEL = 0.02;

// SPOTLIGHT_SMOOTHING: スポットライトが点く・消える・次の石へ移る速さ（MathUtils.damp の係数。大きいほど速い）。
// 5 だと約 0.8 秒でほぼ着き、カメラの移動（CAMERA_SMOOTH_TIME）とそろう
const SPOTLIGHT_SMOOTHING = 5;

/** スポットライトの置き方。光源の位置と、光を向ける先（どちらも mm）。 */
export interface SpotlightAim {
  /** 光源の位置。 */
  readonly position: Vec3;
  /** 光を向ける先。 */
  readonly target: Vec3;
}

/**
 * 選んだ石を真上から照らすスポットライトの置き方を求める。光源は石の真上の高さ `SPOTLIGHT_HEIGHT_MM`、向ける先は石の真下の床。
 *
 * @param month - 誕生月（1〜12）
 */
export function spotlightAim(month: number): SpotlightAim {
  // 石の床の上の位置（高さは使わない）
  const [x, , z] = ringPosition(month);
  // 光源は石の真上、向ける先は石の真下の床
  return { position: [x, SPOTLIGHT_HEIGHT_MM, z], target: [x, 0, z] };
}

/**
 * フレーム間で持ち越すスポットライトの状態。`advanceSpotlight` が毎フレーム**直接書き換える**（毎フレームの割り当てを避けるため）。
 * `position` と `target` の `readonly` は「別のベクトルに差し替えない」という意味で、ベクトルの中身は書き換わる。
 */
export interface SpotlightState {
  /** 明るさ（0 = 消えている〜1 = 点いている）。光の強さと、光の筋・光だまりの濃さに掛ける。 */
  level: number;
  /** 光源の今の位置（mm）。 */
  readonly position: THREE.Vector3;
  /** 光を向けている今の先（mm）。 */
  readonly target: THREE.Vector3;
}

/** 消えた状態のスポットライトを作る（シーンを開いたときに 1 回）。 */
export function createSpotlightState(): SpotlightState {
  // 明るさ 0、位置は原点（最初に点くときに、選んだ石の上へすぐ移る）
  return { level: 0, position: new THREE.Vector3(), target: new THREE.Vector3() };
}

/**
 * スポットライトを 1 フレーム進める。`useFrame` から毎フレーム呼ぶ前提で、`state` を**直接書き換える**。
 *
 * - 石を選んでいれば明るくし、その石の上へ動かす。消えている状態から点くときは、前の石から滑らせずにすぐ移す。
 * - 選んでいなければ、その場で暗くする（位置は動かさない）。
 *
 * @param state - 前のフレームまでの状態（直接書き換える）
 * @param aim - 照らす石の置き方（`spotlightAim`）。石を選んでいなければ `null`
 * @param delta - 前フレームからの経過秒数。`Infinity` を渡すと、その場で目標へ切り替える（動きを減らす設定のとき）。
 *   0 以下や NaN では何もしない（NaN が一度入ると、明るさと位置がずっと NaN のまま戻らなくなるため）。
 *   `state.level` が有限でなければ、消えている（0）ものとして扱う
 */
export function advanceSpotlight(
  state: SpotlightState,
  aim: SpotlightAim | null,
  delta: number,
): void {
  // 壊れた・進まない経過秒数（0 以下・NaN）では何もしない（NaN は比較がいつも false になるので、0 より大きいかどうかで見分ける）
  if (!(delta > 0)) return;
  // 明るさが壊れていたら（NaN など）、消えているものとして立て直す（NaN のままだと、光の筋がずっと出なくなる。性能のため直接書き換える）
  if (!Number.isFinite(state.level)) state.level = 0;
  // 石を選んでいなければ、明るさだけを 0 へ近づける（性能のため直接書き換える）
  if (!aim) {
    // 今いる石の上で暗くしていく（滑っている途中なら、その途中の位置で）
    state.level = THREE.MathUtils.damp(state.level, 0, SPOTLIGHT_SMOOTHING, delta);
    // 位置は動かさずに終える
    return;
  }
  // 消えているなら、新しい石の上へすぐ移す（前に照らした石から床の上を滑ってこないように）
  if (state.level < SPOTLIGHT_SNAP_LEVEL) {
    // 光源を石の上へ（性能のため直接書き換える）
    state.position.set(...aim.position);
    // 向ける先を石の下へ（性能のため直接書き換える）
    state.target.set(...aim.target);
  } else {
    // 点いているなら、光源を少しずつ次の石の上へ動かす（性能のため直接書き換える）
    dampVector(state.position, aim.position, delta);
    // 向ける先も同じ速さで動かす（性能のため直接書き換える）
    dampVector(state.target, aim.target, delta);
  }
  // 明るさを 1 へ近づける（性能のため直接書き換える）
  state.level = THREE.MathUtils.damp(state.level, 1, SPOTLIGHT_SMOOTHING, delta);
}

// dampVector: ベクトルの 3 成分を、それぞれ目標へ少しずつ近づける（MathUtils.damp。性能のため直接書き換える）
function dampVector(current: THREE.Vector3, goal: Vec3, delta: number): void {
  // x・y・z をそれぞれ目標へ近づける
  current.set(
    // x
    THREE.MathUtils.damp(current.x, goal[0], SPOTLIGHT_SMOOTHING, delta),
    // y
    THREE.MathUtils.damp(current.y, goal[1], SPOTLIGHT_SMOOTHING, delta),
    // z
    THREE.MathUtils.damp(current.z, goal[2], SPOTLIGHT_SMOOTHING, delta),
  );
}

/**
 * 光の筋と光だまりのマテリアル。シェーダーに渡す 2 つの値（`uColor` と `uOpacity`）の型を決めておき、入れる値の型の間違いを見つける。
 * 名前の書き間違い（`uOpacty` など）までは見つけられない（three.js の `uniforms` はどんな名前でも受け付けるため）。
 */
export type GlowMaterial = THREE.ShaderMaterial & {
  /** シェーダーに渡す値。 */
  uniforms: {
    /** 色。 */
    uColor: THREE.IUniform<THREE.Color>;
    /** いちばん濃い所の不透明度（0 で見えない）。 */
    uOpacity: THREE.IUniform<number>;
  };
};

// createGlowMaterial: 光の筋と光だまりに共通の、暖かい色を薄く重ねて塗るマテリアルを作る（違うのはピクセルの濃さの式と、裏の面を描くか）
function createGlowMaterial(fragmentShader: string, side: THREE.Side): GlowMaterial {
  // シェーダーに渡す値（名前と型を GlowMaterial の uniforms に合わせる）
  const uniforms: GlowMaterial["uniforms"] = {
    // 色（three.js の色管理で線形 RGB に直る）
    uColor: { value: new THREE.Color(SPOTLIGHT_COLOR) },
    // 濃さ（setGlowStrength がスポットライトの明るさに合わせて書き換える。0 で見えない）
    uOpacity: { value: 0 },
  };
  // 半透明のシェーダーマテリアル（uniforms は上で型を決めたものなので、その型として返す）
  return new THREE.ShaderMaterial({
    // シェーダーに渡す値
    uniforms,
    // 頂点シェーダー: 面の向き・カメラへの向き・uv を、ピクセルごとの計算へ渡す
    vertexShader: /* glsl */ `
      // 形に貼る座標（円すいでは uv.y が下端 0・上端 1、円盤では中心が (0.5, 0.5)）
      varying vec2 vUv;
      // 面の向き（カメラから見た座標）
      varying vec3 vNormalView;
      // この点からカメラへの向き（カメラから見た座標）
      varying vec3 vToCamera;

      void main() {
        // uv をそのまま渡す
        vUv = uv;
        // カメラから見た位置
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        // 面の向きをカメラから見た座標に直す
        vNormalView = normalize(normalMatrix * normal);
        // カメラはカメラ座標の原点にあるので、位置を反転するとカメラへの向きになる
        vToCamera = normalize(-viewPosition.xyz);
        // 画面の上の位置
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    // フラグメントシェーダー（筋か光だまりかで違う）
    fragmentShader,
    // 半透明として、不透明な物のあとに描く
    transparent: true,
    // ふつうの重ね塗り（足し合わせると、白い背景の上では白のままで見えない）
    blending: THREE.NormalBlending,
    // 奥行きを書き込まない（向こうの石や影を隠さない）
    depthWrite: false,
    // 描く面（筋は両面、光だまりは表だけ）
    side,
    // トーンマッピングしない印。ShaderMaterial では、実際に効くのはシェーダーに tonemapping_fragment を入れないこと（入れていない）。
    // 露出 2 倍で暖色が白へ飛ばないようにするため。あとで tonemapping_fragment を足したときの保険として印も付けておく
    toneMapped: false,
  }) as GlowMaterial;
}

/**
 * 光の筋（スポットライトの光が空気中のちりに当たって見える円すい）のマテリアルを作る。`CylinderGeometry`（ふたなし）に貼る。
 * 円すいの側面のうち、こちらを向いている所ほど濃く（芯が濃く、輪郭が薄い）、光源に近いほど濃く、床へ向かって薄くする。最初は濃さ 0（見えない）。
 *
 * 呼び出し側の責任: 使い終わったら `dispose()` する（GPU のシェーダーを片付ける）。
 */
export function createBeamMaterial(): GlowMaterial {
  // 筋の濃さの式で作る（内側の面も描いて、厚みがあるように見せる）
  return createGlowMaterial(
    /* glsl */ `
      // 筋の色
      uniform vec3 uColor;
      // いちばん濃い所の不透明度（0 で見えない）
      uniform float uOpacity;
      // uv（y は下端 0・上端 1）
      varying vec2 vUv;
      // 面の向き
      varying vec3 vNormalView;
      // カメラへの向き
      varying vec3 vToCamera;

      void main() {
        // 面がカメラを向いているほど 1、真横を向いているほど 0（円すいの輪郭ほど 0 になり、筋の縁がぼける）。
        // 内側の面（裏）も描くので、向きの正負は abs で無視する。2 乗して芯を細く見せる
        float facing = pow(abs(dot(normalize(vNormalView), normalize(vToCamera))), 2.0);
        // 光源（上端）に近いほど濃く、床（下端）へ向かって 0.15 まで薄くする（光が広がって弱まる見え方）。
        // 0.15 を大きくすると床のそばまで筋が濃く残り、石の手前の筋が石の色を濁らせる
        float falloff = mix(0.15, 1.0, vUv.y);
        // 色はそのまま、濃さだけを不透明度にして重ねて塗る
        gl_FragColor = vec4(uColor, facing * falloff * uOpacity);
        // 出力の色空間（sRGB）に直す
        #include <colorspace_fragment>
      }
    `,
    // 両面を描く
    THREE.DoubleSide,
  );
}

/**
 * 足元の光だまり（床に置く円盤）のマテリアルを作る。`CircleGeometry` に貼る（uv の中心 (0.5, 0.5) が円盤の中心）。
 * 中心から縁へ向かってなめらかに薄くなる、暖かい色の円。最初は濃さ 0（見えない）。
 *
 * 呼び出し側の責任: 使い終わったら `dispose()` する（GPU のシェーダーを片付ける）。
 */
export function createPoolMaterial(): GlowMaterial {
  // 光だまりの濃さの式で作る（上から見るだけなので表の面だけ）
  return createGlowMaterial(
    /* glsl */ `
      // 光だまりの色
      uniform vec3 uColor;
      // 中心の不透明度（0 で見えない）
      uniform float uOpacity;
      // uv（中心が 0.5, 0.5）
      varying vec2 vUv;

      void main() {
        // 中心からの距離（円盤の縁で 1）
        float radius = length(vUv - 0.5) * 2.0;
        // 半径の 0.25 倍までは同じ濃さ、そこから縁へなめらかに 0 にする（縁がくっきりしないように）
        float fade = 1.0 - smoothstep(0.25, 1.0, radius);
        // 色はそのまま、濃さだけを不透明度にして重ねて塗る
        gl_FragColor = vec4(uColor, fade * uOpacity);
        // 出力の色空間（sRGB）に直す
        #include <colorspace_fragment>
      }
    `,
    // 表の面だけ（床に寝かせて上から見る）
    THREE.FrontSide,
  );
}

/**
 * 光の筋か光だまりの濃さを、スポットライトの明るさに合わせる。毎フレーム呼んでよい（uniform を**直接書き換える**だけ）。
 *
 * @param material - `createBeamMaterial` か `createPoolMaterial` で作ったマテリアル
 * @param level - スポットライトの明るさ（0〜1）
 * @param maxOpacity - 点いているときの濃さ（`BEAM_OPACITY` か `POOL_OPACITY`）
 */
export function setGlowStrength(material: GlowMaterial, level: number, maxOpacity: number): void {
  // 濃さ = 明るさ × 点いているときの濃さ（性能のため直接書き換える）
  material.uniforms.uOpacity.value = level * maxOpacity;
}
