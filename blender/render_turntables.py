# render_turntables.py: 12 個の誕生石それぞれを、カメラが一周しながら撮った連番画像（ターンテーブル）として Cycles で描く。
# Web の詳細パネルでは、この連番をドラッグでめくって「写真の石を回す」体験にする。
# build_jewels.py が保存した blender/jewels.blend を開いて、ヘッドレスで実行する:
#
#   blender.exe --background blender/jewels.blend --python blender/render_turntables.py -- [オプション]
#
# オプション:
#   --frames N       1 周の枚数（既定 48 枚 = 7.5° ずつ）
#   --size PX        画像の一辺（既定 640 px）
#   --samples S      1 画素あたりのサンプル数（省略時は .blend の設定 = 160。パールだけは SAMPLES_OVERRIDE の値）
#   --only ID ...    指定した石だけ描く（例: --only diamond ruby）
#   --preview PATH   全石の 1 枚目だけを小さく描き、4 列 × 3 行の一覧画像（PNG）を PATH に保存する（見た目の調整用）

import argparse
import json
import math
import sys
import time
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

# REPO: リポジトリのルート（このファイルは <REPO>/blender/render_turntables.py にある）
REPO = Path(__file__).resolve().parents[1]
# STONES_JSON: 誕生石のデータ。描く順番と id に使う
STONES_JSON = REPO / "lib" / "birthstones.json"
# OUTPUT_DIR: 連番画像の書き出し先。<OUTPUT_DIR>/<石の id>/00.webp 〜 のように並ぶ
OUTPUT_DIR = REPO / "public" / "jewels" / "turntable"

# CAMERA_LENS_MM: ターンテーブルのカメラのレンズ（mm）。望遠寄りにして、形のゆがみ（パース）を抑える
CAMERA_LENS_MM = 100.0
# CAMERA_ELEVATION_DEG: カメラの仰角（°）。テーブル面（上の平らな面）と、斜めの切子面の両方が見える高さ
CAMERA_ELEVATION_DEG = 35.0
# CAMERA_START_AZIMUTH_DEG: 1 枚目のカメラの方位角（°）。180° は手前（時計の 6 時側）から見る位置
CAMERA_START_AZIMUTH_DEG = 180.0
# FRAME_FILL: 石を包む球が、画面の高さのどれだけを占めるか（0〜1）。大きいほど石が大きく写る
FRAME_FILL = 0.86
# SAMPLES_OVERRIDE: 石ごとのサンプル数の上書き。パールは表面下散乱（光が少し中に入って散る表現）が重いが、
# 表面がなめらかでノイズが出にくいので、少ないサンプルでも十分きれいに描ける
SAMPLES_OVERRIDE = {"pearl": 64}
# WEBP_QUALITY: WebP の画質（0〜100）。上げるほどきれいでファイルが大きくなる
WEBP_QUALITY = 88
# PREVIEW_SIZE: 一覧画像での 1 石ぶんの大きさ（px）
PREVIEW_SIZE = 256
# PREVIEW_SAMPLES: 一覧画像を描くときのサンプル数（速さ優先）
PREVIEW_SAMPLES = 48
# PREVIEW_COLUMNS: 一覧画像の列数（12 石を 4 列 × 3 行に並べる）
PREVIEW_COLUMNS = 4
# PREVIEW_BACKGROUND: 一覧画像の背景色（sRGB の 0〜1）。透明な部分がわかるよう、サイトに近い暗い色にする
PREVIEW_BACKGROUND = (0.03, 0.035, 0.05)


def parse_args() -> argparse.Namespace:
    # Blender 自身の引数と分けるため、"--" より後ろだけを読む
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    # 引数の定義
    parser = argparse.ArgumentParser(prog="render_turntables")
    # 1 周の枚数
    parser.add_argument("--frames", type=int, default=48)
    # 画像の一辺
    parser.add_argument("--size", type=int, default=640)
    # サンプル数（省略時は .blend の設定を使う）
    parser.add_argument("--samples", type=int, default=None)
    # 描く石の id（省略時はすべて）
    parser.add_argument("--only", nargs="*", default=None)
    # 一覧画像の保存先（指定したときはプレビューだけを描く）
    parser.add_argument("--preview", type=str, default=None)
    # 読んだ引数を返す
    return parser.parse_args(argv)


def load_stone_ids() -> list[str]:
    # データの順番（1 月〜12 月）で石の id を返す
    with STONES_JSON.open(encoding="utf-8") as f:
        # JSON を読み、id だけを取り出す
        return [stone["id"] for stone in json.load(f)]


def bounding_sphere(ob: bpy.types.Object) -> tuple[Vector, float]:
    # 石の形を包む球（中心と半径）を、メッシュの頂点（オブジェクト自身の座標系）から求める
    points = [v.co for v in ob.data.vertices]
    # 各軸の最小値
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    # 各軸の最大値
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    # 箱の中心を球の中心にする
    center = (lo + hi) / 2
    # 中心からいちばん遠い頂点までの距離を半径にする
    radius = max((p - center).length for p in points)
    # 中心と半径を返す
    return center, radius


