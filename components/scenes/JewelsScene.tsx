"use client";

import {
  CameraControls,
  CameraControlsImpl,
  ContactShadows,
  Environment,
  MeshRefractionMaterial,
  PerspectiveCamera,
  useEnvironment,
  useGLTF,
} from "@react-three/drei";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { BIRTHSTONES, type Birthstone, type BirthstoneId, birthstoneById } from "@/lib/birthstones";
import type { JewelParams } from "@/lib/scene";
import {
  aberrationFor,
  advanceBrightness,
  advanceLift,
  advanceSpin,
  advanceViewShift,
  applyStoneBrightness,
  applyViewShift,
  disposeRefractionBvh,
  exposureFor,
  fitFov,
  focusPose,
  focusViewShift,
  geometryBounds,
  JEWELS_ENV_URL,
  JEWELS_GLB_URL,
  nearestAngle,
  OVERVIEW_POSE,
  orbitAngles,
  pickStoneGeometries,
  ringPosition,
  type StonePlacement,
  stoneBrightness,
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
// CAMERA_SMOOTH_TIME: カメラが目標へ移るときの時間の目安（秒）。大きいほどゆっくり回り込む
const CAMERA_SMOOTH_TIME = 0.8;
// FLOOR_RADIUS_MM: ベルベットの床の半径（mm）。霧で見えなくなる距離より大きくして、床の端を見せない
const FLOOR_RADIUS_MM = 600;
// FLOOR_ENV_INTENSITY: 床に環境マップが映り込む強さ。大きいと、スタジオの明るい天井が床に映り、背景が灰色に見える
const FLOOR_ENV_INTENSITY = 0.06;
// FOG_NEAR_MM / FOG_FAR_MM: 霧がかかり始める距離と、背景色に溶けきる距離（mm）
const FOG_NEAR_MM = 160;
// 霧で背景色に溶けきる距離
const FOG_FAR_MM = 420;
// BACKGROUND_COLOR: 霧の色。アプリ全体の背景（globals.css の --color-ink）と同じにして、床の奥を背景に溶かす
const BACKGROUND_COLOR = "#04060b";

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
}

