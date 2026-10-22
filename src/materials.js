// 材质库：PBR 参数参考真实材料（橡木、爵士白大理石、胡桃木、黄铜、亚麻等）
import * as THREE from 'three';
import * as T from './textures.js';

export const interiorMaterials = new Set();

function std(params, interior = true) {
  const m = new THREE.MeshStandardMaterial(params);
  if (interior) interiorMaterials.add(m);
  return m;
}
function phys(params, interior = true) {
  const m = new THREE.MeshPhysicalMaterial(params);
  if (interior) interiorMaterials.add(m);
  return m;
}

export function repeatTex(t, r) {
  const c = t.clone();
  c.needsUpdate = true;
  if (typeof r === 'number') c.repeat.set(r, r); else c.repeat.set(r[0], r[1]);
  return c;
}

export function createMaterials(quality) {
  const big = quality === 'high' ? 1024 : 1024;
  const M = {};

  // ---------- 地面 ----------
  const hb = T.herringboneWood({ size: big, tone: [182, 140, 96] });
  hb.map.repeat.set(1 / 1.08, 1 / 1.08); hb.bump.repeat.copy(hb.map.repeat);
  M.floorOak = std({ map: hb.map, bumpMap: hb.bump, bumpScale: 0.6, roughness: 0.48, metalness: 0 });
  M.floorOak.userData.noCast = true;

  const marbleFloor = T.marble({ size: big, base: [236, 233, 228], vein: [168, 162, 154], gold: 0.35, seed: 9, slabs: [2, 4] });
  marbleFloor.repeat.set(1 / 2.4, 1 / 2.4);
  M.floorMarble = std({ map: marbleFloor, roughness: 0.12, metalness: 0 });
  M.floorMarble.userData.noCast = true;

  const greyFloor = T.marble({ size: 512, base: [196, 192, 186], vein: [150, 146, 140], gold: 0, seed: 19, slabs: [2, 2], veinScale: 0.6 });
  greyFloor.repeat.set(1 / 1.2, 1 / 1.2);
  M.floorGreyStone = std({ map: greyFloor, roughness: 0.3 });
  M.floorGreyStone.userData.noCast = true;

  const bathTex = T.marble({ size: big, base: [242, 240, 236], vein: [150, 148, 146], gold: 0.1, seed: 29, slabs: [2, 2], veinScale: 1.3 });
  bathTex.repeat.set(1 / 1.6, 1 / 1.6);
  M.bathMarble = std({ map: bathTex, roughness: 0.1 });

  const tvMarbleT = T.marble({ size: big, base: [210, 200, 188], vein: [96, 84, 72], gold: 0.6, seed: 39, slabs: [1, 1], veinScale: 0.8 });
  tvMarbleT.repeat.set(1 / 3.0, 1 / 3.0);
  M.tvMarble = std({ map: tvMarbleT, roughness: 0.08 });

  const darkMarbleT = T.marble({ size: 512, base: [38, 38, 40], vein: [200, 196, 190], seed: 49, slabs: null, dark: true });
  darkMarbleT.repeat.set(1 / 1.5, 1 / 1.5);
  M.darkMarble = std({ map: darkMarbleT, roughness: 0.12 });

  const counterT = T.marble({ size: 512, base: [244, 242, 238], vein: [170, 168, 166], gold: 0, seed: 59, slabs: null, veinScale: 0.7 });
  counterT.repeat.set(1 / 1.6, 1 / 1.6);
  M.counter = std({ map: counterT, roughness: 0.15 });

  const tileT = T.tiles({ size: 512, tone: [214, 212, 208], n: 4, grout: [160, 158, 154] });
  tileT.repeat.set(1 / 1.2, 1 / 1.2);
  M.tileFloor = std({ map: tileT, roughness: 0.35 });
  M.tileFloor.userData.noCast = true;
  const subway = T.tiles({ size: 512, tone: [236, 236, 232], n: 8, grout: [200, 198, 194], seed: 7 });
  subway.repeat.set(1 / 0.6, 1 / 1.2);
  M.tileWall = std({ map: subway, roughness: 0.15 });

  const deckT = T.plankWood({ size: 1024, tone: [126, 92, 64], planks: 8, seed: 33 });
  deckT.repeat.set(1 / 1.2, 1 / 2.4); deckT.rotation = Math.PI / 2;
  M.deck = std({ map: deckT, roughness: 0.75 });

  // ---------- 墙顶 ----------
  const wallT = T.plaster({ size: 512, tone: [238, 234, 226], amp: 0.025 });
  wallT.repeat.set(1 / 2.5, 1 / 2.5);
  const wallBump = T.bumpNoise(256, 5, 16); wallBump.repeat.set(1 / 0.8, 1 / 0.8);
  M.wall = std({ map: wallT, bumpMap: wallBump, bumpScale: 0.15, roughness: 0.92 });
  const warmWallT = T.plaster({ size: 512, tone: [224, 212, 194], amp: 0.05, seed: 14 });
  warmWallT.repeat.set(1 / 2.5, 1 / 2.5);
  M.wallWarm = std({ map: warmWallT, bumpMap: wallBump, bumpScale: 0.25, roughness: 0.9 });
  const clothT = T.wallCloth({ size: 512, tone: [210, 196, 176] });
  clothT.repeat.set(1 / 0.6, 1 / 0.6);
  M.wallCloth = std({ map: clothT, bumpMap: clothT, bumpScale: 0.3, roughness: 0.95 });
  const clothBlueT = T.wallCloth({ size: 512, tone: [150, 164, 172], seed: 18 });
  clothBlueT.repeat.set(1 / 0.6, 1 / 0.6);
  M.wallClothBlue = std({ map: clothBlueT, bumpMap: clothBlueT, bumpScale: 0.3, roughness: 0.95 });
  M.ceiling = std({ color: 0xf4f2ee, roughness: 0.95 });
  M.ceiling.userData.noCast = true;
  M.skirting = std({ color: 0xe9e6e0, roughness: 0.5 });
  M.facade = std({ color: 0xd8d2c6, roughness: 0.8, map: T.plaster({ size: 256, tone: [216, 210, 198], amp: 0.06, seed: 77 }) }, false);
  M.facade.map.repeat.set(1 / 3, 1 / 3);
  M.facadeDark = std({ color: 0x3a3a3c, roughness: 0.5, metalness: 0.6 }, false);

  // ---------- 木作 ----------
  const walnut = T.woodVeneer({ size: 512, tone: [96, 64, 42], seed: 5 });
  walnut.repeat.set(1 / 1.2, 1 / 1.2);
  M.walnut = std({ map: walnut, roughness: 0.42 });
  const walnutDark = T.woodVeneer({ size: 512, tone: [62, 42, 30], seed: 6, rings: 18 });
  walnutDark.repeat.set(1 / 1.2, 1 / 1.2);
  M.walnutDark = std({ map: walnutDark, roughness: 0.38 });
  const oakV = T.woodVeneer({ size: 512, tone: [196, 160, 118], seed: 8, rings: 10 });
  oakV.repeat.set(1 / 1.2, 1 / 1.2);
  M.oak = std({ map: oakV, roughness: 0.5 });
  const rosewood = T.woodVeneer({ size: 512, tone: [88, 40, 28], seed: 10, rings: 22 });
  rosewood.repeat.set(1 / 0.9, 1 / 0.9);
  M.rosewood = std({ map: rosewood, roughness: 0.3 });
  M.lacquerWhite = std({ color: 0xf1eee8, roughness: 0.28 });
  M.lacquerGreige = std({ color: 0xbdb3a6, roughness: 0.35 });
  M.lacquerBlack = std({ color: 0x1b1b1c, roughness: 0.25 });

  // ---------- 金属 ----------
  const brushed = T.brushedMetal(256);
  M.brass = std({ color: 0xc9a46a, metalness: 1, roughness: 0.28, roughnessMap: brushed });
  M.brassDark = std({ color: 0x8c6d43, metalness: 1, roughness: 0.4 });
  M.blackMetal = std({ color: 0x1c1c1e, metalness: 0.7, roughness: 0.45 });
  M.chrome = std({ color: 0xe8e8ea, metalness: 1, roughness: 0.08 });
  M.steel = std({ color: 0xbfc2c4, metalness: 1, roughness: 0.32, roughnessMap: brushed });
  M.gunmetal = std({ color: 0x4a4a4c, metalness: 0.9, roughness: 0.35 });
  M.frame = std({ color: 0x2b2a28, metalness: 0.8, roughness: 0.4 }, false);

  // ---------- 布艺皮革 ----------
  const fab = T.fabric({ size: 256, seed: 12 });
  fab.repeat.set(1 / 0.12, 1 / 0.12);
  M.sofaFabric = std({ map: fab, color: 0xd6d1c8, roughness: 0.95 });
  M.fabricGrey = std({ map: fab, color: 0x9d9a94, roughness: 0.95 });
  M.fabricBeige = std({ map: fab, color: 0xcbb89c, roughness: 0.95 });
  M.fabricBlue = std({ map: fab, color: 0x51677a, roughness: 0.9 });
  M.fabricGreen = std({ map: fab, color: 0x6d7a5e, roughness: 0.92 });
  M.fabricRust = std({ map: fab, color: 0xa8664a, roughness: 0.92 });
  M.velvetGreen = phys({ map: fab, color: 0x3f5a4c, roughness: 0.75, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color(0x8fb3a0) });
  M.bedLinen = std({ map: fab, color: 0xf3f0ea, roughness: 0.98 });
  M.bedThrow = std({ map: fab, color: 0x8a7a66, roughness: 0.95 });
  M.towel = std({ map: fab, color: 0xefebe4, roughness: 1 });
  const linenT = T.fabric({ size: 256, seed: 22, coarse: 1.4 });
  linenT.repeat.set(1 / 0.2, 1 / 0.2);
  M.curtain = std({ map: linenT, color: 0xb9ad9b, roughness: 1, side: THREE.DoubleSide });
  M.sheer = std({ map: linenT, color: 0xfbfaf6, roughness: 1, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
  M.sheer.userData.renderOrder = 2;
  const leatherT = T.leather({ size: 512, tone: [140, 84, 48] });
  leatherT.repeat.set(1 / 0.5, 1 / 0.5);
  M.leather = std({ map: leatherT, roughness: 0.55 });
  const leatherBlackT = T.leather({ size: 512, tone: [40, 36, 34], seed: 17 });
  leatherBlackT.repeat.set(1 / 0.5, 1 / 0.5);
  M.leatherBlack = std({ map: leatherBlackT, roughness: 0.5 });

  M.rugInk = std({ map: T.inkRug({}), roughness: 1 });
  M.rugInk.userData.noCast = true;
  M.rugWool = std({ map: T.wovenRug({ tone: [196, 186, 170] }), roughness: 1 });
  M.rugWool.userData.noCast = true;
  M.rugBlue = std({ map: T.wovenRug({ tone: [118, 132, 146], seed: 43, stripes: false }), roughness: 1 });
  M.rugBlue.userData.noCast = true;

  // ---------- 陶瓷玻璃 ----------
  M.ceramic = std({ color: 0xf7f6f2, roughness: 0.08 });
  M.celadon = phys({ color: 0x9fbfa6, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  M.blueWhite = phys({ color: 0xe9eef2, roughness: 0.1, clearcoat: 1, map: blueWhiteTex(), clearcoatRoughness: 0.05 });
  M.blackCeramic = std({ color: 0x222224, roughness: 0.2 });
  M.terracotta = std({ color: 0x9a5d43, roughness: 0.85 });
  M.stoneGrey = std({ color: 0x8e8c88, roughness: 0.8, map: T.plaster({ size: 256, tone: [150, 148, 144], amp: 0.12, seed: 23 }) });
  M.glass = phys({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.12, envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide, specularIntensity: 1 });
  M.glass.userData.renderOrder = 3;
  M.windowGlass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.0, metalness: 0, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
  M.windowGlass.userData.renderOrder = 4;
  M.windowGlass.userData.noShadow = true;
  M.tintGlass = phys({ color: 0x9aa4a4, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false });
  M.tintGlass.userData.renderOrder = 3;
  M.frosted = phys({ color: 0xf2f4f4, roughness: 0.5, transparent: true, opacity: 0.7, depthWrite: false });
  M.frosted.userData.renderOrder = 3;
  M.mirror = std({ color: 0xb4b8ba, metalness: 1, roughness: 0.06 });
  M.screen = std({ color: 0x050607, roughness: 0.12, metalness: 0.2 });
  M.water = phys({ color: 0xcfe6ea, roughness: 0.02, transparent: true, opacity: 0.5, depthWrite: false });

  // ---------- 植物 ----------
  M.leaf = std({ color: 0x3f6b33, roughness: 0.6, side: THREE.DoubleSide });
  M.leafDark = std({ color: 0x2d4f2a, roughness: 0.55, side: THREE.DoubleSide });
  M.leafLight = std({ color: 0x6f8f45, roughness: 0.6, side: THREE.DoubleSide });
  M.stem = std({ color: 0x5b4a33, roughness: 0.9 });
  M.soil = std({ color: 0x3a2e24, roughness: 1 });
  M.pebble = std({ color: 0xd8d4cc, roughness: 0.6 });
  M.orchid = std({ color: 0xf6f0f2, roughness: 0.5, side: THREE.DoubleSide });
  M.moss = std({ color: 0x4f6b2e, roughness: 1 });

  // ---------- 发光 ----------
  M.lightStrip = std({ color: 0x000000, emissive: 0xffd9a8, emissiveIntensity: 2.2 });
  M.lightStrip.userData.noShadow = true;
  M.downlight = std({ color: 0x000000, emissive: 0xfff1dc, emissiveIntensity: 2.5 });
  M.downlight.userData.noShadow = true;
  M.lampShade = std({ color: 0xf4ead8, emissive: 0xffd7a0, emissiveIntensity: 0.0, roughness: 0.9, side: THREE.DoubleSide });
  M.lampShade.userData.noCast = true;
  M.paperLantern = std({ color: 0xf6efe0, emissive: 0xffd9a8, emissiveIntensity: 0.0, roughness: 0.95, side: THREE.DoubleSide });
  M.paperLantern.userData.noCast = true;
  M.fridgeLight = std({ color: 0x000000, emissive: 0xe8f2ff, emissiveIntensity: 1.2 });

  // ---------- 画与书 ----------
  M.painting = std({ map: T.inkPainting({ w: 1024, h: 512, title: '西湖烟雨' }), roughness: 0.9 });
  M.painting2 = std({ map: T.inkPainting({ w: 512, h: 1024, seed: 57, title: '南屏晚钟', vertical: true }), roughness: 0.9 });
  M.painting3 = std({ map: T.inkPainting({ w: 1024, h: 512, seed: 63, title: '平湖秋月' }), roughness: 0.9 });
  M.calligraphy = std({ map: T.calligraphy({ text: '水光潋滟晴方好' }), roughness: 0.9 });
  M.calligraphy2 = std({ map: T.calligraphy({ text: '山色空蒙雨亦奇', seed: 67 }), roughness: 0.9 });
  M.books = std({ map: T.bookSpines({}), roughness: 0.8 });
  M.books2 = std({ map: T.bookSpines({ seed: 73 }), roughness: 0.8 });
  M.paper = std({ color: 0xf2ede2, roughness: 0.9 });
  M.fruitOrange = std({ color: 0xe48a2a, roughness: 0.5 });
  M.fruitGreen = std({ color: 0x9ab84a, roughness: 0.45 });
  M.fruitRed = std({ color: 0xa8282a, roughness: 0.35 });
  M.tea = std({ color: 0x8a9a3e, roughness: 0.6 });
  M.candle = std({ color: 0xf2ebdc, roughness: 0.6 });
  M.black = std({ color: 0x0c0c0d, roughness: 0.6 });
  M.white = std({ color: 0xf5f5f3, roughness: 0.4 });
  M.appliance = std({ color: 0xdedcd8, roughness: 0.25, metalness: 0.3 });
  M.rubber = std({ color: 0x222222, roughness: 0.9 });

  // ---------- 阴影贴片 ----------
  M.blob = new THREE.MeshBasicMaterial({ map: T.blobShadow(), transparent: true, depthWrite: false, color: 0x000000, alphaMap: null });
  M.blob.map = null; M.blob.alphaMap = T.blobShadow(); M.blob.opacity = 0.75;
  M.blob.userData.renderOrder = 1; M.blob.userData.noShadow = true;
  M.boxShadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, alphaMap: T.boxShadow(), opacity: 0.7 });
  M.boxShadow.userData.renderOrder = 1; M.boxShadow.userData.noShadow = true;

  return M;
}

function blueWhiteTex() {
  const c = T.canvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2f4f6'; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#2a4a8a'; ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 4) ctx.lineTo(x, 60 + i * 28 + Math.sin(x * 0.08 + i) * 8);
    ctx.stroke();
  }
  ctx.fillStyle = '#2a4a8a';
  for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.arc(18 * i + 8, 30, 5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillRect(0, 226, 256, 6);
  return T.tex(c);
}