def orbit_position(azimuth_deg: float, elevation_deg: float, distance: float) -> Vector:
    # 方位角（+Y から時計回り）・仰角・距離から、原点まわりのカメラ位置を求める（build_jewels.py の spherical と同じ向き）
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    # 水平方向の距離
    flat = distance * math.cos(el)
    # x（右）, y（奥）, z（上）の位置を返す
    return Vector((flat * math.sin(az), flat * math.cos(az), distance * math.sin(el)))


def aim_camera(cam: bpy.types.Object, location: Vector) -> None:
    # カメラを指定の位置に置き、原点（石の中心）を向ける
    cam.location = location
    # カメラの -Z（撮影する向き）を原点へ、+Y（画面の上）をなるべく上に向ける
    cam.rotation_euler = (Vector((0.0, 0.0, 0.0)) - location).to_track_quat("-Z", "Y").to_euler()


def isolate(stone: bpy.types.Object, stones: list[bpy.types.Object]) -> tuple[Vector, float]:
    # 1 個だけを描くために、他の石を隠し、この石の中心を原点へ移す。戻り値は石を包む球の半径と、元の位置
    for other in stones:
        # この石以外はレンダリングに写さない
        other.hide_render = other is not stone
    # 石を包む球
    center, radius = bounding_sphere(stone)
    # 元の位置を覚えておく（描き終えたら戻す）
    original = stone.location.copy()
    # 向きをそろえる（確認用の配置で付けた回転を外す）
    stone.rotation_euler = (0.0, 0.0, 0.0)
    # 球の中心が原点に来るように動かす
    stone.location = -center
    # 元の位置と半径を返す
    return original, radius


def camera_distance(radius: float, lens_mm: float, sensor_mm: float) -> float:
    # 石を包む球が画面の FRAME_FILL ぶんを占める距離を、レンズの画角から求める
    half_fov = math.atan(sensor_mm / 2 / lens_mm)
    # 球が画角にちょうど収まる距離を、FRAME_FILL で割って少し引く
    return radius / math.sin(half_fov) / FRAME_FILL


def render_to(scene: bpy.types.Scene, path: Path) -> None:
    # 今の設定で 1 枚描いて、指定のパスに保存する
    path.parent.mkdir(parents=True, exist_ok=True)
    # 保存先を設定する
    scene.render.filepath = str(path)
    # 描いて保存する
    bpy.ops.render.render(write_still=True)


def setup_output(scene: bpy.types.Scene, size: int, samples: int | None) -> None:
    # 画像の大きさ・形式・サンプル数を設定する
    scene.render.resolution_x = size
    # 正方形にする
    scene.render.resolution_y = size
    # 解像度をそのまま使う
    scene.render.resolution_percentage = 100
    # 背景は透明（詳細パネルの上に石だけを重ねる）
    scene.render.film_transparent = True
    # 形式は WebP（写真向けの圧縮で、透明も扱える）
    scene.render.image_settings.file_format = "WEBP"
    # 透明度（アルファ）付きで保存する
    scene.render.image_settings.color_mode = "RGBA"
    # 画質
    scene.render.image_settings.quality = WEBP_QUALITY
    # サンプル数の指定があれば上書きする
    if samples is not None:
        # 1 画素あたりのサンプル数
        scene.cycles.samples = samples


def render_turntable(scene: bpy.types.Scene, cam: bpy.types.Object, stone: bpy.types.Object, stones: list[bpy.types.Object], frames: int) -> None:
    # 1 個の石について、カメラを 1 周させながら frames 枚を描く
    original, radius = isolate(stone, stones)
    # 石が画面に収まるカメラの距離
    distance = camera_distance(radius, cam.data.lens, cam.data.sensor_width)
    # 石ごとの書き出し先フォルダ
    folder = OUTPUT_DIR / stone.name
    # 1 枚ずつ描く
    for frame in range(frames):
        # 描き始めた時刻（進み具合の表示用）
        started = time.time()
        # この枚のカメラの方位角
        azimuth = CAMERA_START_AZIMUTH_DEG + 360.0 * frame / frames
        # カメラを置いて石の中心へ向ける
        aim_camera(cam, orbit_position(azimuth, CAMERA_ELEVATION_DEG, distance))
        # 00.webp, 01.webp, ... の名前で保存する（Web 側はこの名前で読み込む）
        render_to(scene, folder / f"{frame:02d}.webp")
        # 進み具合を出す（ログを見て残り時間を見積もれるように、すぐに書き出す）
        print(f"TURNTABLE {stone.name} {frame + 1}/{frames} {time.time() - started:.1f}s", flush=True)
    # 石を元の位置に戻す
    stone.location = original


