"use client";

import { useEffect, useId, useRef } from "react";

/** PageError の props（Next.js がエラーバウンダリから渡す）。 */
interface PageErrorProps {
  /** 捕まえたエラー。本番ではサーバー由来のエラーの詳しい文言は伏せられ、`digest`（サーバーのログと照らし合わせるための、自動で作られるハッシュ）だけが付く。 */
  error: Error & { digest?: string };
  /** ページの中身を取り直して描き直す（Next.js 16.2 で加わり、`reset` より推奨されている）。一時的な失敗なら、これで元に戻る。 */
  unstable_retry: () => void;
}

// PageError: ページの受け皿（Next.js の error.tsx）。app/page.tsx から下で起きたエラーを捕まえ、画面が真っ白になる代わりにこれを出す。
// 3D のキャンバスの中のエラーは components/SceneErrorBoundary.tsx が先に受け止めるので、ここに来るのはそれ以外
// （タブ・月のボタン・詳細パネルなど UI の部品のエラーや、画面の本体（PortfolioExperience）のプログラム（チャンク）が通信の失敗で読めなかったとき）。
// 同じ階層の app/layout.tsx で起きたエラーは、ここでは受け止められない（それは global-error.tsx の役目。layout は静的で落ちる要素がほぼないので置いていない）。
// エラーバウンダリはブラウザで動く必要があるので "use client" にする。名前を Error にしないのは、組み込みの Error を隠してしまうため
export default function PageError({ error, unstable_retry }: PageErrorProps) {
  // heading: 見出しの <h1>（エラーの画面が出たときに、ここへフォーカスを移すため）
  const heading = useRef<HTMLHeadingElement>(null);
  // descriptionId: 説明の <p> の id（見出しの aria-describedby から指して、フォーカスが移ったときに説明も読ませるため）。
  // useId はページの中で重ならない id を React に作らせる
  const descriptionId = useId();

  // エラーが来るたびに（最初に出たときと、再試行しても失敗して新しいエラーが来たとき）1 回だけ行う。
  // 開発時は React の Strict Mode で 2 回走ることがある
  useEffect(() => {
    // 原因を調べられるよう、目印を付けてエラーを開発者ツールに残す
    console.error("[app/error] ページの表示に失敗しました", error);
    // 見出しへフォーカスを移す。押していたボタンなどが消えてフォーカスが <body> に落ちると、
    // キーボードや読み上げで使う人が今どこにいるかを見失うため。読み上げソフトはフォーカスの移った見出しを読み、
    // aria-describedby でつないだ説明もあわせて読むことが多い。フォーカスの移動で伝えるので、role="alert" は付けない（付けると同じ内容を二重に読み上げかねない）
    heading.current?.focus();
  }, [error]);

  return (
    // main: ページの本文。背景の暗い色は body の bg-ink（app/layout.tsx）がそのまま見えている。
    // 大きく拡大して中身が画面より高くなっても上下が切れないよう、main の中でスクロールできるようにする（body はスクロールしない）。
    // w-full: 親（body）の幅いっぱいに広げる
    <main className="flex h-dvh w-full flex-col overflow-y-auto px-8 text-center">
      {/* 中身のまとまり。m-auto で、余白があるときは画面の中央に置き、はみ出すときは上端から並べる（justify-center だと上が切れる） */}
      <div className="m-auto flex flex-col items-center gap-6 py-8">
        {/* 見出しと説明 */}
        <div className="flex flex-col items-center gap-3">
          {/* 見出し（エラーの画面では、シーンの見出しの代わりにこれがページの h1 になる）。
              tabIndex={-1}: Tab キーでは止まらないが、プログラムからフォーカスを当てられるようにする。
              outline-none: プログラムで当てたフォーカスの枠は出さない（ボタンの枠は残す）。
              aria-describedby: 見出しにフォーカスが移ったとき、下の説明も「この見出しの補足」として読み上げさせる */}
          <h1
            ref={heading}
            tabIndex={-1}
            aria-describedby={descriptionId}
            className="font-bold font-jp text-lg outline-none"
          >
            ページを表示できませんでした
          </h1>
          {/* 何をすればよいかの説明 */}
          <p id={descriptionId} className="max-w-110 font-jp text-sm leading-[1.8] opacity-85">
            一時的な通信の失敗かもしれません。「もう一度試す」を押しても直らないときは、ページを再読み込みしてください。
          </p>
        </div>
        {/* ボタンの列（狭い画面では折り返す） */}
        <div className="flex flex-wrap justify-center gap-3">
          {/* もう一度試す: Next.js にページの中身を取り直して描き直してもらう（UI の部品の一時的なエラーならこれで戻る） */}
          <button
            // type="button": フォームの送信ボタンにならないよう明示する
            type="button"
            // 押したら描き直す
            onClick={() => unstable_retry()}
            // 白地の目立つボタン（シーンのタブの選択中と同じ見た目・同じ文字色）。キーボードで選んだときだけ白い枠を出す
            className="cursor-pointer rounded-full border-0 bg-paper px-5 py-2.25 font-bold font-jp text-[#0a0a12] text-sm focus-visible:outline-2 focus-visible:outline-paper focus-visible:outline-offset-2"
          >
            もう一度試す
          </button>
          {/* 再読み込み: 読み込みに失敗したプログラムは覚えられていて描き直しでは直らないことがあるので、ページごと読み直す */}
          <button
            // type="button": フォームの送信ボタンにならないよう明示する
            type="button"
            // 押したらページを読み直す
            onClick={() => window.location.reload()}
            // 枠だけの控えめなボタン。枠は背景との差を 3:1 以上にする（white/50 で約 5:1。枠がボタンだとわかる唯一の手がかりのため）。
            // キーボードで選んだときだけ白い枠を出す
            className="cursor-pointer rounded-full border border-white/50 bg-transparent px-5 py-2.25 font-jp text-paper text-sm transition-colors hover:border-white/80 focus-visible:outline-2 focus-visible:outline-paper focus-visible:outline-offset-2"
          >
            ページを再読み込み
          </button>
        </div>
      </div>
    </main>
  );
}
