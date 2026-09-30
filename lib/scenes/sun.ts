// 太陽シーンの「ロジック」を集約したモジュール（描画/JSX は SunScene.tsx 側）。
// - buildSun(): メッシュ・マテリアル・バッファ等を一度だけ組み立てる。
// - createSunAnim(): フレーム間で持ち越す可変状態を作る。
// - updateSun(): 毎フレームの更新（回転・炎の再計算・uniform 反映）。
// - disposeSun(): GPU リソースの解放。
// React には依存しないので、単体でのテストや流用がしやすい。

import * as THREE from "three";
import type { SunParams } from "@/lib/scene";
import { NOISE } from "@/lib/shaders";
import { makeGlow, makeStar } from "@/lib/textures";
import type { DragState } from "@/lib/useDragInteraction";

// Vec3: 3成分の数値配列を表す型エイリアス(方向ベクトルや座標に使う)。
type Vec3 = [number, number, number];

// Strand: プロミネンス(太陽表面から噴き上がる炎)1本ぶんの寿命・形状パラメータ。
interface Strand {
  // 根本の方向(単位ベクトル)
  a: Vec3;
  // 先端側の方向(単位ベクトル)。a→b で炎が傾く
  b: Vec3;
  // a に直交する軸1(横揺れ wob に使う従法線)
  bit: Vec3;
  // a に直交する軸2(横揺れ sway に使う接線)
  tang: Vec3;
  // 炎の高さ倍率
  h: number;
  // 炎の太さ倍率
  wid: number;
  // 揺れの速さ倍率
  wig: number;
  // 縦方向の凹凸の周波数
  lf: number;
  // 縦方向の凹凸の位相
  lp: number;
  // 個体差を出す乱数シード
  seed: number;
  // 出現し始める時刻(秒)
  tStart: number;
  // 消え終わる時刻(秒)
  tEnd: number;
  // 寿命(秒)
  dur: number;
}

// SunBuilt: buildSun() が返す、ループから参照する構築済みオブジェクト一式。
export interface SunBuilt {
  group: THREE.Group;
  halo: THREE.Mesh;
  sunMat: THREE.ShaderMaterial;
  haloMat: THREE.ShaderMaterial;
  flameMat: THREE.ShaderMaterial;
  flameGeo: THREE.BufferGeometry;
  SEG: number;
  glow: THREE.Sprite;
  stars: THREE.Points;
  pmat: THREE.PointsMaterial;
}

// SunAnim: 慣性回転や炎の再利用など、フレーム間で持ち越す可変状態。
export interface SunAnim {
  // X 軸(上下)の回転角
  rotX: number;
  // Y 軸(左右)の回転角
  rotY: number;
  // X 回転の速度(慣性)
  vx: number;
  // Y 回転の速度(慣性)
  vy: number;
  // クリック時のフレア演出量(減衰する)
  burst: number;
  // 各炎の現在のパラメータ
  strands: Array<Strand | null>;
  // 炎の芯線 X の一時バッファ
  tx: Float32Array;
  // 炎の芯線 Y の一時バッファ
  ty: Float32Array;
  // 炎の芯線 Z の一時バッファ
  tz: Float32Array;
}

// sunMaterial: 太陽球の表面を描くシェーダーマテリアルを生成する。
// ノイズで対流粒(granule)・活動領域・黒点(umbra/penumbra)・周縁減光(limb darkening)を表現し、
// 最後に Tonemap(ACES 近似)で明部を圧縮して白飛びを抑える。
function sunMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    // uniforms: JS 側から毎フレーム渡す値。uTime=時間, uBright=明るさ, uFlare=活動度, uCorona=周縁の炎の強さ。
    uniforms: {
      uTime: { value: 0 },
      uBright: { value: 1.2 },
      uFlare: { value: 0.6 },
      uCorona: { value: 0.8 },
    },
    // vertexShader: 頂点位置・法線・視線ベクトルをフラグメントシェーダーへ渡す。
    vertexShader: `varying vec3 vPos;varying vec3 vN;varying vec3 vV;void main(){vPos=position;vec4 mv=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
    // fragmentShader: 表面の各ピクセル色を計算する。冒頭に共有ノイズ(NOISE)を差し込む。
    fragmentShader: `uniform float uTime;uniform float uBright;uniform float uFlare;uniform float uCorona;varying vec3 vPos;varying vec3 vN;varying vec3 vV;
