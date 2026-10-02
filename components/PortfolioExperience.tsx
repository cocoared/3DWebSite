"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import SceneErrorBoundary from "@/components/SceneErrorBoundary";
import JewelsScene from "@/components/scenes/JewelsScene";
import OceanScene from "@/components/scenes/OceanScene";
import SunScene from "@/components/scenes/SunScene";
import ControlPanel from "@/components/ui/ControlPanel";
import JewelCard from "@/components/ui/JewelCard";
import LoadingIndicator from "@/components/ui/LoadingIndicator";
import MonthLabels from "@/components/ui/MonthLabels";
import SceneHero from "@/components/ui/SceneHero";
import SceneNav from "@/components/ui/SceneNav";
import { type BirthstoneId, birthstoneById } from "@/lib/birthstones";
import { createMonthLabelHandles, endFocusPromise, requestLabelFocus } from "@/lib/monthLabels";
import {
  DEFAULT_PARAMS,
  HERO,
  parseSceneTab,
  type SceneParams,
  type SceneTab,
  STORAGE_KEY,
} from "@/lib/scene";
import { jewelHero, overviewHero } from "@/lib/scenes/jewels";

// CANVAS_DPR: キャンバスの解像度の倍率（デバイスピクセル比）の範囲 [下限, 上限]。高精細な画面でも 1.6 倍までにして、描くピクセル数を抑える
const CANVAS_DPR: [number, number] = [1, 1.6];
// JEWELS_DPR: 誕生石シーンだけの解像度の倍率の範囲。屈折の石は 1 ピクセルごとに光線を赤・緑・青の 3 回ずつ追いかけて重いので、
// 上限を 1.25 倍に下げる（1.6 倍より描くピクセル数が約 4 割少ない）。大きくすると石の輪郭が細かくなるが、スマホで遅くなる
const JEWELS_DPR: [number, number] = [1, 1.25];

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
  // jewel: 誕生石シーンで選んでいる石（null = 全体の文字盤を見ている）。3D・月のラベル・見出し・解説カードが共有する
  const [jewel, setJewel] = useState<BirthstoneId | null>(null);
  // isReturnFromStone: 同じタブのまま石の選択を外して、文字盤の一覧に戻ったところか。
  // 読み上げを「シーンを表示しています」ではなく「一覧に戻りました」にするために使う（lib/scenes/jewels.ts の overviewHero）
  const [isReturnFromStone, setIsReturnFromStone] = useState(false);
  // labelHandles: 月のラベルの DOM 要素と、閉じたあとにフォーカスを返す月の入れ物（lib/monthLabels.ts）。
  // MonthLabels が要素を入れ、JewelsScene が毎フレーム位置を書き込む。useState の初期化関数で 1 回だけ作り、同じものを使い続ける
  const [labelHandles] = useState(createMonthLabelHandles);
  // jewelCard: 解説カードの <section>（閉じるときに、フォーカスがカードの中にあるかを調べるため）
  const jewelCard = useRef<HTMLElement>(null);
  // heroHeading: 左下の見出し（SceneHero の h1）。解説カードを閉じたあと、月のラベルが画面に入るまでフォーカスを預ける
  const heroHeading = useRef<HTMLHeadingElement>(null);
  // shouldHoldFocus: 次にカードが消えたときに、見出しへフォーカスを預けるか（閉じるときに、ラベルへ返す約束をしたら true）
  const shouldHoldFocus = useRef(false);
  // isJewelsReady: 誕生石シーンの 3D が読み込まれて表示できているか（JewelsScene の onReady が知らせる）。
  // true の間だけ月のラベルを描く（読み込み中やエラーのときに、中身の無い「誕生月を選ぶ」ナビを読み上げさせないため）
  const [isJewelsReady, setIsJewelsReady] = useState(false);
  // selectTab: タブを切り替え、選択を localStorage に保存する。
  const selectTab = (next: SceneTab) => {
    // 表示シーンを更新
    setTab(next);
    // 石の選択を外す（誕生石シーンに戻ってきたときに、解説カードが出てフォーカスがタブから勝手に動かないように）
    setJewel(null);
    // 月のラベルへフォーカスを返す約束と預け先を消す（別のシーンへ移ったあとで、戻ってきたときにフォーカスを奪わないように）。入れ物は state ではないので直接書き換える
    endFocusPromise(labelHandles);
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

  // selectJewel: 石を選ぶ（月のラベル・3D の石・解説カードの前後の月のボタンから）。
  // 月のラベルは石を選んでいる間は描かないので、押し直して選択を外す動きは無い（外すのはカードの × と Esc）。
  // 入れ物（再レンダーで変わらない）と state の更新関数しか使わないので、最初に作った関数を使い回す（memo した MonthLabels を描き直さないため）
  const selectJewel = useCallback(
    (id: BirthstoneId) => {
      // 選択を更新する
      setJewel(id);
      // 石を選んだので、読み上げは石の文にする
      setIsReturnFromStone(false);
      // 前の約束と預け先が残っていれば消す（別の石を選んだあとで、古い月のラベルにフォーカスが飛ばないように）。入れ物は state ではないので直接書き換える
      endFocusPromise(labelHandles);
    },
    [labelHandles],
  );

  // closeJewel: 解説カードを閉じて文字盤の一覧に戻る（× ボタンと Esc キー）。
  // 閉じる石の月を使うので、選んでいる石が替わったら作り直す
  const closeJewel = useCallback(() => {
    // 閉じる石が無ければ何もしない
    if (!jewel) return;
    // カードの中にフォーカスがあれば、閉じたあと、その月のラベルが見えたときにフォーカスを返す約束をする（lib/monthLabels.ts）。
    // 約束したら、ラベルが見えるまでの間は見出しへフォーカスを預ける（下の useLayoutEffect）
    shouldHoldFocus.current = requestLabelFocus(
      jewelCard.current,
      document.activeElement,
      labelHandles,
      birthstoneById(jewel).month,
      // 今の時刻（約束の期限を決める。カメラが一覧へ戻る間は待つ）
      performance.now(),
    );
    // 選択を外す
    setJewel(null);
    // 同じタブのまま一覧に戻ったので、「一覧に戻りました」と読み上げる
    setIsReturnFromStone(true);
  }, [jewel, labelHandles]);

  // 誕生石を選んでいる間は、Esc キーで全体の文字盤に戻れるようにする
  useEffect(() => {
    // 誕生石シーンで石を選んでいるときだけ受け付ける
    if (tab !== "jewel" || !jewel) return;
    // onKeyDown: Esc キーなら解説カードを閉じる
    const onKeyDown = (event: KeyboardEvent) => {
      // Esc キーのときだけ
      if (event.key === "Escape") closeJewel();
    };
    // キー入力の受け取りを登録する
    window.addEventListener("keydown", onKeyDown);
    // 後始末: 登録を外す
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tab, jewel, closeJewel]);

  // cardStone: 解説カードに出す石（誕生石シーンで石を選んでいるときだけ）
  const cardStone = tab === "jewel" && jewel ? birthstoneById(jewel) : null;
  // 解説カードを閉じてカードが消えたら、月のラベルが画面に入るまで、一覧の見出しへフォーカスを預ける。
  // カードの中にあったフォーカスはカードと一緒に消えて <body> に落ち、キーボードや読み上げで今いる場所が分からなくなるため（WCAG 2.4.3）。
  // 閉じた直後はカメラが石に寄ったままで、ラベルが画面の外にあり、すぐにはフォーカスできない。ラベルが見えたら JewelsScene が見出しからラベルへ移す。
  // useLayoutEffect: 画面を描く前に移す（フォーカスの無い瞬間を見せない。3D の次のフレームより先に動くので、先にラベルへ移ったフォーカスを見出しが奪うこともない）
  useLayoutEffect(() => {
    // カードが出ている間、または閉じるときに約束しなかった（フォーカスがカードの外にあった）ときは何もしない
    if (cardStone || !shouldHoldFocus.current) return;
    // 1 回だけにする（次に閉じるときまで）
    shouldHoldFocus.current = false;
    // heading: 一覧の見出し
    const heading = heroHeading.current;
    // active: 今フォーカスのある要素
    const active = document.activeElement;
    // 見出しが無い、またはフォーカスがもう別の場所にある（<body> に落ちていない）なら、動かさない
    if (!heading || (active && active !== document.body)) return;
    // 預け先を入れ物に知らせる（ここにある間は、約束を待ち続ける。lib/monthLabels.ts の dropFocusPromiseIfMoved）。入れ物は state ではないので直接書き換える
    labelHandles.focusHolder = heading;
    // 画面を動かさずに見出しへ移す
    heading.focus({ preventScroll: true });
  }, [cardStone, labelHandles]);

  // overview: 石を選んでいないときの見出し。誕生石シーンでは、選択を外して戻ったときだけ読み上げの文が変わる
  const overview = tab === "jewel" ? overviewHero(isReturnFromStone) : HERO[tab];
  // hero: 左下の見出しの文言と読み上げの知らせ。石を選んでいればその石の見出し、そうでなければ上の見出し
  const hero = cardStone ? jewelHero(cardStone) : overview;
  // isOnLight: 真っ白な背景が出ているか（誕生石シーンの 3D が表示できている間だけ。読み込み中とエラーのときは、まだ暗い下地の bg-ink が見えている）。
  // true の間は、見出しを濃い色の文字にし、周辺を暗くする飾りと、スマホ向けの暗いグラデーションを敷かない
  const isOnLight = tab === "jewel" && isJewelsReady;

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
          // 解像度の倍率（誕生石シーンだけ上限を下げる。タブを替えたときに切り替わる）
          dpr={tab === "jewel" ? JEWELS_DPR : CANVAS_DPR}
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
              <JewelsScene
                params={params.jewel}
                selected={jewel}
                onSelect={selectJewel}
                labels={labelHandles}
                onReady={setIsJewelsReady}
              />
            </Suspense>
          )}
        </Canvas>
      </SceneErrorBoundary>

      {/* vignette: 画面周辺を暗く落として中央へ視線を集める、操作を透過するオーバーレイ。真っ白な背景（誕生石シーン）では、白のままにするため敷かない */}
      {!isOnLight && (
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(125%_95%_at_50%_42%,transparent_55%,rgba(0,0,0,0.36)_100%)]" />
      )}

      {/* scrim: スマホ向けの配置だけ、下から濃くなるグラデーションを敷き、見出しの文字を読みやすくする。
          スマホでは太陽や石などの 3D が見出しの真後ろに来るため（パソコン向けの配置では見出しが左下の隅にあるので敷かない）。操作は透過する。
          暗い背景（isOnLight が false の値。太陽・浜辺と、誕生石の読み込み中）: 画面の全体に、下の端で黒 80%、真ん中で 60%、上の端で透明。
          320〜390px 幅で測って、いちばん小さい文字でも 5.7:1 以上（WCAG AA は 4.5:1）になる濃さ。
          真っ白な背景（isOnLight が true の値。誕生石）: 見出しは濃い色の文字なので、画面の下半分だけに白を敷き（下の端で 85%、下から 1/4 の高さで 65%）、
          見出しの後ろに色の濃い石が来ても読めるようにする。後ろが真っ黒でも、見出しのいちばん上の小さな文字（eyebrow。390 × 844 の画面で白 約 56% の所）が計算で約 6:1 になる濃さ（80% / 50% では約 4:1 だった）
          （全体に敷くと、文字盤の石まで白くかすむため） */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 roomy:hidden bg-linear-to-t to-transparent ${
          isOnLight ? "h-1/2 from-white/85 via-white/65" : "h-full from-black/80 via-black/60"
        }`}
      />

      {/* 3D の読み込み中だけ、中央に進み具合を出す。 */}
      <LoadingIndicator />

      {/* ui: キャンバスの上に重なる操作 UI。上にナビ、下に見出し（または解説カード）と操作パネルを配置する。
          余白はスマホ向けの配置では狭く（16px）、パソコン向けの配置（roomy:）では広くとる。
          高さ 256px 未満の画面（tiny:。400% 拡大など）では、中身が入りきらないので、この層ごとスクロールする。
          isolate: この層を 1 つの重なりの単位にし、月のラベル（-z-10）を層の中の一番下に描く（キャンバスよりは上、ナビ・見出し・カード・操作パネルよりは下） */}
      <div className="pointer-events-none absolute inset-0 isolate flex flex-col tiny:overflow-y-auto px-4 roomy:px-11 py-4 roomy:py-8.5 text-paper">
        {/* top: 上部ナビ(シーン切り替え) */}
        <div>
          {/* シーン切り替えのタブ */}
          <SceneNav active={tab} onSelect={selectTab} />
        </div>
        {/* 誕生石シーンの 3D が表示できていて、石を選んでいない間だけ、文字盤の石のそばに月のラベルを浮かべる（位置は JewelsScene が毎フレーム書き込む）。
            石を選んでいる間はラベルが全部隠れるので、描かない（中身の無い「誕生月を選ぶ」ナビを読み上げさせないため）。閉じたあとにフォーカスを返す約束は入れ物に残るので、描き直したラベルに返る。
            ナビの直後に置き、キーボードの移動順を「タブ → 月 → 見出し・カード → 操作パネル」にする */}
        {tab === "jewel" && isJewelsReady && !cardStone && (
          <MonthLabels handles={labelHandles} onSelect={selectJewel} />
        )}
        {/* bottom: 残りの高さを使う下の段。
            パソコン向けの配置（roomy:）: 左下に見出し（または解説カード）、右下に操作パネル。
            スマホ向けの配置: 見出し（または解説カードのシート）→ 操作パネルの開閉ボタンを縦に並べ、下の端にそろえる（横に並べると、縦持ちでは幅が、横持ちでは高さが足りないため）。
            高さ 256px 未満の画面（tiny:）では縮めずに中身の高さのままにし、UI の層ごとスクロールさせる */}
        <div className="flex min-h-0 flex-1 tiny:flex-none roomy:flex-row flex-col roomy:items-end justify-end roomy:justify-between gap-3 roomy:gap-10 pt-3 roomy:pt-6">
          {/* 左下: 石を選んでいれば解説カード、そうでなければ現在シーンの見出し */}
          {cardStone ? (
            <JewelCard
              ref={jewelCard}
              stone={cardStone}
              onSelect={selectJewel}
              onClose={closeJewel}
            />
          ) : (
            <SceneHero content={hero} headingRef={heroHeading} isOnLight={isOnLight} />
          )}
          {/* 右下（スマホ向けの配置では下）: 操作パネル。スマホ向けの配置では幅いっぱいに広げ（items-stretch）、パソコン向けの配置では右に寄せる */}
          <div className="flex roomy:max-h-full min-h-0 flex-col roomy:items-end items-stretch">
            {/* 現在シーンの操作パネル。key={tab}: タブを替えたら作り直し、スマホ向けの配置で開いていたスライダーを閉じた状態から始める
                （開いたまま別のシーンへ移ると、次のシーンの 3D をいきなり覆ってしまうため）。
                タブを替えるときはフォーカスがタブのボタンにあるので、作り直してもフォーカスは失われない。
                石を選んだときには作り直さない（スライダーにフォーカスがあるまま Esc でカードを閉じると、フォーカスが消えてしまうため） */}
            <ControlPanel
              key={tab}
              tab={tab}
              values={params[tab] as unknown as Record<string, number>}
              onChange={setParam}
            />
          </div>
        </div>
        {/* 読み上げ専用の知らせ（画面には出さない）。いつも置いておき、タブを切り替えたとき・石を選んだとき（前後の月へ移ったときも）・選択を外したときに、
            中の文（例: 浜辺のシーンを表示しています。／文字盤の一覧に戻りました。）が替わって読み上げられる。
            ページを開いた直後の文は読み上げられない */}
        <p role="status" className="sr-only">
          {hero.announcement}
        </p>
      </div>
    </main>
  );
}
