"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import SceneErrorBoundary from "@/components/SceneErrorBoundary";
import JewelsScene from "@/components/scenes/JewelsScene";
import OceanScene from "@/components/scenes/OceanScene";
import SunScene from "@/components/scenes/SunScene";
import ControlPanel from "@/components/ui/ControlPanel";
import JewelDetail from "@/components/ui/JewelDetail";
import LoadingIndicator from "@/components/ui/LoadingIndicator";
import MonthPicker from "@/components/ui/MonthPicker";
import SceneHero from "@/components/ui/SceneHero";
import SceneNav from "@/components/ui/SceneNav";
import { type BirthstoneId, birthstoneById } from "@/lib/birthstones";
import { returnFocusToMonth } from "@/lib/focus";
import {
  DEFAULT_PARAMS,
  HERO,
  parseSceneTab,
  type SceneParams,
  type SceneTab,
  STORAGE_KEY,
} from "@/lib/scene";
import { jewelHero, overviewHero, toggleStone } from "@/lib/scenes/jewels";

// readSavedTab: 前回開いていたシーンを localStorage から復元する(なければ太陽)。
// このコンポーネントは page 側で ssr:false 指定のためクライアントでのみ実行され、localStorage を安全に読める。
function readSavedTab(): SceneTab {
  try {
    // 保存値を読み、実在するタブの id なら復元する（改名前の "gem" などは受け入れない）
    return parseSceneTab(localStorage.getItem(STORAGE_KEY)) ?? "sun";
  } catch {
    // localStorage が使えない環境では初期値にフォールバックする
    return "sun";
  }
}

