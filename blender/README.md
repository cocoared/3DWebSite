# blender/ — THE JEWELS の資産を作るスクリプト

誕生石シーン（THE JEWELS）で使う 3D の形・環境マップ・写真のような連番画像を、Blender 5.2 と JewelCraft で作ります。
石のデータ（色・屈折率・分散・大きさ・カット）は [lib/birthstones.json](../lib/birthstones.json) にあり、Web のコードと同じファイルを読みます。

| スクリプト                                         | すること                                                                                      | 書き出すもの                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [build_jewels.py](build_jewels.py)                 | JewelCraft で 12 石を作り、Cycles 用のマテリアル・スタジオの照明・カメラを組み立てる            | `blender/jewels.blend`（Git には入れない）、`public/jewels/jewels.glb` |
| [render_env.py](render_env.py)                     | スタジオの照明を、石の位置から全方向に見た 1 枚の HDR（正距円筒図法の環境マップ）に焼く        | `public/jewels/studio.hdr`                                    |
| [render_turntables.py](render_turntables.py)       | 石ごとにカメラを 1 周させ、Cycles で 48 枚の回転の連番を描く（`--preview` で一覧だけ描く）      | `public/jewels/turntable/<id>/00.webp` 〜 `47.webp`           |

`render_env.py` と `render_turntables.py` は `jewels.blend` を開いて動くので、先に `build_jewels.py` を実行してください。

## BlenderMCP から GUI の Blender で実行する

Blender の画面で組み立ての様子を見ながら進めたいときは、BlenderMCP の `execute_blender_code` に次のコードを渡します。
`__file__` を渡しているのは、スクリプトがリポジトリの場所（`lib/birthstones.json` など）を自分のパスから求めるためです。

```python
path = r"\\wsl.localhost\Ubuntu\home\cocoared\Projects\3dwebsite\blender\build_jewels.py"
g = {"__file__": path, "__name__": "jewels_build"}
exec(compile(open(path, encoding="utf-8").read(), path, "exec"), g)
result = g["main"]()
```

- 実行すると、開いているシーンの中身を消して作り直し、`jewels.blend` として保存します。未保存の作業があるときは、先に保存してください。
- Cycles の描画（`render_env.py` / `render_turntables.py`）は時間がかかり、GUI で動かすと Blender の操作が止まるので、下のヘッドレスで動かします。

## ヘッドレスで実行する（WSL から）

```bash
BLENDER="/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"

# 組み立て。JewelCraft はユーザー設定で無効でも使えるよう、--factory-startup で起動してスクリプトの中で有効化する
"$BLENDER" --background --factory-startup --python "$(wslpath -w blender/build_jewels.py)"

# 環境マップを焼く（数秒）
"$BLENDER" --background "$(wslpath -w blender/jewels.blend)" --python "$(wslpath -w blender/render_env.py)"

# 見た目の確認用に、全石の 1 枚目だけを小さく描いた一覧を作る（数十秒）
"$BLENDER" --background "$(wslpath -w blender/jewels.blend)" --python "$(wslpath -w blender/render_turntables.py)" -- --preview "$(wslpath -w /tmp/jewels_preview.png)"

# 連番を描く（CPU で 1 枚 10〜15 秒、12 石 × 48 枚で 2 時間ほど）。--only diamond ruby のように石を絞れる
"$BLENDER" --background "$(wslpath -w blender/jewels.blend)" --python "$(wslpath -w blender/render_turntables.py)"
```

## 見た目を調整するときの勘所

- **石の色**は `lib/birthstones.json` の `color`。Cycles では吸収ボリュームの色、Web では屈折の色の両方に使います。吸収は厚いほど「一番明るい成分の色」に寄っていくので（黄色は赤っぽく、淡いピンクは灰色っぽくなる）、参照画像から測った色を、描いた結果を見ながら調整してあります。
- **色の濃さ**は `build_jewels.py` の `ABSORPTION_DENSITY`（1 mm あたりの吸収の強さ）。
- **照明**は `build_jewels.py` の `STUDIO_RINGS` / `STUDIO_SPARKS` / `WORLD_GRADIENT`。仰角 20〜55° の帯を暗くしてあるのは、カメラ（仰角 35°）から見たテーブル面に映る方向だからです。明るくすると、表面の反射で石が白く覆われます。
- **分散（虹色のファイア）**: Blender 5.2 の Glass / Principled BSDF には分散の入力が無いので、赤・緑・青だけを通すガラスを 3 つ足し、色ごとに屈折率をずらすノードグループ（`JWL_DispersiveGlass`）で表しています。
- Blender の UI が日本語だと、新しく作ったノードの名前も翻訳されます（例：「プリンシプルBSDF」）。スクリプトでは既定のノードを名前で探さず、消して作り直しています。
- 資産を作り直したら `pnpm test` を実行してください。`.glb` のノード名・HDR の形式・連番の枚数がコードの期待と合っているかを確かめます。