${NOISE}
float rfbm(vec3 p){float s=0.0;float a=0.55;for(int i=0;i<5;i++){s+=a*(1.0-abs(snoise(p)));p*=2.13;a*=0.5;}return s;}
vec3 ramp(float t){t=clamp(t,0.0,1.0);vec3 c1=vec3(0.16,0.012,0.0);vec3 c2=vec3(0.52,0.07,0.008);vec3 c3=vec3(0.93,0.30,0.02);vec3 c4=vec3(1.0,0.62,0.12);vec3 c5=vec3(1.0,0.92,0.60);vec3 c=mix(c1,c2,smoothstep(0.0,0.30,t));c=mix(c,c3,smoothstep(0.28,0.55,t));c=mix(c,c4,smoothstep(0.54,0.78,t));c=mix(c,c5,smoothstep(0.80,1.0,t));return c;}
void main(){float sp=0.6+uFlare*1.4;
vec3 q=vPos*2.4;
float warp=fbm(q*0.8+uTime*0.05*sp);
float fib=rfbm(q*2.0+vec3(warp*1.5)+vec3(0.0,uTime*0.04*sp,0.0));
float gran=fbm(vPos*9.0-uTime*0.13*sp);
float v=fib*0.78+0.20*gran+0.16*warp;
float act=pow(clamp(0.5+0.5*snoise(vPos*1.7+3.7),0.0,1.0),5.0)*smoothstep(0.45,0.75,fib);
float filam=smoothstep(0.60,0.78,rfbm(q*0.9+8.0+vec3(uTime*0.02)));
vec3 col=ramp(clamp(v,0.0,1.0));
col+=act*vec3(1.0,0.93,0.72)*2.4;
col*=1.0-filam*0.42;
float limb=max(dot(normalize(vN),normalize(vV)),0.0);
col*=0.52+0.48*pow(limb,0.4);
float sm2=snoise(vPos*1.9+11.0);
float umb=smoothstep(0.64,0.80,sm2);float pen=smoothstep(0.52,0.64,sm2)-umb;
col*=1.0-umb*0.72-pen*0.30;
col*=1.0+0.10*fbm(vPos*17.0-uTime*0.18*sp);
float fres=pow(1.0-limb,1.8);
col+=fres*vec3(1.0,0.42,0.10)*(0.5+uCorona*0.7);
col*=uBright*1.5;
col=clamp((col*(2.51*col+0.03))/(col*(2.43*col+0.59)+0.14),0.0,1.0);
gl_FragColor=vec4(col,1.0);}`,
  });
}

// haloMaterial: 太陽の外周に重ねる、加算合成の「コロナ(炎の揺らめき)」を描く平面用マテリアル。
function haloMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    // 透過を有効化する
    transparent: true,
    // 加算合成で光が重なるほど明るくする
    blending: THREE.AdditiveBlending,
    // 深度バッファへ書き込まない(背後の描画を遮らない)
    depthWrite: false,
    // 深度テストを無効化し常に前面に重ねる
    depthTest: false,
    // uniforms: uTime=時間, uMera=揺らめき量, uI=全体強度。
    uniforms: { uTime: { value: 0 }, uMera: { value: 0.55 }, uI: { value: 1.0 } },
    // vertexShader: UV をそのまま渡すだけの単純な板ポリゴン。
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    // fragmentShader: 中心からの距離 r とノイズで、外へ伸びる炎の房(tongue)とフリンジを描く。
    fragmentShader: `uniform float uTime;uniform float uMera;uniform float uI;varying vec2 vUv;
