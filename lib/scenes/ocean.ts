// 浜辺シーンの「ロジック」を集約したモジュール（描画/JSX は OceanScene.tsx 側）。
// 空ドーム・砂浜・寄せ返す波の3枚を、共有シェーダーで構築・更新する。

import * as THREE from "three";
import { NOISE, SANDH, SKYF } from "@/lib/shaders";
import type { DragState } from "@/lib/useDragInteraction";
import type { OceParams } from "@/lib/scene";

// OceanBuilt: buildOcean() が返す、ループから更新する3つのマテリアルとグループ。
export interface OceanBuilt {
  group: THREE.Group;
  skyMat: THREE.ShaderMaterial;
  sandMat: THREE.ShaderMaterial;
  waterMat: THREE.ShaderMaterial;
}

// OceanAnim: 見回しの角度と慣性、突風量を持ち越す。
export interface OceanAnim {
  // 左右の見回し角
  yaw: number;
  // 上下の見回し角
  pit: number;
  // 左右の速度(慣性)
  vyaw: number;
  // 上下の速度(慣性)
  vpit: number;
  // タップで発生する突風(減衰する)
  burst: number;
}

// buildOcean: 空・砂・水のメッシュとマテリアルを初回に一度だけ構築する。
export function buildOcean(): OceanBuilt {
  // group: 3枚のメッシュをまとめる入れ物。
  const group = new THREE.Group();

  // 空ドーム: 内側(BackSide)から見る巨大な球に、空・雲・星空シェーダーを貼る。
  const skyMat = new THREE.ShaderMaterial({
    // 球の内側を描く
    side: THREE.BackSide,
    // 深度書き込みなし(常に一番奥の背景として扱う)
    depthWrite: false,
    // uTime=時間, uDay=昼夜(1で昼)
    uniforms: { uTime: { value: 0 }, uDay: { value: 0.85 } },
    // vertexShader: 頂点位置を渡すだけ。
    vertexShader: `varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    // fragmentShader: 視線方向 d から地色+雲(skyBase)と夜空(nightSky)を合成する。
    fragmentShader: `uniform float uTime;uniform float uDay;varying vec3 vP;
${NOISE}
${SKYF}
void main(){vec3 d=normalize(vP);float cov;vec3 col=skyBase(d,uDay,uTime,cov)+nightSky(d,uDay,uTime)*(1.0-cov*0.92);
col+=vec3(0.9,0.95,1.0)*0.06*pow(1.0-max(d.y,0.0),5.0)*smoothstep(0.4,1.0,uDay);
gl_FragColor=vec4(col,1.0);}`,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(260, 32, 20), skyMat));

  // 砂浜: 頂点で高さ関数 sandH を適用し、濡れ・透過・コースティクス(水中の光模様)を描く。
  const sandMat = new THREE.ShaderMaterial({
    uniforms: {
      // 時間
      uTime: { value: 0 },
      // 昼夜
      uDay: { value: 0.85 },
      // 波の速さ(濡れ際の動きに使う)
      uSpeed: { value: 0.45 },
      // カメラ位置(毎フレーム実カメラの位置で更新する)
      uCam: { value: new THREE.Vector3(0, 1.8, 9) },
    },
    // vertexShader: 平面の各頂点を sandH で持ち上げてワールド座標 vW を渡す。
    vertexShader: `varying vec3 vW;
${SANDH}
void main(){vec3 p=position;p.y=sandH(p.x,p.z);vW=(modelMatrix*vec4(p,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
    // fragmentShader: 砂色・濡れ・水中の減衰・コースティクス・遠景フォグを合成する。
    fragmentShader: `uniform float uTime;uniform float uDay;uniform float uSpeed;uniform vec3 uCam;varying vec3 vW;
${NOISE}
void main(){float dayK=smoothstep(0.0,1.0,uDay);float lightK=mix(0.07,1.0,dayK);
vec3 sand=vec3(0.97,0.93,0.83);sand*=0.95+0.05*fbm(vec3(vW.xz*3.0,0.0));
sand+=vec3(0.06)*smoothstep(0.7,1.0,fbm(vec3(vW.xz*22.0,4.0)));
float h=vW.y;
float t2=uTime*(0.5+uSpeed*1.7);
float ph=sin(vW.z*0.55-t2*0.8)+0.45*sin(vW.z*1.1-t2*1.3+1.3);
float wet=max(smoothstep(0.16,0.02,h),smoothstep(0.26,0.04,h-ph*0.055)*0.85);
sand*=mix(1.0,0.68,wet);
sand=mix(sand,vec3(0.62,0.80,0.90)*mix(0.1,1.0,smoothstep(0.0,1.0,uDay)),wet*smoothstep(0.09,0.02,abs(h-max(ph,0.0)*0.04))*0.34);
float sub=smoothstep(0.015,-0.015,h);
float depth=max(-h,0.0);
vec3 trans=exp(-depth*vec3(1.35,0.60,0.38));
sand=mix(sand,sand*trans,sub);
float caus=pow(clamp(1.0-abs(fbm(vec3(vW.xz*2.3,uTime*0.55))),0.0,1.0),5.0);
sand+=caus*vec3(0.45,0.62,0.58)*sub*exp(-depth*0.85)*0.55*dayK;
sand*=lightK;
sand=mix(sand*vec3(0.72,0.82,1.22),sand,dayK);
float dist=length(uCam-vW);float fog=smoothstep(30.0,110.0,dist);
vec3 fogc=mix(vec3(0.010,0.020,0.048),vec3(0.70,0.85,0.95),dayK);
sand=mix(sand,fogc,fog);
gl_FragColor=vec4(sand,1.0);}`,
  });
  // 220×220 を細かく分割した平面
  const sandGeo = new THREE.PlaneGeometry(220, 220, 120, 120);
  // 水平(床)向きに倒す
  sandGeo.rotateX(-Math.PI / 2);
  group.add(new THREE.Mesh(sandGeo, sandMat));

  // 波(水面): 頂点で複数のサイン波+岸での駆け上がりを合成し、フラグメントで反射・泡・透過を描く。
  const waterMat = new THREE.ShaderMaterial({
    // 水は半透明
    transparent: true,
    uniforms: {
      // 時間
      uTime: { value: 0 },
      // 昼夜
      uDay: { value: 0.85 },
      // 波の高さ
      uAmp: { value: 0.5 },
      // 波の速さ
      uSpeed: { value: 0.45 },
      // 突風(タップで一時的に高まる)
      uGust: { value: 0 },
      // カメラ位置(毎フレーム実カメラの位置で更新する)
      uCam: { value: new THREE.Vector3(0, 1.8, 9) },
    },
    // vertexShader: 4つの方向波+岸の runup を合成して水面を波立たせ、法線 vN とワールド座標 vW を渡す。
    vertexShader: `uniform float uTime;uniform float uAmp;uniform float uSpeed;uniform float uGust;varying vec3 vN;varying vec3 vW;
${SANDH}
void main(){vec3 p=position;float t=uTime*(0.5+uSpeed*1.7);
float sh=sandH(p.x,p.z);float damp=clamp(-sh*0.55,0.10,1.0);
float amp=(0.16+uAmp*0.5)*(1.0+uGust*0.55)*damp;
float h=0.0;float gx=0.0;float gz=0.0;
float d1=dot(vec2(0.08,-1.0),p.xz)*0.50+t*1.00;h+=0.42*sin(d1);gx+=0.42*0.50*0.08*cos(d1);gz+=0.42*0.50*(-1.0)*cos(d1);
float d2=dot(vec2(-0.24,-0.97),p.xz)*1.10+t*1.5;h+=0.18*sin(d2);gx+=0.18*1.10*(-0.24)*cos(d2);gz+=0.18*1.10*(-0.97)*cos(d2);
float d3=dot(vec2(0.33,-0.94),p.xz)*2.2+t*1.9;h+=0.085*sin(d3);gx+=0.085*2.2*0.33*cos(d3);gz+=0.085*2.2*(-0.94)*cos(d3);
float d4=dot(vec2(-0.47,-0.88),p.xz)*4.0+t*2.5;h+=0.045*sin(d4);gx+=0.045*4.0*(-0.47)*cos(d4);gz+=0.045*4.0*(-0.88)*cos(d4);
float shoreAmp=exp(-abs(sh)*3.2);
float runup=sin(p.z*0.55-t*0.8)+0.45*sin(p.z*1.1-t*1.3+1.3);
p.y+=h*amp+runup*0.11*shoreAmp*(0.55+uAmp*0.9);
vN=normalize(vec3(-gx*amp,1.0,-gz*amp));
vW=(modelMatrix*vec4(p,1.0)).xyz;
gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
    // fragmentShader: 深さによる水色・空の反射・太陽/月のきらめき・岸の泡(foam)・遠景フォグを合成する。
    fragmentShader: `uniform float uTime;uniform float uDay;uniform float uSpeed;uniform float uGust;uniform float uAmp;uniform vec3 uCam;varying vec3 vN;varying vec3 vW;
${NOISE}
${SKYF}
${SANDH}
void main(){float t=uTime;float dayK=smoothstep(0.0,1.0,uDay);
float sh=sandH(vW.x,vW.z);float depth=max(vW.y-sh,0.0);
vec3 N=normalize(vN+0.09*vec3(fbm(vec3(vW.xz*1.9,t*0.55)),0.0,fbm(vec3(vW.zx*1.9+7.0,t*0.6))));
vec3 V=normalize(uCam-vW);
float fres=pow(1.0-max(dot(N,V),0.0),3.0);
vec3 R=reflect(-V,N);R.y=abs(R.y);
float df=1.0-exp(-depth*0.72);
float df2=1.0-exp(-depth*0.30);
vec3 dayBody=mix(vec3(0.34,0.90,0.80),vec3(0.02,0.44,0.66),df);
dayBody=mix(dayBody,vec3(0.004,0.22,0.50),df2);
vec3 nightBody=vec3(0.008,0.020,0.050)+df*vec3(0.0,0.012,0.032);
vec3 body=mix(nightBody,dayBody,dayK);
float rcov;vec3 refl=skyBase(R,uDay,t,rcov)+nightSky(R,uDay,t)*0.6*(1.0-rcov*0.9);
vec3 col=body*(0.55+0.45*max(N.y,0.0))+refl*fres*0.92;
vec3 sunD=normalize(vec3(0.35,0.72,-0.60));
float spec=pow(max(dot(R,sunD),0.0),300.0);
float specW=pow(max(dot(R,sunD),0.0),24.0);
float glit=pow(clamp(0.5+0.5*snoise(vec3(vW.xz*26.0,t*2.2)),0.0,1.0),18.0);
col+=vec3(1.0,0.97,0.88)*spec*3.0*dayK;
col+=vec3(1.0,0.95,0.85)*glit*(0.5+2.6*specW)*dayK*smoothstep(0.05,0.4,depth);
float dusk=smoothstep(0.12,0.45,uDay)*smoothstep(0.78,0.45,uDay);
col+=vec3(1.0,0.45,0.15)*specW*dusk*0.9;
float moonSpec=pow(max(dot(R,normalize(vec3(-0.25,0.55,-0.75))),0.0),180.0);
col+=vec3(0.75,0.85,1.0)*moonSpec*0.5*(1.0-dayK);
float lace=smoothstep(0.25,0.70,fbm(vec3(vW.xz*3.2,t*0.4))+0.25*sin(vW.z*2.2-t*0.9));
float holes=smoothstep(0.15,0.75,fbm(vec3(vW.xz*7.5+4.0,t*0.55)));
float bub=smoothstep(0.55,0.95,fbm(vec3(vW.xz*16.0,t*0.9)));
float crest=smoothstep(0.5,1.15,vW.y/max(0.16+uAmp*0.5,0.05))*smoothstep(3.5,0.8,depth)*(0.4+0.6*lace);
float foamEdge=smoothstep(0.22,0.005,depth)*(0.35+0.65*lace)*(0.45+0.55*holes)+bub*smoothstep(0.10,0.01,depth)*0.6+crest*0.85;
float foamBands=smoothstep(0.55,0.95,0.5+0.5*sin(depth*8.0-t*(1.0+uSpeed*1.7))+0.35*fbm(vec3(vW.xz*2.6,t*0.5)))*smoothstep(0.55,0.10,depth);
float foam=clamp(foamEdge+foamBands*0.8,0.0,1.0)*(0.8+uGust*0.6);
foam*=0.75+0.25*fbm(vec3(vW.xz*7.0,t*0.8));
vec3 foamC=vec3(0.94,0.97,0.97)*mix(0.14,1.0,dayK);
col=mix(col,foamC,foam*0.85);
float alpha=clamp(0.12+df*0.70+fres*0.30,0.0,0.96);
alpha=mix(alpha,1.0,foam*0.8);
float dist=length(uCam-vW);float fog=smoothstep(28.0,110.0,dist);
vec3 fogc=mix(vec3(0.010,0.020,0.048),vec3(0.70,0.85,0.95),dayK);
col=mix(col,fogc,fog);alpha=mix(alpha,1.0,fog);
gl_FragColor=vec4(col,alpha);}`,
  });
  // 水面は砂よりさらに細かく分割する
  const watGeo = new THREE.PlaneGeometry(220, 220, 180, 180);
  // 水平向きに倒す
  watGeo.rotateX(-Math.PI / 2);
  group.add(new THREE.Mesh(watGeo, waterMat));

  // 返り値: ループから更新する3つのマテリアルとグループ。
  return { group, skyMat, sandMat, waterMat };
}

// createOceanAnim: 見回しの角度・慣性・突風量の初期状態を作る。
export function createOceanAnim(): OceanAnim {
  return { yaw: 0, pit: 0, vyaw: 0, vpit: 0, burst: 0 };
}

// updateOcean: 毎フレームの更新(元コードの tick の oce 分岐に相当)。
// camera は R3F が用意した現在のカメラ。注視点(lookAt)を動かして水平線を見回す。
export function updateOcean(
  // 構築済みオブジェクト
  b: OceanBuilt,
  // 可変状態
  a: OceanAnim,
  // ポインタ操作の生データ
  drag: DragState,
  // 現在のスライダー値
  p: OceParams,
  // 経過秒数
  time: number,
  // 現在のカメラ
  camera: THREE.Camera,
): void {
  // タップされていたら突風を最大にし、フラグを消費する。
  if (drag.tap) {
    a.burst = 1;
    drag.tap = false;
  }
  // ドラッグ量を見回し速度へ加え、消費する(海は感度を低めに)。
  // 横ドラッグ→左右の見回し
  a.vyaw += drag.mx * 0.0009;
  // 縦ドラッグ→上下の見回し
  a.vpit += drag.my * 0.0006;
  // 消費
  drag.mx = 0;
  // 消費
  drag.my = 0;

  // 突風を減衰させる。
  a.burst *= 0.955;
  // 十分小さくなったら0に
  if (a.burst < 0.001) a.burst = 0;

  // 見回し角を慣性込みで更新し、可動範囲に制限する。
  // 左右角に速度を加える
  a.yaw += a.vyaw;
  // 慣性減衰
  a.vyaw *= 0.92;
  // 左右の範囲制限
  a.yaw = Math.max(-0.8, Math.min(0.8, a.yaw));
  // 上下角に速度を加える
  a.pit += a.vpit;
  // 慣性減衰
  a.vpit *= 0.92;
  // 上下の範囲制限
  a.pit = Math.max(-0.45, Math.min(0.3, a.pit));
  // カメラは位置固定のまま、注視点だけを動かして水平線を見回す。
  camera.lookAt(Math.sin(a.yaw) * 40, 0.2 - a.pit * 26, 9 - Math.cos(a.yaw) * 46);

  // フォグ・反射計算に使うカメラ位置を、実際に描画に使われているカメラの位置へ同期する。
  (b.waterMat.uniforms.uCam.value as THREE.Vector3).copy(camera.position);
  (b.sandMat.uniforms.uCam.value as THREE.Vector3).copy(camera.position);

  // 水面マテリアルへ現在値を渡す。
  b.waterMat.uniforms.uTime.value = time;
  // 昼夜
  b.waterMat.uniforms.uDay.value = p.amb;
  // 波の高さ
  b.waterMat.uniforms.uAmp.value = p.wave;
  // 波の速さ
  b.waterMat.uniforms.uSpeed.value = p.speed;
  // 突風
  b.waterMat.uniforms.uGust.value = a.burst;

  // 空マテリアルへ現在値を渡す。
  b.skyMat.uniforms.uTime.value = time;
  // 昼夜
  b.skyMat.uniforms.uDay.value = p.amb;

  // 砂マテリアルへ現在値を渡す。
  b.sandMat.uniforms.uTime.value = time;
  // 昼夜
  b.sandMat.uniforms.uDay.value = p.amb;
  // 波の速さ
  b.sandMat.uniforms.uSpeed.value = p.speed;
}

// disposeOcean: アンマウント時に GPU リソースを解放する。
export function disposeOcean(b: OceanBuilt): void {
  b.group.traverse((obj) => {
    // Mesh とみなす
    const mesh = obj as THREE.Mesh;
    // ジオメトリ解放
    mesh.geometry?.dispose();
    // マテリアル
    const mat = mesh.material as THREE.Material | undefined;
    // マテリアル解放
    mat?.dispose();
  });
}
