// 宝石シーンの「ロジック」を集約したモジュール（描画/JSX は GemsScene.tsx 側）。
// 7つの宝石をベルベット床に並べ、環境反射ときらめきで見せる。

import * as THREE from "three";
import { makeStar, makeSoft } from "@/lib/textures";
import type { DragState } from "@/lib/useDragInteraction";
import type { GemParams } from "@/lib/scene";

// GemDef: 宝石1個の定義。切子(cut)またはsphere(球)のどちらかで形を決める。
interface GemDef {
  // 表面の色(16進)
  c: number;
  // 内部の深い色(16進)
  deep: number;
  // [面数, 半径, 冠高, 尖底深さ, テーブル比, オフセット]
  cut?: [number, number, number, number, number, number];
  // 球にする場合の半径(cut の代わり)
  sphere?: number;
  // 各軸のスケール(縦横比の変化)
  sc?: [number, number, number];
  // 床面上の配置(x, z)
  pos: [number, number];
  // Y 軸まわりの初期回転
  rotY: number;
}

// GemInstance: 1宝石ぶんの、ループで更新する参照(本体・マテリアル・反射像・きらめき)。
interface GemInstance {
  // 本体のマテリアル
  mat: THREE.ShaderMaterial | THREE.MeshPhysicalMaterial;
  // 床反射像のマテリアル
  rmat: THREE.ShaderMaterial | THREE.MeshPhysicalMaterial;
  // 切子(shader)なら true、球(physical)なら false
  isShader: boolean;
  // 面のきらめきスプライト
  glints: THREE.Sprite[];
}

// GemsBuilt: buildGems() が返す、ループから更新するオブジェクトと破棄用の環境テクスチャ。
export interface GemsBuilt {
  group: THREE.Group;
  gems: GemInstance[];
  amb: THREE.AmbientLight;
  key1: THREE.SpotLight;
  pmatA: THREE.PointsMaterial;
  pmatB: THREE.PointsMaterial;
  env: THREE.CubeTexture;
  envR: THREE.CubeTexture;
  velvet: THREE.CanvasTexture;
}

// GemsAnim: 回転角と慣性、タップ演出量を持ち越す。
export interface GemsAnim {
  // カメラ高さに影響する上下量
  rotX: number;
  // 宝石群の回転角
  rotY: number;
  // 上下の速度(慣性)
  vx: number;
  // 回転の速度(慣性)
  vy: number;
  // タップ時のきらめき増幅(減衰する)
  burst: number;
}

// mkGemGeo: 多面カットの宝石ジオメトリを手続き的に生成する。
// 下部リング g → 上部リング tR(テーブル)→ 頂点 top と尖底 cul を三角形でつないで宝石らしい面を作る。
function mkGemGeo(
  // 円周の分割数(=面の数)
  n: number,
  // 下部リングの半径
  r: number,
  // 冠(上部)の高さ
  hc: number,
  // 尖底(下部)の深さ
  hp: number,
  // 上部リング半径の下部に対する比
  tableR: number,
  // 上部リングを半ピッチずらすか(0/1)
  off: number,
): THREE.BufferGeometry {
  // 全頂点座標を平坦に積む配列
  const pos: number[] = [];
  // push: 三角形1枚ぶんの3頂点を配列へ追加するヘルパー。
  const push = (a: number[], b: number[], c: number[]) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  // ring: 高さ y に半径 rad の環状に n 個の点を並べる。わずかな乱れ(jr)と上下ゆらぎで手研磨風にする。
  const ring = (rad: number, y: number, o: number): number[][] =>
    Array.from({ length: n }, (_, i) => {
      // この点の角度
      const a = ((i + o) / n) * Math.PI * 2;
      // 半径をわずかに不規則化
      const jr = rad * (1 + Math.sin(i * 37.7 + n) * 0.5 * 0.06);
      // 環上の座標
      return [Math.cos(a) * jr, y + Math.sin(i * 53.1) * 0.02, Math.sin(a) * jr];
    });
  // 下部リング(胴の一番広い部分)
  const g = ring(r, 0, 0);
  // 上部リング(テーブル面の縁)
  const tR = ring(r * tableR, hc, off ? 0.5 : 0);
  // テーブル中心の頂点
  const top = [0, hc, 0];
  // 尖底(パビリオンの先端)
  const cul = [0, -hp, 0];
  // 各区間について、胴の斜面2枚・冠面1枚・尖底面1枚を張る。
  for (let i = 0; i < n; i++) {
    // 次の点(最後は先頭へ戻る)
    const j = (i + 1) % n;
    // 胴の斜面(その1)
    push(g[i], tR[i], g[j]);
    // 胴の斜面(その2)
    push(g[j], tR[i], tR[j]);
    // 冠(テーブルへ向かう面)
    push(tR[i], top, tR[j]);
    // 尖底へ向かう面
    push(g[j], cul, g[i]);
  }
  // 空のジオメトリ
  const geo = new THREE.BufferGeometry();
  // 頂点座標を登録
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  // 面から法線を計算(ライティング用)
  geo.computeVertexNormals();
  // 完成したジオメトリを返す
  return geo;
}

