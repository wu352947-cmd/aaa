// 大气散射近似：雾色随视线与太阳夹角变化（逆光暖、顺光冷），视线越高雾越薄。
// 通过替换 three.js 内置雾的着色器片段实现，所有材质自动生效。
import * as THREE from 'three';

// 使用普通对象（非 Vector3），这样每个材质克隆 uniforms 时共享同一引用
export const fogSun = {
  dir: { value: { x: 0, y: 0.2, z: -1 } },
  color: { value: { x: 1, y: 0.8, z: 0.6 } },
};

export function setFogSun(dir, color) {
  Object.assign(fogSun.dir.value, { x: dir.x, y: dir.y, z: dir.z });
  Object.assign(fogSun.color.value, { x: color.r, y: color.g, z: color.b });
}

const C = THREE.ShaderChunk;
C.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogDir;
#endif`;
C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogDir = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
#endif`;
C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform vec3 fogSunDir;
  uniform vec3 fogSunColor;
  varying float vFogDepth;
  varying vec3 vFogDir;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 fogD = normalize( vFogDir );
  float sunAmt = pow( max( dot( fogD, fogSunDir ), 0.0 ), 9.0 );
  vec3 fogC = mix( fogColor, fogSunColor, sunAmt );
  fogFactor *= 1.0 - smoothstep( 0.02, 0.4, fogD.y ) * 0.55;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
#endif`;

for (const k of Object.keys(THREE.ShaderLib)) {
  const u = THREE.ShaderLib[k].uniforms;
  if (u && u.fogColor) { u.fogSunDir = fogSun.dir; u.fogSunColor = fogSun.color; }
}
THREE.UniformsLib.fog.fogSunDir = fogSun.dir;
THREE.UniformsLib.fog.fogSunColor = fogSun.color;
