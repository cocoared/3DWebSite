"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import SunScene from "@/components/scenes/SunScene";
import OceanScene from "@/components/scenes/OceanScene";
import GemsScene from "@/components/scenes/GemsScene";
import SceneNav from "@/components/ui/SceneNav";
import SceneHero from "@/components/ui/SceneHero";
import ControlPanel from "@/components/ui/ControlPanel";
import { DEFAULT_PARAMS, STORAGE_KEY, type SceneParams, type SceneTab } from "@/lib/scene";

// PortfolioExperience: サイト全体のクライアント側ルート。1枚の WebGL キャンバス上でシーンを切り替え、UI を重ねる。
// (シーンごとにキャンバスを分けると WebGL コンテキストが増えて不具合が出やすいため、単一キャンバス+シーン差し替え方式にしている。)
export default function PortfolioExperience() {
  // tab: 現在表示中のシーン。初期値は太陽。
  const [tab, setTab] = useState<SceneTab>("sun");
  // params: 3シーンぶんの操作パラメータ。スライダーで更新される。
  const [params, setParams] = useState<SceneParams>(DEFAULT_PARAMS);

  // マウント時に、前回開いていたシーンを localStorage から復元する。
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY); // 保存値を読む
      if (saved === "sun" || saved === "oce" || saved === "gem") setTab(saved); // 妥当なら復元
    } catch {
      // localStorage が使えない環境では初期値のままにする
    }
  }, []);

  // selectTab: タブを切り替え、選択を localStorage に保存する。
  const selectTab = (next: SceneTab) => {
    setTab(next); // 表示シーンを更新
    try {
      localStorage.setItem(STORAGE_KEY, next); // 選択を保存
    } catch {
      // 保存できなくても表示切り替えは継続する
    }
  };

  // setParam: 現在のシーンの指定パラメータを新しい値へ更新する(イミュータブルに新オブジェクトを作る)。
  const setParam = (field: string, value: number) => {
    setParams((prev) => ({
      ...prev, // 他シーンの値はそのまま引き継ぐ
      [tab]: { ...(prev[tab] as unknown as Record<string, number>), [field]: value }, // 現シーンの1項目だけ差し替える
    }) as SceneParams);
  };

  return (
    // app: 全画面の背景コンテナ。3D キャンバスと UI を絶対配置で重ねる土台。
    <div className="app">
      {/* 単一の 3D キャンバス。色味を元デザインに合わせて linear(色変換なし)+flat(トーンマップなし)にする。 */}
      <Canvas className="lay on" dpr={[1, 1.6]} gl={{ antialias: true, alpha: true }} linear flat>
        {/* 選択中のシーンだけをマウントする。各シーンは自前のカメラ(PerspectiveCamera)を持つ。 */}
        {tab === "sun" && <SunScene params={params.sun} />}
        {tab === "oce" && <OceanScene params={params.oce} />}
        {tab === "gem" && <GemsScene params={params.gem} />}
      </Canvas>

      {/* vignette: 画面周辺を暗く落として中央へ視線を集める、操作を透過するオーバーレイ。 */}
      <div className="vignette" />

      {/* ui: キャンバスの上に重なる操作 UI。ナビと、左下の見出し・右下のパネルを配置する。 */}
      <div className="ui">
        {/* 上部ナビ(シーン切り替え)。 */}
        <SceneNav active={tab} onSelect={selectTab} />
        {/* bottom: 下端に見出しと操作パネルを両端揃えで並べる。 */}
        <div className="bottom">
          {/* 左下: 現在シーンの見出し。 */}
          <SceneHero tab={tab} />
          {/* 右下: 現在シーンの操作パネル。 */}
          <div className="panelZone">
            <ControlPanel tab={tab} values={params[tab] as unknown as Record<string, number>} onChange={setParam} />
          </div>
        </div>
      </div>
    </div>
  );
}