// buildEnvG: 宝石が反射・屈折で映し込むための簡易な環境(色帯)をキューブテクスチャに焼き込む。
// 反射用(refl)と屈折用(refr, RefractionMapping)の2種類を返す。
function buildEnvG(renderer: THREE.WebGLRenderer): {
  refl: THREE.CubeTexture;
  refr: THREE.CubeTexture;
} {
  // 環境専用の小さなシーン
  const es = new THREE.Scene();
  // 全体を包む暗い球(背景色)。
  es.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(40, 24, 16),
      new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x101318 }),
    ),
  );
  // strip: 色付きの光の帯を1枚、指定の位置・大きさ・回転で原点を向けて配置する。
  const strip = (
    c: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    rz: number,
  ) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(sx, sy),
      new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }),
      // 色板
    );
    // 位置を設定
    m.position.set(x, y, z);
    // 原点(宝石側)を向ける
    m.lookAt(0, 0, 0);
    // 追加のひねりを加える
    if (rz) m.rotateZ(rz);
    // 環境シーンへ追加
    es.add(m);
  };
  // 上方の広い寒色帯
  strip(0xcdd2de, -9, 13, 6, 26, 5, 0.5);
  // 暖色の帯
  strip(0xfff3dd, 12, 9, -4, 20, 3.5, -0.4);
  // 青みの帯
  strip(0xdfe8ff, -12, 2, -9, 16, 2.5, 0.9);
  // 下方の白い帯
  strip(0xffffff, 3, -11, 8, 14, 2.0, 0.2);
  // 小さな暖色帯
  strip(0xffe2b8, 10, -3, 10, 8, 1.6, -0.8);
  // 灰色の帯
  strip(0x8a8f9e, -3, 8, -11, 10, 1.2, 0.15);
  // 小さな青帯
  strip(0xcfe0ff, 7, 5, 9, 6, 1.0, -0.5);
  // 反射用キューブの描画先
  const rt = new THREE.WebGLCubeRenderTarget(256);
  // 全方位を撮るキューブカメラ
  const cam = new THREE.CubeCamera(0.1, 100, rt);
  // 環境シーンをキューブへ焼き込む
  cam.update(renderer, es);
  // 屈折用キューブの描画先
  const rt2 = new THREE.WebGLCubeRenderTarget(256);
  // 2つ目のキューブカメラ
  const cam2 = new THREE.CubeCamera(0.1, 100, rt2);
  // もう一度焼き込む
  cam2.update(renderer, es);
  // 屈折用にマッピング方式を変える
  rt2.texture.mapping = THREE.CubeRefractionMapping;
  // 反射・屈折のテクスチャを返す
  return { refl: rt.texture, refr: rt2.texture };
}