// JewelsScene: 誕生石シーンのレイアウト担当。計算は lib/scenes/jewels.ts にあり、ここは React のフックと JSX だけ。
// 形（.glb）と環境マップ（.hdr）を読み込み終わるまで、呼び出し側の <Suspense> が待つ。
export default function JewelsScene({ params, selected, onSelect }: JewelsSceneProps) {
  // env: Cycles で焼いたスタジオの環境マップ（石の屈折・反射と、パールや床の映り込みに使う）
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
  // reducedMotion: OS の「動きを減らす」設定が有効か（有効なら、カメラは飛ばずに切り替わり、選んだ石も回さず、描く範囲のずらしもすぐに切り替える）
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
  // 効くのはおもにパソコン向けの配置の横長の画面（画角はいつも 40°、ずらす量はいつも 0）。スマホ向けの配置では、縦長なら画角が、シートが開いていればずらす量が
  // 画面の大きさに応じて変わるので、アドレスバーの伸び縮みでは描き直される
  const fov = useThree((state) => fitFov(state.size.width / state.size.height));
  // viewShift: スマホ向けの配置（lib/scene.ts の isCompactLayout。横持ちも含む）で詳細のシートが開いている間、石がシートに隠れないよう描く範囲を上へずらす量（px）。同じ理由で数値だけを購読する
  const viewShift = useThree((state) =>
    focusViewShift(state.size.width, state.size.height, selected !== null),
  );
  // スマホ向けの配置で詳細のシートが開いている間は、石がシートに隠れないよう描く範囲を上へずらす
  useViewShift(viewShift, reducedMotion);

  return (
    <>
      {/* このシーン専用のカメラ。単位は mm なので、近くの切り取り距離を小さくする。 */}
      <PerspectiveCamera
        makeDefault
        // 縦の画角（上の fov）
        fov={fov}
        near={0.5}
        far={2000}
        position={OVERVIEW_POSE.position}
      />
      {/* ドラッグで回す・ホイールやピンチで寄るカメラ操作。 */}
      <CameraControls
        ref={setControls}
        makeDefault
        // 目標へ移るときの時間の目安
        smoothTime={CAMERA_SMOOTH_TIME}
        // ドラッグ中の追従の速さ（小さいほど指に吸い付く）
        draggingSmoothTime={0.12}
        // 寄れる距離の下限（mm）。石に近づきすぎて中に入らないようにする
        minDistance={10}
        // 離れられる距離の上限（mm）。全体を見るカメラ（注視点から約 108 mm）の約 1.7 倍まで引ける。大きくすると、石が小さな点になるまで離れられる
        maxDistance={180}
        // 真上から見下ろしすぎない（真上だと切子面が平たく見える）
        minPolarAngle={0.2}
        // 床より下に回り込まない
        maxPolarAngle={1.4}
        // マウスの操作の割り当て
        mouseButtons={CAMERA_MOUSE_BUTTONS}
        // タッチの操作の割り当て
        touches={CAMERA_TOUCHES}
      />
      {/* 環境マップを scene.environment にする（パールや床など、標準のマテリアルの映り込み）。背景には出さない。 */}
      <Environment map={env} />
      {/* 奥の床を背景色に溶かす霧 */}
      <fog attach="fog" args={[BACKGROUND_COLOR, FOG_NEAR_MM, FOG_FAR_MM]} />
      {/* 暗いベルベットの床（XZ 平面に寝かせた円盤） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        {/* 円盤の形 */}
        <circleGeometry args={[FLOOR_RADIUS_MM, 96]} />
        {/* 暗い紫がかった、ツヤの無い布の質感。環境マップの映り込みを弱くして、明るい天井が床に映って灰色に浮かないようにする */}
        <meshStandardMaterial
          color="#0c0710"
          roughness={1}
          metalness={0}
          envMapIntensity={FLOOR_ENV_INTENSITY}
        />
      </mesh>
      {/* 石の真下のやわらかい影（床に接していないことがわかる程度の薄さ） */}
      <ContactShadows
        position={[0, 0.02, 0]}
        scale={120}
        far={14}
        blur={2.4}
        opacity={0.55}
        resolution={512}
      />
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
  // 石を選んだままタブを戻ると、ずらしも 0 から目標へ約 0.8 秒かけて動く（カメラの移動と同時なので目立たない）
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

// useStudioLook: 表示している間だけ、レンダラーを写真向けの色の出し方にするフック。
// Canvas は太陽・浜辺のために linear（sRGB に変換しない）+ flat（トーンマッピングしない）で作っているが、
// 宝石は写真のような色で見せたいので、トーンマッピング（Neutral）と sRGB 出力に切り替え、離れるときに戻す。
// R3F は Canvas を作るときに一度しかこの設定を反映しないので、ここで書き換えても上書きされない
function useStudioLook(amb: number): void {
  // R3F が用意したレンダラー
  const gl = useThree((state) => state.gl);
  // 表示したときに切り替え、離れるときに元へ戻す
  useEffect(() => {
    // 元の設定を覚えておく
    const previous = {
      toneMapping: gl.toneMapping,
      exposure: gl.toneMappingExposure,
      colorSpace: gl.outputColorSpace,
    };
    // Neutral トーンマッピング（Khronos PBR Neutral）。商品写真向けに、明るい部分でも色相と彩度を保ちやすい。
    // AgX（Cycles の連番で使った色変換）は明るい部分を白へ寄せるので、屈折で強く光るルビーなどが桃色に褪せて見えた
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
  /** 選ばれている石（選ばれている石はゆっくり回り、ほかの石は暗く沈む）。何も選ばれていなければ `null`。 */
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
  // （spin = 元の向きからの回転、lift = 浮き上がり、brightness = 明るさ。明るさは最初から目標の値で始める）
  const motion = useRef({ spin: 0, lift: 0, brightness: stoneBrightness(stone.id, selected) });
  // hovered: 指（マウス）が乗っているか。毎フレーム読むだけなので、再レンダーを起こさない ref に持つ
  const hovered = useRef(false);
  // gl: R3F のレンダラー（カーソルの形を変える canvas 要素を取り出す）
  const gl = useThree((state) => state.gl);
  // 文字盤の上の位置
  const [x, , z] = ringPosition(stone.month);
  // 長い向きを外へ向ける回転
  const yaw = stoneYaw(stone.month);
  // baseColor: 明るさ 1 のときのマテリアルの色（線形 RGB）。毎フレーム、これに明るさを掛けてマテリアルへ入れる。
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

  // 毎フレーム、選ばれている石を回し、指を乗せた石を浮かせ、選ばれていない石の明るさを変える
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
    // 明るさを進める（石を選んでいる間、ほかの石は暗く沈む。性能のため直接書き換える）
    motion.current.brightness = advanceBrightness(
      // 今の明るさ
      motion.current.brightness,
      // 経過秒数
      delta,
      // 目標の明るさ
      stoneBrightness(stone.id, selected),
    );
    // 明るさをマテリアルの色（とパールの映り込み）に当てはめる
    applyStoneBrightness(
      // このメッシュのマテリアル
      target.material,
      // 明るさ 1 のときの色
      baseColor,
      // 今の明るさ
      motion.current.brightness,
      // 明るさ 1 のときの Fresnel の強さ（屈折のマテリアルだけが持つ。パールでは使われない）
      REFRACTION_FRESNEL,
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
    // biome-ignore lint/a11y/noStaticElementInteractions: <mesh> は DOM の要素ではなく three.js のオブジェクト（R3F の要素）なので当てはまらない。キーボードでは画面の月のボタンから同じ操作ができる
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
        // 地の色（Cycles と同じ銀白色）は、明るさと合わせて useFrame の applyStoneBrightness が毎フレーム入れる
        <meshPhysicalMaterial
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
        // 透明な石: BVH で石の中の反射・屈折を追いかけ、環境マップから光を拾う
        <MeshRefractionMaterial
          // 光を拾う環境マップ（屈折した光に掛ける色は、明るさと合わせて useFrame の applyStoneBrightness が毎フレーム入れる）
          envMap={env}
          // 屈折率
          ior={stone.ior}
          // 石の中で反射する回数の上限
          bounces={REFRACTION_BOUNCES}
          // 虹色のずれ（分散スライダー × 石の分散。0 は渡さない）
          aberrationStrength={aberrationFor(stone.dispersion, fire)}
          // 虹色のずれを速い近似で計算する（3 色ぶん光線を追わない）
          fastChroma
          // 縁を白く光らせる強さ
          fresnel={REFRACTION_FRESNEL}
        />
      )}
    </mesh>
  );
}