${NOISE}
void main(){vec2 p=(vUv-0.5)*4.8;float r=length(p);float ms=0.35+uMera*2.3;vec2 d=p/max(r,1e-4);
float ang=atan(d.y,d.x);
float sp=fbm(vec3(cos(ang)*7.0,sin(ang)*7.0,r*6.0-uTime*0.9*ms));
float fringe=pow(clamp(0.55+0.5*sp,0.0,1.0),2.0);
float reachF=1.03+0.13*fringe*(0.4+uMera*1.3);
float fr=clamp((r-1.0)/max(reachF-1.0,0.02),0.0,1.0);
float iFr=(1.0-fr)*(1.0-fr)*smoothstep(0.97,1.005,r)*(0.5+0.5*fringe);
float n1=fbm(vec3(d*1.7,r*1.1-uTime*0.3*ms));
float tong=clamp(0.5+0.5*n1*0.85,0.0,1.0);
float reachC=1.12+(0.25+uMera*0.75)*tong;
float fc=clamp((r-1.0)/max(reachC-1.0,0.05),0.0,1.0);
float iC=pow(1.0-fc,1.8)*smoothstep(0.96,1.02,r)*(0.25+0.55*tong);
float inten=iFr*1.1+iC*0.8;
vec3 col=mix(vec3(0.95,0.25,0.03),vec3(1.0,0.75,0.30),clamp(inten*1.4,0.0,1.0));
gl_FragColor=vec4(col*inten*uI*1.8,inten*uI);}`,
  });
}

// flameMaterial: プロミネンス(噴き上がる炎の帯)を描くマテリアル。頂点属性で帯を常にカメラ方向へ膨らませる。
function flameMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    // 透過を有効化する
    transparent: true,
    // 加算合成で炎を明るく重ねる
    blending: THREE.AdditiveBlending,
    // 深度書き込みなし(重なりで暗くならないように)
    depthWrite: false,
    // 深度テストは有効(太陽球の裏に隠れる炎は隠す)
    depthTest: true,
    // 帯の裏表どちらからも見えるようにする
    side: THREE.DoubleSide,
    // uniforms: uI=強度, uTime=時間。
    uniforms: { uI: { value: 1.0 }, uTime: { value: 0 } },
    // vertexShader: 各頂点の進行方向 aDir と視線から横方向 sd を求め、帯の幅 aW ぶん左右(aSide)へ押し広げる(ビルボード帯)。
    vertexShader: `attribute float aSide;attribute vec3 aDir;attribute float aW;attribute vec3 aCol;attribute float aA;attribute float aU;attribute float aSeed;varying float vA;varying vec3 vC;varying float vEdge;varying float vU;varying float vSeed;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vec3 td=normalize((modelViewMatrix*vec4(aDir,0.0)).xyz);vec3 vd=normalize(-mv.xyz);vec3 sd=normalize(cross(td,vd));mv.xyz+=sd*aSide*aW;vEdge=aSide;vA=aA;vC=aCol;vU=aU;vSeed=aSeed;gl_Position=projectionMatrix*mv;}`,
    // fragmentShader: ノイズで炎の縁の揺らぎ(lick)・繊維状の模様を作り、帯の中心ほど濃くする。
    fragmentShader: `uniform float uI;uniform float uTime;varying float vA;varying vec3 vC;varying float vEdge;varying float vU;varying float vSeed;
