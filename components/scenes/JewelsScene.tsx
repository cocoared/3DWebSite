"use client";

import {
  CameraControls,
  CameraControlsImpl,
  ContactShadows,
  MeshRefractionMaterial,
  PerspectiveCamera,
  useEnvironment,
  useGLTF,
} from "@react-three/drei";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { BIRTHSTONES, type Birthstone, type BirthstoneId, birthstoneById } from "@/lib/birthstones";
import {
  dropFocusPromiseIfMoved,
  type MonthLabelHandles,
  placeMonthLabels,
} from "@/lib/monthLabels";
import type { JewelParams } from "@/lib/scene";
import { labelAnchor, labelSide, type ScreenPoint } from "@/lib/scenes/jewelLabels";
import {
  advanceSpotlight,
  BEAM_BOTTOM_RADIUS_MM,
  BEAM_OPACITY,
  BEAM_TOP_RADIUS_MM,
  BEAM_VISIBLE_LEVEL,
  createBeamMaterial,
  createPoolMaterial,
  createSpotlightState,
  POOL_OPACITY,
  POOL_RADIUS_MM,
  SPOTLIGHT_ANGLE_RAD,
  SPOTLIGHT_COLOR,
  SPOTLIGHT_HEIGHT_MM,
  setGlowStrength,
  spotlightAim,
} from "@/lib/scenes/jewelSpotlight";
import {
  aberrationFor,
  advanceLift,
  advanceOpacity,
  advanceSpin,
  advanceViewShift,
  applyStoneOpacity,
  applyViewShift,
  CAMERA_SMOOTH_TIME,
  castsShadow,
  disposeRefractionBvh,
  exposureFor,
  fitFov,
  focusPose,
  focusViewShift,
  geometryBounds,
  isFadedStone,
  JEWELS_ENV_URL,
  JEWELS_GLB_URL,
  nearestAngle,
  OVERVIEW_POSE,
  orbitAngles,
  pickStoneGeometries,
  ringPosition,
  type StonePlacement,
  stoneOpacity,
  stonePlacement,
  stoneYaw,
  tintFromColor,
} from "@/lib/scenes/jewels";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

// CLICK_TOLERANCE_PX: 押してから離すまでにこれ以上動いたら、クリックではなくドラッグ（カメラを回す操作）とみなす（px）
const CLICK_TOLERANCE_PX = 5;
// REFRACTION_BOUNCES: 石の中で光が反射する回数の上限。多いほどダイヤらしい輝きになるが重くなる
const REFRACTION_BOUNCES = 4;
// REFRACTION_FRESNEL: 石の縁を白く光らせる強さ（MeshRefractionMaterial の fresnel）。0 で無効
const REFRACTION_FRESNEL = 0.6;
// NO_SHADOW_LAYER: 影を落とさない物（薄くした石と、選択を外して不透明へ戻りきっていない石、スポットライトの光の筋と光だまり）を載せるレイヤーの番号（three.js の Layers。0〜31）。
// 影（ContactShadows）を撮るカメラはレイヤー 0 しか見ないので、ここへ移した石は影を落とさない（薄い石の下に濃い影だけが残らないように）。
// 画面を撮るカメラと、押した物を探す raycaster は、このレイヤーも見るようにする（useNoShadowLayer）
const NO_SHADOW_LAYER = 1;
// DEFAULT_LAYER: ふだんの石が載るレイヤー（three.js の既定。影を撮るカメラも、画面を撮るカメラもこれを見る）
const DEFAULT_LAYER = 0;
// SPOTLIGHT_INTENSITY: スポットライトが点いているときの光の強さ（three.js の光度。減衰なしなので、パールの明るさに直接効く）。
// 屈折の石（MeshRefractionMaterial）はライトを受けないので、効くのはパールだけ。大きくするとパールが白く飛ぶ（4 では飛んだ）
const SPOTLIGHT_INTENSITY = 1.5;
// SPOTLIGHT_PENUMBRA: スポットライトの光の丸の縁のぼけ（0〜1）。大きいほど照らされる範囲の縁がやわらかい
const SPOTLIGHT_PENUMBRA = 0.85;
// POOL_HEIGHT_MM: 足元の光だまりの円盤の高さ（mm）。影の板（0.01 mm 下）より上に置き、影の上に暖色を重ねる
const POOL_HEIGHT_MM = 0.005;

// BACKGROUND_COLOR: 背景の色（真っ白）。商品写真の白ホリ（継ぎ目の無い白い背景）のように、石だけが浮かぶ空間にする。
// 色の背景はトーンマッピングと露出を通らないので、光量スライダーを動かしても白のまま
const BACKGROUND_COLOR = "#ffffff";

// CAMERA_MOUSE_BUTTONS: マウスの操作の割り当て。左ドラッグ = 回す、中ボタン・ホイール = 寄る、右ドラッグ = 何もしない。
// 右ドラッグの平行移動（パン）を無効にして、構図（文字盤や石が画面の中心にある状態）が崩れないようにする。
// 再レンダーのたびに新しいオブジェクトを渡さないよう、モジュールの定数にしている
const CAMERA_MOUSE_BUTTONS = {
  // 左ボタン
  left: CameraControlsImpl.ACTION.ROTATE,
  // 中ボタン
  middle: CameraControlsImpl.ACTION.DOLLY,
  // 右ボタン
  right: CameraControlsImpl.ACTION.NONE,
  // ホイール
  wheel: CameraControlsImpl.ACTION.DOLLY,
};
// CAMERA_TOUCHES: タッチの操作の割り当て。1 本指 = 回す、2 本指 = ピンチで寄る、3 本指 = 何もしない
const CAMERA_TOUCHES = {
  // 1 本指
  one: CameraControlsImpl.ACTION.TOUCH_ROTATE,
  // 2 本指
  two: CameraControlsImpl.ACTION.TOUCH_DOLLY,
  // 3 本指
  three: CameraControlsImpl.ACTION.NONE,
};

