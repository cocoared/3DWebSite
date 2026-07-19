// このモジュールは、3つのシーンで共有する GLSL(シェーダー言語)のコード断片を文字列として提供する。
// 各シーンのシェーダー本体は、これらの断片をテンプレートリテラルで埋め込んで組み立てる。
// GLSL は three.js のシェーダーへ「そのまま」渡す純粋なデータなので、TypeScript 側の意味を持つ行にコメントを付ける。

// NOISE: 3次元シンプレックスノイズ(snoise)と、その多重合成(fbm=fractal Brownian motion)を提供する GLSL 断片。
// - permute / taylorInvSqrt: シンプレックスノイズ内部で使う補助関数(ハッシュと逆平方根の近似)。
// - snoise(vec3): 座標を渡すと -1〜1 の連続的な乱数(雲・炎・波などの自然な揺らぎの素)を返す。
// - fbm(vec3): snoise を周波数を倍にしながら5回重ねて、より複雑で自然な模様を作る。
// 太陽の表面・炎、海の波・泡、空の雲・星など、ほぼ全ての「有機的な揺らぎ」がこの断片に依存する。
export const NOISE = `vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+2.0*C.xxx;vec3 x3=x0-1.0+3.0*C.xxx;i=mod(i,289.0);vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));float n_=1.0/7.0;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float fbm(vec3 p){float s=0.0;float a=0.5;for(int i=0;i<5;i++){s+=a*snoise(p);p*=2.02;a*=0.5;}return s;}`;

// SANDH: 砂浜の高さ関数 sandH(x,z)。海側(z が小さい)ほど低く、岸側ほど高くなる緩やかな傾斜に、
// 複数の sin 波を足して自然な砂の起伏を作る。海の水面シェーダーと砂シェーダーの両方が、
// 同じ地形高さを共有するためにこの関数を使う(=水と砂の境目がずれない)。
export const SANDH = `float sandH(float x,float z){return (z-2.0)*0.062+0.035*sin(x*0.8+z*0.6)+0.02*sin(x*2.3-z*1.7)+0.012*sin(z*6.0+sin(x*0.7)*2.0);}`;

// SKYF: 空・雲・星空を描く GLSL 断片。海シーンの空ドームと、水面の反射計算で使う。
// - hash12(vec2): 2次元座標から 0〜1 の擬似乱数を返す(星の配置に使用)。
// - skyBase(): 視線方向 d と昼夜パラメータ day から、青空〜夕焼け〜夜空の地色と、動く雲(cov=雲の被覆率)を返す。
// - starLayer(): 一定密度の星を1層ぶん描く。倍率 sc としきい値 thresh を変えて複数層を重ねると天の川風になる。
// - nightSky(): 昼が暗いほど強く現れる、星・天の川・大気光を合成した夜空を返す。
export const SKYF = `float hash12(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 skyBase(vec3 d,float day,float t,out float cov){float h=max(d.y,0.0);
vec3 dayc=mix(vec3(0.86,0.94,1.00),vec3(0.10,0.40,0.96),pow(h,0.55));
vec3 nightc=mix(vec3(0.035,0.055,0.10),vec3(0.006,0.012,0.038),pow(h,0.5));
vec3 col=mix(nightc,dayc,smoothstep(0.0,1.0,day));
float dusk=smoothstep(0.12,0.45,day)*smoothstep(0.78,0.45,day);
col+=vec3(0.95,0.45,0.18)*dusk*pow(1.0-h,3.0)*0.5;
cov=0.0;
if(h>0.012){vec2 cuv=d.xz/(h+0.18)*0.17;
float cl=fbm(vec3(cuv+vec2(t*0.006,0.0),2.0))+0.55*fbm(vec3(cuv*3.1,5.0));
cov=smoothstep(0.46,0.86,cl)*smoothstep(0.012,0.08,h);
float shade=smoothstep(-0.65,0.55,fbm(vec3(cuv*1.5+8.0,3.0)));
vec3 cloudC=mix(vec3(0.84,0.88,0.94),vec3(1.30,1.28,1.22),shade);
cloudC=mix(cloudC,vec3(1.0,0.62,0.42),dusk*0.5);
cloudC*=mix(0.04,1.0,smoothstep(0.0,1.0,day));
col=mix(col,cloudC,cov*0.88);}
return col;}
float starLayer(vec3 d,float sc,float thresh,float t){vec2 s=vec2(atan(d.z,d.x)*sc,d.y*sc*2.0);vec2 id=floor(s);vec2 f=fract(s);float rn=hash12(id);if(rn<thresh)return 0.0;vec2 sp=vec2(hash12(id+1.3),hash12(id+2.7))*0.8+0.1;float mag=(rn-thresh)/(1.0-thresh);float ds=length(f-sp);float star=smoothstep(0.16+0.18*mag,0.0,ds)*(0.30+0.70*mag);star*=0.65+0.35*sin(t*(1.0+rn*4.0)+rn*40.0);return star;}
vec3 nightSky(vec3 d,float day,float t){float vis=pow(smoothstep(0.32,0.04,day),1.5);if(vis<=0.002)return vec3(0.0);
float deep=smoothstep(0.16,0.02,day);
float s1=starLayer(d,42.0,0.960,t);float s2=starLayer(d,95.0,0.925,t)*0.8;
float s3=starLayer(d,165.0,mix(0.945,0.885,deep),t)*0.6*(0.25+0.75*deep);
float s4=starLayer(d,240.0,0.905,t)*0.45*deep;
float sb=starLayer(d,70.0,0.978,t*0.5)*1.3;
vec3 stars=vec3(0.85,0.90,1.0)*(s1+s2)+vec3(0.95,0.92,1.0)*(s3+s4)+vec3(1.0,0.97,0.90)*sb;
vec3 mwN=normalize(vec3(0.55,0.30,-0.78));float db=abs(dot(d,mwN));
float mw=exp(-db*db*24.0)*(0.35+0.65*fbm(d*6.5+3.0));
float dust=smoothstep(0.15,0.55,fbm(d*9.0+11.0));
mw*=0.5+0.5*fbm(d*14.0);
vec3 mwc=(vec3(0.38,0.48,0.75)+vec3(0.30,0.16,0.22)*fbm(d*4.0))*mw*(1.0-0.55*dust)*deep*0.85;
vec3 airglow=vec3(0.05,0.10,0.14)*pow(1.0-max(d.y,0.0),4.0)*deep*0.5;
return (stars+mwc+airglow)*vis;}`;
