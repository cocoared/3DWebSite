# 3D ポートフォリオサイト

ブラウザだけで動く 3D のポートフォリオサイトです。
画面上部のタブで、3 つのシーンを切り替えて眺められます。

| シーン        | 見どころ                                                                      | 操作                                           |
| ------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| **THE SUN**   | 燃えさかる太陽の表面と、そこから噴き上がるプロミネンス（炎の柱）              | ドラッグで回転 / クリックでフレア               |
| **THE SHORE** | 白い砂浜に寄せては返す波。環境光を落とすと夜になり、星空が浮かびあがる        | ドラッグで見回す / スライダーで昼夜を切り替え   |
| **THE JEWELS** | 1 月〜12 月の誕生石を、真っ白な空間に時計の文字盤のように並べる。月を選ぶとその石へカメラが寄り、真上から淡いスポットライトが当たって、ほかの石は白に溶けるように薄くなり、左下に解説のカードが出る | ドラッグで回転 / 石のそばの月のラベルか石のタップで選ぶ / Esc で全体に戻る |

どのシーンも右下のパネルのスライダーで、明るさや波の高さなどをその場で変えられます。
映像は画像や動画ではなく、**GPU でリアルタイムに描いています**（シェーダーという小さなプログラムで、ピクセルの色を毎フレーム計算しています）。
THE JEWELS の石の形と、石に映り込むスタジオの環境マップは、**Blender（JewelCraft と Cycles）で事前に作ったもの**を読み込んでいます。

> このリポジトリは **Next.js・React Three Fiber・シェーダーの学習** を目的にしています。
> そのため、コードのほぼすべての行に日本語のコメントを付けています。

---

## 使っている技術