// gemShader: 宝石本体のシェーダーマテリアル。環境キューブの反射・屈折(RGB を微妙にずらす分散)と、
// フレネル・内部色・きらめきを合成して、光を閉じ込めた切子面の質感を作る。
function gemShader(
  col: THREE.Color,
  deep: THREE.Color,
  env: THREE.CubeTexture,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    // 半透明
    transparent: true,
    uniforms: {
      // 環境キューブテクスチャ
      uEnv: { value: env },
      // 表面色
      uCol: { value: col.clone() },
      // 内部の深い色
      uDeep: { value: deep.clone() },
      // 全体の明るさ
      uI: { value: 1.0 },
      // きらめき量
      uSpark: { value: 0.6 },
      // 不透明度
      uA: { value: 1.0 },
      // 時間(きらめきのゆらぎ用)
      uTime: { value: 0 },
    },
    // vertexShader: ワールド法線 vN とワールド座標 vW を渡す(反射計算に使う)。
    vertexShader: `varying vec3 vN;varying vec3 vW;void main(){vN=normalize(mat3(modelMatrix)*normal);vW=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.0);}`,
    // fragmentShader: 視線 V と法線 N から反射 R・屈折 T を求め、環境色を拾って合成する。
    fragmentShader: `uniform samplerCube uEnv;uniform vec3 uCol;uniform vec3 uDeep;uniform float uI;uniform float uSpark;uniform float uA;uniform float uTime;
varying vec3 vN;varying vec3 vW;
void main(){
vec3 N=normalize(vN);vec3 V=normalize(cameraPosition-vW);
float facing=clamp(dot(N,V),0.0,1.0);
float fres=pow(1.0-facing,2.5);
vec3 R=reflect(-V,N);
vec3 refl=textureCube(uEnv,R).rgb;
vec3 jit=vec3(sin(uTime*0.7+vW.x*40.0),sin(uTime*0.9+vW.y*40.0),sin(uTime*0.5+vW.z*40.0))*0.015;
vec3 T1=refract(-V,normalize(N+jit),0.68);vec3 T2=refract(-V,normalize(N+jit*1.3),0.63);vec3 T3=refract(-V,normalize(N+jit*1.6),0.58);
vec3 refr=vec3(textureCube(uEnv,T1).r,textureCube(uEnv,T2).g,textureCube(uEnv,T3).b);
vec3 body=mix(uCol,uDeep,pow(1.0-facing,1.2));
vec3 col=body*(0.28+0.50*facing);
col+=uCol*refr*2.0;
col+=refl*(0.22+fres*1.6);
float lum=dot(refr,vec3(0.333));
col+=vec3(1.0,0.98,0.94)*pow(lum,3.0)*(0.7+uSpark*1.8);
gl_FragColor=vec4(col*uI,uA);}`,
  });
}

// GEM_DEFS: 7つの宝石(ルビー〜アンバー)の定義。最後の1つだけ球(アンバー)。
const GEM_DEFS: GemDef[] = [
  {
    c: 0xb50d3a,
    deep: 0x3a000e,
    cut: [12, 0.82, 0.24, 0.58, 0.62, 1],
    sc: [1.05, 1, 1.0],
    pos: [-0.15, 0.15],
    rotY: 0.4,
    // ルビー
  },
  {
    c: 0x0f52ba,
    deep: 0x03163e,
    cut: [14, 0.62, 0.2, 0.48, 0.62, 1],
    sc: [1, 1, 1],
    pos: [1.25, -0.5],
    rotY: 1.8,
    // サファイア
  },
  {
    c: 0x11a15a,
    deep: 0x02351c,
    cut: [8, 0.56, 0.26, 0.44, 0.72, 0],
    sc: [1.4, 1.05, 0.95],
    pos: [-1.75, -0.4],
    rotY: 0.55,
    // エメラルド
  },
  {
    c: 0xf5a81c,
    deep: 0x6e3e00,
    cut: [12, 0.68, 0.22, 0.5, 0.6, 1],
    sc: [1.15, 0.95, 1],
    pos: [1.6, 0.85],
    rotY: 2.6,
    // シトリン
  },
  {
    c: 0x1b3fe8,
    deep: 0x060e52,
    cut: [10, 0.54, 0.24, 0.5, 0.58, 1],
    sc: [1, 1.05, 1],
    pos: [0.35, -1.35],
    rotY: 0.9,
    // 青
  },
  {
    c: 0x7a3bb8,
    deep: 0x1e0640,
    cut: [10, 0.56, 0.3, 0.46, 0.55, 1],
    sc: [1, 1.05, 1],
    pos: [-1.35, -1.5],
    rotY: 0.5,
    // アメジスト
  },
  // アンバー(球)
  { c: 0xc9660a, deep: 0x4e2400, sphere: 0.48, pos: [-1.5, 1.15], rotY: 0.7 },
];

