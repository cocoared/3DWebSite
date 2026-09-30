# 警告と TODO の解説

このドキュメントは、以下の2つをまとめたものです。

1. `app/globals.css` と `app/layout.tsx` に出ている**警告の原因と対処**
2. コード中に書いた **TODO コメントの答え**（4か所）

---

## もくじ

- [第1部：警告の話](#第1部警告の話)
  - [1-1. globals.css の警告（`@theme` が Unknown at rule）](#1-1-globalscss-の警告theme-が-unknown-at-rule)
  - [1-2. layout.tsx の警告（`no-page-custom-font`）](#1-2-layouttsx-の警告no-page-custom-font)
  - [1-3. JewelsScene.tsx の警告（Biome の `noStaticElementInteractions`）](#1-3-jewelsscenetsx-の警告biome-の-nostaticelementinteractions)
- [第2部：TODO の答え](#第2部todo-の答え)
  - [2-1. layout.tsx「ここの link たちいる？」](#2-1-layouttsxここの-link-たちいる)
  - [2-2. page.tsx「なぜブラウザ API をサーバーで実行させないのか？」](#2-2-pagetsxなぜブラウザ-api-をサーバーで実行させないのか)
  - [2-3. scene.ts「slider とは？」](#2-3-scenetsslider-とは)
  - [2-4. SceneNav.tsx「この CSS の意味は？ `[]` の意味は？」](#2-4-scenenavtsxこの-css-の意味は-の意味は)
- [まとめ：対応の記録](#まとめ対応の記録)

---

# 第1部：警告の話

まず大事な前提として、**この2つの警告は種類がまったく違います**。

| ファイル      | 誰が出している？          | 実害       | 対処                           |
| ------------- | ------------------------- | ---------- | ------------------------------ |
| `globals.css` | **VSCode（エディタ）**    | なし       | エディタ設定で黙らせる         |
| `layout.tsx`  | **ESLint（`pnpm lint`）** | 実害はある | `next/font` に移行するのが本筋 |

`globals.css` のほうは「エディタが知らないだけ」の偽物の警告、
`layout.tsx` のほうは「ルール自体は的外れだが、指している問題は本物」という少しややこしい警告です。順に見ていきます。

---

## 1-1. globals.css の警告（`@theme` が Unknown at rule）

### 出ている警告

`app/globals.css` の 7 行目あたりにこんな波線が出ているはずです。

```
Unknown at rule @theme   css(unknownAtRules)
```

該当箇所はここです。

```css
@import "tailwindcss";

@theme {
  --color-ink: #04060b;
  --font-display: "Space Grotesk", sans-serif;
  /* ... */
}
```

### なぜ出るのか

**VSCode に内蔵されている CSS チェッカーが、Tailwind CSS v4 の構文を知らないからです。**

CSS には `@media`、`@keyframes`、`@import` のような「アットルール（at-rule）」という文法があります。VSCode はこの一覧を**W3C の標準仕様どおりに**持っていて、リストにない `@` から始まる単語を見つけると「知らないルールです」と警告します。

ところが `@theme` は W3C の標準 CSS ではありません。**Tailwind CSS v4 が独自に追加した構文**です。

```
書いた CSS
   │
   ├─→ VSCode の CSS チェッカーが読む
   │     「@theme...? 標準 CSS に無いぞ」→ ⚠️ 警告を出す
   │
   └─→ PostCSS + @tailwindcss/postcss が読む（postcss.config.mjs 経由）
         「@theme ね、はいはい」→ ✅ 正しく CSS 変数に変換してビルド成功
```

つまり**実際にビルドするツールは `@theme` を完璧に理解していて、警告を出しているのは横から覗いているエディタだけ**という状況です。

証拠として、`pnpm lint` を実行しても `globals.css` については何も出ません（このプロジェクトに stylelint は入っていないので、CSS を検査するツールは動いていません）。`pnpm build` も通ります。

> ちなみに Tailwind v3 までは `@tailwind base;` `@apply` などが同じ理由でずっと警告されていました。「Tailwind を使うと VSCode が CSS に文句を言う」のは昔からの風物詩みたいなものです。

### 対処法

実害はゼロなので放置してもいいのですが、波線が気になるなら消せます。おすすめは **A + B の併用**です。

#### A. Tailwind CSS IntelliSense 拡張を入れる（おすすめ）

VSCode の拡張機能で `Tailwind CSS IntelliSense`（発行元 Tailwind Labs）を入れます。これを入れると：

- `@theme` などの独自構文を理解してくれる
- おまけで `className` を書くときにクラス名の補完が効く
- クラスにマウスを乗せると実際の CSS が見える（`py-2.25` → `padding: 9px 0` など）

後半の TODO 2-4 で Tailwind のクラスをたくさん読むことになるので、**この拡張は入れておくと学習がかなり楽になります**。

#### B. VSCode の CSS チェックを黙らせる

プロジェクト直下に `.vscode/settings.json` を作って以下を書きます。

```json
{
  "css.lint.unknownAtRules": "ignore"
}
```

これで「知らないアットルール」の警告だけがオフになります。他の CSS チェック（タイポの検出など）は生きたままなので、安全な設定です。

> `"files.associations": { "*.css": "tailwindcss" }` という書き方もよく紹介されますが、これは CSS ファイルの言語モード自体を変えてしまい、拡張を入れていないと逆に補完が効かなくなることがあります。まずは A + B をおすすめします。

---

## 1-2. layout.tsx の警告（`no-page-custom-font`）

### 出ている警告

`pnpm lint` を実行すると、はっきりこう出ます。

```
/home/cocoared/Projects/3dwebsite/app/layout.tsx
  21:9  warning  Custom fonts not added in `pages/_document.js` will only load for
                 a single page. This is discouraged.
                 See: https://nextjs.org/docs/messages/no-page-custom-font
                 @next/next/no-page-custom-font

✖ 1 problem (0 errors, 1 warning)
```

指されている 21 行目は、Google Fonts の**スタイルシート読み込み**の行です。`preconnect` の2行ではありません。

```tsx
// app/layout.tsx:21
<link
  href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Manrope:..."
  rel="stylesheet"
/>
```

### なぜ出るのか（ルールの本来の意図）

このルールは **Next.js の古いルーティング方式（Pages Router）時代に作られたもの**です。

Pages Router では、ページごとに `pages/index.tsx`、`pages/about.tsx` …とファイルがあり、共通の `<head>` を作るには `pages/_document.js` という特別なファイルを使う必要がありました。

```
【Pages Router の場合】

pages/index.tsx で <link rel="stylesheet"> を書く
   → トップページでしかフォントが読まれない
   → /about に移動するとフォントが読み込み直し → 文字がガタッと入れ替わる ❌

pages/_document.js で書く
   → 全ページ共通で読まれる ✅
```

ESLint はファイル内に `fonts.googleapis.com` への `<link rel="stylesheet">` を見つけると、「これ `_document.js` じゃないよね？ 1ページ分しか効かないよ」と警告します。

### あなたのコードでは、この指摘は的外れ

このプロジェクトは **App Router**（`app/` ディレクトリ）を使っています。App Router の `app/layout.tsx` は**全ページ共通の外枠**であり、Pages Router の `_document.js` に相当する立場です。

```
【App Router = このプロジェクト】

app/layout.tsx で <link rel="stylesheet"> を書く
   → 全ページ共通で読まれる ✅  ← ルールが心配している問題は起きていない
```

つまり ESLint は「`_document.js` という名前のファイルじゃない」という理由だけで反応しており、**警告の文面が言っている問題（1ページでしか読まれない）は、あなたのコードでは発生していません**。これは Next.js の既知の誤検知です。

### ……でも、指している行には別の本物の問題がある

ここが少しややこしいところです。ルールの理由は的外れですが、**その `<link rel="stylesheet">` には、別の実在する性能問題があります**。

`<link rel="stylesheet">` は**レンダリングブロッキング**です。ブラウザはこの CSS を読み終わるまで、ページの描画を始められません。

```
【現状：外部 Google Fonts を <link> で読む】

  ブラウザ
    │
    ├─ 1. HTML を受け取る
    ├─ 2. fonts.googleapis.com に DNS 解決 + TCP + TLS 接続   ← 往復①
    ├─ 3. CSS をダウンロード（この間ずっと描画が止まる）
    ├─ 4. CSS の中に書いてある fonts.gstatic.com の URL を発見
    ├─ 5. fonts.gstatic.com に DNS 解決 + TCP + TLS 接続      ← 往復②
    ├─ 6. 実際のフォントファイル(woff2)を4書体ぶんダウンロード
    └─ 7. ようやく本来のフォントで表示

  ※ 6 が終わるまでは代替フォント（ゴシックなど）で表示される
    → フォントが差し替わる瞬間に文字幅が変わってガタッと動く（CLS）
```

問題は3つあります。

1. **外部ドメインへの往復が2回発生する**（`googleapis.com` → `gstatic.com`）
2. **CSS が描画をブロックする**
3. **フォント差し替え時にレイアウトがガタつく**（Cumulative Layout Shift）

さらに、Google Fonts に**ユーザーの IP アドレスが送られる**ため、GDPR の観点で問題視されることもあります（ドイツでは実際に判例が出ています）。

### 本当の解決策：`next/font/google` を使う

Next.js には**この問題を丸ごと解決する仕組み**が用意されています。`next/font` を使うと：

- ✅ ビルド時にフォントファイルを**ダウンロードして自分のサーバーに同梱**（外部通信ゼロ）
- ✅ 往復が2回 → **0回**
- ✅ CSS の `size-adjust` を自動計算して**レイアウトのガタつきをゼロにする**
- ✅ 使うフォントだけを自動で `preload`
- ✅ ESLint の警告も消える（`<link>` が無くなるので）

`app/layout.tsx` はこう書き換わります。

```tsx
import type { Metadata } from "next";
// Space Grotesk / Manrope / Zen Kaku Gothic New / Space Mono を Next.js 経由で読む
import { Space_Grotesk, Manrope, Zen_Kaku_Gothic_New, Space_Mono } from "next/font/google";
import "./globals.css";

// 各書体を読み込み、CSS 変数として公開する。
// variable: globals.css の @theme から参照するための変数名。
// subsets: 必要な文字セットだけに絞ってファイルサイズを減らす。
// display: "swap" → フォント到着前は代替フォントで表示（文字が消えない）。
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

// 日本語書体。subsets に "japanese" は指定できない（後述）。
const zenKaku = Zen_Kaku_Gothic_New({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-zen-kaku",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "3D Portfolio",
  description: "太陽・浜辺・宝石。3つのリアルタイム 3D シーンで綴るポートフォリオ。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // 4書体ぶんの CSS 変数クラスを <html> に付けて、配下すべてで使えるようにする。
    <html
      lang="ja"
      className={`${spaceGrotesk.variable} ${manrope.variable} ${zenKaku.variable} ${spaceMono.variable}`}
    >
      {/* <head> も <link> も不要。Next.js が必要な preload を自動生成する。 */}
      <body className="bg-ink font-body text-paper m-0 overflow-hidden antialiased">
        {children}
      </body>
    </html>
  );
}
```

そして `globals.css` の `@theme` を、**フォント名の直書きから CSS 変数の参照に**変えます。

```css
@theme {
  --color-ink: #04060b;
  --color-paper: #f6f5f1;
  --color-link: #66d9ff;

  /* next/font が生成した変数を参照する。フォールバックも書いておく。 */
  --font-display: var(--font-space-grotesk), sans-serif;
  --font-body: var(--font-manrope), system-ui, sans-serif;
  --font-jp: var(--font-zen-kaku), sans-serif;
  --font-mono: var(--font-space-mono), monospace;
}
```

**`font-display` / `font-body` / `font-jp` / `font-mono` というクラス名はそのまま使えます。** 中身の供給元が「Google の CDN」から「自分のサーバー」に変わるだけなので、`SceneNav.tsx` や `ControlPanel.tsx` の `font-mono` などは 1 文字も直す必要がありません。

#### ⚠️ ハマりどころ：日本語書体に `subsets: ["japanese"]` は指定できない

最初 `subsets: ["latin", "japanese"]` と書いたところ、型エラーでビルドが落ちました。

```
Type error: Type '"japanese"' is not assignable to type '"latin" | "latin-ext" | "cyrillic"'.
```

Zen Kaku Gothic New に対して `next/font` が受け付けるサブセットは `latin` / `latin-ext` / `cyrillic` の3つだけで、**`japanese` は選択肢に無い**のです。

「では日本語が表示できないのでは？」と不安になりますが、**問題ありません**。理由は `subsets` オプションの役割にあります。

- `subsets` が決めているのは「**どれを先読み（preload）するか**」
- 実際に配信される CSS には、**すべての文字範囲が `unicode-range` 付きで含まれる**

実際にビルド結果を確認したところ、こうなっていました。

```bash
# 生成された woff2 ファイル数
$ find .next -name "*.woff2" | wc -l
389

# Zen Kaku Gothic New の CSS に含まれるひらがな/カタカナの unicode-range 数
72
```

**72 個のひらがな・カタカナ範囲が CSS に含まれている**ので、`subsets: ["latin"]` のままで日本語はきちんと表示されます。

ブラウザは `unicode-range` を見て、**実際にページに出てくる文字に必要なファイルだけ**をダウンロードします。389 ファイルすべてが読まれるわけではないので、転送量の心配も不要です。

> このように「型が通らない ＝ 機能しない」とは限りません。今回は `subsets` が preload の制御であって配信内容の制御ではない、というのが答えでした。**推測で終わらせず、ビルド結果を実際に grep して確かめるのが確実です。**

### もし移行せずに警告だけ消したい場合

学習中で今は触りたくない、という場合は該当行だけ無効化できます。**ただし理由をコメントに残してください。**

```tsx
{
  /* App Router の layout.tsx は Pages Router の _document.js に相当するため、
     このルールの前提（1ページ分しか読まれない）は当てはまらない。
     ただし外部フォント CDN による描画ブロックは残るので、いずれ next/font へ移行する。 */
}
{
  /* eslint-disable-next-line @next/next/no-page-custom-font */
}
<link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet" />;
```

---

## 1-3. JewelsScene.tsx の警告（Biome の `noStaticElementInteractions`）

### 出ている警告

`pnpm lint` で、誕生石シーンの `<mesh>` にエラーが出ました（2026-09-27）。

```text
components/scenes/JewelsScene.tsx lint/a11y/noStaticElementInteractions
  × Unexpected event handler on static element.
```

### なぜ出るのか

Biome は、小文字で始まる JSX の要素（`<div>` や `<span>`）を **HTML の要素** とみなします。
「役割（role）を持たない静的な要素にクリックなどのイベントを付けると、キーボードやスクリーンリーダーで操作できない」というアクセシビリティのルールです。

ところが `<mesh>` は HTML ではなく、React Three Fiber が three.js の `THREE.Mesh` に変換する **3D のオブジェクト** です。
DOM の要素ではないので、`role` を付けても意味がなく、このルールは当てはまりません（Biome が R3F の要素を知らないための誤検知）。

### 対処

その要素の直前に、理由を書いた抑止のコメントを置きました。

```tsx
// biome-ignore lint/a11y/noStaticElementInteractions: <mesh> は DOM の要素ではなく three.js のオブジェクト（R3F の要素）なので当てはまらない。キーボードでは画面の月のボタンから同じ操作ができる
<mesh onClick={onClick} ...>
```

ルールの本来の目的（キーボードでも操作できること）は、**画面の月のボタン（`MonthPicker`）で同じ操作ができる** ことで満たしています。
3D の石をクリックするのはマウス・タッチ向けの近道で、キーボードの人は月のボタンを Tab で選んで Enter を押せば、同じ石へカメラが寄ります。

---

# 第2部：TODO の答え

コード中に置いた TODO は4か所です。

```
lib/scene.ts:86               // TODO:slider とは？
app/page.tsx:6                // TODO:なぜブラウザ API をサーバーで実行させないのか？
app/layout.tsx:17             {/* TODO:ここの link たちいる？ */}
components/ui/SceneNav.tsx:26 // TODO:CSS の意味は？[] の意味は？
```

---

## 2-1. layout.tsx「ここの link たちいる？」

### 質問の箇所

```tsx
{/* TODO:ここのlinkたちいる？ */}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
```

### 答え：**「今のコードのままなら必要。ただし `next/font` に移行するなら全部消える」**

順に説明します。

### `preconnect` とは何か

「このドメインには後で必ず繋ぐから、**今のうちに接続だけ済ませておいて**」というブラウザへの事前予告です。

ブラウザが外部ドメインからファイルを取るとき、実は**ダウンロードの前に3つの準備**が必要です。

| 手順               | やること                       | だいたいの時間    |
| ------------------ | ------------------------------ | ----------------- |
| DNS 解決           | ドメイン名 → IP アドレスを引く | 20〜120ms         |
| TCP ハンドシェイク | 通信路を開く                   | 30〜100ms         |
| TLS ハンドシェイク | HTTPS の暗号化を確立           | 50〜150ms         |
| **合計**           |                                | **約 100〜370ms** |

この準備は**ファイルの中身とは無関係**なので、URL さえ分かっていれば先にやっておけます。それが `preconnect` です。

```
【preconnect なし】

HTML 解析 ─→ <link> 発見 ─→ [DNS+TCP+TLS ≈200ms] ─→ CSS DL ─→ 描画
                            └─ ここで待たされる ─┘


【preconnect あり】

HTML 解析 ─┬→ preconnect 発見 ─→ [DNS+TCP+TLS] ← 裏で並行して進む
           └→ <link> 発見 ────────────→ CSS DL ─→ 描画
                                        接続済みなのですぐ始まる ⚡
```

このプロジェクトは実測環境にもよりますが、**おおむね 100〜300ms 程度の短縮**が期待できます。無料の 2 行としては十分に価値があります。

### なぜ2つあるのか

Google Fonts は**2つのドメインに分かれている**からです。

| ドメイン               | 何が置いてある                          | 使われ方                             |
| ---------------------- | --------------------------------------- | ------------------------------------ |
| `fonts.googleapis.com` | **CSS ファイル**（`@font-face` の定義） | `<link rel="stylesheet">` が直接読む |
| `fonts.gstatic.com`    | **実際のフォントファイル**（.woff2）    | 上の CSS の中から参照される          |

ここに `gstatic` の preconnect が効く理由があります。ブラウザは**CSS をダウンロードして中身を読み終わるまで、`gstatic.com` を使うことを知りません**。

```
preconnect が無いと：

1. googleapis.com に接続         [200ms]
2. CSS ダウンロード               [50ms]
3. 中身を読む → 「gstatic.com か！」と初めて気づく
4. gstatic.com に接続            [200ms]  ← ここが完全に直列で無駄
5. フォントファイルをダウンロード

preconnect があると：

1. googleapis.com に接続   ┐
   gstatic.com に接続      ┘ 並行して[200ms]  ← 4 の待ち時間が消える
2. CSS ダウンロード
3. すぐフォントファイルをダウンロード ⚡
```

**`gstatic.com` への preconnect のほうが効果が大きい**、というのがポイントです。

### `crossOrigin="anonymous"` はなぜ片方だけ？

これが Google Fonts のスニペットで一番よく「なんで？」と言われる部分です。

**ブラウザは、CORS モードで取るファイルと、そうでないファイルとで、接続を別々に管理するから**です。同じドメインでも「CORS 用の接続」と「通常の接続」は共有されません。

- **フォントファイル（.woff2）は、仕様上つねに CORS モード（匿名）で取得される** → だから `gstatic.com` の preconnect も `crossOrigin="anonymous"` を付けて、**CORS 用の接続**を用意しておく必要がある
- **CSS ファイルは通常モードで取得される** → `googleapis.com` は `crossOrigin` なしでよい

```tsx
{
  /* CSS を取る → 通常モードの接続を用意 */
}
<link rel="preconnect" href="https://fonts.googleapis.com" />;

{
  /* フォント本体を取る → CORS モードの接続を用意（crossOrigin 必須） */
}
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />;
```

もし `gstatic.com` の `crossOrigin` を付け忘れると、せっかく用意した接続が使われず、**preconnect が丸ごと無駄になります**（しかも無駄な接続を1本開いた分むしろ損）。付いていて正解です。

### 結論

| 状況                             | この2行は                                            |
| -------------------------------- | ---------------------------------------------------- |
| 今のまま Google Fonts CDN を使う | **必要。消さないこと**（消すと 100〜300ms 遅くなる） |
| `next/font/google` に移行する    | **不要。`<head>` ごと全部消える**                    |

`next/font` に移行するとフォントが**自分のサーバーから配信される**ので、そもそも外部ドメインに接続しません。preconnect する相手がいなくなります。

---

## 2-2. page.tsx「なぜブラウザ API をサーバーで実行させないのか？」

### 質問の箇所

```tsx
// TODO:なぜブラウザ API(document など)がサーバーで実行されるのを防ぐ必要があるのか？
const PortfolioExperience = dynamic(() => import("@/components/PortfolioExperience"), {
  ssr: false,
});
```

### 答え：**「防がないと、サーバー側でクラッシュしてページが真っ白になるから」**

### 前提：Next.js はコンポーネントを2回動かす

普通の React（Vite など）はブラウザでしか動きません。しかし Next.js は違います。

```
【Next.js の標準動作（SSR = Server Side Rendering）】

  ① サーバー（Node.js）で実行
       React コンポーネントを動かして HTML 文字列を作る
       → ユーザーは JS の到着を待たずに中身を見られる（表示が速い、SEO に強い）
              │
              ▼  HTML を送る
  ② ブラウザで実行
       同じコンポーネントをもう一度動かして、HTML にイベントを繋ぐ
       （この工程を「ハイドレーション」と呼ぶ）
```

つまり**同じコードが Node.js とブラウザの両方で走ります**。

### 問題：Node.js には `document` も `window` も存在しない

`document`、`window`、`navigator`、`WebGLRenderingContext`、`localStorage`——これらは**ブラウザが提供している機能**であって、JavaScript 言語の一部ではありません。

Node.js は「JavaScript を動かすためのランタイム」であって「ブラウザ」ではないので、これらの変数は**そもそも存在しません**。

```js
// ブラウザで実行
document.createElement("canvas"); // ✅ 動く

// Node.js で実行
document.createElement("canvas"); // ❌ ReferenceError: document is not defined
```

### このプロジェクトで具体的に何が壊れるか

`PortfolioExperience.tsx` は three.js（`@react-three/fiber`）を使っています。R3F の `<Canvas>` は、内部でだいたいこういうことをします。

```js
// @react-three/fiber の <Canvas> がやっていること（概念コード）
const canvas = document.createElement("canvas"); // ← ①
const gl = canvas.getContext("webgl2"); // ← ②
const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
window.addEventListener("resize", handleResize); // ← ③
```

`ssr: false` を外すと、サーバー側で **① の時点で即死**します。

```
Error: ReferenceError: document is not defined
    at Canvas (/node_modules/@react-three/fiber/dist/index.js:...)
    at renderToReadableStream (...)

  → Next.js のビルドが失敗する、または本番でページが 500 エラー / 真っ白
```

仮に `document` を無理やり用意（jsdom などで）できたとしても、**② の WebGL コンテキストは絶対に作れません**。WebGL は GPU を叩くための API であり、サーバーには描画対象の GPU もディスプレイもないからです。3D 描画は原理的にサーバーでは不可能です。

### `ssr: false` が何をしているか

```tsx
const PortfolioExperience = dynamic(() => import("@/components/PortfolioExperience"), {
  ssr: false,
});
```

これは Next.js に対してこう伝えています。

> このコンポーネントは**サーバーでは一切実行するな**。
> HTML を作るときは中身を空っぽにしておいて、
> **ブラウザに届いてから初めて JS を読み込んで描画しろ**。

```
【ssr: false あり】

  サーバー: PortfolioExperience を飛ばして HTML 生成 → 該当箇所は空 ✅
              │
              ▼
  ブラウザ: JS 到着 → three.js を読み込む → document も WebGL もある → 描画 ✅
```

### 「4つ目の効果」：バンドルサイズ

おまけの利点として、`dynamic()` は **three.js のコードを別ファイル（チャンク）に切り出します**。three.js は圧縮後でも 600KB 以上ある巨大なライブラリです。

`dynamic()` を使うことで、これが最初の JS バンドルに含まれず、**ページの骨格が表示されてから裏で読み込まれる**ようになります。

### 「`use client` を付ければいいのでは？」という疑問

これはとても良い疑問で、**混同しやすい重要ポイント**です。

`page.tsx` の1行目にはすでに `"use client"` があります。しかし**`"use client"` は「サーバーで実行しない」という意味ではありません**。

| ディレクティブ                 | サーバーで実行される？           | ブラウザで実行される？         |
| ------------------------------ | -------------------------------- | ------------------------------ |
| （なし）= Server Component     | ✅ される                        | ❌ されない（JS が送られない） |
| `"use client"`                 | ✅ **される**（HTML 生成のため） | ✅ される（ハイドレーション）  |
| `dynamic(..., { ssr: false })` | ❌ **されない**                  | ✅ される                      |

つまり `"use client"` は「**ブラウザでも**動く」という宣言であって、「**サーバーでは**動かない」ではありません。Client Component も初回は必ずサーバーで1回描画されます。

だから `"use client"` だけでは `document is not defined` は防げず、**`ssr: false` が必要**なのです。

### もう1つの理由：ハイドレーションのズレ

`ssr: false` にはもう1つ副次的な効果があります。

サーバーで作った HTML と、ブラウザで作り直した HTML が**食い違う**と、React は警告を出して DOM を作り直します（Hydration mismatch）。

`PortfolioExperience.tsx` は `localStorage` から最後に開いていたシーンを復元しています（`STORAGE_KEY = "scene-tab"`）。`localStorage` もブラウザ専用なので：

```
サーバー: localStorage が無い → 初期値 "sun" で HTML を作る
ブラウザ: localStorage に "gem" がある → "gem" で描画したい
          → 食い違い！ Hydration failed の警告
```

`ssr: false` ならサーバーが何も作らないので、この食い違いも原理的に起きません。

### まとめ

| 防いでいる問題             | 内容                                          |
| -------------------------- | --------------------------------------------- |
| **クラッシュ**（最重要）   | `document is not defined` でビルド/実行が失敗 |
| **原理的な不可能**         | サーバーに GPU が無く WebGL を作れない        |
| **ハイドレーション不整合** | `localStorage` の値でサーバーと食い違う       |
| **バンドルサイズ**         | 巨大な three.js を初期 JS から切り離せる      |

---

## 2-3. scene.ts「slider とは？」

### 質問の箇所

```ts
// SliderDef: 操作パネル1本ぶんのスライダー設定。
// TODO:slider とは？
export interface SliderDef {
  field: string;
  name: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}
```

### 答え：**「つまみを左右にドラッグして数値を決める、あの横棒の UI」**

HTML では `<input type="range">` という要素です。実物は `ControlPanel.tsx` の画面右下のパネルにあります。

```
       ラベル(name)      補足(unit)          現在の値
          │                 │                    │
          ▼                 ▼                    ▼
      ┌─────────────────────────────────────────────┐
      │  光量  brightness                     1.50  │
      │  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │ ← これがスライダー
      └─────────────────────────────────────────────┘
         ▲                                        ▲
       min=0                                    max=3
         └── つまみ(thumb) を左右にドラッグして値を変える
```

### 6つのプロパティが何に対応しているか

`SLIDERS.sun` の1本目を例に、定義と実際の画面を対応させます。

```ts
// lib/scene.ts
{ field: "amb", name: "光量", unit: "brightness", min: 0, max: 3, step: 0.05 }
```

これが `ControlPanel.tsx` で以下のように展開されます。

```tsx
<label>
  <span>
    {s.name}                          {/* → "光量" と表示 */}
    <em>{s.unit}</em>                 {/* → "brightness" と薄く表示 */}
    <span>{v.toFixed(2)}</span>       {/* → "1.50" とアクセント色で表示 */}
  </span>
  <input
    type="range"
    min={s.min}                       {/* → 0    左端の値 */}
    max={s.max}                       {/* → 3    右端の値 */}
    step={s.step}                     {/* → 0.05 動かす刻み幅 */}
    value={v}                         {/* → 現在値 = values["amb"] */}
    onChange={(e) => onChange(s.field, parseFloat(e.target.value))}
    //                       ↑ "amb" という文字列がキーになる
  />
</label>
```

各プロパティの役割を表にすると：

| プロパティ | 型     | 役割                                   | 例（太陽シーン）              |
| ---------- | ------ | -------------------------------------- | ----------------------------- |
| `field`    | string | どのパラメータを操作するかの**キー名** | `"amb"` → `SunParams.amb`     |
| `name`     | string | 画面に出す日本語ラベル                 | `"光量"`                      |
| `unit`     | string | 横に薄く出す英語の補足                 | `"brightness"`                |
| `min`      | number | 一番左まで動かしたときの値             | `0`（真っ暗）                 |
| `max`      | number | 一番右まで動かしたときの値             | `3`（まぶしい）               |
| `step`     | number | つまみが飛ぶ刻み幅                     | `0.05`（0.00, 0.05, 0.10...） |

### `field` が文字列なのはなぜか

ここがこの設計の肝です。`field: "amb"` という**文字列**を持たせることで、`ControlPanel` は「どのシーンの、どのパラメータか」を知らなくても動きます。

```
lib/scene.ts の SLIDERS 配列
        │
        │  ControlPanel が map で回す
        ▼
   スライダーが3本描画される（sun の場合）
        │
        │  ユーザーがドラッグ
        ▼
   onChange("amb", 2.1)      ← field 文字列がそのまま渡る
        │
        ▼
   PortfolioExperience の setParam が
   params.sun.amb を 2.1 に更新（イミュータブルに新オブジェクト作成）
        │
        ▼
   SunScene が新しい amb を受け取って明るさを変える
```

**`ControlPanel.tsx` は「太陽」も「宝石」も知りません。** `SLIDERS[tab]` を回して並べているだけです。

だから新しいスライダーを増やしたいときは、**`lib/scene.ts` にオブジェクトを1つ足すだけ**で済みます。

```ts
// 例：太陽シーンに「黒点の量」スライダーを追加したい場合

// 1. SunParams に型を追加
export interface SunParams {
  amb: number;
  rot: number;
  mera: number;
  spot: number; // ← 追加
}

// 2. 初期値を追加
export const DEFAULT_PARAMS: SceneParams = {
  sun: { amb: 1.5, rot: 0.5, mera: 0.55, spot: 0.2 }, // ← 追加
  // ...
};

// 3. スライダー定義を追加
export const SLIDERS: Record<SceneTab, SliderDef[]> = {
  sun: [
    { field: "amb", name: "光量", unit: "brightness", min: 0, max: 3, step: 0.05 },
    { field: "rot", name: "自動回転", unit: "orbit", min: 0, max: 2, step: 0.05 },
    { field: "mera", name: "炎のゆらめき", unit: "corona", min: 0, max: 1, step: 0.02 },
    { field: "spot", name: "黒点", unit: "sunspot", min: 0, max: 1, step: 0.02 }, // ← 追加
  ],
  // ...
};

// → ControlPanel.tsx は 1 文字も触らずに 4 本目が表示される ✅
// （あとは SunScene 側で spot を使って描画するだけ）
```

これが `lib/scene.ts` の冒頭コメントにある「**文言や範囲の変更をここだけで完結できる**」の意味です。

### 補足：スライダーの見た目は globals.css で作っている

`<input type="range">` はブラウザごとに標準の見た目がバラバラです（Chrome は灰色の細い棒、Firefox は別の形…）。そこで `globals.css` の `.rng` で標準の見た目を消して、独自デザインにしています。

```css
.rng {
  -webkit-appearance: none; /* ブラウザ標準の見た目を消す */
  appearance: none;
  height: 4px; /* 細いトラック（棒） */
  background: rgba(255, 255, 255, 0.16);
}

/* つまみは疑似要素なので、Tailwind のクラスでは書けない */
.rng::-webkit-slider-thumb {
  /* Chrome / Safari / Edge 用 */
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--accent, #fff); /* ← シーンごとの色 */
}
.rng::-moz-range-thumb {
  /* Firefox 用（同じことを別名で書く必要がある） */
  /* ... */
}
```

`::-webkit-slider-thumb` と `::-moz-range-thumb` は**ブラウザ独自の疑似要素**で、同じことを2回書かないといけません。Tailwind のユーティリティクラスでは表現できないため、ここだけ素の CSS が残っています。`globals.css` のコメントにある「Tailwind のユーティリティで表現しづらい部分だけを残す」がこれです。

そして `var(--accent, #fff)` の `--accent` は `ControlPanel.tsx` から流し込まれます。

```tsx
// ControlPanel.tsx:19
const accentStyle = { "--accent": PANEL_ACCENT[tab] } as CSSProperties;
//                                 ↑ sun なら "#ffc93c"（黄）
```

**シーンを切り替えるとつまみの色が変わる**のはこの仕組みです。CSS 変数は子孫要素に自動で継承されるので、パネルの `<div>` に1回セットするだけで、中のすべてのスライダーに届きます。

---

## 2-4. SceneNav.tsx「この CSS の意味は？ `[]` の意味は？」

### 質問の箇所

```tsx
// TODO:CSSの意味は？[]の意味は？
className={`cursor-pointer rounded-full border-0 px-5 py-2.25 font-mono text-xs tracking-[0.14em] uppercase transition-colors ${
  isActive
    ? "bg-paper font-bold text-[#0a0a12]"
    : "text-paper/60 bg-transparent hover:text-white"
}`}
```

3つに分けて説明します。**(A) `[]` の意味 → (B) 各クラスの意味 → (C) テンプレートリテラルの構造**。

---

### (A) `[]` は「Tailwind の任意値（arbitrary value）」

Tailwind は**あらかじめ決められた値のセット**を持っています。たとえば padding は：

| クラス | 実際の値         |
| ------ | ---------------- |
| `p-1`  | `0.25rem` (4px)  |
| `p-2`  | `0.5rem` (8px)   |
| `p-3`  | `0.75rem` (12px) |
| `p-4`  | `1rem` (16px)    |
| `p-5`  | `1.25rem` (20px) |

そこで `[]` を使うと、**その場で好きな値を直接指定**できます。

```
text-xs        → font-size: 0.75rem        ← 決められた値
text-[13px]    → font-size: 13px            ← 任意の値
        ↑↑↑↑↑↑
        この角括弧が「好きな値を入れる」の合図
```

Tailwind はビルド時に `text-[13px]` というクラス名を見つけると、その場で `.text-\[13px\] { font-size: 13px; }` という CSS を生成します。

#### ⚠️ 重要：余白は `[]` を使わなくていい（Tailwind v4）

ここが**この解説を書いたときに私が間違えていた**ところです。

Tailwind **v3** までの spacing は `p-1` `p-2` `p-3` …という**固定の階段**でした。だから 9px のような中間の値は `[]` に頼るしかありませんでした。

ところが **v4 の spacing スケールは「固定の階段」ではなく「掛け算」**です。`--spacing: 0.25rem`（4px）を基準に、**任意の倍率が使えます**。

```
p-1     = 1    × 4px =  4px
p-1.25  = 1.25 × 4px =  5px   ← 小数もOK
p-2.25  = 2.25 × 4px =  9px   ← 9px も普通に書ける
p-69    = 69   × 4px = 276px  ← 大きい値もOK
```

つまり **4 で割り切れる px 値なら `[]` は不要**です。実際、Tailwind CSS IntelliSense 拡張を入れたことで、この指摘が警告として出るようになりました。

```
The class `py-2.25` can be written as `py-2.25`   suggestCanonicalClasses
```

そこでコード側を**正規の書き方に修正済み**です。

| 修正前            | 修正後          | 計算              |
| ----------------- | --------------- | ----------------- |
| `py-2.25`         | `py-2.25`       | 2.25 × 4px = 9px  |
| `gap-[5px]`       | `gap-1.25`      | 1.25 × 4px = 5px  |
| `p-[5px]`         | `p-1.25`        | 1.25 × 4px = 5px  |
| `pt-[18px]`       | `pt-4.5`        | 4.5 × 4px = 18px  |
| `pb-[22px]`       | `pb-5.5`        | 5.5 × 4px = 22px  |
| `py-[11px]`       | `py-2.75`       | 2.75 × 4px = 11px |
| `w-[276px]`       | `w-69`          | 69 × 4px = 276px  |
| `h-[7px] w-[7px]` | `h-1.75 w-1.75` | 1.75 × 4px = 7px  |
| `max-w-[440px]`   | `max-w-110`     | 110 × 4px = 440px |
| `px-[44px]`       | `px-11`         | 11 × 4px = 44px   |

正規の書き方にする利点は、**後から `--spacing` を変えるだけで余白全体を一括調整できる**ことです。`[]` で px を直書きしていると、そこだけスケールから外れて取り残されます。

#### では `[]` はいつ使うのか

**spacing スケールで表現できないもの**に使います。今のコードに残っている `[]` がまさにそれです。

| 書き方                     | 生成される CSS                    | なぜ `[]` が必要か                    |
| -------------------------- | --------------------------------- | ------------------------------------- |
| `tracking-[0.14em]`        | `letter-spacing: 0.14em`          | 字間は spacing スケールとは別軸       |
| `bg-[rgba(10,12,20,0.55)]` | `background: rgba(10,12,20,0.55)` | この色はテーマに無い                  |
| `backdrop-blur-[14px]`     | `backdrop-filter: blur(14px)`     | ぼかし量は spacing スケールとは別軸   |
| `text-[#0a0a12]`           | `color: #0a0a12`                  | この色はテーマに無い                  |
| `text-[13px]`              | `font-size: 13px`                 | 文字サイズは spacing スケールとは別軸 |
| `leading-[1.7]`            | `line-height: 1.7`                | 行間の倍率指定                        |

**まとめると `[]` は「Tailwind のスケールで表現できない値のための逃げ道」です。** 余白（padding / margin / gap / width）は v4 なら基本 `[]` 不要、と覚えておけば十分です。

> ⚠️ 使いすぎ注意：`[]` だらけになったら「そもそもテーマに登録すべきでは？」のサインです。たとえば `bg-[rgba(10,12,20,0.55)]` は `SceneNav.tsx` と `ControlPanel.tsx`（`bg-[rgba(9,10,16,0.6)]`）で似た値が2回出てきています。こういうものは `globals.css` の `@theme` に `--color-glass: rgba(10,12,20,0.55);` と登録して `bg-glass` と書くほうが、後から一括で調整できて楽です。

#### 応用：`[]` はプロパティ名ごと指定することもできる

`[プロパティ名:値]` と書くと、**ユーティリティが用意されていない CSS プロパティ**を直接指定できます。これを「任意プロパティ（arbitrary property）」と呼びます。`SceneHero.tsx` の影がその例です。

```tsx
className = "... [text-shadow:0_4px_40px_rgba(0,0,0,0.45)] ...";
```

`text-shadow` には対応するユーティリティが無いため、この書き方が必要になります。

ポイントは**アンダースコア `_` がスペースの代わり**になることです。クラス名にスペースは使えない（別のクラスとして分割されてしまう）ので、Tailwind は `_` をスペースに変換します。

#### ⚠️ ただしユーティリティがあるなら、そちらを使う

`ControlPanel.tsx` の脈動アニメーションは、当初こう書いていました。

```text
className = "... [animation:pdot_1.9s_ease-in-out_infinite] ...";
```

これも動きますが、拡張から警告が出ます。

```
The class `[animation:pdot_1.9s_ease-in-out_infinite]` can be written as
`animate-[pdot_1.9s_ease-in-out_infinite]`   tailwindcss(suggestCanonicalClasses)
```

`animation` には **`animate-*` というユーティリティが存在する**からです。任意プロパティ `[animation:...]` は「ユーティリティが無いとき用」の最終手段なので、あるならそちらを使うのが正しい書き方です。

```text
// 修正前：任意プロパティ（プロパティ名から指定）
[animation:pdot_1.9s_ease-in-out_infinite]

// 修正後：animate ユーティリティ + 任意値
animate-[pdot_1.9s_ease-in-out_infinite]
```

どちらも生成される CSS は `animation: pdot 1.9s ease-in-out infinite;` で同じです。`globals.css` で定義した `@keyframes pdot`（見出し横の点が脈打つアニメーション）を呼び出しています。

**使い分けの整理：**

| 書き方              | 意味                      | 使うとき                           |
| ------------------- | ------------------------- | ---------------------------------- |
| `animate-[...]`     | ユーティリティ + 任意の値 | ユーティリティがある（ほぼこちら） |
| `[text-shadow:...]` | プロパティ名から直接指定  | ユーティリティが無い（最終手段）   |

> 💡 この警告は `.tsx` だけでなく**このドキュメントの ```tsx コードブロック内でも**出ました。Tailwind CSS IntelliSense は Markdown 内のコード例まで検査してくれます。

#### CSS 変数を読むときは `()` の短縮形を使う

v4 では CSS 変数を参照するとき、`[var(--x)]` ではなく **`(--x)` と書けます**。拡張もこちらを推奨してきます。

```text
// 修正前（v3 までの書き方）
bg-[var(--accent)]   text-[var(--accent)]

// 修正後（v4 の短縮形）— 生成される CSS は同じ
bg-(--accent)        text-(--accent)
```

ビルド結果を確認すると、どちらも `background-color:var(--accent)` / `color:var(--accent)` になり**完全に同じ**でした。

#### `!important` は「後ろ」に付ける

v3 では `!h-full` と**先頭**に `!` を付けていましたが、**v4 では末尾に移動**しました。

```text
// 修正前（v3）      // 修正後（v4）
[&_canvas]:!h-full → [&_canvas]:h-full!
```

こちらもビルド結果で `height:100%!important` が正しく出ていることを確認済みです。

---

### (B) 各クラスの意味

#### 常に適用される部分

```
cursor-pointer  rounded-full  border-0  px-5  py-2.25
font-mono  text-xs  tracking-[0.14em]  uppercase  transition-colors
```

| クラス              | CSS                                                               | 見た目への効果                             |
| ------------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| `cursor-pointer`    | `cursor: pointer`                                                 | マウスカーソルが指の形に（押せる感を出す） |
| `rounded-full`      | `border-radius: 9999px`                                           | 角を最大まで丸める → 錠剤型（ピル型）      |
| `border-0`          | `border-width: 0`                                                 | `<button>` の**ブラウザ標準の枠線を消す**  |
| `px-5`              | `padding-left/right: 1.25rem` (20px)                              | 左右の余白                                 |
| `py-2.25`           | `padding-top/bottom: 9px`                                         | 上下の余白（任意値）                       |
| `font-mono`         | `font-family: var(--font-mono)`                                   | 等幅フォント → `@theme` の Space Mono      |
| `text-xs`           | `font-size: 0.75rem` (12px)                                       | 小さめの文字                               |
| `tracking-[0.14em]` | `letter-spacing: 0.14em`                                          | 字間を広げる → ラベルらしい印象に          |
| `uppercase`         | `text-transform: uppercase`                                       | `Sun` → `SUN` と大文字表示                 |
| `transition-colors` | `transition-property: color, background-color, border-color, ...` | **色の変化だけ**をなめらかに（0.15s）      |

**`font-mono` + `text-xs` + `tracking-[0.14em]` + `uppercase` の4点セット**は、「小さい等幅・大文字・字間広め」という**ラベル／キャプションの定番の組み合わせ**です。同じ組み合わせが `ControlPanel.tsx` の見出しにも出てきます。

```tsx
// ControlPanel.tsx:28
className = "... font-mono text-[11px] tracking-[0.2em] uppercase opacity-85";
//             ^^^^^^^^^ ^^^^^^^^^^^ ^^^^^^^^^^^^^^^^ ^^^^^^^^^ 同じ発想
```

`transition-colors` について補足すると、Tailwind には `transition-all` もありますが、**`all` は全プロパティを監視するので性能が落ちます**。ここは色しか変わらないので `transition-colors` が正解です。

#### 選択中（`isActive === true`）のとき

```
bg-paper  font-bold  text-[#0a0a12]
```

| クラス           | CSS                              | 説明                                               |
| ---------------- | -------------------------------- | -------------------------------------------------- |
| `bg-paper`       | `background: var(--color-paper)` | `@theme` の `--color-paper: #f6f5f1`（near-white） |
| `font-bold`      | `font-weight: 700`               | 太字                                               |
| `text-[#0a0a12]` | `color: #0a0a12`                 | ほぼ黒。白背景の上なので文字を暗くする（反転）     |

**`bg-paper` が動く理由**が重要です。`globals.css` にこう書いたからです。

```css
@theme {
  --color-paper: #f6f5f1;
}
```

Tailwind v4 は `@theme` の中の **`--color-*` という名前の変数を自動的に色のスケールとして登録**します。その結果：

```
--color-paper を定義する
   ↓ Tailwind が自動生成
bg-paper      → background-color: var(--color-paper)
text-paper    → color: var(--color-paper)
border-paper  → border-color: var(--color-paper)
```

同様に `--font-mono` を定義したから `font-mono` が使え、`--color-ink` を定義したから `layout.tsx` の `bg-ink` が使えています。**接頭辞（`--color-` / `--font-`）が何のユーティリティを生むかを決めている**わけです。

#### 非選択（`isActive === false`）のとき

```
text-paper/60  bg-transparent  hover:text-white
```

| クラス             | CSS                                                               | 説明                           |
| ------------------ | ----------------------------------------------------------------- | ------------------------------ |
| `text-paper/60`    | `color: color-mix(in oklab, var(--color-paper) 60%, transparent)` | paper 色を**不透明度60%**で    |
| `bg-transparent`   | `background: transparent`                                         | 背景なし（透明）               |
| `hover:text-white` | `&:hover { color: #fff }`                                         | マウスを乗せたときだけ白くする |

##### `/60` スラッシュ記法

`text-paper/60` の `/60` は**不透明度（opacity）**の指定です。

```
text-paper      → 不透明度 100%（くっきり）
text-paper/60   → 不透明度 60%（少し薄い）
text-paper/30   → 不透明度 30%（かなり薄い）
```

同じパターンが `SceneNav.tsx` の `<nav>` にも出てきます。

```tsx
border border-white/15
//            ^^^^^^^^ 白を 15% の不透明度で = ごく薄い枠線
```

**なぜ `opacity-60` を使わないのか**が大事なポイントです。

| 書き方          | 影響範囲                                 |
| --------------- | ---------------------------------------- |
| `opacity-60`    | **その要素と子要素すべて**が半透明になる |
| `text-paper/60` | **文字色だけ**が半透明になる             |

ボタンの背景は透明のままで文字だけ薄くしたいので、`/60` が正解です。

##### `hover:` プレフィックス

`hover:text-white` の `hover:` は**バリアント（variant）**と呼ばれる修飾子で、「〜のときだけ適用」を意味します。

```css
/* hover:text-white が生成する CSS */
.hover\:text-white:hover {
  color: #fff;
}
```

同じ仕組みで `focus:`、`active:`、`disabled:`、`md:`（画面幅768px以上）、`dark:`（ダークモード）などがあり、**組み合わせも可能**です（`md:hover:text-white` など）。

##### 設計意図：選択中と非選択の対比

この2つのスタイルは**意図的に真逆**になっています。

```
【選択中】                       【非選択】
┌──────────┐                  ┌──────────┐
│   SUN    │  白背景・黒文字   │  BEACH   │  透明背景・薄い白文字
└──────────┘  font-bold        └──────────┘  hover で白く
   目立つ                          控えめ
```

| 項目   | 選択中             | 非選択                 |
| ------ | ------------------ | ---------------------- |
| 背景   | 明るい（paper）    | 透明                   |
| 文字色 | 暗い（#0a0a12）    | 薄い白（paper/60）     |
| 太さ   | 太字               | 標準                   |
| hover  | なし（既に選択中） | あり（押せると伝える） |

**選択中のボタンに `hover:` が無い**のは細かいですが良い判断です。すでに選択されているものにホバー効果を付けると「押せばまだ何か起きる」と誤解させるからです。

---

### (C) テンプレートリテラルで条件分岐する構造

```tsx
className={`共通クラス ${条件 ? "Aのクラス" : "Bのクラス"}`}
```

これは Tailwind に特別な機能があるわけではなく、**素の JavaScript のテンプレートリテラル**です。バッククォート `` ` `` で囲んだ文字列の中で `${...}` を使うと、JavaScript の式を埋め込めます。

実際に生成される文字列を見てみましょう。

```tsx
// isActive === true のとき
"cursor-pointer rounded-full border-0 px-5 py-2.25 font-mono text-xs tracking-[0.14em] uppercase transition-colors bg-paper font-bold text-[#0a0a12]";

// isActive === false のとき
"cursor-pointer rounded-full border-0 px-5 py-2.25 font-mono text-xs tracking-[0.14em] uppercase transition-colors text-paper/60 bg-transparent hover:text-white";
```

つまり**共通部分は毎回同じで、末尾だけが差し替わっている**だけです。

`ControlPanel.tsx` にも同じパターンがあります。

```tsx
// ControlPanel.tsx:40
className={`flex flex-col gap-2.25 py-2.75 ${i > 0 ? "border-t border-white/10" : ""}`}
//                                              ↑ 2本目以降だけ上に区切り線
```

`i > 0`（＝1本目でない）のときだけ `border-t` を足すことで、**スライダーの間にだけ線が入り、一番上には入らない**ようになります。`: ""` で「該当しないときは何も足さない」を表現しているのがポイントです。

#### ⚠️ 注意：クラス名を分割して組み立ててはいけない

Tailwind はビルド時に**ソースコードを文字列として走査して**、見つかったクラス名の CSS だけを生成します。だから**完全なクラス名がコード中にそのまま書かれていないと動きません**。

```tsx
// ❌ 動かない：Tailwind は "text-red-500" という文字列を見つけられない
const color = "red";
className={`text-${color}-500`}

// ✅ 動く：完全なクラス名が書かれている
className={isError ? "text-red-500" : "text-green-500"}
```

今のコードは全部 ✅ の書き方になっているので問題ありません。

#### 補足：`clsx` / `tailwind-merge` について

条件分岐が3つ以上に増えてきたら、`clsx` や `tailwind-merge` というライブラリを使うと読みやすくなります。

```tsx
import clsx from "clsx";

className={clsx(
  "cursor-pointer rounded-full border-0 px-5 py-2.25",
  "font-mono text-xs tracking-[0.14em] uppercase transition-colors",
  isActive && "bg-paper font-bold text-[#0a0a12]",
  !isActive && "text-paper/60 bg-transparent hover:text-white",
)}
```

ただし**今の2分岐なら三項演算子で十分読めます**。依存を増やす価値が出るのは、条件が増えて可読性が落ちてからです（YAGNI）。

---

### おまけ：`prettier-plugin-tailwindcss` がクラス順を並べ替えている

`package.json` に `prettier-plugin-tailwindcss` が入っています。これは `pnpm format` を実行すると**Tailwind のクラス名を公式推奨の順序に自動で並べ替える**プラグインです。

```
レイアウト → ボックスモデル → タイポグラフィ → 視覚効果 → 状態バリアント
```

だから `SceneNav.tsx` のクラス順（`cursor-pointer rounded-full border-0 px-5 py-2.25 font-mono ...`）は、**あなたが書いた順ではなく Prettier が整えた順**です。手で並べ替える必要はありません。

これのおかげで「同じスタイルなのに人によってクラスの順番が違う」という差分ノイズが起きなくなります。

---

# まとめ：対応の記録

以下はすべて**対応済み**です。

| #   | やったこと                                            | 効果                                            |
| --- | ----------------------------------------------------- | ----------------------------------------------- |
| 1   | Tailwind CSS IntelliSense 拡張を導入                  | 補完が効く・クラスの実体が見える                |
| 2   | `.vscode/settings.json` に `unknownAtRules: "ignore"` | `globals.css` の波線が消えた                    |
| 3   | `next/font/google` に移行                             | ESLint 警告ゼロ・外部通信ゼロ・CLS 対策が自動化 |
| 4   | 3 に伴い `<head>` の `<link>` 3行を削除               | preconnect ごと不要になった                     |
| 5   | 余白の `[]` を正規のスケール表記へ（16か所）          | 拡張の `suggestCanonicalClasses` 警告が消えた   |
| 6   | TODO コメント4件を1行の要点に書き換え                 | 疑問形のコメントが残らない                      |

検証結果：

```bash
$ pnpm lint     # → 出力なし（警告ゼロ）
$ pnpm build    # → ✓ Compiled successfully / TypeScript も通過
```

3 が本命でした。`no-page-custom-font` の根本解決であると同時に、フォント取得の外部往復2回がゼロになります。3D 描画で JS が重いサイトなので、ここで稼げる 100〜300ms は効いてきます。

なお 5 は、**1 の拡張を入れたことで初めて見えるようになった警告**です。Tailwind v4 の spacing は掛け算スケールなので、`py-[9px]` のような余白の任意値はほぼ不要でした（詳細は [2-4](#2-4-scenenavtsxこの-css-の意味は-の意味は) の表）。

### 書き換えた TODO コメント

| ファイル                     | 書き換え後                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `app/page.tsx`               | `ssr:false`: Node.js には document も GPU も無く、実行すると即クラッシュするため |
| `lib/scene.ts`               | slider = つまみをドラッグして数値を決める `<input type="range">`                 |
| `components/ui/SceneNav.tsx` | `[]` は任意値、`/60` は不透明度。三項演算子で選択中/非選択を差し替え             |
| `app/layout.tsx`             | （`<link>` ごと削除されたため TODO 自体が消滅）                                  |

---

## 関連ドキュメント

- [用語集](./用語集.md) — このプロジェクトの専門用語辞典
- [Next.js: no-page-custom-font](https://nextjs.org/docs/messages/no-page-custom-font)
- [Next.js: Font Optimization](https://nextjs.org/docs/app/getting-started/fonts)
- [Tailwind CSS v4: Theme variables](https://tailwindcss.com/docs/theme)
- [Tailwind CSS: Arbitrary values](https://tailwindcss.com/docs/adding-custom-styles#using-arbitrary-values)
