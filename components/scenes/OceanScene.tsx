"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { NOISE, SANDH, SKYF } from "@/lib/shaders";
import { useDragInteraction } from "@/lib/useDragInteraction";
import type { OceParams } from "@/lib/scene";

// OceanScene: 浜辺シーン本体。空ドーム・砂浜・寄せ返す波の3枚を、共有シェーダーで描く。
export default function OceanScene({ params }: { params: OceParams }) {
  // paramsRef: 最新のスライダー値を再レンダーなしでループから読むための ref。
  const paramsRef = useRef(params);
  paramsRef.current = params; // 毎レンダーで更新する

  // camera: R3F が用意した現在のカメラ。視線(lookAt)を毎フレーム動かすために取得する。
  const camera = useThree((state) => state.camera);
  // drag: ポインタ操作(見回し・タップ突風)の状態。
  const drag = useDragInteraction();

  // built: 空・砂・水のメッシュとマテリアルを初回に一度だけ構築する。
  const built = useMemo(() => {
    // group: 3枚のメッシュをまとめる入れ物。
    const group = new THREE.Group();

    // 空ドーム: 内側(BackSide)から見る巨大な球に、空・雲・星空シェーダーを貼る。
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, // 球の内側を描く
      depthWrite: false, // 深度書き込みなし(常に一番奥の背景として扱う)
      uniforms: { uTime: { value: 0 }, uDay: { value: 0.85 } }, // uTime=時間, uDay=昼夜(1で昼)
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
        uTime: { value: 0 }, // 時間
        uDay: { value: 0.85 }, // 昼夜
        uSpeed: { value: 0.45 }, // 波の速さ(濡れ際の動きに使う)
        uCam: { value: new THREE.Vector3(0, 1.8, 9) }, // カメラ位置(毎フレーム実カメラの位置で更新する)
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
    const sandGeo = new THREE.PlaneGeometry(220, 220, 120, 120); // 220×220 を細かく分割した平面
    sandGeo.rotateX(-Math.PI / 2); // 水平(床)向きに倒す
    group.add(new THREE.Mesh(sandGeo, sandMat));

    // 波(水面): 頂点で複数のサイン波+岸での駆け上がりを合成し、フラグメントで反射・泡・透過を描く。
    const waterMat = new THREE.ShaderMaterial({
      transparent: true, // 水は半透明
      uniforms: {
        uTime: { value: 0 }, // 時間
        uDay: { value: 0.85 }, // 昼夜
        uAmp: { value: 0.5 }, // 波の高さ
        uSpeed: { value: 0.45 }, // 波の速さ
        uGust: { value: 0 }, // 突風(タップで一時的に高まる)
        uCam: { value: new THREE.Vector3(0, 1.8, 9) }, // カメラ位置(毎フレーム実カメラの位置で更新する)
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
    const watGeo = new THREE.PlaneGeometry(220, 220, 180, 180); // 水面は砂よりさらに細かく分割する
    watGeo.rotateX(-Math.PI / 2); // 水平向きに倒す
    group.add(new THREE.Mesh(watGeo, waterMat));

    // 返り値: ループから更新する3つのマテリアルとグループ。
    return { group, skyMat, sandMat, waterMat };
  }, []);

  // anim: 見回しの角度と慣性、突風量を持ち越す。
  const anim = useRef({
    yaw: 0, // 左右の見回し角
    pit: 0, // 上下の見回し角
    vyaw: 0, // 左右の速度(慣性)
    vpit: 0, // 上下の速度(慣性)
    burst: 0, // タップで発生する突風(減衰する)
  });

  // 毎フレームの更新(元コードの tick の oce 分岐に相当)。
  useFrame((state) => {
    const time = state.clock.getElapsedTime(); // 経過秒数
    const p = paramsRef.current; // 現在のスライダー値
    const a = anim.current; // 可変状態
    const b = built; // 構築済みオブジェクト

    // タップされていたら突風を最大にし、フラグを消費する。
    if (drag.current.tap) {
      a.burst = 1;
      drag.current.tap = false;
    }
    // ドラッグ量を見回し速度へ加え、消費する(海は感度を低めに)。
    a.vyaw += drag.current.mx * 0.0009; // 横ドラッグ→左右の見回し
    a.vpit += drag.current.my * 0.0006; // 縦ドラッグ→上下の見回し
    drag.current.mx = 0; // 消費
    drag.current.my = 0; // 消費

    // 突風を減衰させる。
    a.burst *= 0.955;
    if (a.burst < 0.001) a.burst = 0; // 十分小さくなったら0に

    // 見回し角を慣性込みで更新し、可動範囲に制限する。
    a.yaw += a.vyaw; // 左右角に速度を加える
    a.vyaw *= 0.92; // 慣性減衰
    a.yaw = Math.max(-0.8, Math.min(0.8, a.yaw)); // 左右の範囲制限
    a.pit += a.vpit; // 上下角に速度を加える
    a.vpit *= 0.92; // 慣性減衰
    a.pit = Math.max(-0.45, Math.min(0.3, a.pit)); // 上下の範囲制限
    // カメラは位置固定のまま、注視点だけを動かして水平線を見回す。
    camera.lookAt(Math.sin(a.yaw) * 40, 0.2 - a.pit * 26, 9 - Math.cos(a.yaw) * 46);

    // フォグ・反射計算に使うカメラ位置を、実際に描画に使われているカメラの位置へ同期する。
    (b.waterMat.uniforms.uCam.value as THREE.Vector3).copy(camera.position);
    (b.sandMat.uniforms.uCam.value as THREE.Vector3).copy(camera.position);

    // 水面マテリアルへ現在値を渡す。
    b.waterMat.uniforms.uTime.value = time;
    b.waterMat.uniforms.uDay.value = p.amb; // 昼夜
    b.waterMat.uniforms.uAmp.value = p.wave; // 波の高さ
    b.waterMat.uniforms.uSpeed.value = p.speed; // 波の速さ
    b.waterMat.uniforms.uGust.value = a.burst; // 突風

    // 空マテリアルへ現在値を渡す。
    b.skyMat.uniforms.uTime.value = time;
    b.skyMat.uniforms.uDay.value = p.amb; // 昼夜

    // 砂マテリアルへ現在値を渡す。
    b.sandMat.uniforms.uTime.value = time;
    b.sandMat.uniforms.uDay.value = p.amb; // 昼夜
    b.sandMat.uniforms.uSpeed.value = p.speed; // 波の速さ
  });

  // アンマウント時に GPU リソースを解放する。
  useEffect(() => {
    const b = built; // 破棄対象
    return () => {
      b.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh; // Mesh とみなす
        mesh.geometry?.dispose(); // ジオメトリ解放
        const mat = mesh.material as THREE.Material | undefined; // マテリアル
        mat?.dispose(); // マテリアル解放
      });
    };
  }, [built]);

  // このシーン専用のカメラ(遠景まで見えるよう far を大きく)を規定カメラとして登録し、グループを追加する。
  return (
    <>
      <PerspectiveCamera makeDefault fov={55} near={0.1} far={600} position={[0, 1.8, 9]} />
      <primitive object={built.group} />
    </>
  );
}
