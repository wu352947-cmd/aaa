import * as THREE from 'three';
import * as T from './textures.js';

// 所有共享材质；按 key 供 Builder 使用
export function createMaterials() {
  const stone = T.stoneTextures();
  const carved = T.carvedTextures();
  const lead = T.leadTextures();
  const slate = T.roofTileTextures('slate');
  const tile = T.roofTileTextures('tile');
  const paving = T.pavingTextures();
  const ground = T.groundTextures();
  const wood = T.woodTextures();
  const plaster = T.plasterTextures();
  const floor = T.floorTextures();
  const facade = T.facadeAtlas();
  const lancet = T.lancetGlass();

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const m = {};
  m.stone = std({ map: stone.map, normalMap: stone.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92, metalness: 0 });
  m.stoneDark = std({ map: stone.map, normalMap: stone.normalMap, color: 0xb8ad98, roughness: 0.95 });
  m.stoneInt = std({ map: stone.map, normalMap: stone.normalMap, color: 0xd8ccb4, roughness: 0.9 });
  m.vault = std({ map: stone.map, normalMap: stone.normalMap, color: 0xe2d8c4, roughness: 0.95, side: THREE.DoubleSide });
  m.carved = std({ map: carved.map, normalMap: carved.normalMap, roughness: 0.85 });
  m.lead = std({ map: lead.map, normalMap: lead.normalMap, color: 0xd8d8d0, roughness: 0.62, metalness: 0.12 });
  m.slate = std({ map: slate.map, normalMap: slate.normalMap, roughness: 0.7, metalness: 0.05 });
  m.tile = std({ map: tile.map, normalMap: tile.normalMap, roughness: 0.85 });
  m.paving = std({ map: paving.map, normalMap: paving.normalMap, roughness: 0.9 });
  m.wood = std({ map: wood.map, normalMap: wood.normalMap, roughness: 0.8 });
  m.woodDark = std({ map: wood.map, normalMap: wood.normalMap, color: 0x6a5040, roughness: 0.75 });
  m.plaster = std({ map: plaster.map, normalMap: plaster.normalMap, roughness: 0.95 });
  m.floor = std({ map: floor.map, normalMap: floor.normalMap, roughness: 0.72 });
  m.facade = std({ map: facade.map, emissiveMap: facade.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.9 });
  m.gold = std({ color: 0xd4a640, roughness: 0.28, metalness: 1.0 });
  m.gilt = std({ map: carved.map, color: 0xe8c070, roughness: 0.4, metalness: 0.6 });
  m.bronze = std({ color: 0x8a6a3a, roughness: 0.38, metalness: 1.0 });
  m.iron = std({ color: 0x2a2826, roughness: 0.6, metalness: 0.8 });
  m.redCloth = std({ color: 0x8a1c1c, roughness: 0.95 });
  m.blueCloth = std({ color: 0x1e3170, roughness: 0.95 });
  m.whiteCloth = std({ color: 0xe8e0d0, roughness: 0.95 });
  m.paintKing = std({ map: carved.map, normalMap: carved.normalMap, color: 0xd8c8a0, roughness: 0.7 });
  m.choirRelief = std({ map: T.choirRelief(), roughness: 0.6 });
  m.choirRelief.map.repeat.set(1, 1);
  m.inscription = std({ map: T.inscriptionTex(), roughness: 0.9 });
  m.door = std({ map: T.doorTex(), roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide });
  m.darkVoid = new THREE.MeshBasicMaterial({ color: 0x0b0a09 });
  m.candle = new THREE.MeshStandardMaterial({ color: 0xf2ead8, emissive: 0x443322, roughness: 0.6 });
  m.flame = new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false });
  m.flame.userData.noShadow = true;
  m.water = null; // 在 river.js 中单独创建

  // 彩绘玻璃：室内侧为发光材质，室外侧为深色反光材质
  m.glassIn = new THREE.MeshBasicMaterial({ map: lancet, side: THREE.FrontSide });
  m.glassIn.userData.noShadow = true;
  m.glassOut = std({ map: lancet, color: 0x2a2e36, roughness: 0.12, metalness: 0.6, emissiveMap: lancet, emissive: 0xffa060, emissiveIntensity: 0 });
  m.glassOut.userData.noShadow = true;
  for (const kind of ['west', 'north', 'south']) {
    const r = T.roseWindow(kind);
    const k = kind[0].toUpperCase() + kind.slice(1);
    m['rose' + k + 'In'] = new THREE.MeshBasicMaterial({ map: r.glow, transparent: false, alphaTest: 0.5 });
    m['rose' + k + 'In'].userData.noShadow = true;
    m['rose' + k + 'Out'] = std({ map: r.outside, alphaTest: 0.5, roughness: 0.25, metalness: 0.3, emissiveMap: r.glow, emissive: 0xffa060, emissiveIntensity: 0 });
    m['rose' + k + 'Out'].userData.noShadow = true;
  }
  for (const kind of ['judgment', 'virgin', 'anne']) {
    const t = T.tympanum(kind);
    m['tymp_' + kind] = std({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.85 });
  }
  for (let i = 0; i < 4; i++) {
    m['banner' + i] = std({ map: T.bannerTex(i), side: THREE.DoubleSide, roughness: 0.95 });
    m['banner' + i].userData.noShadow = true;
  }

  // 地形材质：草地/泥土与石板路按顶点属性 paved 混合
  const g = std({ map: ground.map, normalMap: ground.normalMap, roughness: 0.95 });
  g.onBeforeCompile = (sh) => {
    sh.uniforms.pavedMap = { value: paving.map };
    sh.uniforms.pavedNormal = { value: paving.normalMap };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float paved;\nvarying float vPaved;\nvarying vec2 vWuv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPaved = paved;\nvWuv = (modelMatrix * vec4(position,1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D pavedMap;\nvarying float vPaved;\nvarying vec2 vWuv;')
      .replace('#include <map_fragment>', `
        vec4 g1 = texture2D( map, vWuv / 8.0 );
        vec4 g2 = texture2D( pavedMap, vWuv / 2.6 );
        float farMix = smoothstep(80.0, 400.0, length(vViewPosition));
        vec4 g1b = texture2D( map, vWuv / 41.0 );
        g1 = mix(g1, g1b * 1.05, farMix * 0.6);
        diffuseColor *= mix(g1, g2, vPaved);
      `);
  };
  m.ground = g;
  m.groundFar = std({ color: 0x5d6040, roughness: 1 });

  // 雕塑/天使使用较亮石材
  m.statue = std({ map: carved.map, normalMap: carved.normalMap, color: 0xe6dcc4, roughness: 0.82 });

  return m;
}
