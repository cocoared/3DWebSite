"use client";

import { useProgress } from "@react-three/drei";

// LoadingIndicator: three.js の読み込み（宝石の .glb と環境マップの .hdr）が進んでいる間だけ、画面の中央に進み具合を出す。
// drei の useProgress は three.js の読み込みの管理（DefaultLoadingManager）を見ているので、<Canvas> の外でも使える
export default function LoadingIndicator() {
  // active: 読み込み中か
  const active = useProgress((state) => state.active);
  // progress: 進み具合（0〜100）
  const progress = useProgress((state) => state.progress);
  // 読み込んでいなければ何も出さない
  if (!active) return null;
  return (
    // status: 読み上げに進み具合を伝える。操作の邪魔にならないよう、ポインタは下のキャンバスへ通す
    <div
      role="status"
      className="pointer-events-none fixed inset-0 flex items-center justify-center"
    >
      {/* 進み具合（整数の %） */}
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-70">
        Loading {Math.round(progress)}%
      </span>
    </div>
  );
}
