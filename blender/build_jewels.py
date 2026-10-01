# build_jewels.py: THE JEWELS の 12 個の誕生石を Blender に組み立てるスクリプト。
# 形は JewelCraft のカット（Round / Oval / Pear）を使い、JewelCraft に型が無いパールだけは球で作る。
# 実行すると、シーンを作り直して blender/jewels.blend に保存し、Web 用の public/jewels/jewels.glb を書き出す。
#
# 実行方法（どちらでも同じ結果になる）:
#   - BlenderMCP から GUI の Blender で実行する（blender/README.md の「BlenderMCP から GUI の Blender で実行する」を参照）
#   - ヘッドレスで実行する:
#       blender.exe --background --factory-startup --python blender/build_jewels.py

import json
import math
from pathlib import Path

import addon_utils
import bpy
from mathutils import Vector

# REPO: リポジトリのルート（このファイルは <REPO>/blender/build_jewels.py にある）
REPO = Path(__file__).resolve().parents[1]
# STONES_JSON: 誕生石のデータ。Web 側（lib/birthstones.ts）と同じファイルを読み、値の食い違いを防ぐ
STONES_JSON = REPO / "lib" / "birthstones.json"
# BLEND_PATH: 組み立てたシーンの保存先。render_env.py はこのファイルを開いて描画する
BLEND_PATH = REPO / "blender" / "jewels.blend"
# GLB_PATH: Web で読み込む形状データ（glTF のバイナリ形式 .glb）の書き出し先
GLB_PATH = REPO / "public" / "jewels" / "jewels.glb"

# JEWELCRAFT_MODULE: JewelCraft アドオンのモジュール名（拡張機能として user_default リポジトリに入っている）
JEWELCRAFT_MODULE = "bl_ext.user_default.jewelcraft"
# JEWELCRAFT_CUTS: データのカット名 → JewelCraft のカット識別子（sphere は JewelCraft に無いので含めない）
JEWELCRAFT_CUTS = {"round": "ROUND", "oval": "OVAL", "pear": "PEAR"}
# JEWELCRAFT_STONES: 石の id → JewelCraft の石の種類。JewelCraft 上の記録用で、見た目のマテリアルはこのスクリプトで付け直す
JEWELCRAFT_STONES = {
    # 1 月: ガーネット
    "garnet": "GARNET",
    # 2 月: アメジスト
    "amethyst": "AMETHYST",
    # 3 月: アクアマリン
    "aquamarine": "AQUAMARINE",
    # 4 月: ダイヤモンド
    "diamond": "DIAMOND",
    # 5 月: エメラルド
    "emerald": "EMERALD",
    # 7 月: ルビー
    "ruby": "RUBY",
    # 8 月: ペリドット
    "peridot": "PERIDOT",
    # 9 月: サファイア
    "sapphire": "SAPPHIRE",
    # 10 月: ピンクトルマリン（JewelCraft ではトルマリンとしてまとめて扱う）
    "pink-tourmaline": "TOURMALINE",
    # 11 月: シトリン
    "citrine": "CITRINE",
    # 12 月: ブルートパーズ（JewelCraft ではトパーズとして扱う）
    "blue-topaz": "TOPAZ",
}

# ABSORPTION_DENSITY: Cycles で石の色の濃さを決める吸収の強さ（1 mm あたり）。
# 大きいほど光が石の中を進むうちに色が濃くなる。0 のときは吸収ボリュームを付けない（無色のダイヤなど）。
# 色そのものは lib/birthstones.json の color（Web のリアルタイム描画と共通の、描画用の色）を使う。
# 吸収は厚いほど「いちばん明るい成分の色」に寄っていく（黄色は赤っぽく、淡いピンクは灰色っぽくなる）ので、
# JSON の color は、参照画像から測った色をもとに、Cycles の描画結果を見比べて調整してある
ABSORPTION_DENSITY = {
    # ガーネット: 深い赤にしたいので強め
    "garnet": 0.8,
    # アメジスト: 中くらいの紫
    "amethyst": 0.35,
    # アクアマリン: 明るい水色
    "aquamarine": 0.3,
    # ダイヤモンド: 無色なので吸収なし
    "diamond": 0.0,
    # エメラルド: やや濃い緑
    "emerald": 0.45,
    # パール: 不透明な素材なので使わない
    "pearl": 0.0,
    # ルビー: 濃い赤
    "ruby": 0.7,
    # ペリドット: 中くらいの黄緑
    "peridot": 0.35,
    # サファイア: 濃い青
    "sapphire": 0.7,
    # ピンクトルマリン: あざやかなピンク
    "pink-tourmaline": 0.24,
    # シトリン: 黄金色
    "citrine": 0.4,
    # ブルートパーズ: あざやかな空色（スイスブルー）
    "blue-topaz": 0.35,
}

