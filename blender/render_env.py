# render_env.py: スタジオの照明を、石の位置から全方向に見渡した 1 枚の HDR 画像（正距円筒図法の環境マップ）に焼く。
# Web のリアルタイム描画（MeshRefractionMaterial やパールの反射）がこの画像を環境として使うので、
# Blender で組んだスタジオと同じ照明で石が光って見える。
# build_jewels.py が保存した blender/jewels.blend を開いて、ヘッドレスで実行する:
#
#   blender.exe --background blender/jewels.blend --python blender/render_env.py

import math
from pathlib import Path

import bpy

# REPO: リポジトリのルート（このファイルは <REPO>/blender/render_env.py にある）
REPO = Path(__file__).resolve().parents[1]
# OUTPUT_PATH: 環境マップの書き出し先（Radiance HDR 形式。1 を超える明るさもそのまま保存できる）
OUTPUT_PATH = REPO / "public" / "jewels" / "studio.hdr"
# WIDTH: 画像の幅（px）。横 360° を表す。小さな点光源（約 2.7°）でも数 px の大きさで写る解像度
WIDTH = 1024
# HEIGHT: 画像の高さ（px）。縦 180° を表すので幅の半分
HEIGHT = 512
# SAMPLES: サンプル数。発光する板と背景しか無く、ノイズが出ないので少なくてよい（縁のギザギザを消す程度）
SAMPLES = 16


def hide_non_studio() -> None:
    # 石と確認用の床を隠し、照明とワールドだけが写るようにする
    for ob in bpy.data.objects:
        # 石（JWL_Stones）と床（JWL_Preview）のコレクションにあるものを隠す
        if any(coll.name in ("JWL_Stones", "JWL_Preview") for coll in ob.users_collection):
            # レンダリングに写さない
            ob.hide_render = True
        # 発光する板は、build_jewels.py でカメラから見えないようにしてあるので、見えるように戻す
        elif ob.name.startswith("Light_"):
            # カメラからも見えるようにする
            ob.visible_camera = True


def setup_panorama(scene: bpy.types.Scene) -> None:
    # 全方向を 1 枚に写すパノラマカメラを、石の中心（原点）に置く
    cam = bpy.data.objects["JWL_Camera"]
    # パノラマカメラにする
    cam.data.type = "PANO"
    # 正距円筒図法（横 = 方位 360°、縦 = 仰角 180°）で写す
    cam.data.panorama_type = "EQUIRECTANGULAR"
    # 原点に置く
    cam.location = (0.0, 0.0, 0.0)
    # 画像の中心が +X、左 90° が +Y（時計の 12 時）、上が +Z になる向き。
    # three.js の equirectUv は、中心 = +X、左 90° = -Z（glTF 変換後の +Y）、上 = +Y（変換後の +Z）なので、
    # この向きで焼くと、Web で読み込んだときに Blender と同じ方向から光が来る
    cam.rotation_euler = (math.radians(90.0), 0.0, math.radians(-90.0))
    # このカメラで描く
    scene.camera = cam


def setup_output(scene: bpy.types.Scene) -> None:
    # 画像の大きさ・形式・色の扱いを設定する
    scene.render.resolution_x = WIDTH
    # 高さ
    scene.render.resolution_y = HEIGHT
    # 解像度をそのまま使う
    scene.render.resolution_percentage = 100
    # 背景（ワールド）も写す
    scene.render.film_transparent = False
    # サンプル数
    scene.cycles.samples = SAMPLES
    # ノイズが出ないのでデノイズは不要（かけると細い光の縁がぼける）
    scene.cycles.use_denoising = False
    # 色変換をかけず、光の強さをそのまま保存する（Web 側でトーンマッピングと露出をかける）
    scene.view_settings.view_transform = "Standard"
    # 見た目の調整もかけない
    scene.view_settings.look = "None"
    # 露出も 0（そのまま）にする
    scene.view_settings.exposure = 0.0
    # 形式は Radiance HDR（three.js の HDRLoader / drei の useEnvironment で読める）
    scene.render.image_settings.file_format = "HDR"
    # 書き出し先
    scene.render.filepath = str(OUTPUT_PATH)


def main() -> None:
    # 今のシーン（jewels.blend）
    scene = bpy.context.scene
    # 照明とワールド以外を隠す
    hide_non_studio()
    # パノラマカメラを用意する
    setup_panorama(scene)
    # 出力の設定をする
    setup_output(scene)
    # 書き出し先のフォルダを用意する
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    # 描いて保存する（.blend は保存しないので、ここで変えた設定は元のファイルに残らない）
    bpy.ops.render.render(write_still=True)
    # 保存先を出す
    print(f"ENV_DONE {OUTPUT_PATH}", flush=True)


# このファイルを直接実行したときだけ描く
if __name__ == "__main__":
    # 実行する
    main()
