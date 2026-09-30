"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { OceParams } from "@/lib/scene";
import { buildOcean, createOceanAnim, disposeOcean, updateOcean } from "@/lib/scenes/ocean";
import { useDragInteraction } from "@/lib/useDragInteraction";

// OceanScene: 浜辺シーンのレイアウト担当。
// 構築・更新・破棄の実処理は lib/scenes/ocean.ts にあり、ここは React のフックと JSX だけ。
export default function OceanScene({ params }: { params: OceParams }) {
  // paramsRef: 最新のスライダー値を再レンダーなしでループから読むための ref。
  // レンダー中に ref を書き換えないよう、更新は effect 側で行う。
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  // camera: R3F が用意した現在のカメラ。視線(lookAt)を毎フレーム動かすために取得する。
  const camera = useThree((state) => state.camera);
  // drag: ポインタ操作(見回し・タップ突風)の状態。
  const drag = useDragInteraction();

  // built: 空・砂・水のメッシュとマテリアルを初回に一度だけ構築する。
  const built = useMemo(() => buildOcean(), []);

  // anim: 見回しの角度と慣性、突風量を持ち越す。
  const anim = useRef(createOceanAnim());

  // 毎フレーム、最新のスライダー値・ドラッグ状態・カメラでシーンを更新する。
  useFrame((state) => {
    updateOcean(
      built,
      anim.current,
      drag.current,
      paramsRef.current,
      state.clock.getElapsedTime(),
      camera,
    );
  });

  // アンマウント時に GPU リソースを解放する。
  useEffect(() => () => disposeOcean(built), [built]);

  // このシーン専用のカメラ(遠景まで見えるよう far を大きく)を規定カメラとして登録し、グループを追加する。
  return (
    <>
      <PerspectiveCamera makeDefault fov={55} near={0.1} far={600} position={[0, 1.8, 9]} />
      <primitive object={built.group} />
    </>
  );
}
