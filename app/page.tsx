"use client";

import dynamic from "next/dynamic";

// PortfolioExperience は WebGL(three.js)を使うため、サーバー側では描画せずクライアントだけで読み込む。
// ssr:false: Node.js には document も GPU も無く、実行すると即クラッシュするため
//            ("use client" だけでは初回のサーバー描画を防げない)。詳細は docs/警告とTODOの解説.md
const PortfolioExperience = dynamic(() => import("@/components/PortfolioExperience"), {
  ssr: false,
});

// Home: サイトのトップページ。3D 体験コンポーネントをそのまま表示する。
export default function Home() {
  return <PortfolioExperience />;
}