# RING_RADIUS_MM: GUI での確認用に 12 石を並べる時計の文字盤の半径（mm）。書き出す .glb には位置を使わない（Web 側で並べ直す）
RING_RADIUS_MM = 30.0
# LIFT_MM: 石の一番下（キューレット）を床からどれだけ浮かせるか（mm）。確認用の配置にだけ使う
LIFT_MM = 0.8
# PEARL_SEGMENTS: パールの球の経度方向の分割数。多いほど輪郭がなめらかになる
PEARL_SEGMENTS = 96
# PEARL_RINGS: パールの球の緯度方向の分割数。多いほど上下方向の輪郭と映り込みがなめらかになるが、三角形が増えて .glb が重くなる
PEARL_RINGS = 48

# STUDIO_RINGS: 周りを囲む細長い発光板（ストリップライト）の輪。宝石の切子面に白い帯として映り込む。
# 形式は (仰角°, 本数, 幅mm, 高さmm, 強い板の明るさ, 弱い板の明るさ, 方位角のずらし°)。強弱を交互にして、切子面の明暗のコントラストを作る。
# 仰角 20〜55° の帯はあえて空けている。カメラ（仰角 35°）から見たテーブル面（上の平らな面）には、この帯が鏡のように映るため、
# そこが明るいと表面の反射で白く覆われ、石の中で反射した色が見えなくなる
STUDIO_RINGS = [
    # 低い輪: 横から入った光が中で反射し、石の色を明るく見せる
    (12.0, 8, 20.0, 40.0, 4.0, 1.2, 0.0),
    # 高い輪: 斜め上からの光で、上側の切子面にきらめきを作る
    (62.0, 6, 14.0, 40.0, 3.0, 3.0, 30.0),
]
# TOP_LIGHT_STRENGTH: 真上の面光源の明るさ。強すぎると上側の切子面が白い反射で覆われ、石の色が見えなくなる
TOP_LIGHT_STRENGTH = 1.5
# WORLD_GRADIENT: ワールド（背景）の上下のグラデーション。形式は (位置, 線形 RGB)。位置は 0 = 真下、0.5 = 水平、1 = 真上。
# 下を暗く、上ほど明るくして、宝石撮影で天井に大きな拡散板を張ったような光にする。
# 石の中で反射して戻ってくる光はおもに上半分から来るので、上が明るいと色が明るく見え、下や水平の暗さが切子面の明暗を作る
WORLD_GRADIENT = [
    # 真下: ほぼ黒
    (0.0, (0.008, 0.008, 0.01)),
    # 水平: まだ暗い
    (0.5, (0.03, 0.03, 0.035)),
    # 水平から少し上（約 14°）
    (0.58, (0.12, 0.12, 0.13)),
    # 斜め上（約 45°）。テーブル面に映る方向なので、真っ黒にせず少し明るさを残す
    (0.75, (0.3, 0.3, 0.33)),
    # 真上: 明るい灰色
    (1.0, (0.62, 0.63, 0.68)),
]
# VIEW_EXPOSURE: Cycles で描くときの露出（段数）。Web のリアルタイム描画の露出もこれに合わせる
VIEW_EXPOSURE = 1.0
# STUDIO_RING_DISTANCE_MM: 輪の発光板と石の中心の距離（mm）。
# 近づけるほど発光板が石から大きく見え、切子面に映る白い帯が太く、光が柔らかくなる。遠ざけると帯が細く鋭いきらめきになる
STUDIO_RING_DISTANCE_MM = 100.0
# STUDIO_SPARKS: 小さく強い発光板。ダイヤの虹色のきらめき（ファイア）や鋭い光の点を作る。形式は (方位角°, 仰角°)。
# 方位角は +Y（時計の 12 時）から時計回り
STUDIO_SPARKS = [(30, 48), (120, 52), (210, 46), (300, 50)]


def load_stones() -> list[dict]:
    # 誕生石のデータ（12 件）を JSON から読み込む
    with STONES_JSON.open(encoding="utf-8") as f:
        # JSON を Python の辞書のリストとして返す
        return json.load(f)


def ensure_jewelcraft() -> None:
    # JewelCraft がまだ有効でなければ、このセッションだけ有効化する（ヘッドレス実行では --factory-startup で起動するため無効になっている）
    if not addon_utils.check(JEWELCRAFT_MODULE)[1]:
        # ユーザー設定を保存しないようにしてから有効化する（default_set=False だと JewelCraft の register が KeyError になるため True にする）
        bpy.context.preferences.use_preferences_save = False
        # アドオンを有効化する
        addon_utils.enable(JEWELCRAFT_MODULE, default_set=True)


def srgb_hex_to_linear(hex_color: str) -> tuple[float, float, float]:
    # "#rrggbb" を、Blender がマテリアルで使う線形 RGB（0〜1）に変換する
    values = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    # sRGB のガンマを外して線形にする（暗い部分は直線、明るい部分は 2.4 乗の式）
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values)


def normalized_absorption_color(hex_color: str) -> tuple[float, float, float]:
    # 吸収ボリュームに渡す色を作る。いちばん明るい成分が 1 になるよう割り、色味だけを残す
    linear = srgb_hex_to_linear(hex_color)
    # 最大の成分（0 除算を避けるため下限を付ける）
    peak = max(max(linear), 1e-4)
    # 各成分を最大値で割る（最大の成分は吸収されず、他の成分ほど強く吸収される）
    return tuple(c / peak for c in linear)


