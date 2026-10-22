// 巴黎圣母院平面与高度常量（单位：米；x 向东，z 向南，y 向上；西立面中心地面为原点）
// 参考：全长约 127–128 米，宽 48 米，西立面宽约 43.5 米，钟楼高 69 米，
// 中殿拱顶高约 33 米，西玫瑰窗直径约 9.6 米，南北玫瑰窗直径约 13 米。
export const P = {
  FL: 1.8,            // 室内地坪：雨果写到西立面前曾有 11 级台阶
  ZF: 21.75,          // 西立面半宽
  BI0: 4.95, BI1: 7.55,     // 内侧扶壁
  BO0: 19.15, BO1: 21.75,   // 外侧扶壁
  XT: 15,             // 钟楼进深
  NAVE0: 15, NAVE1: 57, NAVE_BAYS: 8,
  CROSS0: 57, CROSS1: 71,
  CHOIR0: 71, CHOIR1: 104, CHOIR_BAYS: 6,
  XA: 104,            // 半圆后殿圆心
  NH: 6.25,           // 中殿拱廊墙轴线
  AI: 12.5,           // 内外侧廊之间的柱列
  OW: 24,             // 礼拜堂外墙
  ARC_SPRING: 9.6,
  TRIB_Y: 14.6,
  CLER_Y: 24.6,
  VS: 26, VC: 35.5,   // 主拱顶起拱/拱顶高
  WALL_TOP: 37.5,
  RIDGE: 46.2,
  AVS: 8, AVC: 11.4,  // 侧廊拱顶
  CHAPEL_TOP: 13.5,
  KINGS_Y: 19.5,
  ROSE_Y: 32.2,
  GAL_Y: 40,
  CHIM_Y: 46.6,       // 双塔之间的上层长廊
  BELFRY_FLOOR: 49.0,
  TOWER_TOP: 68.2,
};
export const naveBayX = (i) => P.NAVE0 + (P.NAVE1 - P.NAVE0) * i / P.NAVE_BAYS;
export const choirBayX = (i) => P.CHOIR0 + (P.CHOIR1 - P.CHOIR0) * i / P.CHOIR_BAYS;