// buildGems: 宝石・床・ライト・きらめきを初回に一度だけ構築する。renderer は環境キューブの焼き込みに使う。
export function buildGems(gl: THREE.WebGLRenderer): GemsBuilt {
  // group: 回転させる宝石群と床・パーティクルをまとめる入れ物。
  const group = new THREE.Group();

  // 環境キューブ(反射・屈折)を焼き込み、切子シェーダーが参照する反射テクスチャを得る。
  const envs = buildEnvG(gl);
  // 反射用キューブ
  const env = envs.refl;

  // ライト構成: 環境光+スポット(キー)+複数の補助ライトで宝石を輝かせる。
  // 環境光
  const amb = new THREE.AmbientLight(0xfff2e6, 0.3);
  group.add(amb);

  // 主役のスポットライト
  const key1 = new THREE.SpotLight(0xffeecf, 2.7, 0, 0.55, 0.65, 1.2);
  // 右上から照らす
  key1.position.set(4.5, 7.5, 5);
  group.add(key1);
  // スポットの狙点(既定で原点)
  group.add(key1.target);

  // 寒色の補助光
  const fill = new THREE.PointLight(0xbfd8ff, 1.0, 0);
  fill.position.set(-6, 3, -4);
  group.add(fill);

  // 手前下からの暖色光
  const low = new THREE.PointLight(0xffc890, 0.9, 14, 2);
  low.position.set(0, 0.5, 3.2);
  group.add(low);

  // 白のアクセント光
  const acc1 = new THREE.PointLight(0xffffff, 0.8, 10, 2);
  acc1.position.set(-2, 2.5, 2.5);
  group.add(acc1);

  // 青のアクセント光
  const acc2 = new THREE.PointLight(0xd8e6ff, 0.6, 12, 2);
  acc2.position.set(2.5, 1.8, -2.5);
  group.add(acc2);

  // 紫のごく弱い床光
  const low2 = new THREE.PointLight(0x8f7bff, 0.15, 10, 2);
  low2.position.set(-2.5, 0.6, 2.5);
  group.add(low2);

  // 床: 中央がわずかに沈み、外周が起伏する円盤状の平面を作る。
  // 大きな分割平面
  const gndGeo = new THREE.PlaneGeometry(44, 44, 80, 80);
  // 水平に倒す
  gndGeo.rotateX(-Math.PI / 2);
  // 頂点位置属性
  const gpa = gndGeo.attributes.position;
  for (let i = 0; i < gpa.count; i++) {
    // 頂点の X
    const x = gpa.getX(i);
    // 頂点の Z
    const z = gpa.getZ(i);
    // 中心からの距離
    const rr = Math.hypot(x, z);
    const n =
      Math.sin(x * 1.7) * Math.cos(z * 2.1) +
      Math.sin(x * 3.9 + 1.0) * 0.5 +
      // 起伏ノイズ
      Math.cos(z * 5.3) * 0.35;
    // 外周ほど起伏を強めて高さを設定
    gpa.setY(i, n * 0.05 * Math.min(1, Math.max(0, (rr - 2.8) / 4)) - 0.02);
  }
  // 起伏に合わせて法線を再計算
  gndGeo.computeVertexNormals();

  // ベルベット風の放射状グラデーションテクスチャを作る。
  // 一時 canvas
  const vc = document.createElement("canvas");
  // 512角
  vc.width = vc.height = 512;
  // 2D コンテキスト
  const vx = vc.getContext("2d")!;
  // 中央やや下から広がるグラデ
  const vg = vx.createRadialGradient(256, 300, 30, 256, 256, 300);
  // 中心は明るめの紫黒
  vg.addColorStop(0, "#17111f");
  // 中間は暗い紫
  vg.addColorStop(0.45, "#0a0812");
  // 外周はほぼ黒
  vg.addColorStop(1, "#030304");
  // 塗りに設定
  vx.fillStyle = vg;
  // 全面を塗る
  vx.fillRect(0, 0, 512, 512);
  // テクスチャ化
  const velvet = new THREE.CanvasTexture(vc);

  const gnd = new THREE.Mesh(
    gndGeo,
    new THREE.MeshStandardMaterial({
      map: velvet,
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.05,
      transparent: true,
      opacity: 0.85,
    }),
    // 床メッシュ
  );
  group.add(gnd);

  // 床の上を漂う暖色の細かな塵(点群)。
  // 塵の数
  const fn = 90;
  // 位置バッファ
  const fp = new Float32Array(fn * 3);
  for (let i = 0; i < fn; i++) {
    // 中心からの距離
    const rr = 1.2 + Math.random() * 7;
    // 角度
    const ang = Math.random() * 6.283;
    // X
    fp[i * 3] = Math.cos(ang) * rr;
    // 床すれすれの高さ
    fp[i * 3 + 1] = 0.03;
    // Z
    fp[i * 3 + 2] = Math.sin(ang) * rr;
  }
  // 塵のジオメトリ
  const fgg = new THREE.BufferGeometry();
  // 位置を登録
  fgg.setAttribute("position", new THREE.BufferAttribute(fp, 3));
  group.add(
    new THREE.Points(
      fgg,
      new THREE.PointsMaterial({
        size: 0.05,
        color: 0xffc86e,
        transparent: true,
        opacity: 0.8,
        map: makeStar(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
    // 塵の点群
  );

  // 背景の柔らかい紫の光だまり(奥に浮かべる)。
  const back = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeSoft(),
      color: 0x2c2240,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  // 奥・上に配置
  back.position.set(0.5, 2.2, -5.5);
  // 大きく広げる
  back.scale.set(22, 13, 1);
  group.add(back);

  // 各宝石を生成して配置する。
  // ループ更新用の配列
  const gems: GemInstance[] = [];
  // きらめきスプライト共通テクスチャ
  const glintTex = makeStar();
  GEM_DEFS.forEach((d) => {
    // 表面色
    const col = new THREE.Color(d.c);
    // 内部色
    const deep = new THREE.Color(d.deep);
    const geo = d.sphere
      ? new THREE.SphereGeometry(d.sphere, 28, 20)
      : // 球 or 切子
        mkGemGeo(...(d.cut as [number, number, number, number, number, number]));
    // 縦横比を調整
    if (d.sc) geo.scale(d.sc[0], d.sc[1], d.sc[2]);
    // 切子はシェーダー、球は物理マテリアル
    const isShader = !d.sphere;
    // 本体マテリアル: 切子は自作 gemShader、球は反射する物理マテリアル。
    let mat: THREE.ShaderMaterial | THREE.MeshPhysicalMaterial;
    if (isShader) mat = gemShader(col, deep, env);
    else
      mat = new THREE.MeshPhysicalMaterial({
        color: col.clone().multiplyScalar(0.8),
        metalness: 0.0,
        roughness: 0.06,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        envMap: env,
        envMapIntensity: 1.1,
        transparent: true,
        opacity: 0.85,
        emissive: col.clone(),
        emissiveIntensity: 0.08,
        reflectivity: 1.0,
      });
    // 本体メッシュ
    const mesh = new THREE.Mesh(geo, mat);
    // 反射像より手前に描く
    mesh.renderOrder = 2;
    // 個別の配置グループ
    const grp = new THREE.Group();
    grp.add(mesh);
    // 床からの持ち上げ高さ
    const y = d.sphere ? d.sphere * 0.92 : (d.cut as number[])[3] * 0.55;
    // 床面上の位置
    grp.position.set(d.pos[0], y, d.pos[1]);
    // 初期回転
    grp.rotation.y = d.rotY;
    group.add(grp);

    // 床反射像: 同じ形を上下反転し、薄く描いて床への映り込みを作る。
    // 切子は新しくシェーダーを作る(render target を含む uniform は clone できず警告になるため)。球は複製で十分。
    const rmat: THREE.ShaderMaterial | THREE.MeshPhysicalMaterial = isShader
      ? gemShader(col, deep, env)
      : (mat.clone() as THREE.MeshPhysicalMaterial);
    if (isShader) {
      // 反射像は薄く
      (rmat as THREE.ShaderMaterial).uniforms.uA.value = 0.2;
    } else {
      // 球の反射像も薄く
      (rmat as THREE.MeshPhysicalMaterial).opacity = 0.16;
    }
    // 反射像メッシュ(ジオメトリは共有)
    const rmesh = new THREE.Mesh(geo, rmat);
    // 本体より奥に描く
    rmesh.renderOrder = 1;
    // 反射像の配置グループ
    const rgrp = new THREE.Group();
    rgrp.add(rmesh);
    // 床の下側へ配置
    rgrp.position.set(d.pos[0], -y + 0.01, d.pos[1]);
    // 本体と同じ向き
    rgrp.rotation.y = d.rotY;
    // 上下反転して鏡像にする
    rgrp.scale.y = -1;
    group.add(rgrp);

    // 面のきらめき: 宝石の周囲に小さな加算スプライトを2つ、点滅させて配置する。
    const glints: THREE.Sprite[] = [];
    for (let gi = 0; gi < 2; gi++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glintTex,
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
        }),
        // きらめきスプライト
      );
      // 配置角度
      const a = Math.random() * 6.283;
      // 宝石半径に応じた配置半径
      const rrad = (d.sphere ? d.sphere : (d.cut as number[])[1]) * 0.55;
      sp.position.set(
        d.pos[0] + Math.cos(a) * rrad,
        y + (d.sphere ? d.sphere : (d.cut as number[])[2]) * 0.75,
        d.pos[1] + Math.sin(a) * rrad,
        // 宝石の上面付近に置く
      );
      // きらめきの大きさ
      sp.scale.set(0.34, 0.34, 1);
      // 点滅の周波数と位相
      sp.userData = { f: 0.5 + Math.random() * 0.8, p: Math.random() * 6.283 };
      group.add(sp);
      glints.push(sp);
    }
    // ループ更新用に登録
    gems.push({ mat, rmat, isShader, glints });
  });

  // mkSparkles: 空中を舞う色付きの微粒子群を作り、そのマテリアルを返す(明滅を後で制御)。
  const mkSparkles = (n: number, seedC: number[]): THREE.PointsMaterial => {
    // 微粒子ジオメトリ
    const pg = new THREE.BufferGeometry();
    // 位置
    const pp = new Float32Array(n * 3);
    // 色
    const pc = new Float32Array(n * 3);
    // 色候補
    const tints = seedC.map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      // 中心からの距離
      const rr = 1.6 + Math.random() * 2.6;
      // 角度
      const th = Math.random() * Math.PI * 2;
      // X
      pp[i * 3] = Math.cos(th) * rr;
      // 高さ
      pp[i * 3 + 1] = 0.15 + Math.random() * 1.8;
      // Z(奥行きは浅めに)
      pp[i * 3 + 2] = Math.sin(th) * rr * 0.5;
      // 色を選ぶ
      const c = tints[Math.floor(Math.random() * tints.length)];
      // R
      pc[i * 3] = c.r;
      // G
      pc[i * 3 + 1] = c.g;
      // B
      pc[i * 3 + 2] = c.b;
    }
    // 位置を登録
    pg.setAttribute("position", new THREE.BufferAttribute(pp, 3));
    // 色を登録
    pg.setAttribute("color", new THREE.BufferAttribute(pc, 3));
    const pm = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      sizeAttenuation: true,
      map: makeStar(),
      blending: THREE.AdditiveBlending,
      // 微粒子マテリアル
    });
    // 点群として追加
    group.add(new THREE.Points(pg, pm));
    // 明滅制御用にマテリアルを返す
    return pm;
  };
  // 白〜淡いピンク/水色の微粒子
  const pmatA = mkSparkles(120, [0xffffff, 0xffe8f5, 0xe8f6ff]);
  // 紫/青/暖色の微粒子
  const pmatB = mkSparkles(90, [0xe8b4ff, 0x9fe8ff, 0xfff2c8]);

  // 返り値: ループから更新するオブジェクトと、破棄用の環境テクスチャ。
  return { group, gems, amb, key1, pmatA, pmatB, env, envR: envs.refr, velvet };
}