def reset_scene() -> None:
    # 何度実行しても同じ結果になるよう、既存のオブジェクトと、このスクリプトが作ったデータをすべて消す
    for ob in list(bpy.data.objects):
        # オブジェクトをシーンから外して削除する
        bpy.data.objects.remove(ob, do_unlink=True)
    # シーン直下の子コレクションを消す（Collection や前回の JWL_* など）
    for coll in list(bpy.data.collections):
        # コレクションを削除する
        bpy.data.collections.remove(coll)
    # 使われなくなったメッシュ・マテリアル・ノードグループ・カメラ・ワールドを消す
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.node_groups, bpy.data.cameras, bpy.data.lights):
        # それぞれのデータの一覧を確認する
        for block in list(datablocks):
            # どこからも使われていないものだけ消す
            if block.users == 0:
                # 削除する
                datablocks.remove(block)
    # 前回作ったワールドを消す（今のシーンのワールドを差し替えてから消すので、使用中でも問題ない）
    for world in list(bpy.data.worlds):
        # JWL_ で始まるものだけ対象にする
        if world.name.startswith("JWL_"):
            # 削除する
            bpy.data.worlds.remove(world)


def setup_units(scene: bpy.types.Scene) -> None:
    # 長さの単位をミリメートルにする。1 Blender 単位 = 1 mm として扱い、JewelCraft のサイズ指定（mm）と合わせる
    scene.unit_settings.system = "METRIC"
    # 1 単位を 0.001 m（= 1 mm）とみなす
    scene.unit_settings.scale_length = 0.001
    # 画面に表示する単位も mm にする
    scene.unit_settings.length_unit = "MILLIMETERS"


def new_collection(scene: bpy.types.Scene, name: str) -> bpy.types.Collection:
    # 名前付きのコレクションを作ってシーンにつなぐ
    coll = bpy.data.collections.new(name)
    # シーン直下に追加する
    scene.collection.children.link(coll)
    # 作ったコレクションを返す
    return coll


def set_active_collection(coll: bpy.types.Collection) -> None:
    # 演算子（bpy.ops）で追加したオブジェクトが入るコレクションを切り替える
    layer_coll = bpy.context.view_layer.layer_collection.children[coll.name]
    # アクティブなコレクションにする
    bpy.context.view_layer.active_layer_collection = layer_coll


def select_only(ob: bpy.types.Object) -> None:
    # 選択を解除し、指定したオブジェクトだけを選択・アクティブにする（transform_apply などの演算子が対象を正しく扱うため）
    for other in bpy.context.selected_objects:
        # ほかの選択を外す
        other.select_set(False)
    # 対象を選択する
    ob.select_set(True)
    # 対象をアクティブにする
    bpy.context.view_layer.objects.active = ob


def gem_surface_group() -> bpy.types.ShaderNodeTree:
    # 分散（光を虹色に分ける性質）を持つガラスのノードグループを作る。
    # Blender 5.2 の Glass BSDF には分散の入力が無いので、赤・緑・青だけを通すガラスを 3 つ足し、
    # 赤は屈折率を少し下げ、青は少し上げる。3 色の曲がり方がずれて、虹色のきらめき（ファイア）になる
    group = bpy.data.node_groups.new("JWL_DispersiveGlass", "ShaderNodeTree")
    # 入力: 屈折率（緑の光の値として使う）
    group.interface.new_socket("IOR", in_out="INPUT", socket_type="NodeSocketFloat")
    # 入力: 分散。赤と青の屈折率の差（宝石学の B–G 間の値をそのまま使う）
    group.interface.new_socket("Dispersion", in_out="INPUT", socket_type="NodeSocketFloat")
    # 出力: 合成したシェーダー
    group.interface.new_socket("BSDF", in_out="OUTPUT", socket_type="NodeSocketShader")
    # nodes / links: グループ内のノードとつなぎ線
    nodes, links = group.nodes, group.links
    # グループの入力ノード
    group_in = nodes.new("NodeGroupInput")
    # グループの出力ノード
    group_out = nodes.new("NodeGroupOutput")
    # 分散の半分を求める（赤は IOR − 半分、青は IOR + 半分）
    half = nodes.new("ShaderNodeMath")
    # 掛け算にする
    half.operation = "MULTIPLY"
    # 0.5 倍する
    half.inputs[1].default_value = 0.5
    # 分散を入力する
    links.new(group_in.outputs["Dispersion"], half.inputs[0])
    # 赤の屈折率 = IOR − 分散/2
    ior_red = nodes.new("ShaderNodeMath")
    # 引き算にする
    ior_red.operation = "SUBTRACT"
    # 左辺に IOR
    links.new(group_in.outputs["IOR"], ior_red.inputs[0])
    # 右辺に分散/2
    links.new(half.outputs[0], ior_red.inputs[1])
    # 青の屈折率 = IOR + 分散/2
    ior_blue = nodes.new("ShaderNodeMath")
    # 足し算にする
    ior_blue.operation = "ADD"
    # 左辺に IOR
    links.new(group_in.outputs["IOR"], ior_blue.inputs[0])
    # 右辺に分散/2
    links.new(half.outputs[0], ior_blue.inputs[1])
    # glasses: 赤・緑・青だけを通すガラス 3 つ
    glasses = []
    # 各色について、通す色と屈折率の出どころを決めてガラスを作る
    for color, ior_socket in (((1, 0, 0, 1), ior_red.outputs[0]), ((0, 1, 0, 1), group_in.outputs["IOR"]), ((0, 0, 1, 1), ior_blue.outputs[0])):
        # ガラスのノードを作る
        glass = nodes.new("ShaderNodeBsdfGlass")
        # この色だけを通す
        glass.inputs["Color"].default_value = color
        # 表面は鏡のようになめらか（粗さ 0）
        glass.inputs["Roughness"].default_value = 0.0
        # 色ごとの屈折率をつなぐ
        links.new(ior_socket, glass.inputs["IOR"])
        # 一覧に加える
        glasses.append(glass)
    # 赤 + 緑
    add_rg = nodes.new("ShaderNodeAddShader")
    # 赤のガラスをつなぐ
    links.new(glasses[0].outputs[0], add_rg.inputs[0])
    # 緑のガラスをつなぐ
    links.new(glasses[1].outputs[0], add_rg.inputs[1])
    # (赤 + 緑) + 青。3 色がそろうと白い光として元どおりになる
    add_rgb = nodes.new("ShaderNodeAddShader")
    # 赤 + 緑をつなぐ
    links.new(add_rg.outputs[0], add_rgb.inputs[0])
    # 青のガラスをつなぐ
    links.new(glasses[2].outputs[0], add_rgb.inputs[1])
    # グループの出力へつなぐ
    links.new(add_rgb.outputs[0], group_out.inputs["BSDF"])
    # 作ったノードグループを返す
    return group