def render_preview(scene: bpy.types.Scene, cam: bpy.types.Object, stones: list[bpy.types.Object], sheet_path: Path) -> None:
    # 全石の 1 枚目を小さく描き、4 列 × 3 行の一覧画像にまとめる（色や照明の調整を素早く見比べるため）
    setup_output(scene, PREVIEW_SIZE, PREVIEW_SAMPLES)
    # 一時的に描いた 1 枚ずつの画像の置き場所
    tile_dir = sheet_path.parent / "preview_tiles"
    # 行数（12 石を列数で割って切り上げる）
    rows = math.ceil(len(stones) / PREVIEW_COLUMNS)
    # 一覧画像の画素（高さ × 幅 × RGBA）。背景色で塗っておく
    sheet = np.ones((rows * PREVIEW_SIZE, PREVIEW_COLUMNS * PREVIEW_SIZE, 4), dtype=np.float32)
    # 背景色を入れる
    sheet[:, :, :3] = PREVIEW_BACKGROUND
    # 1 石ずつ描いて並べる
    for index, stone in enumerate(stones):
        # 他の石を隠して中心を原点へ
        original, radius = isolate(stone, stones)
        # カメラを 1 枚目の位置に置く
        aim_camera(cam, orbit_position(CAMERA_START_AZIMUTH_DEG, CAMERA_ELEVATION_DEG, camera_distance(radius, cam.data.lens, cam.data.sensor_width)))
        # 1 枚描く
        tile_path = tile_dir / f"{stone.name}.webp"
        # 保存する
        render_to(scene, tile_path)
        # 描いた画像を読み込む
        tile = bpy.data.images.load(str(tile_path), check_existing=False)
        # 画素を配列にする（Blender の画像は下の行から並んでいる）
        pixels = np.array(tile.pixels[:], dtype=np.float32).reshape(PREVIEW_SIZE, PREVIEW_SIZE, 4)
        # 読み込んだ画像を消す（一覧に写したら不要）
        bpy.data.images.remove(tile)
        # 置く列
        col = index % PREVIEW_COLUMNS
        # 置く行（画像の下から数えるので、上の行から並ぶよう反転する）
        row = rows - 1 - index // PREVIEW_COLUMNS
        # 透明度
        alpha = pixels[:, :, 3:4]
        # 置く範囲
        target = sheet[row * PREVIEW_SIZE : (row + 1) * PREVIEW_SIZE, col * PREVIEW_SIZE : (col + 1) * PREVIEW_SIZE, :3]
        # 背景の上に、透明度に応じて重ねる
        target[:] = pixels[:, :, :3] * alpha + target * (1 - alpha)
        # 石を元の位置に戻す
        stone.location = original
        # 進み具合を出す
        print(f"PREVIEW {stone.name} done", flush=True)
    # 一覧画像を Blender の画像として作る
    image = bpy.data.images.new("jewels_preview", width=PREVIEW_COLUMNS * PREVIEW_SIZE, height=rows * PREVIEW_SIZE, alpha=True)
    # 画素を書き込む
    image.pixels = sheet.ravel()
    # PNG として保存する
    image.filepath_raw = str(sheet_path)
    # 形式を指定する
    image.file_format = "PNG"
    # 保存する
    image.save()
    # 保存先を出す
    print(f"PREVIEW_SHEET {sheet_path}", flush=True)


def main() -> None:
    # 引数を読む
    args = parse_args()
    # 今のシーン（jewels.blend）
    scene = bpy.context.scene
    # データの順番の石の id
    ids = load_stone_ids()
    # シーンの中の石のオブジェクト（データの順番にそろえる）
    stones = [bpy.data.objects[stone_id] for stone_id in ids]
    # ターンテーブル用のカメラ
    cam = bpy.data.objects["JWL_Camera"]
    # 望遠寄りのレンズにする
    cam.data.lens = CAMERA_LENS_MM
    # 確認用の床は写さない（念のため）
    bpy.data.objects["Preview_Floor"].hide_render = True
    # プレビューの指定があれば一覧画像だけを描いて終わる
    if args.preview:
        # 一覧画像を描く
        render_preview(scene, cam, stones, Path(args.preview))
        # 終わり
        return
    # 画像の大きさと形式を設定する
    setup_output(scene, args.size, args.samples)
    # 描く石（--only の指定があればそれだけ）
    targets = [ob for ob in stones if args.only is None or ob.name in args.only]
    # 石ごとの上書きが無いときに使うサンプル数（.blend の設定か --samples の値）
    base_samples = scene.cycles.samples
    # 石ごとに 1 周ぶん描く
    for stone in targets:
        # この石のサンプル数（上書きがあればそれを使う）
        scene.cycles.samples = SAMPLES_OVERRIDE.get(stone.name, base_samples)
        # 1 個ぶん描く
        render_turntable(scene, cam, stone, stones, args.frames)
    # すべて終わったことを出す
    print("TURNTABLE_DONE", flush=True)


# このファイルを直接実行したときだけ描く
if __name__ == "__main__":
    # 実行する
    main()