// createGemsAnim: 回転角・慣性・タップ演出量の初期状態を作る。
export function createGemsAnim(): GemsAnim {
  return { rotX: 0, rotY: 0, vx: 0, vy: 0, burst: 0 };
}

// updateGems: 毎フレームの更新(元コードの tick の gem 分岐に相当)。
// camera は R3F が用意した現在のカメラ。宝石群の中心を見下ろす高さを毎フレーム変える。
export function updateGems(
  // 構築済みオブジェクト
  b: GemsBuilt,
  // 可変状態
  a: GemsAnim,
  // ポインタ操作の生データ
  drag: DragState,
  // 現在のスライダー値
  p: GemParams,
  // 経過秒数
  time: number,
  // 現在のカメラ
  camera: THREE.Camera,
): void {
  // タップされていたらきらめきを最大にし、フラグを消費する。
  if (drag.tap) {
    a.burst = 1;
    drag.tap = false;
  }
  // ドラッグ量を回転速度へ加え、消費する(太陽と同じ感度)。
  // 横ドラッグ→回転
  a.vy += drag.mx * 0.0022;
  // 縦ドラッグ→上下(カメラ高さ)
  a.vx += drag.my * 0.0017;
  // 消費
  drag.mx = 0;
  // 消費
  drag.my = 0;

  // きらめき増幅を減衰させる。
  a.burst *= 0.955;
  // 十分小さくなったら0に
  if (a.burst < 0.001) a.burst = 0;

  // 回転を慣性込みで更新。ドラッグ中でなければゆっくり止まっていく。
  // 回転に速度を加える
  a.rotY += a.vy;
  // 慣性減衰
  a.vy *= 0.93;
  // 放したら自然に停止へ向かう
  if (!drag.drag) a.rotY *= 0.985;
  // 上下量に速度を加える
  a.rotX += a.vx;
  // 慣性減衰
  a.vx *= 0.93;
  // 上下の範囲制限
  a.rotX = Math.max(-0.12, Math.min(0.7, a.rotX));
  // 宝石群を回転
  b.group.rotation.y = a.rotY;
  // カメラ高さを上下量で変え、常に宝石群の中心を見る。
  camera.position.set(0, 2.7 + a.rotX * 2.0, 5.6);
  camera.lookAt(0, 0.25, 0);

  // ライト強度をパラメータとタップで調整する。
  // 環境光
  b.amb.intensity = 0.18 + p.amb * 0.32;
  // スポット
  b.key1.intensity = 1.4 + p.amb * 1.0 + a.burst * 2.0;
  // 球宝石の映り込み強度
  const emi = 0.6 + p.amb * 0.4 + p.spark * 0.25 + a.burst * 0.8;

  // 各宝石のマテリアルと反射像、きらめきスプライトを更新する。
  for (const g of b.gems) {
    if (g.isShader) {
      // 切子の明るさ
      const gi = 0.7 + p.amb * 0.4 + a.burst * 0.55;
      // 本体シェーダー
      const mat = g.mat as THREE.ShaderMaterial;
      // 反射像シェーダー
      const rmat = g.rmat as THREE.ShaderMaterial;
      // 明るさ
      mat.uniforms.uI.value = gi;
      // きらめき
      mat.uniforms.uSpark.value = p.spark + a.burst;
      // 時間
      mat.uniforms.uTime.value = time;
      // 反射像は控えめに
      rmat.uniforms.uI.value = gi * 0.8;
      // 反射像のきらめきも控えめ
      rmat.uniforms.uSpark.value = p.spark * 0.5;
      // 時間
      rmat.uniforms.uTime.value = time;
    } else {
      // 球の物理マテリアル
      const mat = g.mat as THREE.MeshPhysicalMaterial;
      // 映り込みの強さ
      mat.envMapIntensity = emi;
      // わずかな自発光
      mat.emissiveIntensity = 0.04 + p.amb * 0.04 + p.spark * 0.06 + a.burst * 0.3;
    }
    // 面のきらめきスプライトを、位相のずれた鋭いパルスで点滅させる。
    for (const sp of g.glints) {
      // 周波数と位相
      const u = sp.userData as { f: number; p: number };
      // 0以上のサイン波
      const w = Math.max(0, Math.sin(time * u.f + u.p));
      // 鋭い閃光にして明るさを掛ける
      sp.material.opacity = Math.pow(w, 14) * (0.25 + p.spark * 0.75) * (0.5 + p.amb * 0.35);
    }
  }

  // 空中の微粒子2群を、位相をずらして明滅させ、大きさもきらめき量で変える。
  // A群の明滅
  b.pmatA.opacity = (0.12 + p.spark * 0.5) * (0.65 + 0.35 * Math.sin(time * 3.1)) + a.burst * 0.3;
  b.pmatB.opacity =
    // B群の明滅
    (0.1 + p.spark * 0.45) * (0.65 + 0.35 * Math.sin(time * 2.3 + 2.0)) + a.burst * 0.3;
  // A群の大きさ
  b.pmatA.size = 0.05 + p.spark * 0.05;
  // B群の大きさ
  b.pmatB.size = 0.04 + p.spark * 0.05;
}

// disposeGems: アンマウント時に GPU リソースを解放する。
export function disposeGems(b: GemsBuilt): void {
  b.group.traverse((obj) => {
    // Mesh とみなす
    const mesh = obj as THREE.Mesh;
    // ジオメトリ解放
    mesh.geometry?.dispose();
    // マテリアル
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat))
      // 配列なら全解放
      mat.forEach((m) => m.dispose());
    // 単体なら解放
    else mat?.dispose();
  });
  // 反射キューブ解放
  b.env.dispose();
  // 屈折キューブ解放
  b.envR.dispose();
  // ベルベットテクスチャ解放
  b.velvet.dispose();
}