def principled_material(name: str) -> tuple[bpy.types.Material, bpy.types.ShaderNode]:
    # Principled BSDF を 1 つだけ持つマテリアルを作る。
    # 既定で入っているノードは UI の言語によって名前が翻訳される（日本語では「プリンシプルBSDF」）ので、名前で探さずに作り直す
    mat = bpy.data.materials.new(name)
    # nodes / links: マテリアルのノードとつなぎ線
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    # 既定のノードを消す
    nodes.clear()
    # Principled BSDF（多くの素材を 1 つで表せる標準のシェーダー）
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    # マテリアルの出力ノード
    output = nodes.new("ShaderNodeOutputMaterial")
    # シェーダーを表面につなぐ
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    # マテリアルと、値を設定するための Principled BSDF を返す
    return mat, bsdf


def gem_material(stone: dict, surface: bpy.types.ShaderNodeTree) -> bpy.types.Material:
    # 透明な宝石のマテリアルを作る。表面は分散ガラス、中身は色を付ける吸収ボリューム
    mat = bpy.data.materials.new(f"JWL_{stone['id']}")
    # ビューポートでの表示色（ソリッド表示のときの色）を石の色にする
    mat.diffuse_color = (*srgb_hex_to_linear(stone["color"]), 1.0)
    # nodes / links: マテリアルのノードとつなぎ線
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    # 既定で入っている Principled BSDF などを消して作り直す
    nodes.clear()
    # マテリアルの出力ノード
    output = nodes.new("ShaderNodeOutputMaterial")
    # 分散ガラスのグループを置く
    glass = nodes.new("ShaderNodeGroup")
    # 使うノードグループを指定する
    glass.node_tree = surface
    # 石の屈折率を渡す
    glass.inputs["IOR"].default_value = stone["ior"]
    # 石の分散を渡す
    glass.inputs["Dispersion"].default_value = stone["dispersion"]
    # 表面（Surface）につなぐ
    links.new(glass.outputs["BSDF"], output.inputs["Surface"])
    # density: この石の吸収の強さ
    density = ABSORPTION_DENSITY[stone["id"]]
    # 吸収が 0 より大きい石だけ、中身に色を付ける
    if density > 0:
        # 吸収ボリュームのノード
        absorption = nodes.new("ShaderNodeVolumeAbsorption")
        # 残したい色（それ以外の色が吸収される）
        absorption.inputs["Color"].default_value = (*normalized_absorption_color(stone["color"]), 1.0)
        # 吸収の強さ
        absorption.inputs["Density"].default_value = density
        # 体積（Volume）につなぐ
        links.new(absorption.outputs[0], output.inputs["Volume"])
    # 作ったマテリアルを返す
    return mat