${NOISE}
void main(){float n1=fbm(vec3(vU*7.0-uTime*1.6,vSeed*17.0,uTime*0.5));float n2=fbm(vec3(vU*15.0+uTime*2.3,vSeed*29.0+4.0,uTime*0.8));float fil=fbm(vec3(vU*18.0-uTime*1.1,vEdge*2.5+vSeed*31.0,uTime*0.35));float lick=clamp(0.45+0.55*(n1*0.8+n2*0.5),0.0,1.0);float body=smoothstep(1.05,0.10,abs(vEdge)+(0.5-lick)*0.8);body*=0.45+0.9*smoothstep(0.15,0.75,0.5+0.5*fil);float a=vA*body*(0.35+0.75*lick);vec3 col=vC+vec3(0.25,0.10,0.0)*n2;gl_FragColor=vec4(col*uI*(0.7+0.65*lick),a*uI);}`,
  });
}

// randProm: プロミネンス1本の寿命・形状をランダム生成する。base があれば「同系統の枝」として近い向きで作る。
function randProm(time: number, base: Strand | null): Strand {
  // norm: ベクトルを正規化(長さ1に)するヘルパー。
  const norm = (v: Vec3): Vec3 => {
    // 長さ(0除算を避けるため最低1)
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    // 各成分を長さで割る
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  // frame: 方向 dir に直交する接線 tang・従法線 bit の正規直交フレームを作る。
  const frame = (dir: Vec3): { tang: Vec3; bit: Vec3 } => {
    // dir が真上に近ければ基準軸を X に切り替える
    const up: Vec3 = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const tang = norm([
      // 外積 dir×up の X 成分
      dir[1] * up[2] - dir[2] * up[1],
      // 外積の Y 成分
      dir[2] * up[0] - dir[0] * up[2],
      // 外積の Z 成分
      dir[0] * up[1] - dir[1] * up[0],
    ]);
    const bit: Vec3 = [
      // 外積 dir×tang の X 成分
      dir[1] * tang[2] - dir[2] * tang[1],
      // 外積の Y 成分
      dir[2] * tang[0] - dir[0] * tang[2],
      // 外積の Z 成分
      dir[0] * tang[1] - dir[1] * tang[0],
    ];
    // 直交する2軸を返す
    return { tang, bit };
  };
  // 既存の親(base)が生きている間は、それを少しずらした「枝」を作る。
  if (base && time < base.tEnd) {
    // -k/2〜k/2 の微小な揺らぎを返す
    const j = (k: number) => (Math.random() - 0.5) * k;
    // 根本方向を親から微妙にずらす
    const a = norm([base.a[0] + j(0.12), base.a[1] + j(0.12), base.a[2] + j(0.12)]);
    // 先端方向も親からずらす
    const b = norm([base.b[0] + j(0.14), base.b[1] + j(0.14), base.b[2] + j(0.14)]);
    // 新しい根本方向の直交フレームを作る
    const fr = frame(a);
    // 親より少し遅れて出現させる
    const tStart = base.tStart + Math.random() * 1.5;
    // 寿命を親の 0.8〜1.2 倍にする
    const dur = base.dur * (0.8 + Math.random() * 0.4);
    return {
      // 根本方向
      a,
      // 先端方向
      b,
      // 横揺れ軸1
      bit: fr.bit,
      // 横揺れ軸2
      tang: fr.tang,
      // 高さを親の 0.75〜1.25 倍に
      h: base.h * (0.75 + Math.random() * 0.5),
      // 太さを親の 0.7〜1.3 倍に
      wid: base.wid * (0.7 + Math.random() * 0.6),
      // 揺れ速さ
      wig: 0.6 + Math.random() * 1.2,
      // 凹凸の周波数
      lf: 7 + Math.random() * 10,
      // 凹凸の位相
      lp: Math.random() * 6.28,
      // 個体差シード
      seed: Math.random(),
      // 出現時刻
      tStart,
      // 消滅時刻
      tEnd: tStart + dur,
      // 寿命
      dur,
    };
  }
  // 親がいない/寿命切れなら、球面上のランダムな向きに新しい炎を作る。
  // 方位角(0〜2π)
  const th = Math.random() * Math.PI * 2;
  // 天頂角(球面上で一様分布になるよう acos で分布補正)
  const ph = Math.acos(2 * Math.random() - 1);
  // 球面座標→直交座標
  const dir: Vec3 = [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)];
  // 直交フレームを作る
  const fr = frame(dir);
  // 接線軸
  const tang = fr.tang;
  // 従法線軸
  const bit = fr.bit;
  // 35%の確率で大きな炎にする
  const big = Math.random() < 0.35;
  // 先端を接線方向へ傾ける量(左右ランダム)
  const span = (0.12 + Math.random() * 0.22) * (Math.random() < 0.5 ? 1 : -1);
  // 従法線方向の微小な傾き
  const bj = (Math.random() - 0.5) * 0.25;
  const b = norm([
    // 先端方向 X(根本方向を接線・従法線方向へずらす)
    dir[0] + tang[0] * span + bit[0] * bj,
    // 先端方向 Y
    dir[1] + tang[1] * span + bit[1] * bj,
    // 先端方向 Z
    dir[2] + tang[2] * span + bit[2] * bj,
  ]);
  // 寿命 6〜12 秒
  const dur = 6 + Math.random() * 6;
  // 3〜17 秒後に出現
  const tStart = time + 3 + Math.random() * 14;
  return {
    // 根本方向
    a: dir,
    // 先端方向
    b,
    // 横揺れ軸1
    bit,
    // 横揺れ軸2
    tang,
    // 大きい炎ほど高い
    h: big ? 0.65 + Math.random() * 0.55 : 0.28 + Math.random() * 0.3,
    // 大きい炎ほど太い
    wid: big ? 1.7 : 1.1,
    // 揺れ速さ
    wig: 0.6 + Math.random() * 1.2,
    // 凹凸の周波数
    lf: 7 + Math.random() * 10,
    // 凹凸の位相
    lp: Math.random() * 6.28,
    // 個体差シード
    seed: Math.random(),
    // 出現時刻
    tStart,
    // 消滅時刻
    tEnd: tStart + dur,
    // 寿命
    dur,
  };
}

// buildSun: 太陽本体・炎・光・星を一度だけ構築する。
export function buildSun(): SunBuilt {
  // group: 太陽本体・炎・光・星をまとめる回転用グループ。
  const group = new THREE.Group();

  // 太陽球: 半径1の球にシェーダーマテリアルを貼る。
  const sunMat = sunMaterial();
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1, 72, 72), sunMat));

  // コロナ用の板: 太陽より一回り大きい平面を独立配置(グループ外)し、常に手前へ重ねる。
  const haloMat = haloMaterial();
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 4.8), haloMat);
  // 描画順を上げて最前面で加算する
  halo.renderOrder = 3;

  // プロミネンスの帯ジオメトリを用意する。NP=炎の本数, SEG=1本の分割数, VC=総頂点数(左右2列ぶん)。
  const NP = 9;
  const SEG = 20;
  const VC = NP * SEG * 2;
  // 各頂点属性の配列を確保する(位置・色・不透明度・進行方向・幅・左右・U座標・シード)。
  // 位置(xyz)
  const lpos = new Float32Array(VC * 3);
  // 色(rgb)
  const lcol = new Float32Array(VC * 3);
  // 不透明度
  const lal = new Float32Array(VC);
  // 進行方向(xyz)
  const ldir = new Float32Array(VC * 3);
  // 帯の半幅
  const lw = new Float32Array(VC);
  // 帯の左右(-1/+1)
  const lside = new Float32Array(VC);
  // 根本→先端の進行度 U(0〜1)
  const lu = new Float32Array(VC);
  // 個体差シード
  const lseed = new Float32Array(VC);
  // インデックス(三角形の組み立て)を作る。各区間を2枚の三角形(帯)でつなぐ。
  const idx: number[] = [];
  for (let si = 0; si < NP; si++) {
    for (let k = 0; k < SEG - 1; k++) {
      // この区間・左の頂点番号
      const a2 = (si * SEG + k) * 2;
      // 右の頂点番号
      const b2 = a2 + 1;
      // 次の区間・左の頂点番号
      const c2 = (si * SEG + k + 1) * 2;
      // 次の区間・右の頂点番号
      const d2 = c2 + 1;
      // 2つの三角形で四角い帯を作る
      idx.push(a2, b2, c2, b2, d2, c2);
    }
  }
  // 各頂点に固定属性(左右符号と U 座標)を書き込む。
  for (let si = 0; si < NP; si++) {
    for (let k = 0; k < SEG; k++) {
      // この頂点の進行度(0=根本, 1=先端)
      const u = k / (SEG - 1);
      // 左頂点の番号
      const base = (si * SEG + k) * 2;
      // 左端は -1
      lside[base] = -1;
      // 右端は +1
      lside[base + 1] = 1;
      // 左端の U
      lu[base] = u;
      // 右端の U
      lu[base + 1] = u;
    }
  }
  // BufferGeometry に全属性を登録する。
  const lg = new THREE.BufferGeometry();
  // 位置
  lg.setAttribute("position", new THREE.BufferAttribute(lpos, 3));
  // 色
  lg.setAttribute("aCol", new THREE.BufferAttribute(lcol, 3));
  // 不透明度
  lg.setAttribute("aA", new THREE.BufferAttribute(lal, 1));
  // 進行方向
  lg.setAttribute("aDir", new THREE.BufferAttribute(ldir, 3));
  // 半幅
  lg.setAttribute("aW", new THREE.BufferAttribute(lw, 1));
  // 左右符号
  lg.setAttribute("aSide", new THREE.BufferAttribute(lside, 1));
  // U 座標
  lg.setAttribute("aU", new THREE.BufferAttribute(lu, 1));
  // シード
  lg.setAttribute("aSeed", new THREE.BufferAttribute(lseed, 1));
  // インデックスを設定する
  lg.setIndex(idx);
  // 炎メッシュ。frustumCulled を切り、範囲外判定で消えないようにする。
  const flameMat = flameMaterial();
  const flames = new THREE.Mesh(lg, flameMat);
  flames.frustumCulled = false;
  group.add(flames);

  // glow: 太陽全体を覆う暖色のにじみスプライト(加算)。
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      // 光輪テクスチャ
      map: makeGlow(),
      // 透過
      transparent: true,
      // 初期不透明度
      opacity: 0.34,
      // 加算合成
      blending: THREE.AdditiveBlending,
      // 深度書き込みなし
      depthWrite: false,
      // 常に手前
      depthTest: false,
    }),
  );
  // にじみの大きさ
  glow.scale.set(3.0, 3.0, 1);
  group.add(glow);

  // 背景の星屑: 太陽の周囲に点群として散らす。
  // 星の数
  const N = 2400;
  // 星の位置・色バッファ
  const pg = new THREE.BufferGeometry();
  // 位置
  const pp = new Float32Array(N * 3);
  // 色
  const pc = new Float32Array(N * 3);
  // 星の色候補
  const stops = [0xffffff, 0xfff0c0, 0xffe7b0, 0xbfd4ff].map((c) => new THREE.Color(c));
  for (let i = 0; i < N; i++) {
    // 中心からの距離(2.2〜4.8)
    const r = 2.2 + Math.random() * 2.6;
    // 方位角
    const th = Math.random() * Math.PI * 2;
    // 天頂角(一様分布)
    const ph = Math.acos(2 * Math.random() - 1);
    // X
    pp[i * 3] = r * Math.sin(ph) * Math.cos(th);
    // Y
    pp[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    // Z
    pp[i * 3 + 2] = r * Math.cos(ph);
    // 色をランダムに選ぶ
    const c = stops[Math.floor(Math.random() * stops.length)];
    // R
    pc[i * 3] = c.r;
    // G
    pc[i * 3 + 1] = c.g;
    // B
    pc[i * 3 + 2] = c.b;
  }
  // 位置属性
  pg.setAttribute("position", new THREE.BufferAttribute(pp, 3));
  // 色属性
  pg.setAttribute("color", new THREE.BufferAttribute(pc, 3));
  // pmat: 星の点マテリアル(頂点色・加算・星テクスチャ)。
  const pmat = new THREE.PointsMaterial({
    // 点の大きさ
    size: 0.13,
    // 頂点色を使う
    vertexColors: true,
    // 透過
    transparent: true,
    // 不透明度
    opacity: 0.95,
    // 深度書き込みなし
    depthWrite: false,
    // 遠いほど小さく
    sizeAttenuation: true,
    // 星テクスチャ
    map: makeStar(),
    // 加算合成
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(pg, pmat);
  group.add(stars);

  // 返り値: ループから参照する各オブジェクトをまとめる。
  return { group, halo, sunMat, haloMat, flameMat, flameGeo: lg, SEG, glow, stars, pmat };
}

// createSunAnim: フレーム間で持ち越す可変状態(慣性・炎パラメータ・一時バッファ)を作る。
export function createSunAnim(): SunAnim {
  return {
    // X 軸(上下)の回転角
    rotX: -0.12,
    // Y 軸(左右)の回転角
    rotY: 0,
    // X 回転の速度(慣性)
    vx: 0,
    // Y 回転の速度(慣性)
    vy: 0,
    // クリック時のフレア演出量(減衰する)
    burst: 0,
    // 各炎の現在のパラメータ
    strands: new Array<Strand | null>(9).fill(null),
    // 炎の芯線 X の一時バッファ
    tx: new Float32Array(20),
    // 炎の芯線 Y の一時バッファ
    ty: new Float32Array(20),
    // 炎の芯線 Z の一時バッファ
    tz: new Float32Array(20),
  };
}

// updateSun: 毎フレームの更新(元コードの tick の sun 分岐に相当)。
export function updateSun(
  // 構築済みオブジェクト
  b: SunBuilt,
  // 可変状態
  a: SunAnim,
  // ポインタ操作の生データ
  drag: DragState,
  // 現在のスライダー値
  p: SunParams,
  // 経過秒数
  time: number,
): void {
  // タップ(クリック)されていたらフレアを最大にし、フラグを消費する。
  if (drag.tap) {
    a.burst = 1;
    drag.tap = false;
  }
  // ドラッグの移動量を回転速度へ加え、消費してリセットする(元の pointermove の係数と同じ)。
  // 横ドラッグ→左右回転
  a.vy += drag.mx * 0.0022;
  // 縦ドラッグ→上下回転
  a.vx += drag.my * 0.0017;
  // 消費済みにする
  drag.mx = 0;
  // 消費済みにする
  drag.my = 0;

  // フレア量を毎フレーム減衰させる。
  a.burst *= 0.955;
  // 十分小さくなったら0に丸める
  if (a.burst < 0.001) a.burst = 0;

  // 自動回転+慣性を合成して回転角を更新する。上下は範囲制限する。
  // 自動回転(rot)+慣性
  a.rotY += 0.006 * p.rot + a.vy;
  // 慣性を減衰
  a.vy *= 0.93;
  // 上下回転に慣性を加える
  a.rotX += a.vx;
  // 慣性を減衰
  a.vx *= 0.93;
  // 上下の回転角を制限
  a.rotX = Math.max(-1.1, Math.min(1.1, a.rotX));
  // グループへ回転を反映
  b.group.rotation.set(a.rotX, a.rotY, 0);
  // フレア時にわずかに膨らませる
  b.group.scale.setScalar(1 + a.burst * 0.08);

  // 太陽球シェーダーへ現在値を渡す。
  b.sunMat.uniforms.uTime.value = time;
  // 明るさ
  b.sunMat.uniforms.uBright.value = 0.5 + p.amb * 0.45;
  // 周縁の炎の強さ
  b.sunMat.uniforms.uCorona.value = 0.3 + p.amb * 0.55;
  // 活動度は一定
  b.sunMat.uniforms.uFlare.value = 0.62;

  // コロナ板へ現在値を渡す。
  b.haloMat.uniforms.uTime.value = time;
  // 揺らめき量
  b.haloMat.uniforms.uMera.value = p.mera;
  // 強度(上限1.4)
  b.haloMat.uniforms.uI.value = Math.min(1.4, 0.35 + p.amb * 0.45 + a.burst * 0.6);

  // 炎マテリアルへ現在値を渡す。
  b.flameMat.uniforms.uTime.value = time;
  // 強度(上限1.6)
  b.flameMat.uniforms.uI.value = Math.min(1.6, 0.62 + p.amb * 0.6 + a.burst * 0.8);

  // 炎のジオメトリ属性配列を取り出す(直接書き換えて GPU へ再アップロードする)。
  // 位置
  const P = b.flameGeo.attributes.position.array as Float32Array;
  // 色
  const C = b.flameGeo.attributes.aCol.array as Float32Array;
  // 不透明度
  const A = b.flameGeo.attributes.aA.array as Float32Array;
  // 進行方向
  const D = b.flameGeo.attributes.aDir.array as Float32Array;
  // 半幅
  const W = b.flameGeo.attributes.aW.array as Float32Array;
  // シード
  const SD = b.flameGeo.attributes.aSeed.array as Float32Array;
  // 1本あたりの分割数
  const SEG = b.SEG;
  // 芯線 X 一時バッファ
  const tx = a.tx;
  // 芯線 Y 一時バッファ
  const ty = a.ty;
  // 芯線 Z 一時バッファ
  const tz = a.tz;

  // 各プロミネンスを1本ずつ更新する。
  for (let si = 0; si < a.strands.length; si++) {
    // この炎の現在のパラメータ
    let st = a.strands[si];
    // 未生成、または寿命が尽きて1秒たったら新しく作り直す。3本ずつ「枝」でまとめる。
    if (!st || time > st.tEnd + 1) {
      // グループ先頭を親として枝を作る
      const src = si % 3 !== 0 ? a.strands[si - (si % 3)] : null;
      // 新しい炎を生成して保存
      st = a.strands[si] = randProm(time, src);
      for (let k = 0; k < SEG; k++) {
        // 左頂点番号
        const base = (si * SEG + k) * 2;
        // 左頂点にシードを書く
        SD[base] = st.seed;
        // 右頂点にシードを書く
        SD[base + 1] = st.seed;
      }
      // シード変更を GPU へ通知
      b.flameGeo.attributes.aSeed.needsUpdate = true;
    }
    // 寿命に対する進行度(0〜1)
    const g = (time - st.tStart) / st.dur;
    // 見えやすさ(出現でフェードイン、末期でフェードアウト)
    let life = 0;
    // 伸び具合(0=縮んでいる, 1=伸びきり)
    let hk = 0;
    if (g >= 0 && g <= 1) {
      // 前半で立ち上がり、後半で消える
      life = Math.min(1, g / 0.1) * (1 - Math.max(0, (g - 0.7) / 0.3));
      // 55%までに伸びきる
      hk = Math.min(1, g / 0.55);
      // イーズアウトで滑らかに
      hk = 1 - (1 - hk) * (1 - hk);
    }
    // 現在の高さ
    const hgt = st.h * 1.05 * hk;
    // 芯線(帯の中心線)の各点を計算する。
    for (let k = 0; k < SEG; k++) {
      // 進行度(0〜1)
      const u = k / (SEG - 1);
      // 高さの配分カーブ
      const s1 = u ** 0.85;
      // a→b を補間して基準方向を作り、正規化する。
      let mx = st.a[0] + (st.b[0] - st.a[0]) * u;
      let my = st.a[1] + (st.b[1] - st.a[1]) * u;
      let mz = st.a[2] + (st.b[2] - st.a[2]) * u;
      // 長さ
      const ml = Math.hypot(mx, my, mz) || 1;
      // 正規化 X
      mx /= ml;
      // 正規化 Y
      my /= ml;
      // 正規化 Z
      mz /= ml;
      const lump =
        0.7 +
        0.34 * Math.sin(u * st.lf + st.lp) +
        // 縦の凹凸(こぶ)
        0.18 * Math.sin(u * st.lf * 2.3 + st.seed * 40.0 + time * 0.7);
      // 先端ほど大きくなる重み
      const tipw = u ** 1.5;
      const wob =
        (Math.sin(u * 6.0 + time * 2.2 * st.wig + st.seed * 30.0) * 0.07 +
          Math.sin(u * 13.0 - time * 1.5 * st.wig + st.seed * 11.0) * 0.04) *
        // 従法線方向の揺れ
        (0.25 + tipw);
      // 接線方向のなびき
      const sway = Math.sin(u * 3.0 + time * 1.1 * st.wig + st.seed * 7.0) * 0.1 * tipw;
      // 太陽表面(半径1)からの距離
      const rad = 1.0 + hgt * s1 * lump;
      // 芯線 X(伸長+揺れ)
      tx[k] = mx * rad + st.bit[0] * wob + st.tang[0] * sway;
      // 芯線 Y
      ty[k] = my * rad + st.bit[1] * wob + st.tang[1] * sway;
      // 芯線 Z
      tz[k] = mz * rad + st.bit[2] * wob + st.tang[2] * sway;
    }
    // 芯線から各頂点の進行方向・色・幅・不透明度を求め、左右2頂点に書き込む。
    for (let k = 0; k < SEG; k++) {
      // 進行度
      const u = k / (SEG - 1);
      // 次の点(端はクランプ)
      const kn = Math.min(SEG - 1, k + 1);
      // 前の点(端はクランプ)
      const kp = Math.max(0, k - 1);
      // 進行方向 X(前後差分)
      let ddx = tx[kn] - tx[kp];
      // 進行方向 Y
      let ddy = ty[kn] - ty[kp];
      // 進行方向 Z
      let ddz = tz[kn] - tz[kp];
      // 長さ
      const dl = Math.hypot(ddx, ddy, ddz) || 1;
      // 正規化 X
      ddx /= dl;
      // 正規化 Y
      ddy /= dl;
      // 正規化 Z
      ddz /= dl;
      // 根本ほど高温(明るい)
      const hot = 1.0 - 0.62 * u ** 1.2;
      // 緑成分(温度で変化)
      const cg = 0.13 + 0.48 * hot;
      // 青成分
      const cb = 0.02 + 0.26 * hot * hot;
      // 幅の細かな変動
      const lw2 = 0.5 + 0.7 * (0.5 + 0.5 * Math.sin(u * 14.0 + st.seed * 60.0 + time * 1.4));
      const alpha =
        life *
        (0.42 + 0.58 * hot) *
        (0.8 + 0.2 * Math.sin(time * 3.0 * st.wig + u * 9.0 + st.seed * 20.0)) *
        // 不透明度(先端はさらに薄く)
        (u > 0.82 ? 1.0 - ((u - 0.82) / 0.18) * 0.85 : 1.0);
      // 半幅(根本太く先端細く)
      const hw = st.wid * (0.009 + 0.03 * hot) * lw2 * (1.15 - 0.65 * u);
      // 左頂点番号
      const base = (si * SEG + k) * 2;
      for (let sdi = 0; sdi < 2; sdi++) {
        // 左(0)/右(1)の頂点番号
        const vi = base + sdi;
        // 位置 X(左右で同じ芯線位置。膨らませは頂点シェーダーが行う)
        P[vi * 3] = tx[k];
        // 位置 Y
        P[vi * 3 + 1] = ty[k];
        // 位置 Z
        P[vi * 3 + 2] = tz[k];
        // 進行方向 X
        D[vi * 3] = ddx;
        // 進行方向 Y
        D[vi * 3 + 1] = ddy;
        // 進行方向 Z
        D[vi * 3 + 2] = ddz;
        // 赤成分(常に最大)
        C[vi * 3] = 1.0;
        // 緑成分
        C[vi * 3 + 1] = cg;
        // 青成分
        C[vi * 3 + 2] = cb;
        // 不透明度
        A[vi] = alpha;
        // 半幅
        W[vi] = hw;
      }
    }
  }
  // 書き換えた炎の属性を GPU へ再アップロードするよう通知する。
  b.flameGeo.attributes.position.needsUpdate = true;
  b.flameGeo.attributes.aCol.needsUpdate = true;
  b.flameGeo.attributes.aA.needsUpdate = true;
  b.flameGeo.attributes.aDir.needsUpdate = true;
  b.flameGeo.attributes.aW.needsUpdate = true;

  // glow(にじみ)を脈動させ、明るさ・大きさをパラメータとフレアで調整する。
  // 脈動
  const pulse = 1 + 0.06 * Math.sin(time * 1.4) + a.burst * 0.5;
  // にじみの大きさ
  const g2 = 3.0 * (0.62 + p.amb * 0.38) * pulse;
  // 大きさを反映
  b.glow.scale.set(g2, g2, 1);
  // 不透明度を反映
  b.glow.material.opacity = Math.min(1, 0.24 + p.amb * 0.24 + a.burst * 0.3);

  // 星をわずかに明滅・回転させる。
  // 明滅
  b.pmat.opacity = 0.7 + 0.25 * Math.sin(time * 2.4);
  // ゆっくり回転
  b.stars.rotation.y += 0.0008;
}

// disposeSun: アンマウント時に GPU リソースを解放する(ジオメトリ・マテリアル・テクスチャ)。
export function disposeSun(b: SunBuilt): void {
  b.group.traverse((obj) => {
    // メッシュ・点・スプライトのジオメトリとマテリアルを破棄する。
    // 型を Mesh とみなして参照する
    const mesh = obj as THREE.Mesh;
    // ジオメトリを解放
    mesh.geometry?.dispose();
    // マテリアル(単体/配列)
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) {
      // 配列なら全て解放(for...of にするのは、forEach のコールバックが戻り値を返す書き方を避けるため)
      for (const m of mat) m.dispose();
    } else {
      // 単体なら解放
      mat?.dispose();
    }
  });
  // コロナ板のジオメトリを解放
  b.halo.geometry.dispose();
  // コロナ板のマテリアルを解放
  b.haloMat.dispose();
}
