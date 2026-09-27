"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { SunParams } from "@/lib/scene";
import { buildSun, createSunAnim, disposeSun, updateSun } from "@/lib/scenes/sun";
import { useDragInteraction } from "@/lib/useDragInteraction";

// SunScene: 太陽シーンのレイアウト担当。
// 構築・更新・破棄の実処理は lib/scenes/sun.ts にあり、ここは React のフックと JSX だけ。
export default function SunScene({ params }: { params: SunParams }) {
  // paramsRef: 毎フレーム最新の params を読むための ref(再レンダーを介さずループから参照する)。
  // レンダー中に ref を書き換えないよう、更新は effect 側で行う。
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  // drag: ポインタ操作(ドラッグ慣性・タップ)の状態。
  const drag = useDragInteraction();

  // built: シーンのメッシュ・マテリアル・バッファ等を初回に一度だけ構築して保持する。
  const built = useMemo(() => buildSun(), []);

  // anim: 慣性回転や炎の再利用など、フレーム間で持ち越す可変状態。
  const anim = useRef(createSunAnim());

  // 毎フレーム、最新のスライダー値とドラッグ状態でシーンを更新する。
  useFrame((state) => {
    updateSun(built, anim.current, drag.current, paramsRef.current, state.clock.getElapsedTime());
  });

  // アンマウント時に GPU リソースを解放する。
  useEffect(() => () => disposeSun(built), [built]);

  // このシーン専用のカメラ(視野角50・正面から)を規定カメラとして登録し、グループとコロナ板を追加する。
  return (
    <>
      <PerspectiveCamera makeDefault fov={50} near={0.1} far={100} position={[0, 0, 4.6]} />
      <primitive object={built.group} />
      <primitive object={built.halo} />
    </>
  );
}