def pearl_material(stone: dict) -> bpy.types.Material:
    # パールのマテリアルを作る。不透明な真珠層に、虹色の照り（薄膜干渉）と、なめらかなツヤ（コート）を重ねる
    mat, bsdf = principled_material(f"JWL_{stone['id']}")
    # ビューポートでの表示色
    mat.diffuse_color = (*srgb_hex_to_linear(stone["color"]), 1.0)
    # 地の色（参照画像の銀灰色のパールを、照明で陰が付く前の明るさにした銀白色）
    bsdf.inputs["Base Color"].default_value = (*srgb_hex_to_linear(stone["color"]), 1.0)
    # 真珠層のやわらかいツヤ。0 に近いほど鏡のようになる
    bsdf.inputs["Roughness"].default_value = 0.14
    # 真珠層の屈折率（反射の強さに効く）
    bsdf.inputs["IOR"].default_value = stone["ior"]
    # 光が少しだけ表面の下に入って散る（真珠のしっとりした質感）
    bsdf.inputs["Subsurface Weight"].default_value = 0.3
    # 表面下で光が広がる距離の比率（赤ほど遠くまで届く）
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.8, 0.6)
    # 表面下で光が広がる距離の目安（mm）
    bsdf.inputs["Subsurface Scale"].default_value = 0.4
    # 表面を覆う透明なツヤの層。強すぎると下の虹色の照りが隠れるので半分にする
    bsdf.inputs["Coat Weight"].default_value = 0.5
    # ツヤの層はなめらかにする
    bsdf.inputs["Coat Roughness"].default_value = 0.04
    # 薄膜の厚さ（ナノメートル）。真珠層の干渉で、見る角度によって虹色の照り（オリエント）が出る
    bsdf.inputs["Thin Film Thickness"].default_value = 520.0
    # 薄膜の屈折率
    bsdf.inputs["Thin Film IOR"].default_value = 1.6
    # 作ったマテリアルを返す
    return mat


def add_cut_stone(stone: dict) -> bpy.types.Object:
    # JewelCraft でカットした石を 1 個追加する（位置は原点。サイズは長さ mm）
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    # JewelCraft の「Add Gem」を実行する
    bpy.ops.object.jewelcraft_gem_add(cut=JEWELCRAFT_CUTS[stone["cut"]], stone=JEWELCRAFT_STONES[stone["id"]], size=stone["sizeMm"])
    # 追加された石（アクティブオブジェクトになっている）を返す
    return bpy.context.active_object


def add_pearl(stone: dict) -> bpy.types.Object:
    # パールを球として追加する（sizeMm は直径）
    bpy.ops.mesh.primitive_uv_sphere_add(segments=PEARL_SEGMENTS, ring_count=PEARL_RINGS, radius=stone["sizeMm"] / 2)
    # ob: 追加された球
    ob = bpy.context.active_object
    # 面をなめらかに見せる（切子面のある宝石と違い、パールは継ぎ目なく丸い）
    bpy.ops.object.shade_smooth()
    # 追加した球を返す
    return ob


def ring_angle(month: int) -> float:
    # 時計の文字盤で month 月の位置の角度（ラジアン）。12 時（+Y）から時計回りに 30°ずつ進む
    return month / 12 * math.tau


def add_stone(stone: dict, surface: bpy.types.ShaderNodeTree) -> bpy.types.Object:
    # 石を 1 個作り、名前・マテリアル・確認用の配置を整える
    ob = add_pearl(stone) if stone["cut"] == "sphere" else add_cut_stone(stone)
    # オブジェクト名を石の id にする。glTF のノード名になり、Web 側はこの名前で形を取り出す
    ob.name = stone["id"]
    # メッシュ名も同じにする
    ob.data.name = stone["id"]
    # 大きさ（JewelCraft はスケールでサイズを表す）をメッシュに焼き込み、スケールを 1 に戻す（Web 側で扱う形を mm のままにする）
    select_only(ob)
    # スケールだけを適用する
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # 既存のマテリアル（JewelCraft が付けた簡易なもの）を外す
    ob.data.materials.clear()
    # 石の種類に合ったマテリアルを付ける
    ob.data.materials.append(pearl_material(stone) if stone["cut"] == "sphere" else gem_material(stone, surface))
    # angle: 時計の文字盤での角度
    angle = ring_angle(stone["month"])
    # 確認用に、時計の文字盤の位置へ置く（x は右、y は奥が 12 時）
    ob.location.x = RING_RADIUS_MM * math.sin(angle)
    # 奥行き方向の位置
    ob.location.y = RING_RADIUS_MM * math.cos(angle)
    # 石の一番下が床から LIFT_MM だけ浮くように高さを決める（メッシュの最下点を求める）
    ob.location.z = LIFT_MM - min(v.co.z for v in ob.data.vertices)
    # 楕円やペアシェイプの長い向き（+Y）が文字盤の外側を向くよう回す
    ob.rotation_euler.z = -angle
    # 作った石を返す
    return ob