| 技術                                                                | 役割                                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [Next.js](https://nextjs.org) 16（App Router）                      | Web サイトの土台。ページの配信とビルド                                  |
| [React](https://react.dev) 19                                       | 画面を部品（コンポーネント）に分けて組み立てる                          |
| [three.js](https://threejs.org)                                     | ブラウザで 3D を描くためのライブラリ（WebGL を扱いやすくする）          |
| [React Three Fiber](https://r3f.docs.pmnd.rs) / drei                | three.js を React の書き方で使えるようにする                            |
| GLSL（シェーダー）                                                  | 太陽の炎・波・宝石の輝きなど、見た目の計算                              |
| [Tailwind CSS](https://tailwindcss.com) v4                          | 3D の上に重ねるボタンやパネルの見た目                                   |
| [Biome](https://biomejs.dev)                                        | コードの整形とチェック（書き方の統一、よくある間違いの検出）            |
| [Vitest](https://vitest.dev)                                        | 自動テスト                                                              |
| [lefthook](https://lefthook.dev)                                    | コミットの直前に、チェックとテストを自動で実行する                      |
| [Blender](https://www.blender.org) 5.2 + [JewelCraft](https://github.com/mrachinskiy/jewelcraft) | 誕生石の形のモデリング（JewelCraft）と、環境マップの描画（Cycles） |
| [glTF](https://www.khronos.org/gltf/)（.glb）                       | Blender で作った 3D の形を Web で読み込むためのファイル形式             |

---

## はじめかた

### 1. 必要なもの

- **Node.js 24 以上**（`node -v` で確認）
- **pnpm**（`npm install -g pnpm` で入ります。このプロジェクトでは `npm` / `yarn` は使いません）

### 2. インストールと起動

```bash
# 依存パッケージをインストールする（コミット時の自動チェックもここで登録される）
pnpm install

# 開発サーバーを起動する
pnpm dev
```

ブラウザで <http://localhost:3000> を開くと、サイトが表示されます。
ファイルを保存すると、画面が自動で更新されます。

### 3. VSCode を使う場合

プロジェクトを開くと、おすすめの拡張機能として **Biome** と **Vitest** が案内されるので、入れてください。

- ファイルを保存すると、Biome が自動で整形します（設定は [.vscode/settings.json](.vscode/settings.json)）。
- Prettier や ESLint の拡張機能は、このプロジェクトの中では自動で無効になります。

---

## よく使うコマンド

| コマンド             | すること                                                                |
| -------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`           | 開発サーバーを起動する                                                  |
| `pnpm build`         | 公開用にビルドする                                                      |
| `pnpm start`         | ビルドしたものを起動する（`pnpm build` のあとに使う）                   |
| `pnpm lint`          | 整形の崩れやコードの問題をチェックする（ファイルは書き換えない）        |
| `pnpm lint:fix`      | 上のチェックで、自動で直せるものを直す                                  |
| `pnpm typecheck`     | TypeScript の型の間違いをチェックする                                   |
| `pnpm test`          | テストを 1 回実行する                                                   |
| `pnpm test:watch`    | ファイルを保存するたびに、テストを自動で実行し直す                      |
| `pnpm test:coverage` | テストがコードのどれだけを通ったか（カバレッジ）を表示する              |
| `pnpm check`         | `lint` → `typecheck` → `test` → `build` をまとめて実行する              |

迷ったら、作業の区切りで `pnpm check` を実行してください。これが通れば一通り問題ありません。

---

## コミットするときの自動チェック

`git commit` を実行すると、コミットの直前に次のチェックが自動で走ります（設定は [lefthook.yml](lefthook.yml)）。

1. **Biome**：コミットするファイルの整形とコードの問題
2. **型チェック**：プロジェクト全体の型の間違い
3. **テスト**：すべてのテスト

どれかが失敗すると、コミットは中止されます。表示されたエラーを直してから、もう一度コミットしてください。
整形の崩れなら `pnpm lint:fix` で直り、そのあと `git add` し直せば大丈夫です。

---

## 誕生石の 3D データと環境マップを作り直す（Blender）

THE JEWELS の資産（`public/jewels/` の形・環境マップ）は、[blender/](blender/) の Python スクリプトで作っています。
石の色や大きさなどのデータは [lib/birthstones.json](lib/birthstones.json) にまとまっていて、Web と Blender の両方がこのファイルを読みます。データを変えたら、次の順に作り直してください（詳しくは [blender/README.md](blender/README.md)）。

```bash
# Windows の Blender を WSL から動かす例（パスは環境に合わせる）
BLENDER="/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"

# 1. JewelCraft で 12 石を組み立て、blender/jewels.blend と public/jewels/jewels.glb を作る
"$BLENDER" --background --factory-startup --python "$(wslpath -w blender/build_jewels.py)"

# 2. スタジオの照明を環境マップ（public/jewels/studio.hdr）に焼く
"$BLENDER" --background "$(wslpath -w blender/jewels.blend)" --python "$(wslpath -w blender/render_env.py)"
```

作り直したら `pnpm test` を実行してください。`.glb` のノード名や環境マップの形式が、コードの期待と合っているかを確かめるテストがあります。

---

## フォルダの構成

```plain text
3dwebsite/
├── app/                          # ページの入口（Next.js の App Router）
│   ├── layout.tsx                #   全ページ共通の枠（フォント・<html> など）
│   ├── page.tsx                  #   トップページ
│   ├── error.tsx                 #   ページで起きたエラーの受け皿（真っ白にせず、再試行と再読み込みのボタンを出す）
│   └── globals.css               #   全体の CSS と色・フォントの定義
├── components/                   # 画面の部品（React コンポーネント）
│   ├── PortfolioExperience.tsx   #   サイト全体のまとめ役。3D キャンバスと UI を並べる
│   ├── SceneErrorBoundary.tsx    #   3D の表示に失敗したとき、画面が真っ白にならないよう知らせる
│   ├── scenes/                   #   各シーンの React 側（Sun / Ocean / Jewels）
│   └── ui/                       #   3D の上に重ねるタブ・見出し・操作パネル・月のラベル・解説カード
├── lib/                          # 画面を持たないロジック
│   ├── scene.ts                  #   シーンの種類・初期値・文言・スライダーの定義
│   ├── birthstones.json / .ts    #   12 か月の誕生石のデータ（Web と Blender で共有）と、その型・検証
│   ├── monthLabels.ts            #   月のラベルの位置の書き込みと、閉じたあとにフォーカスを返す約束
│   ├── scenes/                   #   各シーンの 3D の組み立てと毎フレームの更新
│   ├── shaders.ts                #   シーン共通のシェーダー部品（ノイズ関数）
│   ├── textures.ts               #   光のにじみなどのテクスチャを作る
│   ├── useDragInteraction.ts     #   マウス・タッチのドラッグ操作
│   └── *.test.ts                 #   テスト（テスト対象と同じ場所に置く）
├── blender/                      # 誕生石の形・環境マップを作る Blender の Python スクリプト
├── public/jewels/                # Blender で作った資産（.glb・studio.hdr）。/jewels/... の URL で配信される
├── docs/                         # 学習用の解説
├── .claude/                      # デザインの参照資料（元になったプロトタイプと参照画像）
├── AGENTS.md                     # AI エージェント（Claude Code など）向けの作業ルール
├── biome.jsonc                   # Biome（整形・チェック）の設定
├── lefthook.yml                  # コミット時の自動チェックの設定
└── vitest.config.mts             # テストの設定
```

シーン 1 つは、**`lib/scenes/` のロジック**と **`components/scenes/` の React 部分**の 2 つのファイルでできています。
たとえば太陽なら、3D の組み立てや炎の計算は [lib/scenes/sun.ts](lib/scenes/sun.ts)、React とのつなぎこみは [components/scenes/SunScene.tsx](components/scenes/SunScene.tsx) です。

---

## もっと知りたいとき

| ドキュメント                                             | 内容                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| [docs/用語集.md](docs/用語集.md)                         | コメントに出てくる専門用語の辞書（ref、シェーダー、uniform など）  |
| [docs/警告とTODOの解説.md](docs/警告とTODOの解説.md)     | これまでに出た警告の原因と対処、コードの疑問への回答               |
| [.claude/README.md](.claude/README.md)                   | 各シーンのデザイン仕様（色・スライダーの範囲・見た目の作り方）     |
| [AGENTS.md](AGENTS.md)                                   | 開発のルール（コメントの書き方、テスト、レビューの流れ）           |