// PortfolioExperience: サイト全体のクライアント側ルート。1枚の WebGL キャンバス上でシーンを切り替え、UI を重ねる。
// (シーンごとにキャンバスを分けると WebGL コンテキストが増えて不具合が出やすいため、単一キャンバス+シーン差し替え方式にしている。)
export default function PortfolioExperience() {
  // tab: 現在表示中のシーン。初回だけ localStorage から復元する(遅延初期化)。
  const [tab, setTab] = useState<SceneTab>(readSavedTab);
  // params: 3シーンぶんの操作パラメータ。スライダーで更新される。
  const [params, setParams] = useState<SceneParams>(DEFAULT_PARAMS);
  // jewel: 誕生石シーンで選んでいる石（null = 全体の文字盤を見ている）。3D・月のボタン・見出し・詳細パネルが共有する
  const [jewel, setJewel] = useState<BirthstoneId | null>(null);
  // isReturnFromStone: 同じタブのまま石の選択を外して、文字盤の一覧に戻ったところか。
  // 読み上げを「シーンを表示しています」ではなく「一覧に戻りました」にするために使う（lib/scenes/jewels.ts の overviewHero）
  const [isReturnFromStone, setIsReturnFromStone] = useState(false);
  // monthPicker: 月のボタン列の <nav>（詳細パネルを閉じたときに、フォーカスを戻す月のボタンを探すため）
  const monthPicker = useRef<HTMLElement>(null);
  // detailPanel: 詳細パネルの <section>（閉じるときに、フォーカスがパネルの中にあるかを調べるため）
  const detailPanel = useRef<HTMLElement>(null);

  // selectTab: タブを切り替え、選択を localStorage に保存する。
  const selectTab = (next: SceneTab) => {
    // 表示シーンを更新
    setTab(next);
    // タブを切り替えてきたので、誕生石シーンに来たときはシーンの読み上げに戻す
    setIsReturnFromStone(false);
    try {
      // 選択を保存
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 保存できなくても表示切り替えは継続する
    }
  };

  // setParam: 現在のシーンの指定パラメータを新しい値へ更新する(イミュータブルに新オブジェクトを作る)。
  const setParam = (field: string, value: number) => {
    setParams(
      (prev) =>
        ({
          ...prev, // 他シーンの値はそのまま引き継ぐ
          [tab]: { ...(prev[tab] as unknown as Record<string, number>), [field]: value }, // 現シーンの1項目だけ差し替える
        }) as SceneParams,
    );
  };

  // toggleJewel: 月のボタンで石を選ぶ。選んでいる月をもう一度押したら選択を外す（決め方は lib/scenes/jewels.ts の toggleStone）。
  // 3D の石のクリックは、切り替えずにいつもその石を選ぶ（JewelsScene の onSelect に setJewel をそのまま渡している）
  const toggleJewel = (id: BirthstoneId) => {
    // 今の選択から、次の選択を決める（読み上げの切り替えにも使うので、先に計算しておく）
    const next = toggleStone(jewel, id);
    // 選択を更新する
    setJewel(next);
    // 選択を外したときだけ、「一覧に戻りました」と読み上げる
    setIsReturnFromStone(next === null);
  };

  // closeJewel: 詳細パネルを閉じて全体の文字盤に戻る（× ボタンと Esc キー）。
  // ref と state の更新関数（どれも再レンダーで変わらない）しか使わないので、最初に作った関数を使い回す
  const closeJewel = useCallback(() => {
    // パネルの中にフォーカスがあれば、パネルが消える前に、選んでいた月のボタンへ移す（lib/focus.ts）
    returnFocusToMonth(detailPanel.current, monthPicker.current, document.activeElement);
    // 選択を外す
    setJewel(null);
    // 同じタブのまま一覧に戻ったので、「一覧に戻りました」と読み上げる
    setIsReturnFromStone(true);
  }, []);

  // 誕生石を選んでいる間は、Esc キーで全体の文字盤に戻れるようにする
  useEffect(() => {
    // 誕生石シーンで石を選んでいるときだけ受け付ける
    if (tab !== "jewel" || !jewel) return;
    // onKeyDown: Esc キーなら詳細パネルを閉じる
    const onKeyDown = (event: KeyboardEvent) => {
      // Esc キーのときだけ
      if (event.key === "Escape") closeJewel();
    };
    // キー入力の受け取りを登録する
    window.addEventListener("keydown", onKeyDown);
    // 後始末: 登録を外す
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tab, jewel, closeJewel]);

  // detail: 詳細パネルに出す石（誕生石シーンで石を選んでいるときだけ）
  const detail = tab === "jewel" && jewel ? birthstoneById(jewel) : null;
  // overview: 石を選んでいないときの見出し。誕生石シーンでは、選択を外して戻ったときだけ読み上げの文が変わる
  const overview = tab === "jewel" ? overviewHero(isReturnFromStone) : HERO[tab];
  // hero: 左下の見出しの文言と読み上げの知らせ。石を選んでいればその石の見出し、そうでなければ上の見出し
  const hero = detail ? jewelHero(detail) : overview;

  return (
    // main: ページの本文（ランドマーク）。読み上げソフトで「本文へ移動」したときの行き先になる。
    // 全画面の背景コンテナを兼ね、3D キャンバスと UI を絶対配置で重ねる土台にする。
    // h-dvh: スマホでアドレスバーが出ていても、実際に見えている高さに合わせる（h-screen だと下端の UI が隠れる）
    <main className="relative h-dvh w-full overflow-hidden bg-ink">
      {/* キャンバスの中で起きたエラー（宝石の .glb が読めないなど）を捕まえて知らせる。タブを替えたら描き直す。 */}
      <SceneErrorBoundary resetKey={tab}>
        {/* 単一の 3D キャンバス。色味を元デザインに合わせて linear(色変換なし)+flat(トーンマップなし)にする。 */}
        {/* （誕生石シーンだけは、表示中に JewelsScene が写真向けの色の出し方へ切り替える） */}
        {/* [&_canvas]:… は R3F が内部生成する <canvas> を層いっぱいに広げ、タッチのスクロール干渉を防ぐ指定。 */}
        <Canvas
          className="absolute inset-0 block h-full w-full cursor-grab touch-none active:cursor-grabbing [&_canvas]:block [&_canvas]:h-full! [&_canvas]:w-full! [&_canvas]:touch-none"
          dpr={[1, 1.6]}
          gl={{ antialias: true, alpha: true }}
          linear
          flat
        >
          {/* 選択中のシーンだけをマウントする。各シーンは自前のカメラ(PerspectiveCamera)を持つ。 */}
          {tab === "sun" && <SunScene params={params.sun} />}
          {tab === "oce" && <OceanScene params={params.oce} />}
          {/* 誕生石シーンは .glb と .hdr を読み込むので、読み終わるまで Suspense で待つ（その間は何も描かない） */}
          {tab === "jewel" && (
            <Suspense fallback={null}>
              {/* 誕生石シーン */}
              <JewelsScene params={params.jewel} selected={jewel} onSelect={setJewel} />
            </Suspense>
          )}
        </Canvas>
      </SceneErrorBoundary>

      {/* vignette: 画面周辺を暗く落として中央へ視線を集める、操作を透過するオーバーレイ。 */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(125%_95%_at_50%_42%,transparent_55%,rgba(0,0,0,0.36)_100%)]" />

      {/* scrim: スマホ向けの配置だけ、下から暗くなるグラデーションを敷き、見出しの白い文字を読みやすくする。
          スマホでは太陽などの明るい 3D が見出しの真後ろに来るため（パソコン向けの配置では見出しが左下の暗い隅にあるので敷かない）。操作は透過する。
          太陽・浜辺（下の三項演算子の後ろの値）: 画面の全体に、下の端で黒 80%、真ん中で 60%、上の端で透明。
          320〜390px 幅で測って、いちばん小さい文字でも 5.7:1 以上（WCAG AA は 4.5:1）になる濃さ。
          誕生石（前の値）: 背景が暗いので、画面の下半分だけに弱く敷く（全体に敷くと、文字盤の石の色まで暗く沈んでしまうため）。
          狭い画面でタイトルの後ろに白いパールが来ても読めるようにする */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 roomy:hidden bg-linear-to-t to-transparent ${
          tab === "jewel" ? "h-1/2 from-black/70 via-black/40" : "h-full from-black/80 via-black/60"
        }`}
      />

      {/* 3D の読み込み中だけ、中央に進み具合を出す。 */}
      <LoadingIndicator />

      {/* ui: キャンバスの上に重なる操作 UI。上にナビ、下に見出しと操作パネルを配置する。
          余白はスマホ向けの配置では狭く（16px）、パソコン向けの配置（roomy:）では広くとる */}
      <div className="pointer-events-none absolute inset-0 flex flex-col px-4 roomy:px-11 py-4 roomy:py-8.5 text-paper">
        {/* top: 上部ナビ(シーン切り替え)と、誕生石シーンの月のボタン列。 */}
        <div>
          {/* シーン切り替えのタブ */}
          <SceneNav active={tab} onSelect={selectTab} />
          {/* 誕生石シーンのときだけ、月のボタン列を出す */}
          {tab === "jewel" && (
            <MonthPicker ref={monthPicker} selected={jewel} onSelect={toggleJewel} />
          )}
        </div>
        {/* bottom: 残りの高さを使う下の段。
            パソコン向けの配置（roomy:）: 左下に見出し、右側に詳細パネルと操作パネルを縦に積む。
            スマホ向けの配置: 上から順に、見出し → 詳細のシート → 操作パネルの開閉ボタンを縦に並べ、下の端にそろえる（横に並べると、縦持ちでは幅が、横持ちでは高さが足りないため） */}
        <div className="flex min-h-0 flex-1 roomy:flex-row flex-col roomy:items-end justify-end roomy:justify-between gap-3 roomy:gap-10 pt-3 roomy:pt-6">
          {/* 左下: 現在シーン（または選んだ誕生石）の見出し。スマホ向けの配置で石を選んでいる間は、月と石の名前だけにする */}
          <SceneHero content={hero} isCompact={detail !== null} />
          {/* 右（スマホ向けの配置では下）: 詳細パネル（石を選んだときだけ）の下に操作パネル。
              詳細パネルは、パソコン向けの配置では高さが足りないとき、スマホ向けの配置では中身が 45dvh を超えるときに、中だけスクロールする。
              スマホ向けの配置では幅いっぱいに広げ（items-stretch）、パソコン向けの配置では右に寄せる */}
          <div className="flex roomy:max-h-full min-h-0 flex-col roomy:items-end items-stretch gap-3 roomy:gap-4">
            {/* 選んだ誕生石の詳細（閉じると全体に戻る） */}
            {detail && <JewelDetail ref={detailPanel} stone={detail} onClose={closeJewel} />}
            {/* 現在シーンの操作パネル。key={tab}: タブを替えたら作り直し、スマホ向けの配置で開いていたスライダーを閉じた状態から始める
                （開いたまま別のシーンへ移ると、次のシーンの 3D をいきなり覆ってしまうため）。
                タブを替えるときはフォーカスがタブのボタンにあるので、作り直してもフォーカスは失われない。
                石を選んだときには作り直さない（スライダーにフォーカスがあるまま Esc で詳細を閉じると、フォーカスが消えてしまうため） */}
            <ControlPanel
              key={tab}
              tab={tab}
              values={params[tab] as unknown as Record<string, number>}
              onChange={setParam}
            />
          </div>
        </div>
        {/* 読み上げ専用の知らせ（画面には出さない）。いつも置いておき、タブを切り替えたとき・石を選んだとき・選択を外したときに、
            中の文（例: 浜辺のシーンを表示しています。／文字盤の一覧に戻りました。）が替わって読み上げられる。
            ページを開いた直後の文は読み上げられない */}
        <p role="status" className="sr-only">
          {hero.announcement}
        </p>
      </div>
    </main>
  );
}