def add_emitter(coll: bpy.types.Collection, name: str, size: tuple[float, float], location: Vector, strength: float) -> bpy.types.Object:
    # 発光する板（ソフトボックスやストリップライトの代わり）を 1 枚作り、原点の方へ向ける
    me = bpy.data.meshes.new(name)
    # 板の半分の幅と高さ
    hw, hh = size[0] / 2, size[1] / 2
    # 4 頂点の四角形を作る（法線は +Z）
    me.from_pydata([(-hw, -hh, 0), (hw, -hh, 0), (hw, hh, 0), (-hw, hh, 0)], [], [(0, 1, 2, 3)])
    # メッシュの内部データを整える
    me.update()
    # オブジェクトにする
    ob = bpy.data.objects.new(name, me)
    # コレクションに入れる
    coll.objects.link(ob)
    # 位置を決める
    ob.location = location
    # 板の +Z（光る面）が原点を向くよう回す
    ob.rotation_euler = (Vector((0.0, 0.0, 0.0)) - location).to_track_quat("Z", "Y").to_euler()
    # カメラから直接は見えないようにする（反射・屈折には映る）。手前のライトが石を隠さないための、宝石撮影の定番の設定。
    # 環境マップを焼くときだけ render_env.py が見えるように戻す
    ob.visible_camera = False
    # 光る板のマテリアル
    mat = bpy.data.materials.new(f"JWL_{name}")
    # nodes / links: マテリアルのノードとつなぎ線
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    # 既定のノードを消す
    nodes.clear()
    # 発光シェーダー
    emission = nodes.new("ShaderNodeEmission")
    # 少しだけ暖かい白（撮影用ライトの色味）
    emission.inputs["Color"].default_value = (1.0, 0.97, 0.93, 1.0)
    # 明るさ
    emission.inputs["Strength"].default_value = strength
    # 出力ノード
    output = nodes.new("ShaderNodeOutputMaterial")
    # 発光を表面につなぐ
    links.new(emission.outputs[0], output.inputs["Surface"])
    # 板にマテリアルを付ける
    me.materials.append(mat)
    # 作った板を返す
    return ob


def spherical(azimuth_deg: float, elevation_deg: float, distance: float) -> Vector:
    # 方位角（+Y から時計回り）・仰角・距離から、原点まわりの位置を求める
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    # 水平方向の距離
    flat = distance * math.cos(el)
    # x（右）, y（奥）, z（上）の位置を返す
    return Vector((flat * math.sin(az), flat * math.cos(az), distance * math.sin(el)))


def build_studio(scene: bpy.types.Scene, coll: bpy.types.Collection) -> None:
    # 宝石撮影のスタジオを作る。暗い背景に、真上の面光源・周りを囲む 2 段のストリップ・小さな強い点光源を置く。
    # どの方向から見ても明るさがそろうよう、ぐるりと囲む配置にしている（Web ではカメラを石のまわりにぐるりと回せ、環境マップも全方向に焼くため）
    add_emitter(coll, "Light_Top", (60.0, 60.0), Vector((0.0, 0.0, 120.0)), TOP_LIGHT_STRENGTH)
    # 輪ごとにストリップライトを並べる
    for ring_index, (elevation, count, width, height, strong, weak, offset) in enumerate(STUDIO_RINGS):
        # 輪の中の 1 本ずつ
        for index in range(count):
            # 偶数番目は強く、奇数番目は弱くする
            strength = strong if index % 2 == 0 else weak
            # 方位角を等間隔に配る
            azimuth = offset + 360.0 * index / count
            # 1 本作る
            add_emitter(coll, f"Light_Ring{ring_index}_{index}", (width, height), spherical(azimuth, elevation, STUDIO_RING_DISTANCE_MM), strength)
    # 小さく強い点光源（4 mm 角、距離 85 mm）
    for index, (azimuth, elevation) in enumerate(STUDIO_SPARKS):
        # 1 つ作る
        add_emitter(coll, f"Light_Spark_{index}", (4.0, 4.0), spherical(azimuth, elevation, 85.0), 80.0)
    # ワールド（背景）。暗すぎると石が黒く沈み、一様に明るすぎると切子面の明暗が消えるので、上下のグラデーションにする
    world = bpy.data.worlds.new("JWL_World")
    # シーンのワールドを差し替える
    scene.world = world
    # nodes / links: ワールドのノードとつなぎ線。既定のノードは名前が翻訳されることがあるので作り直す
    nodes, links = world.node_tree.nodes, world.node_tree.links
    # 既定のノードを消す
    nodes.clear()
    # 背景ノード
    background = nodes.new("ShaderNodeBackground")
    # ワールドの出力ノード
    world_output = nodes.new("ShaderNodeOutputWorld")
    # 背景を出力につなぐ
    links.new(background.outputs["Background"], world_output.inputs["Surface"])
    # 見ている方向（ワールドでは Generated が方向ベクトルになる）
    coords = nodes.new("ShaderNodeTexCoord")
    # 方向ベクトルを x / y / z に分ける
    separate = nodes.new("ShaderNodeSeparateXYZ")
    # 方向をつなぐ
    links.new(coords.outputs["Generated"], separate.inputs["Vector"])
    # 上下の成分 z（-1 = 真下 〜 1 = 真上）を 0〜1 に直す
    remap = nodes.new("ShaderNodeMapRange")
    # 元の範囲の下限
    remap.inputs["From Min"].default_value = -1.0
    # 元の範囲の上限
    remap.inputs["From Max"].default_value = 1.0
    # z をつなぐ
    links.new(separate.outputs["Z"], remap.inputs["Value"])
    # 0〜1 の位置を色に変えるカラーランプ
    ramp = nodes.new("ShaderNodeValToRGB")
    # 位置をつなぐ
    links.new(remap.outputs["Result"], ramp.inputs["Fac"])
    # elements: カラーランプの色の区切り（既定で両端の 2 つがある）。
    # 区切りは位置の順に並び替えられるので、先に両端を決め、そのあと間の区切りを足す
    elements = ramp.color_ramp.elements
    # 下端の位置と色
    elements[0].position, elements[0].color = WORLD_GRADIENT[0][0], (*WORLD_GRADIENT[0][1], 1.0)
    # 上端の位置と色
    elements[1].position, elements[1].color = WORLD_GRADIENT[-1][0], (*WORLD_GRADIENT[-1][1], 1.0)
    # 間の区切りを足す
    for position, color in WORLD_GRADIENT[1:-1]:
        # 指定の位置に区切りを足し、色を入れる（アルファは 1）
        elements.new(position).color = (*color, 1.0)
    # カラーランプの色を背景の色につなぐ
    links.new(ramp.outputs["Color"], background.inputs["Color"])
    # 背景の明るさ
    background.inputs["Strength"].default_value = 1.0


