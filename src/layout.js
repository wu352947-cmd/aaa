// 户型数据：西湖·湖滨 6F 一梯一户，三室两厅（客厅、餐厅）+ 书房茶室 + 湖景露台
// 坐标：单位米。-Z 方向朝西（正对西湖），+X 指向北（保俶塔一侧），-X 指向南（雷峰塔一侧）。
export const H = 3.0; // 层高（结构）
export const GROUND = -17.0; // 室外地坪（本户位于 6 层）
export const WATER = -17.6; // 西湖水面
export const EXT_T = 0.24; // 外墙厚
export const INT_T = 0.12; // 内墙厚

export const rooms = [
  { id: 'living', name: '客厅', area: 54, x1: -4, x2: 5, z1: 0, z2: 6, floor: 'floorOak', wall: 'wall', ceil: 3.0, cove: true },
  { id: 'dining', name: '餐厅', area: 42, x1: -5.5, x2: 1.5, z1: 6, z2: 12, floor: 'floorMarble', wall: 'wall', ceil: 3.0, cove: true },
  { id: 'foyer', name: '玄关', area: 21, x1: 1.5, x2: 5, z1: 6, z2: 12, floor: 'floorMarble', wall: 'wall', ceil: 2.85 },
  { id: 'kitchen', name: '厨房', area: 24, x1: 5, x2: 9, z1: 6, z2: 12, floor: 'floorGreyStone', wall: 'tileWall', ceil: 2.7 },
  { id: 'master', name: '主卧', area: 48, x1: -12, x2: -4, z1: 0, z2: 6, floor: 'floorOak', wall: 'wall', ceil: 3.0, cove: true },
  { id: 'mbath', name: '主卫', area: 21, x1: -12, x2: -8.5, z1: 6, z2: 12, floor: 'bathMarble', wall: 'bathMarble', ceil: 2.7, noSkirt: true },
  { id: 'closet', name: '衣帽间', area: 9, x1: -8.5, x2: -5.5, z1: 6, z2: 9, floor: 'floorOak', wall: 'wall', ceil: 2.8 },
  { id: 'study', name: '书房·茶室', area: 9, x1: -8.5, x2: -5.5, z1: 9, z2: 12, floor: 'floorOak', wall: 'wallWarm', ceil: 2.8 },
  { id: 'bed2', name: '次卧', area: 42, x1: 5, x2: 12, z1: 0, z2: 6, floor: 'floorOak', wall: 'wall', ceil: 2.9, cove: true },
  { id: 'bath2', name: '次卫', area: 9, x1: 9, x2: 12, z1: 6, z2: 9, floor: 'tileFloor', wall: 'bathMarble', ceil: 2.6, noSkirt: true },
  { id: 'laundry', name: '洗衣房', area: 9, x1: 9, x2: 12, z1: 9, z2: 12, floor: 'tileFloor', wall: 'tileWall', ceil: 2.6, noSkirt: true },
  { id: 'terrace', name: '湖景露台', area: 22, x1: -3.8, x2: 4.8, z1: -2.6, z2: 0, floor: 'deck', outdoor: true },
];

