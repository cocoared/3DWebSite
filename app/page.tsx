"use client";

import dynamic from "next/dynamic";

// PortfolioExperience は WebGL(three.js)を使うため、サーバー側では描画せずクライアントだけで読み込む。
// ssr:false にすることで、ブラウザ API(document など)がサーバーで実行されるのを防ぐ。
const PortfolioExperience = dynamic(() => import("@/components/PortfolioExperience"), {
  ssr: false,
});

// Home: サイトのトップページ。3D 体験コンポーネントをそのまま表示する。
export default function Home() {
  return <PortfolioExperience />;
}