def build_preview_floor(coll: bpy.types.Collection) -> None:
    # GUI で確認するときだけ見える、暗いベルベットの床を作る（レンダリングには写さない）
    bpy.ops.mesh.primitive_circle_add(vertices=128, radius=70.0, fill_type="NGON", location=(0.0, 0.0, 0.0))
    # floor: 追加した円盤
    floor = bpy.context.active_object
    # 名前を付ける
    floor.name = "Preview_Floor"
    # 環境マップの描画には写さない
    floor.hide_render = True
    # ベルベット風のマテリアル
    mat, bsdf = principled_material("JWL_Velvet")
    # 暗い紫がかった色（旧 GEMS のベルベットの雰囲気を引き継ぐ）
    bsdf.inputs["Base Color"].default_value = (0.03, 0.018, 0.045, 1.0)
    # ざらついた布なのでツヤは弱い
    bsdf.inputs["Roughness"].default_value = 0.9
    # 布の起毛の光沢
    bsdf.inputs["Sheen Weight"].default_value = 0.6
    # 床にマテリアルを付ける
    floor.data.materials.append(mat)
    # 床をコレクションに入れる（演算子で追加したものはアクティブなコレクションに入っている）
    if floor.name not in coll.objects:
        # 念のため明示的にリンクする
        coll.objects.link(floor)