/** JewelsScene の props。 */
interface JewelsSceneProps {
  /** 右下のスライダーの値（光量・分散）。 */
  params: JewelParams;
  /** 選んでいる石。`null` のときは全体（文字盤）を見る。 */
  selected: BirthstoneId | null;
  /** 石がタップされたときに、その石の id で呼ぶ。 */
  onSelect: (id: BirthstoneId) => void;
  /**
   * 月のラベルの DOM 要素の入れ物。このシーンが毎フレーム、ラベルを石のそばへ動かす。
   * 石を選んでいる間は呼び出し側がラベルを描かないが、このシーンも `selected` が null でない間は隠す（DOM と 3D の描き直しの 1 フレームほどのずれの間のため）。
   */
  labels: MonthLabelHandles;
  /**
   * 読み込みが終わって表示できたら `true`、シーンが消えるとき（タブの切り替え・表示のあとのエラー）に `false` で呼ぶ。
   * 呼び出し側は、`true` の間だけ月のラベルを描く（読み込み中やエラーのときに、中身の無い「誕生月を選ぶ」ナビを読み上げさせないため）。
   * 描き直すたびに作り直さない関数（state の更新関数など）を渡す。作り直すと、描き直すたびに false → true と呼ばれ、ラベルが消えて描き直される。
   */
  onReady: (isReady: boolean) => void;
}

// 形と環境マップの読み込みを、このモジュールを読んだ時点ではなく、シーンを開いたときにまとめて始める（preloadJewelsAssets）。
// 1 つずつ useEnvironment / useGLTF で待つと、前の読み込みが終わるまで次が始まらず、待ち時間が足し算になるため

// preloadJewelsAssets: 誕生石シーンの資産（形の .glb・スタジオの .hdr）の読み込みを、並べて始める。
// 何度呼んでも、読み込み中・読み込み済みのものは R3F の useLoader がキャッシュから返すので、二重には読まない
function preloadJewelsAssets(): void {
  // スタジオの環境マップ（石とパール）
  useEnvironment.preload({ files: JEWELS_ENV_URL });
  // 石の形（Draco / Meshopt の圧縮は使わない）
  useGLTF.preload(JEWELS_GLB_URL, false, false);
}