// 墙：axis 'x' 表示墙沿 x 方向延伸（位于 z = c），'z' 表示沿 z 方向（位于 x = c）
// openings: [from, to, bottom, top, kind]
const D = 2.4; // 门洞高
export const walls = [
  // 外墙
  { axis: 'x', c: 12 + EXT_T / 2, from: -12 - EXT_T, to: 12 + EXT_T, t: EXT_T, ext: true,
    openings: [[-11.2, -9.4, 1.0, 2.4, 'win'], [-8.0, -6.0, 0.8, 2.4, 'win'], [2.65, 3.85, 0, D, 'entry'], [5.8, 8.2, 1.05, 2.3, 'win'], [9.8, 11.2, 1.0, 2.3, 'win']] },
  { axis: 'z', c: -12 - EXT_T / 2, from: 0.4, to: 12 + EXT_T, t: EXT_T, ext: true, openings: [] },
  { axis: 'z', c: 12 + EXT_T / 2, from: 0.4, to: 12 + EXT_T, t: EXT_T, ext: true, openings: [] },
  // 内墙
  { axis: 'z', c: -4, from: 0.4, to: 6, t: INT_T, openings: [[4.6, 5.5, 0, D, 'door']] },
  { axis: 'z', c: 5, from: 0.4, to: 12, t: INT_T, openings: [[4.6, 5.5, 0, D, 'door'], [6.5, 7.5, 0, D, 'door']] },
  { axis: 'x', c: 6, from: -12, to: -4, t: INT_T, openings: [[-9.5, -8.7, 0, D, 'door'], [-7.4, -6.6, 0, D, 'door']] },
  { axis: 'z', c: -8.5, from: 6, to: 12, t: INT_T, openings: [] },
  { axis: 'z', c: -5.5, from: 6, to: 12, t: INT_T, openings: [[10.2, 11.0, 0, D, 'door']] },
  { axis: 'x', c: 9, from: -8.5, to: -5.5, t: INT_T, openings: [] },
  { axis: 'x', c: 6, from: 5, to: 12, t: INT_T, openings: [[10.0, 10.8, 0, D, 'door']] },
  { axis: 'z', c: 9, from: 6, to: 12, t: INT_T, openings: [[10.4, 11.2, 0, D, 'door']] },
  { axis: 'x', c: 9, from: 9, to: 12, t: INT_T, openings: [] },
];

// 门：hinge 铰链位置，swing 方向（门扇打开后指向的方向），width 门宽
export const doors = [
  { id: 'master', wall: 3, from: 4.6, to: 5.5, swingTo: 'living' },
  { id: 'bed2', wall: 4, from: 4.6, to: 5.5, swingTo: 'living' },
  { id: 'kitchen', wall: 4, from: 6.5, to: 7.5, swingTo: 'kitchen', glass: true },
  { id: 'mbath', wall: 5, from: -9.5, to: -8.7, swingTo: 'master' },
  { id: 'closet', wall: 5, from: -7.4, to: -6.6, swingTo: 'master' },
  { id: 'study', wall: 7, from: 10.2, to: 11.0, swingTo: 'dining' },
  { id: 'bath2', wall: 9, from: 10.0, to: 10.8, swingTo: 'bed2' },
  { id: 'laundry', wall: 10, from: 10.4, to: 11.2, swingTo: 'laundry' },
];

// 前立面：落地窗分格（x 区间）
export const facade = {
  piers: [[-12.24, -11.84], [-4.2, -3.8], [4.8, 5.2], [11.84, 12.24]],
  bays: [
    { x1: -11.84, x2: -4.2, n: 5 },
    { x1: -3.8, x2: 4.8, n: 6, slide: 2 },
    { x1: 5.2, x2: 11.84, n: 4 },
  ],
};

export function roomAt(x, z) {
  for (const r of rooms) if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return r;
  return null;
}

// 出生点 & 快速传送点
export const spots = {
  living: { x: 0.5, z: 4.4, yaw: 0 },
  terrace: { x: 0.5, z: -1.4, yaw: 0 },
  dining: { x: -1.6, z: 8.2, yaw: Math.PI * 0.75 },
  foyer: { x: 3.25, z: 11.2, yaw: 0 },
  kitchen: { x: 7.0, z: 7.4, yaw: Math.PI },
  master: { x: -6.2, z: 3.4, yaw: Math.PI / 2 },
  mbath: { x: -9.0, z: 7.2, yaw: Math.PI },
  closet: { x: -7.0, z: 7.0, yaw: Math.PI },
  study: { x: -6.2, z: 10.6, yaw: Math.PI / 2 },
  bed2: { x: 7.2, z: 3.2, yaw: -Math.PI / 4 },
  bath2: { x: 10.4, z: 6.8, yaw: Math.PI },
  laundry: { x: 10.0, z: 10.6, yaw: Math.PI },
};
