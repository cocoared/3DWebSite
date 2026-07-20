"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { useDragInteraction } from "@/lib/useDragInteraction";
import { buildGems, createGemsAnim, updateGems, disposeGems } from "@/lib/scenes/gems";
import type { GemParams } from "@/lib/scene";

// GemsScene: 宝石シーンのレイアウト（配線）担当。
// 構築・更新・破棄の実処理は lib/scenes/gems.ts にあり、ここは React のフックと JSX だけ。
export default function GemsScene({ params }: { params: GemParams }) {
  // paramsRef: 最新のスライダー値をループから読むための ref。
  // レンダー中に ref を書き換えないよう、更新は effect 側で行う。
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  // gl / scene / camera: R3F が用意したレンダラー・シーン・カメラを取得する。
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  // drag: ポインタ操作(回転・タップきらめき)の状態。
  const drag = useDragInteraction();

  // built: 宝石・床・ライト・きらめきを初回に一度だけ構築する(環境キューブの焼き込みに renderer が要る)。
  const built = useMemo(() => buildGems(gl), [gl]);

  // anim: 回転角と慣性、タップ演出量を持ち越す。
  const anim = useRef(createGemsAnim());

  // マウント時にシーンの環境反射とフォグを設定する(この Canvas のシーンにのみ効く)。
  // R3F では scene の設定はこのオブジェクトを直接書き換えて行うのが正規の方法なので、
  // hook 戻り値の変更を禁じる react-hooks/immutability はここでは意図的に無効化する。
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    scene.environment = built.env; // 標準マテリアルの映り込みに環境キューブを使う
    scene.fog = new THREE.Fog(0x000000, 11, 24); // 遠くを黒くフェードさせる霧
    return () => {
      scene.environment = null; // 後始末: 環境をクリア
      scene.fog = null; // 後始末: 霧をクリア
    };
  }, [scene, built]);
  /* eslint-enable react-hooks/immutability */

  // 毎フレーム、最新のスライダー値・ドラッグ状態・カメラでシーンを更新する。
  useFrame((state) => {
    updateGems(
      built,
      anim.current,
      drag.current,
      paramsRef.current,
      state.clock.getElapsedTime(),
      camera,
    );
  });

  // アンマウント時に GPU リソースを解放する。
  useEffect(() => () => disposeGems(built), [built]);

  // このシーン専用のカメラ(斜め上から見下ろす)を規定カメラとして登録し、グループを追加する。
  return (
    <>
      <PerspectiveCamera makeDefault fov={40} near={0.1} far={100} position={[0, 2.7, 5.6]} />
      <primitive object={built.group} />
    </>
  );
}