// JewelsScene: 誕生石シーンのレイアウト担当。計算は lib/scenes/jewels.ts にあり、ここは React のフックと JSX だけ。
// 形（.glb）と環境マップ（.hdr）を読み込み終わるまで、呼び出し側の <Suspense> が待つ。
export default function JewelsScene({
  params,
  selected,
  onSelect,
  labels,
  onReady,
}: JewelsSceneProps) {
  // 2 つの資産の読み込みを並べて始める（下の useEnvironment / useGLTF が 1 つずつ待っても、読み込みは同時に進む）
  preloadJewelsAssets();
  // env: Cycles で焼いたスタジオの環境マップ（石の屈折・反射と、パールの映り込みに使う）
  const env = useEnvironment({ files: JEWELS_ENV_URL });
  // nodes: .glb の中のオブジェクト（ノード名 = 石の id）。Draco / Meshopt の圧縮は使っていないので、外部のデコーダーを読み込まない
  const { nodes } = useGLTF(JEWELS_GLB_URL, false, false);
  // geometries: 12 石ぶんの形。足りない石があればここでエラーになり、SceneErrorBoundary が知らせる
  const geometries = useMemo(() => pickStoneGeometries(nodes), [nodes]);
  // placements: 石ごとの置く高さと中心の高さ（形の大きさから一度だけ求める）
  const placements = useMemo(
    // id ごとに、形の範囲から置き方を求める
    () =>
      Object.fromEntries(
        // 12 石ぶん。as const で [id, 置き方] の組（タプル）として扱わせる。
        // 付けないと Object.fromEntries が any を返し、下の as Record<...> が型を何も確かめなくなる
        BIRTHSTONES.map(
          (stone) => [stone.id, stonePlacement(geometryBounds(geometries[stone.id]))] as const,
        ),
      ) as Record<BirthstoneId, StonePlacement>,
    // 形が変わったときだけ求め直す
    [geometries],
  );
  // reducedMotion: OS の「動きを減らす」設定が有効か（有効なら、カメラは飛ばずに切り替わり、選んだ石も回さず、描く範囲のずらしとスポットライトもすぐに切り替える。
  // ほかの石を薄くする変化は動きではないので約 0.8 秒で溶かし、指を乗せた石が浮くのは利用者の操作への小さな反応なので止めない）
  const reducedMotion = usePrefersReducedMotion();

  // 表示している間だけ、写真向けの色の出し方（トーンマッピングと sRGB 出力）に切り替える
  useStudioLook(params.amb);

  // controls: カメラを動かす camera-controls。インスタンスが作り直されたとき（既定のカメラが替わったときなど）に
  // カメラの移動をやり直せるよう、ref ではなく state に持つ
  const [controls, setControls] = useState<CameraControlsImpl | null>(null);
  // 選んだ石へカメラを動かす（石を選んでいなければ全体へ戻す）
  useCameraFlight(controls, selected, placements, reducedMotion);
  // fov: 縦の画角。縦長の画面（スマホ）では広げて、文字盤の左右の石が切れないようにする（lib/scenes/jewels.ts の fitFov）。
  // 画面の大きさそのもの（size）ではなく、求めた数値だけを購読する。size を購読すると、窓の大きさやスマホのアドレスバーが
  // 変わるたびにシーン全体が描き直されるが、数値なら値が変わったときだけで済む。
  // 効くのはおもにパソコン向けの配置の横長の画面（画角はいつも 40°、ずらす量はいつも 0。縦長のタブレットなどでは画角も変わる）。スマホ向けの配置では、縦長なら画角が、シートが開いていればずらす量が
  // 画面の大きさに応じて変わるので、アドレスバーの伸び縮みでは描き直される
  const fov = useThree((state) => fitFov(state.size.width / state.size.height));
  // viewShift: スマホ向けの配置（lib/scene.ts の isCompactLayout。横持ちも含む）で解説カードのシートが開いている間、石がシートに隠れないよう描く範囲を上へずらす量（px）。同じ理由で数値だけを購読する
  const viewShift = useThree((state) =>
    focusViewShift(state.size.width, state.size.height, selected !== null),
  );
  // スマホ向けの配置で解説カードのシートが開いている間は、石がシートに隠れないよう描く範囲を上へずらす
  useViewShift(viewShift, reducedMotion);
  // 影を落とさない物のレイヤー（薄くした石と、スポットライトの光の筋・光だまり）も画面に描き、薄くした石を押せるようにする
  useNoShadowLayer();
  // 月のラベルを毎フレーム石のそばへ動かす（石を選んでいる間は隠す）。
  // useViewShift より後に呼ぶ（どちらも優先度 0 の useFrame で、登録順に動く。先に描く範囲のずらしを反映した行列で投影しないと、シートの開け閉めの間ラベルが 1 フレーム遅れる）
  useMonthLabels(labels, placements, selected === null);
  // 表示できたことを呼び出し側に知らせ、消えるときに取り消す（月のラベルを描くかどうかに使う）
  useEffect(() => {
    // 表示できた
    onReady(true);
    // 後始末: 消える（タブの切り替え・表示のあとのエラー）
    return () => onReady(false);
  }, [onReady]);

  return (
    <>
      {/* このシーン専用のカメラ。単位は mm なので、近くの切り取り距離を小さくする。 */}
      <PerspectiveCamera
        // R3F の既定のカメラにする（CameraControls やラベルの位置の計算がこのカメラを使う）
        makeDefault
        // 縦の画角（上の fov）
        fov={fov}
        // これより近い物は描かない（mm）。石に 10 mm まで寄れるので、それより十分小さくする。小さすぎると奥行きの精度が落ちてちらつく
        near={0.5}
        // これより遠い物は描かない（mm）。カメラの引きの上限（180 mm）と影の板（一辺 120 mm）より十分遠くする
        far={2000}
        // 最初の位置（全体を見る位置。以降は CameraControls が動かす）
        position={OVERVIEW_POSE.position}
      />
      {/* ドラッグで回す・ホイールやピンチで寄るカメラ操作。 */}
      <CameraControls
        ref={setControls}
        makeDefault
        // 目標へ移るときの時間の目安（秒。大きいほどゆっくり）
        smoothTime={CAMERA_SMOOTH_TIME}
        // ドラッグ中の追従にかける時間の目安（秒。小さいほど指に吸い付く）
        draggingSmoothTime={0.12}
        // 寄れる距離の下限（mm）。石に近づきすぎて中に入らないようにする
        minDistance={10}
        // 離れられる距離の上限（mm）。全体を見るカメラ（注視点から約 108 mm）の約 1.7 倍まで引ける。大きくすると、石が小さな点になるまで離れられる
        maxDistance={180}
        // 真上からの角度の下限（ラジアン。0.2 ≒ 11°）。真上から見下ろしすぎない（真上だと切子面が平たく見える）
        minPolarAngle={0.2}
        // 真上からの角度の上限（ラジアン。1.4 ≒ 80°）。床（高さ 0 の基準面）より下に回り込まない
        maxPolarAngle={1.4}
        // マウスの操作の割り当て
        mouseButtons={CAMERA_MOUSE_BUTTONS}
        // タッチの操作の割り当て
        touches={CAMERA_TOUCHES}
      />
      {/* 背景を真っ白にする（attach="background" で scene.background に入る。シーンを離れるときは R3F が元の背景へ戻す） */}
      <color attach="background" args={[BACKGROUND_COLOR]} />
      {/* 石の真下のやわらかい影（白い背景の上で、石が宙に浮いていることと置き場所がわかる程度の薄さ） */}
      {/* 影の高さ: drei の ContactShadows は、影の画像をぼかすときに、ぼかし用の板をいつも原点（高さ 0）に置いたまま、
          影用のカメラ（position で動かす ContactShadows 全体と一緒に動き、上を向いている）で撮る。
          そのため ContactShadows を上へずらすと、ぼかし用の板がカメラの後ろに回って写らず、影の画像が毎フレーム空のまま消される（0.02 mm 上げていて影が出なかった）。
          高さ 0 ちょうどだと、ぼかし用の板がカメラの写す範囲の端（near 0）に乗り、計算の誤差しだいで欠けるおそれがあるので、少しだけ下げる。
          床のメッシュが無いので、下げても重なってちらつく（Z ファイティング）面は無い。
          なお drei 10.7.7 の ContactShadows は、作った描画先とマテリアルを消えるときに片付けない（既知の制約。docs/用語集.md の「背景（scene.background）と ContactShadows」） */}
      <ContactShadows
        // 影の板の高さ（mm）。基準面（0）の 0.01 mm 下
        position={[0, -0.01, 0]}
        // 半透明の物の中で最初に描く（薄くした石の向こうの影が、視点によって透けたり隠れたりしないように）
        renderOrder={-1}
        // 影を描く範囲の一辺（mm）。文字盤（直径 60 mm）と石を覆う大きさ。大きくすると同じ解像度で影が粗くなる
        scale={120}
        // 板からどの高さまでの物の影を落とすか（mm）。浮いた石（高さ 10 mm ほど）まで届く長さ。大きくすると遠い物の影まで薄く出る
        far={14}
        // 影のぼかし。大きいほど影の縁がやわらかい
        blur={2.4}
        // 影の濃さ（0〜1）。大きいほど黒い
        opacity={0.55}
        // 影を描く画像の 1 辺のピクセル数。大きいほど細かいが、毎フレームの描く手間が増える
        resolution={512}
      />
      {/* 選んだ石を真上から照らすスポットライトと、白い背景の上に淡く見せる光の筋と足元の光だまり */}
      <JewelSpotlight selected={selected} reducedMotion={reducedMotion} />
      {/* 12 個の誕生石 */}
      {BIRTHSTONES.map((stone) => (
        <JewelStone
          key={stone.id}
          stone={stone}
          geometry={geometries[stone.id]}
          placement={placements[stone.id]}
          env={env}
          fire={params.fire}
          selected={selected}
          canSpin={!reducedMotion}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

// useViewShift: カメラの描く範囲を上下にずらすフック（レンズを上下にずらす「レンズシフト」と同じ効果）。
// カメラの向きは変えずに、写る範囲だけを動かすので、石を回す操作（camera-controls）とぶつからない。
// ずらす量はカメラの移動と同じくらいの速さで少しずつ目標へ近づける（reducedMotion が true なら、その場で切り替える）。
// 実際にカメラへ反映する判定（変わっていなければ何もしない、0 なら解く）は lib/scenes/jewels.ts の applyViewShift
function useViewShift(target: number, reducedMotion: boolean): void {
  // current: 今のずらす量（px）。フレーム間で持ち越す（毎フレーム変わるので state にしない）
  const current = useRef(0);
  // camera: 今の既定のカメラ
  const camera = useThree((state) => state.camera);
  // 既定のカメラが替わるとき（シーンを開いた直後に、R3F の既定のカメラからこのシーンのカメラへ替わるときと、
  // シーンを離れるとき）に、前のカメラのずらしを解き、次のカメラでは 0 から始め直す。
  // （タブを替えると石の選択は外れるので、ふつうはシーンを開いた時点のずらしは 0。0 から始めるのは念のため）
  useEffect(() => {
    // 後始末: ずらしを解き、今の量を 0 に戻す
    return () => {
      // PerspectiveCamera に型を絞ってから呼ぶ（このシーンは遠近カメラだけを使う）
      if (camera instanceof THREE.PerspectiveCamera) applyViewShift(camera, 0, 0, 0);
      // 今のずらす量を 0 に戻す（性能のため ref を直接書き換える）
      current.current = 0;
    };
  }, [camera]);
  // 毎フレーム、ずらす量を目標へ近づけ、変わったときだけカメラに反映する
  useFrame((state, delta) => {
    // PerspectiveCamera に型を絞る（このシーンは遠近カメラだけを使う）
    if (!(state.camera instanceof THREE.PerspectiveCamera)) return;
    // 次のずらす量（動きを減らす設定なら、すぐに目標へ）。性能のため ref を直接書き換える
    current.current = reducedMotion ? target : advanceViewShift(current.current, target, delta);
    // カメラに反映する（量も画面の大きさも前と同じなら、何もしない）
    applyViewShift(state.camera, current.current, state.size.width, state.size.height);
  });
}

// useNoShadowLayer: 今のカメラと raycaster（押した物を探す光線）に、影を落とさない物のレイヤー（NO_SHADOW_LAYER。薄くした石と、スポットライトの光の筋・光だまり）も見させるフック。
// このフックが無いと、薄くした石・光の筋・光だまりが画面から消える
// カメラが替わったとき・シーンを離れるときに、前のカメラからは外す（太陽・浜辺のシーンのカメラに残さないため）
function useNoShadowLayer(): void {
  // camera: 今の既定のカメラ
  const camera = useThree((state) => state.camera);
  // raycaster: R3F が押した物を探すのに使う raycaster
  const raycaster = useThree((state) => state.raycaster);
  // カメラに見させ、後始末で外す（layout effect にして、最初のフレームを描く前に足す）
  useLayoutEffect(() => {
    // レイヤーを足す（three.js のオブジェクトなので直接書き換える）
    camera.layers.enable(NO_SHADOW_LAYER);
    // 後始末: 外す
    return () => camera.layers.disable(NO_SHADOW_LAYER);
  }, [camera]);
  // raycaster にも見させ、後始末で外す（外さないと、薄くした石を押しても選べない）
  useLayoutEffect(() => {
    // レイヤーを足す（直接書き換える）
    raycaster.layers.enable(NO_SHADOW_LAYER);
    // 後始末: 外す
    return () => raycaster.layers.disable(NO_SHADOW_LAYER);
  }, [raycaster]);
}

// useMonthLabels: 月のラベル（HTML のボタン）を、毎フレーム石のそばへ動かすフック。
// 3D の位置を画面の座標に直す計算（projectToScreen）と、ボタンへの書き込み（placeMonthLabels）は lib にある。
// state は使わず、ボタンの style を直接書き換える（毎フレーム変わる値で、React の描き直しを起こさないため）
// isShown（石を選んでいないとき true）は、ふだんは効かない（石を選んでいる間は、呼び出し側がラベルそのものを描かない）。
// カードを閉じた直後など、DOM の描き直しと 3D 側の描き直しが 1 フレームほどずれる間だけ、3D 側がまだ石を選んでいる（受け取った selected が null でない）間は隠すために残す
function useMonthLabels(
  handles: MonthLabelHandles,
  placements: Record<BirthstoneId, StonePlacement>,
  isShown: boolean,
): void {
  // side: ラベルを石の外側（1。パソコン向けの配置の横長の画面）と内側（-1。スマホ向けの配置と、縦長・正方形に近い窓）のどちらに置くか（lib/scenes/jewelLabels.ts の labelSide）。
  // 数値だけを購読し、切り替わったときだけ描き直す
  const side = useThree((state) => labelSide(state.size.width, state.size.height));
  // anchors: 12 石ぶんのラベルの 3D の位置（月の順。置き方か内外が変わったときだけ求め直す）
  const anchors = useMemo(
    // 月の順に、ラベルの位置を求める
    () => BIRTHSTONES.map((stone) => labelAnchor(stone.month, placements[stone.id], side)),
    // 置き方か内外が変わったときだけ
    [placements, side],
  );
  // point: 画面の位置の入れ物（毎フレーム使い回す）
  const point = useRef<ScreenPoint>({ x: 0, y: 0, isVisible: false });
  // 毎フレーム、ラベルを動かす。drei の CameraControls は優先度 -1 の useFrame でカメラを先に動かすので、
  // 優先度を指定しない（0 の）ここでは、このフレームのカメラの位置で計算できる
  useFrame((state) => {
    // カメラの行列を最新にする（描画の直前まで待たずに、このフレームの位置で投影するため）
    state.camera.updateMatrixWorld();
    // フォーカスを返す約束を待つ間に、利用者が Tab などでフォーカスをほかへ動かしていたら約束を捨てる（ラベルが見えたときに奪い返さないため）。
    // ラベルを置く（見えたらフォーカスを移す）前に見る。性能のため入れ物を直接書き換える
    dropFocusPromiseIfMoved(handles, document.activeElement, document.body);
    // 12 個のラベルを、それぞれの石のそばへ置く（性能のため入れ物とボタンのスタイルを直接書き換える）
    placeMonthLabels(
      handles,
      anchors,
      state.camera,
      state.size.width,
      state.size.height,
      isShown,
      point.current,
      // 今の時刻（フォーカスの約束の期限と比べる。解説カードを閉じたときと同じ performance.now() の時計）
      performance.now(),
    );
  });
}

// useStudioLook: 表示している間だけ、レンダラーを写真向けの色の出し方にするフック。
// Canvas は太陽・浜辺のために linear（sRGB に変換しない）+ flat（トーンマッピングしない）で作っているが、
// 宝石は写真のような色で見せたいので、トーンマッピング（Neutral）と sRGB 出力に切り替え、離れるときに戻す。
// R3F は Canvas を作るときに一度しかこの設定を反映しないので、ここで書き換えても上書きされない
function useStudioLook(amb: number): void {
  // R3F が用意したレンダラー
  const gl = useThree((state) => state.gl);
  // 表示したときに切り替え、離れるときに元へ戻す。layout effect にして、
  // 最初のフレームからトーンマッピングと sRGB 出力で描く（露出は下の useEffect が入れる。passive effect だと、最初の 1 フレームだけトーンマッピングなしの石が出るおそれがある）
  useLayoutEffect(() => {
    // 元の設定を覚えておく
    const previous = {
      // トーンマッピング
      toneMapping: gl.toneMapping,
      // 露出
      exposure: gl.toneMappingExposure,
      // 出力の色空間
      colorSpace: gl.outputColorSpace,
    };
    // Neutral トーンマッピング（Khronos PBR Neutral）。商品写真向けに、明るい部分でも色相と彩度を保ちやすい。
    // AgX（Blender の Cycles の標準の色変換）は明るい部分を白へ寄せるので、屈折で強く光るルビーなどが桃色に褪せて見えた
    gl.toneMapping = THREE.NeutralToneMapping;
    // 画面へは sRGB で出す（色を人の目に合った明るさにする）
    gl.outputColorSpace = THREE.SRGBColorSpace;
    // 後始末: 元の設定に戻す（太陽・浜辺のシーンの色が変わらないように）
    return () => {
      // トーンマッピングを戻す
      gl.toneMapping = previous.toneMapping;
      // 露出を戻す
      gl.toneMappingExposure = previous.exposure;
      // 出力の色空間を戻す
      gl.outputColorSpace = previous.colorSpace;
    };
  }, [gl]);
  // 光量スライダーが変わったら露出を変える（毎フレームではなく、値が変わったときだけ）
  useEffect(() => {
    // 露出を設定する
    gl.toneMappingExposure = exposureFor(amb);
  }, [gl, amb]);
}

// useCameraFlight: 選んだ石へカメラを動かすフック。選んでいなければ全体（文字盤）を見る位置へ戻す。
// 最初の 1 回（シーンを開いたとき）は動かさずにその位置から始め、2 回目以降はなめらかに回り込む。
// reducedMotion が true（OS の「動きを減らす」設定）のときは、飛ばずにその場で切り替える
function useCameraFlight(
  controls: CameraControlsImpl | null,
  selected: BirthstoneId | null,
  placements: Record<BirthstoneId, StonePlacement>,
  reducedMotion: boolean,
): void {
  // flownWith: 最後にカメラを動かした camera-controls（別のインスタンスに替わったら、最初の 1 回として扱う）
  const flownWith = useRef<CameraControlsImpl | null>(null);
  // 選んだ石か camera-controls が変わるたびに動かす
  useEffect(() => {
    // camera-controls がまだ無ければ何もしない
    if (!controls) return;
    // 目標のカメラの位置と注視点
    const pose = selected
      ? focusPose(birthstoneById(selected).month, placements[selected])
      : OVERVIEW_POSE;
    // 同じインスタンスで 2 回目以降、かつ動きを減らす設定でなければ、なめらかに動かす
    const animate = flownWith.current === controls && !reducedMotion;
    // 位置と注視点を目標にする
    void controls.setLookAt(...pose.position, ...pose.target, animate);
    // 目標の向きの角度
    const { azimuth, polar } = orbitAngles(pose);
    // 方位角を「今の角度に一番近い同じ向き」に置き直し、遠回りしないようにする
    void controls.rotateTo(nearestAngle(controls.azimuthAngle, azimuth), polar, animate);
    // このインスタンスで動かしたことを覚える
    flownWith.current = controls;
  }, [controls, selected, placements, reducedMotion]);
}

/** JewelStone の props。 */
interface JewelStoneProps {
  /** 石のデータ。 */
  stone: Birthstone;
  /** 石の形（.glb から取り出したもの。drei の useGLTF がキャッシュしているので、ここでは dispose しない）。 */
  geometry: THREE.BufferGeometry;
  /** 置く高さと中心の高さ。 */
  placement: StonePlacement;
  /** 屈折の計算に使う環境マップ。 */
  env: THREE.Texture;
  /** 分散スライダーの値（0〜1）。 */
  fire: number;
  /** 選ばれている石（選ばれている石はゆっくり回り、ほかの石は白い背景へ溶けるように薄くなる）。何も選ばれていなければ `null`。 */
  selected: BirthstoneId | null;
  /** 選ばれたときに回ってよいか。OS の「動きを減らす」設定が有効なら `false` にして、回さずに置いておく。 */
  canSpin: boolean;
  /** タップされたときに呼ぶ。 */
  onSelect: (id: BirthstoneId) => void;
}

// JewelStone: 誕生石 1 個。時計の文字盤の位置に置き、指を乗せると浮き上がり、タップでその月を選ぶ
function JewelStone({
  stone,
  geometry,
  placement,
  env,
  fire,
  selected,
  canSpin,
  onSelect,
}: JewelStoneProps) {
  // mesh: 石のメッシュ（毎フレーム、回転と高さを直接書き換える）
  const mesh = useRef<THREE.Mesh>(null);
  // motion: フレーム間で持ち越す動きの状態。性能のため直接書き換える
  // （spin = 元の向きからの回転、lift = 浮き上がり、opacity = 不透明度。不透明度は最初から目標の値で始める）
  const motion = useRef({ spin: 0, lift: 0, opacity: stoneOpacity(stone.id, selected) });
  // hovered: 指（マウス）が乗っているか。毎フレーム読むだけなので、再レンダーを起こさない ref に持つ
  const hovered = useRef(false);
  // gl: R3F のレンダラー（カーソルの形を変える canvas 要素を取り出す）
  const gl = useThree((state) => state.gl);
  // 文字盤の上の位置
  const [x, , z] = ringPosition(stone.month);
  // 長い向きを外へ向ける回転
  const yaw = stoneYaw(stone.month);
  // baseColor: マテリアルの色（線形 RGB）。
  // 透明な石は屈折した光に掛ける色（色味だけを残した色。数値 3 つで作ると色空間の変換がかからない）、
  // パールは地の色（16 進数の sRGB から、three.js の色管理が線形に変換する）
  const baseColor = useMemo(
    // 石の種類で作り方を分ける
    () =>
      stone.cut === "sphere"
        ? new THREE.Color(stone.color)
        : new THREE.Color(...tintFromColor(stone.color)),
    // 石の色とカットが変わったときだけ作り直す
    [stone.color, stone.cut],
  );
  // isSelected: この石が選ばれているか
  const isSelected = selected === stone.id;
  // isSpinning: 回し続けるか（選ばれていて、動きを減らす設定でないときだけ）
  const isSpinning = isSelected && canSpin;
  // isFaded: ほかの石を選んでいて、この石が薄くなる（または薄くなっている）か。影を落とさないレイヤーへ移すのに使う
  const isFaded = isFadedStone(stone.id, selected);

  // 毎フレーム、選ばれている石を回し、指を乗せた石を浮かせ、選ばれていない石を薄くする
  useFrame((_, delta) => {
    // メッシュがまだ無ければ何もしない
    const target = mesh.current;
    // 早期リターン
    if (!target) return;
    // 回転を進める（回さないときは元の向きへ戻る。性能のため直接書き換える）
    motion.current.spin = advanceSpin(motion.current.spin, delta, isSpinning);
    // 浮き上がりを進める（性能のため直接書き換える）
    motion.current.lift = advanceLift(motion.current.lift, delta, hovered.current);
    // 向き = 外向きの回転 + 選ばれている間の回転
    target.rotation.y = yaw + motion.current.spin;
    // 高さ = 置く高さ + 浮き上がり
    target.position.y = placement.baseY + motion.current.lift;
    // 不透明度を進める（石を選んでいる間、ほかの石は薄くなる。性能のため直接書き換える）
    motion.current.opacity = advanceOpacity(
      // 今の不透明度
      motion.current.opacity,
      // 経過秒数
      delta,
      // 目標の不透明度
      stoneOpacity(stone.id, selected),
    );
    // 不透明度をマテリアルに当てはめる（性能のため直接書き換える）
    applyStoneOpacity(target.material, motion.current.opacity);
    // 載せるレイヤー: 影を落とす石はふだんのレイヤー、落とさない石（薄くする石と、戻りきっていない石）は影を撮るカメラに写らないレイヤー
    // （lib/scenes/jewels.ts の castsShadow。性能のため直接書き換える。layers.set はビットの並びを 1 つ書き換えるだけで、割り当ては無い）
    target.layers.set(
      castsShadow(isFaded, motion.current.opacity) ? DEFAULT_LAYER : NO_SHADOW_LAYER,
    );
  });

  // アンマウント時に、MeshRefractionMaterial が作った BVH（GPU のテクスチャ）を片付け、カーソルを戻す
  useEffect(() => {
    // 片付けのときに参照するメッシュ（アンマウント後は ref が空になるので、今のうちに控える）
    const target = mesh.current;
    // 後始末
    return () => {
      // BVH を片付ける（パールの MeshPhysicalMaterial など、BVH を持たないものでは何もしない）
      disposeRefractionBvh(target?.material);
      // 指を乗せたまま消えた場合に備えて、カーソルを戻す
      gl.domElement.style.cursor = "";
    };
  }, [gl]);

  // onClick: ドラッグでなければ、この石の月を選ぶ
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    // 奥にある別の石へイベントが届かないようにする
    event.stopPropagation();
    // カメラを回すドラッグだったら選ばない（delta は押してから離すまでに動いた px）
    if (event.delta > CLICK_TOLERANCE_PX) return;
    // この石を選ぶ
    onSelect(stone.id);
  };

  // onPointerOver: 指が乗ったら浮かせ、押せることがわかるカーソルにする
  const onPointerOver = (event: ThreeEvent<PointerEvent>) => {
    // 奥の石にも同時に反応しないようにする
    event.stopPropagation();
    // 浮かせる
    hovered.current = true;
    // 指の形のカーソル
    gl.domElement.style.cursor = "pointer";
  };

  // onPointerOut: 指が離れたら戻す
  const onPointerOut = () => {
    // 浮き上がりを戻す
    hovered.current = false;
    // カーソルを戻す（Canvas の CSS の grab に戻る）
    gl.domElement.style.cursor = "";
  };

  return (
    // 石のメッシュ。位置・回転の初期値を渡し、以降は useFrame が書き換える
    // biome-ignore lint/a11y/noStaticElementInteractions: <mesh> は DOM の要素ではなく three.js のオブジェクト（R3F の要素）なので当てはまらない。キーボードでは文字盤の月のラベルから同じ操作ができる
    <mesh
      // 毎フレーム書き換えるための参照
      ref={mesh}
      // .glb から取り出した石の形
      geometry={geometry}
      // 文字盤の上の位置と、床から浮かせた高さ（最初の値。浮き上がりは useFrame が足す）
      position={[x, placement.baseY, z]}
      // 長い向きを文字盤の外へ向ける回転（最初の値。選ばれている間の回転は useFrame が足す）
      rotation={[0, yaw, 0]}
      // タップ（クリック）でこの石の月を選ぶ
      onClick={onClick}
      // 指が乗ったら浮かせる
      onPointerOver={onPointerOver}
      // 指が離れたら戻す
      onPointerOut={onPointerOut}
    >
      {stone.cut === "sphere" ? (
        // パール: 不透明な真珠層に、虹色の照り（薄膜干渉 = iridescence）と薄いツヤの層（clearcoat）を重ねる。
        // 不透明度は、useFrame の applyStoneOpacity が毎フレーム書き換える（props では渡さない。描き直すたびに 1 へ戻さないため）
        <meshPhysicalMaterial
          // 地の色（Cycles と同じ銀白色）
          color={baseColor}
          // 薄くできるよう、いつも半透明として描く（不透明度 1 ならほぼ不透明と同じ見た目で、描く順が奥から手前になるだけ。
          // 選んだときだけ切り替えると、three.js がシェーダーを作り直して一瞬止まるため）
          transparent
          // 映り込みに使う環境マップ（屈折の石と同じスタジオ）。scene.environment は使わないので直接渡す（渡さなければ映り込みが無い）
          envMap={env}
          // 真珠層のやわらかいツヤ
          roughness={0.2}
          // 金属ではない
          metalness={0}
          // 表面を覆う透明なツヤの層
          clearcoat={0.5}
          // ツヤの層はなめらか
          clearcoatRoughness={0.05}
          // 真珠層の屈折率（反射の強さに効く）
          ior={stone.ior}
          // 薄膜干渉の強さ（見る角度で色が変わる照り）
          iridescence={0.6}
          // 薄膜の屈折率
          iridescenceIOR={1.6}
          // 薄膜の厚さの範囲（ナノメートル）。Cycles の設定（520 nm）を中心にする
          iridescenceThicknessRange={[400, 640]}
          // 布のような柔らかい光沢を少しだけ足す
          sheen={0.2}
          // 光沢の色（わずかに紫がかった白）
          sheenColor="#f5ecff"
        />
      ) : (
        // 透明な石: BVH で石の中の反射・屈折を追いかけ、環境マップから光を拾う。
        // 不透明度は、useFrame の applyStoneOpacity が毎フレーム書き換える（props では渡さない。描き直すたびに 1 へ戻さないため）
        <MeshRefractionMaterial
          // 屈折した光に掛ける色（石の色味）
          color={baseColor}
          // 薄くできるよう、いつも半透明として描く（不透明度 1 ならほぼ不透明と同じ見た目で、描く順が奥から手前になるだけ。
          // 選んだときだけ切り替えると、three.js がシェーダーを作り直して一瞬止まるため）
          transparent
          // 光を拾う環境マップ
          envMap={env}
          // 屈折率
          ior={stone.ior}
          // 石の中で反射する回数の上限
          bounces={REFRACTION_BOUNCES}
          // 虹色のずれ（石の分散 × 分散スライダー × FIRE_GAIN を、赤と青の屈折率の差にする。0 は渡さない）
          aberrationStrength={aberrationFor(stone.dispersion, stone.ior, fire)}
          // 速い近似を切る（drei の初期値は true なので、false をはっきり渡す）。速い近似は、赤と青の光線の向きを決まった方向へ少しずらすだけで、
          // 屈折率の違いによる色の広がりにならないため。切ると、赤・緑・青を別々の屈折率で 3 回追いかける（重くなるが、分散が実物どおりの仕組みで出る）
          fastChroma={false}
          // 縁を白く光らせる強さ
          fresnel={REFRACTION_FRESNEL}
        />
      )}
    </mesh>
  );
}

/** JewelSpotlight の props。 */
interface JewelSpotlightProps {
  /** 照らす石。`null` ならスポットライトを消す。 */
  selected: BirthstoneId | null;
  /** OS の「動きを減らす」設定が有効なら `true`（点く・消える・次の石へ移るのを、その場で切り替える）。 */
  reducedMotion: boolean;
}

// JewelSpotlight: 選んだ石を真上から照らすスポットライト。three.js の spotLight（パールを照らす）と、
// 白い背景の上でも見えるよう、暖かい色を薄く重ねて塗る光の筋（円すい）と足元の光だまり（円盤）。計算は lib/scenes/jewelSpotlight.ts。
// 屈折の石（MeshRefractionMaterial）はライトを受けないので、石が照らされて見えるのは、筋と光だまりの暖色と、ほかの石を薄くすることで表す
function JewelSpotlight({ selected, reducedMotion }: JewelSpotlightProps) {
  // light: three.js のスポットライト（毎フレーム、位置・向け先・強さを書き換える）
  const light = useRef<THREE.SpotLight>(null);
  // beam: 光の筋の円すい（毎フレーム、位置と表示を書き換える）
  const beam = useRef<THREE.Mesh>(null);
  // pool: 足元の光だまりの円盤（毎フレーム、位置と表示を書き換える）
  const pool = useRef<THREE.Mesh>(null);
  // state: フレーム間で持ち越す明るさと位置（advanceSpotlight が直接書き換える）。useState の初期化関数で一度だけ作る
  const [state] = useState(createSpotlightState);
  // beamMaterial: 光の筋のマテリアル。一度だけ作る
  const [beamMaterial] = useState(createBeamMaterial);
  // poolMaterial: 光だまりのマテリアル。一度だけ作る
  const [poolMaterial] = useState(createPoolMaterial);
  // 消えるときに 2 つのマテリアルを片付ける（開発時の Strict Mode で片付けたあとに使われても、three.js が作り直す）
  useEffect(
    // 後始末だけをする
    () => () => {
      // 筋
      beamMaterial.dispose();
      // 光だまり
      poolMaterial.dispose();
    },
    // マテリアルが替わったときだけ（実際には替わらない）
    [beamMaterial, poolMaterial],
  );
  // aim: 照らす石の置き方（石を選んでいなければ null）。選んだ石が替わったときだけ求め直す
  const aim = useMemo(
    // 選んだ石の月の位置の真上
    () => (selected ? spotlightAim(birthstoneById(selected).month) : null),
    // 選んだ石が替わったときだけ
    [selected],
  );

  // 毎フレーム、明るさと位置を目標へ近づけ、ライト・筋・光だまりに反映する
  useFrame((_, delta) => {
    // 明るさと位置を進める（動きを減らす設定なら、その場で目標へ。性能のため state を直接書き換える）
    advanceSpotlight(state, aim, reducedMotion ? Number.POSITIVE_INFINITY : delta);
    // isVisible: 筋と光だまりを描くか（消えているときは描く手間を省く）
    const isVisible = state.level > BEAM_VISIBLE_LEVEL;
    // スポットライト
    const spot = light.current;
    // まだ無ければ何もしない
    if (spot) {
      // 光源の位置（性能のため直接書き換える）
      spot.position.copy(state.position);
      // 向ける先（target はシーンに入れていないので、行列を自分で更新する）
      spot.target.position.copy(state.target);
      // 向ける先の行列を最新にする
      spot.target.updateMatrixWorld();
      // 強さ（消えているときは 0。ライトの数を変えるとシェーダーが作り直されるので、外さずに 0 にする）
      spot.intensity = SPOTLIGHT_INTENSITY * state.level;
    }
    // 光の筋
    const cone = beam.current;
    // まだ無ければ何もしない
    if (cone) {
      // 円すいの中心は、光源と床の真ん中（性能のため直接書き換える）
      cone.position.set(state.position.x, SPOTLIGHT_HEIGHT_MM / 2, state.position.z);
      // 消えているときは描かない
      cone.visible = isVisible;
    }
    // 光だまり
    const disc = pool.current;
    // まだ無ければ何もしない
    if (disc) {
      // 光を向けている床の位置に置く（性能のため直接書き換える）
      disc.position.set(state.target.x, POOL_HEIGHT_MM, state.target.z);
      // 消えているときは描かない
      disc.visible = isVisible;
    }
    // 筋の濃さを明るさに合わせる（性能のため uniform を直接書き換える）
    setGlowStrength(beamMaterial, state.level, BEAM_OPACITY);
    // 光だまりの濃さも合わせる
    setGlowStrength(poolMaterial, state.level, POOL_OPACITY);
  });

  return (
    <>
      {/* 石の真上から真下へ向けるスポットライト。減衰なし（decay 0）・届く距離の制限なし（distance 0）にして、強さを高さに左右されないようにする */}
      <spotLight
        // 毎フレーム位置・向け先・強さを書き換えるための参照
        ref={light}
        // 光の広がりの角度
        angle={SPOTLIGHT_ANGLE_RAD}
        // 光の丸の縁のぼけ
        penumbra={SPOTLIGHT_PENUMBRA}
        // 距離による減衰をしない
        decay={0}
        // 届く距離を制限しない
        distance={0}
        // 光の色（筋・光だまりと同じ暖かい色）
        color={SPOTLIGHT_COLOR}
        // 最初は消えている（useFrame が明るさに合わせて書き換える）
        intensity={0}
      />
      {/* 光の筋（上が細く、床で光の円すいの太さになる円すい）。
          押したときの当たり判定は、R3F が押す処理（onClick など）を持つ物にしか行わないので、筋が手前にあっても奥の石を押せる。
          描く順は、石の下の影（-1）のあと、光だまり（-0.4）と石（0）より先（-0.5）。筋は奥行きを書き込まないので、あとから描く石が筋の上に描かれ、
          石の手前を通る筋が石の色を暖色に濁らせない（選んだ石の色を、いちばん忠実に見せるため） */}
      <mesh
        // 毎フレーム位置と表示を書き換えるための参照
        ref={beam}
        // 暖かい色を重ねて塗る筋のマテリアル
        material={beamMaterial}
        // 最初は描かない（点いたら useFrame が描くようにする）
        visible={false}
        // 影（-1）のあと、石（0）より先に描く
        renderOrder={-0.5}
        // 影を撮るカメラに写らないレイヤーに載せる（筋の暗い形が石の影に混ざらないように。面の向きで偶然写らないことに頼らない）
        layers={NO_SHADOW_LAYER}
      >
        {/* 上端の半径・下端の半径・高さ（光源から床まで）・周りの分割数（細い筋なので 32 で丸く見える）・高さの分割数・ふたなし */}
        <cylinderGeometry
          args={[BEAM_TOP_RADIUS_MM, BEAM_BOTTOM_RADIUS_MM, SPOTLIGHT_HEIGHT_MM, 32, 1, true]}
        />
      </mesh>
      {/* 足元の光だまり（床に寝かせた円盤）。影のあとに描き、影の上に暖色を重ねる */}
      <mesh
        // 毎フレーム位置と表示を書き換えるための参照
        ref={pool}
        // 暖かい色を重ねて塗る光だまりのマテリアル
        material={poolMaterial}
        // 円盤（XY 平面）を床（XZ 平面）に寝かせる
        rotation={[-Math.PI / 2, 0, 0]}
        // 最初は描かない（点いたら useFrame が描くようにする）
        visible={false}
        // 影（-1）と筋（-0.5）のあと、石（0）より先に描く（カメラの向きによる並べ替えに頼らず、いつも石の下に敷く）
        renderOrder={-0.4}
        // 影を撮るカメラに写らないレイヤーに載せる（光だまりの円盤が影に混ざらないように）
        layers={NO_SHADOW_LAYER}
      >
        {/* 円盤の形（半径 mm・周りの分割数。48 分割なら縁の角ばりが見えない） */}
        <circleGeometry args={[POOL_RADIUS_MM, 48]} />
      </mesh>
    </>
  );
}
