"use client";

import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Birthstone } from "@/lib/birthstones";
import { get2dContext } from "@/lib/textures";
import {
  type AutoplayOrigin,
  autoplayFrameAt,
  autoplayOriginFor,
  dragFrame,
  originAfterManualTurn,
  TURNTABLE_FRAMES,
  TURNTABLE_IMAGE_SIZE,
  TURNTABLE_SLOW_LOADING_MS,
  turntableFrameUrls,
  turntableLoadingMessage,
  wrapFrame,
} from "@/lib/turntable";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

/** TurntableViewer の props。 */
interface TurntableViewerProps {
  /** 表示する石。石が替わったときは、呼び出し側で `key` を替えて作り直す（読み込み中の画像を捨てるため）。 */
  stone: Birthstone;
}

// TurntableViewer: Cycles で描いた連番画像（1 周 48 枚）を、ドラッグでめくって「写真の石を回す」ビューア。
// 画像は <canvas> に描く。番号が変わるたびに React の再レンダーを起こさないよう、番号やドラッグの状態は ref に持つ
export default function TurntableViewer({ stone }: TurntableViewerProps) {
  // canvas: 画像を描く <canvas> 要素
  const canvas = useRef<HTMLCanvasElement>(null);
  // images: 1 周ぶんの画像（番号の順）
  const images = useRef<HTMLImageElement[]>([]);
  // frame: 今表示している番号（性能のため直接書き換える）
  const frame = useRef(0);
  // drag: ドラッグ中なら、始めたときの横の位置と番号
  const drag = useRef<{ startX: number; startFrame: number } | null>(null);
  // autoplay: 自動回転の起点（始める時刻と、そのときの番号）。時刻が未来なら、その時刻まで待ってから回す。性能のため直接書き換える
  const autoplay = useRef<AutoplayOrigin | null>(null);
  // reducedMotion: OS の「動きを減らす」設定が有効か
  const reducedMotion = usePrefersReducedMotion();
  // loaded: 読み込み終わった画像の枚数（読み込み中の表示に使う）
  const [loaded, setLoaded] = useState(0);
  // failed: 画像の読み込みに失敗したか
  const [failed, setFailed] = useState(false);
  // playing: 自動回転しているか。動きを減らす設定のときは止めた状態で始める（最初の 1 回だけ読む。あとは一時停止ボタンで切り替える）
  const [playing, setPlaying] = useState(!reducedMotion);
  // isSlow: 読み込みが TURNTABLE_SLOW_LOADING_MS を過ぎても終わらなかったか（読み上げで「読み込み中」と知らせるかを決める）
  const [isSlow, setIsSlow] = useState(false);
  // ready: 1 周ぶんすべて読み込み終わったか
  const ready = loaded === TURNTABLE_FRAMES;

  // 読み込みが長引いたら、読み上げで知らせる印を立てる。すぐ読み込めたら（または失敗したら）立てずに終わる
  useEffect(() => {
    // 読み込めた、または失敗したなら、待たない
    if (ready || failed) return;
    // 決まった時間が過ぎても読み込み中なら、長引いたとみなす
    const timer = window.setTimeout(() => setIsSlow(true), TURNTABLE_SLOW_LOADING_MS);
    // 後始末: 先に読み込めたら（または作り直されたら）、印を立てない
    return () => window.clearTimeout(timer);
  }, [ready, failed]);

  // draw: 今の番号の画像を <canvas> に描く（読み込みが済んでいない画像なら何もしない）
  const draw = useCallback(() => {
    // 描く先
    const target = canvas.current;
    // 描く画像
    const image = images.current[frame.current];
    // どちらかが無い、または画像がまだ届いていなければ描かない
    if (!target || !image?.complete || image.naturalWidth === 0) return;
    // 2D の描画コンテキスト
    const ctx = get2dContext(target);
    // 前の画像を消す（背景は透明なので、重ねると前の石が残る）
    ctx.clearRect(0, 0, target.width, target.height);
    // 画像を <canvas> いっぱいに描く
    ctx.drawImage(image, 0, 0, target.width, target.height);
  }, []);

  // 石の 1 周ぶんの画像を読み込む。石が替わったら（key が替わって作り直されたら）読み込み直す
  useEffect(() => {
    // cancelled: 後始末が済んだか（済んだあとに届いた読み込み完了は無視する）
    let cancelled = false;
    // count: 読み込み終わった枚数
    let count = 0;
    // 1 枚ずつ Image を作って読み込み始める
    const list = turntableFrameUrls(stone.id).map((url, index) => {
      // 画像の要素（画面には出さず、<canvas> に描くためだけに使う）
      const image = new Image();
      // デコード（画像の展開）を描画と並行して行う
      image.decoding = "async";
      // 読み込めたら枚数を数え、今の番号の画像なら描く
      image.onload = () => {
        // 後始末が済んでいたら何もしない
        if (cancelled) return;
        // 枚数を数える
        count += 1;
        // 読み込み中の表示を更新する
        setLoaded(count);
        // 今表示すべき画像なら描く
        if (index === frame.current) draw();
      };
      // 読み込めなかったら、失敗の表示にする
      image.onerror = () => {
        // 後始末が済んでいなければ失敗にする
        if (!cancelled) setFailed(true);
      };
      // 読み込みを始める
      image.src = url;
      // 一覧に加える
      return image;
    });
    // 描画で使えるように持っておく
    images.current = list;
    // 後始末: 届いた完了の知らせを無視し、まだ届いていない画像の通信を打ち切り、画像への参照を手放す
    return () => {
      // 以降の知らせを無視する
      cancelled = true;
      // 画像ごとに、知らせを受け取る関数を外す
      for (const image of list) {
        // 読み込み完了の関数を外す
        image.onload = null;
        // 失敗の関数を外す
        image.onerror = null;
        // まだ届いていない画像は src を外して、ブラウザに通信を打ち切らせる
        // （月を次々に選んだときに、前の石の画像が今の石の画像と回線を取り合わないように）
        if (!image.complete) image.removeAttribute("src");
      }
      // 参照を手放す
      images.current = [];
    };
  }, [stone.id, draw]);

  // すべて読み込み終わっていて自動回転中なら、時間に合わせて番号を進める
  useEffect(() => {
    // 準備ができていない、または止めているなら何もしない
    if (!ready || !playing) return;
    // raf: requestAnimationFrame の番号（後始末で止めるため）
    let raf = 0;
    // tick: 画面の更新ごとに呼ばれ、番号を進める
    const tick = (now: number) => {
      // 次の更新でもまた呼ぶ
      raf = requestAnimationFrame(tick);
      // 起点を決める。ドラッグ中は捨て、無ければ今の番号から今すぐ始める（性能のため直接書き換える）
      autoplay.current = autoplayOriginFor(
        autoplay.current,
        now,
        frame.current,
        drag.current !== null,
      );
      // ドラッグ中は指の動きに任せて、自動では進めない
      if (!autoplay.current) return;
      // 起点と今の時刻から番号を決める（手で回したあとの待ち時間の間は、今の番号のまま）
      const next = autoplayFrameAt(autoplay.current, now, frame.current);
      // 番号が変わったときだけ描き直す
      if (next !== frame.current) {
        // 番号を進める（性能のため直接書き換える）
        frame.current = next;
        // 描く
        draw();
      }
    };
    // 動かし始める
    raf = requestAnimationFrame(tick);
    // 後始末: 止めて起点を捨てる
    return () => {
      // 画面の更新ごとの呼び出しを止める
      cancelAnimationFrame(raf);
      // 起点を捨てる（再開したときは、そのときの番号から始める）
      autoplay.current = null;
    };
  }, [ready, playing, draw]);

  // resumeAutoplayLater: 手で回したあと、しばらく待ってから自動回転を再開させる。
  // 止めている間は起点を作らない（作ると、あとで再開したときに古い起点から時間を数えて、番号が一気に飛ぶ）
  const resumeAutoplayLater = () => {
    // 手で回したあとの起点にする（性能のため直接書き換える）
    autoplay.current = originAfterManualTurn(performance.now(), frame.current, playing);
  };

  // showFrame: 番号を変えて描き直す
  const showFrame = (next: number) => {
    // 番号を変える（性能のため直接書き換える）
    frame.current = next;
    // 描く
    draw();
  };

  // onPointerDown: ドラッグを始める。要素の外へ出てもドラッグが続くよう、ポインタを捕まえる
  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    // ポインタを捕まえる
    event.currentTarget.setPointerCapture(event.pointerId);
    // 始めたときの位置と番号を覚える
    drag.current = { startX: event.clientX, startFrame: frame.current };
  };

  // onPointerMove: ドラッグ中なら、動いた距離に応じて番号を変える
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    // ドラッグしていなければ何もしない
    if (!drag.current) return;
    // 動いた距離から決まる番号
    const next = dragFrame(drag.current.startFrame, event.clientX - drag.current.startX);
    // 番号が変わったときだけ描き直す
    if (next !== frame.current) showFrame(next);
  };

  // endDrag: ドラッグを終え、しばらくしてから自動回転を再開する
  const endDrag = () => {
    // ドラッグしていなければ何もしない
    if (!drag.current) return;
    // ドラッグを終える
    drag.current = null;
    // しばらく待ってから自動回転を再開させる
    resumeAutoplayLater();
  };

  // step: ボタンで 1 コマずつ回す（-1 = 左へ、+1 = 右へ）
  const step = (delta: number) => {
    // 範囲内に収めた次の番号を表示する
    showFrame(wrapFrame(frame.current + delta));
    // しばらく待ってから自動回転を再開させる
    resumeAutoplayLater();
  };

  return (
    // viewer: 画像と操作ボタンのまとまり
    <div>
      {/* stage: 画像を描く正方形の枠。読み込み中や失敗の表示を重ねる。
          スマホ向けの配置では 224px までにして中央に置く（幅いっぱいの正方形だと、高さが最大 45dvh のシートが写真だけで埋まるため）。
          さらに高さが 480px（30rem）以下のスマホ（横向きなど）では 128px にして、説明や特徴の一覧をシートの中で見えるようにする */}
      <div className="relative mx-auto max-w-56 roomy:max-w-none short:max-w-32">
        {/* 画像を描く <canvas>。内部の解像度は連番画像と同じにし、表示の大きさは CSS で合わせる */}
        <canvas
          ref={canvas}
          width={TURNTABLE_IMAGE_SIZE}
          height={TURNTABLE_IMAGE_SIZE}
          // role="img": 読み上げでは「画像」として扱い、aria-label で中身を伝える
          role="img"
          aria-label={`${stone.nameJa}を Cycles（レイトレーシング）で描いた写真。ドラッグで回せます`}
          // touch-pan-y: 横のドラッグは写真を回す操作に使い、縦のドラッグはブラウザに任せて、写真の上からでもシートを縦にスクロールできるようにする
          // （縦にスクロールし始めると pointercancel が届き、endDrag で回す操作を終える）
          className="block aspect-square w-full cursor-grab touch-pan-y active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        {/* 読み込み中の表示（1 周ぶんそろうまで）。失敗したときは代わりに失敗の表示を出す */}
        {!ready && !failed && (
          // 目で見る人向けの枚数の表示。読み上げでは下の読み上げ用の状態が伝えるので、aria-hidden で読ませない
          <div
            aria-hidden="true"
            lang="en"
            className="absolute inset-0 flex items-center justify-center font-mono text-[11px] uppercase tracking-[0.2em] opacity-70"
          >
            {/* 読み込んだ枚数 / 全体の枚数 */}
            Loading {loaded}/{TURNTABLE_FRAMES}
          </div>
        )}
        {/* 読み込みに失敗したときの表示 */}
        {failed && (
          // alert: 読み上げですぐに伝える
          <div
            role="alert"
            className="absolute inset-0 flex items-center justify-center px-6 text-center font-jp text-sm"
          >
            写真を読み込めませんでした。ページを再読み込みしてください。
          </div>
        )}
      </div>
      {/* 読み上げ用の状態（画面には出さない）。最初は空で置いておき、読み込みが長引いたときだけ文を入れて読み上げさせる */}
      <p role="status" className="sr-only">
        {turntableLoadingMessage(ready, failed, isSlow)}
      </p>
      {/* controls: 操作のヒントと、キーボードでも使える回転・一時停止のボタン */}
      <div className="mt-2 flex items-center justify-between">
        {/* 操作のヒント（英語として読み上げさせる） */}
        <span lang="en" className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-55">
          Drag to rotate
        </span>
        {/* buttons: 左へ・一時停止/再開・右へ */}
        <div className="flex gap-1">
          {/* 左へ 1 コマ回す */}
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="左へ回す"
            className={BUTTON_CLASS}
          >
            ‹
          </button>
          {/* 自動回転の一時停止と再開（動き続ける表示を止められるようにする: WCAG 2.2.2） */}
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? "自動回転を止める" : "自動回転を再開する"}
            className={BUTTON_CLASS}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          {/* 右へ 1 コマ回す */}
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="右へ回す"
            className={BUTTON_CLASS}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}

// BUTTON_CLASS: 小さな丸い操作ボタンの見た目（キーボードで選んだときの枠も見えるようにする）
const BUTTON_CLASS =
  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-transparent font-mono text-xs text-paper/75 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-(--accent) focus-visible:outline-offset-2";