def build_camera(scene: bpy.types.Scene, coll: bpy.types.Collection) -> None:
    # 確認用に使うカメラを作る
    cam_data = bpy.data.cameras.new("JWL_Camera")
    # 確認用のレンズ（mm）。時計の文字盤全体が入る画角
    cam_data.lens = 50.0
    # 近くの切り取り距離（mm）
    cam_data.clip_start = 1.0
    # 遠くの切り取り距離（mm）
    cam_data.clip_end = 2000.0
    # カメラのオブジェクト
    cam = bpy.data.objects.new("JWL_Camera", cam_data)
    # コレクションに入れる
    coll.objects.link(cam)
    # 手前（6 時側）の斜め上に置く
    cam.location = Vector((0.0, -120.0, 105.0))
    # 原点（文字盤の中心）を向ける
    cam.rotation_euler = (Vector((0.0, 0.0, 0.0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    # シーンのカメラにする
    scene.camera = cam


def setup_render(scene: bpy.types.Scene) -> None:
    # Cycles（光の経路を追いかけて描くレンダラー）の設定。宝石は光が中で何度も反射・屈折するので、反射回数を多めにする。
    # Blender の画面で見た目を確かめるために描くときの設定（環境マップを焼く render_env.py は、解像度・透明・サンプル数などを上書きする）
    scene.render.engine = "CYCLES"
    # GPU が使えない環境なので CPU で描く
    scene.cycles.device = "CPU"
    # 1 画素あたりの光のサンプル数。多いほどノイズが減るが時間がかかる（CPU で 1 枚 10 秒前後になる値）
    scene.cycles.samples = 160
    # ノイズが十分減った画素は早めに打ち切る
    scene.cycles.use_adaptive_sampling = True
    # 打ち切りの基準。小さいほど丁寧に描く
    scene.cycles.adaptive_threshold = 0.015
    # 残ったノイズをデノイザーで消す
    scene.cycles.use_denoising = True
    # CPU で動く OpenImageDenoise を使う
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    # 反射・屈折の合計回数の上限
    scene.cycles.max_bounces = 32
    # 拡散反射の回数（宝石にはほとんど関係しない）
    scene.cycles.diffuse_bounces = 3
    # 鏡面反射の回数
    scene.cycles.glossy_bounces = 16
    # 透過（屈折）の回数。宝石の中での全反射を追うため多め
    scene.cycles.transmission_bounces = 32
    # ボリュームでの散乱回数。吸収だけで散乱はしないので 0
    scene.cycles.volume_bounces = 0
    # 透明の重なりの回数
    scene.cycles.transparent_max_bounces = 16
    # コースティクス（光が宝石を通って床に集まる効果）は床を写さないので切り、ノイズと時間を減らす
    scene.cycles.caustics_reflective = False
    # 屈折によるコースティクスも切る
    scene.cycles.caustics_refractive = False
    # ごく小さい強い光の点（ファイアフライ）を少しぼかしてノイズを抑える
    scene.cycles.blur_glossy = 0.2
    # 背景を透明にする（確認用の絵で石だけを見やすくするため。環境マップを焼く render_env.py は不透明に戻す）
    scene.render.film_transparent = True
    # 出力画像の幅（px）
    scene.render.resolution_x = 640
    # 出力画像の高さ（px）
    scene.render.resolution_y = 640
    # 解像度をそのまま使う
    scene.render.resolution_percentage = 100
    # 見た目の色変換を AgX にする（明るい部分の色が不自然に飛ばない）
    scene.view_settings.view_transform = "AgX"
    # 露出（段数）。+1 で 2 倍の明るさ。宝石の輝きと色のバランスを見比べて決めた値（+1.5 だと淡い石の色が白く飛ぶ）
    scene.view_settings.exposure = VIEW_EXPOSURE
    # コントラストを少し強める見た目（名前は Blender の版で違うので、使えるものを順に試す）
    for look in ("AgX - Punchy", "Punchy", "None"):
        # 設定を試す
        try:
            # 見た目を設定する
            scene.view_settings.look = look
            # 成功したら終わり
            break
        # この名前が無い版では次の候補へ
        except TypeError:
            # 次を試す
            continue


def export_glb(stone_objects: list[bpy.types.Object]) -> None:
    # 12 個の石だけを選び、Web 用に glTF のバイナリ（.glb）で書き出す
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    # いったん選択を解除する
    for ob in bpy.context.selected_objects:
        # 選択を外す
        ob.select_set(False)
    # 石だけを選択する
    for ob in stone_objects:
        # 選択する
        ob.select_set(True)
    # 書き出す。形・法線だけを入れ、マテリアルは Web 側（MeshRefractionMaterial など）で付けるので入れない
    bpy.ops.export_scene.gltf(
        # 書き出し先
        filepath=str(GLB_PATH),
        # 1 ファイルにまとめたバイナリ形式
        export_format="GLB",
        # 選択中のオブジェクトだけを書き出す
        use_selection=True,
        # マテリアルは書き出さない
        export_materials="NONE",
        # モディファイアを適用した形で書き出す
        export_apply=True,
        # Blender の Z 上向きを、three.js の Y 上向きに変換する
        export_yup=True,
        # 法線（面の向き）を書き出す。切子面の平らな面の向きがそのまま残る
        export_normals=True,
        # テクスチャを使わないので UV は不要
        export_texcoords=False,
        # カメラは不要
        export_cameras=False,
        # ライトは不要
        export_lights=False,
        # アニメーションは不要
        export_animations=False,
        # 圧縮（Draco）は使わない。使うと Web 側で外部のデコーダーを読み込む必要が出る
        export_draco_mesh_compression_enable=False,
    )


def main() -> dict:
    # 全体の手順: データ読み込み → シーン初期化 → 石・照明・カメラ → 描画設定 → 保存 → .glb 書き出し
    stones = load_stones()
    # JewelCraft を使える状態にする
    ensure_jewelcraft()
    # 今のシーン
    scene = bpy.context.scene
    # 前回の結果や既定のオブジェクトを消す
    reset_scene()
    # 単位を mm にする
    setup_units(scene)
    # 石を入れるコレクション
    stones_coll = new_collection(scene, "JWL_Stones")
    # 照明とカメラを入れるコレクション
    studio_coll = new_collection(scene, "JWL_Studio")
    # 確認用の床を入れるコレクション
    preview_coll = new_collection(scene, "JWL_Preview")
    # 分散ガラスのノードグループ（全部の透明な石で共有する）
    surface = gem_surface_group()
    # これから追加する石は JWL_Stones に入れる
    set_active_collection(stones_coll)
    # 12 個の石を作る
    stone_objects = [add_stone(stone, surface) for stone in stones]
    # 床は JWL_Preview に入れる
    set_active_collection(preview_coll)
    # 確認用の床を作る
    build_preview_floor(preview_coll)
    # スタジオの照明を作る
    build_studio(scene, studio_coll)
    # カメラを作る
    build_camera(scene, studio_coll)
    # Cycles の設定をする
    setup_render(scene)
    # 保存先のフォルダを用意する
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    # .blend として保存する（GUI で実行した場合は、開いているファイルがこれに切り替わる）
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    # Web 用の .glb を書き出す
    export_glb(stone_objects)
    # 実行結果の要約（MCP から実行したときに内容を確認するため）
    return {
        # 作った石の名前・頂点数・大きさ（mm）
        "stones": [(ob.name, len(ob.data.vertices), [round(d, 3) for d in ob.dimensions]) for ob in stone_objects],
        # 保存した .blend
        "blend": str(BLEND_PATH),
        # 書き出した .glb と、そのバイト数
        "glb": (str(GLB_PATH), GLB_PATH.stat().st_size),
    }


# このファイルを直接実行したとき（ヘッドレス実行や MCP からの exec）だけ組み立てを行う
if __name__ == "__main__":
    # 組み立てを実行し、要約を出力する
    print("BUILD_JEWELS", main())
