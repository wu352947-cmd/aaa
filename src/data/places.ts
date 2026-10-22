/**
 * 校园建筑与视点。坐标系：x 向东，z 向南，y 向上，单位米。
 * 总平面参考新校区鸟瞰效果图：笃行楼居中朝南，东侧天文台与艺体馆，
 * 东南为 400 米田径场，西南为老教学区（钟楼、弧形阳台楼），西北为宿舍区。
 */
export interface Place {
  id: string
  name: string
  tag: string
  desc: string
  label: [number, number, number]
  cam: [number, number, number]
  target: [number, number, number]
}

export const OVERVIEW: Pick<Place, 'cam' | 'target'> = {
  cam: [-95, 205, 330],
  target: [5, 0, 15],
}

export const PLACES: Place[] = [
  {
    id: 'duxing',
    name: '笃行楼',
    tag: '新教学楼',
    desc: '校园中轴主楼。橙色面砖与深灰窗带相间，中央拱形玻璃中庭直通五层，顶覆红瓦四坡顶，两端以深灰玻璃塔楼收束，前临升旗广场。',
    label: [0, 33, -20],
    cam: [0, 2.2, 78],
    target: [0, 13, -14],
  },
  {
    id: 'flag',
    name: '升旗广场',
    tag: '红色广场',
    desc: '汉白玉栏杆环绕的升旗台位于广场中央，前沿一列石球，五星红旗在笃行楼前高高飘扬。',
    label: [0, 30, 16],
    cam: [-38, 4, 46],
    target: [8, 12, 8],
  },
  {
    id: 'observatory',
    name: '天文台',
    tag: '科技高中·天文观测',
    desc: '方形塔楼四面嵌钟，塔顶银色网壳球顶内置天文望远镜，是校园天际线的标志。',
    label: [72, 41, -10],
    cam: [22, 3.5, 30],
    target: [72, 22, -12],
  },
  {
    id: 'yiti',
    name: '艺体馆',
    tag: '琴·艺体中心',
    desc: '白色铝板包裹的大跨度场馆，南立面蓝色玻璃幕墙整体外挑，侧墙以菱形洞口点缀，造型取意古琴。',
    label: [128, 28, -84],
    cam: [104, 3, -28],
    target: [128, 14, -70],
  },
  {
    id: 'track',
    name: '田径场',
    tag: '400 米标准塑胶跑道',
    desc: '八道塑胶跑道环绕人造草坪足球场，南侧为绿色阶梯看台与白色钢桁架主席台。',
    label: [75, 10, 95],
    cam: [70, 2.2, 82],
    target: [75, 6, 152],
  },
  {
    id: 'banyan',
    name: '古榕广场',
    tag: '棋·百年古榕',
    desc: '数株百年古榕冠盖如云，树下石凳环绕，是师生最爱的读书、休憩之地，平面取意棋盘。',
    label: [-6, 24, 66],
    cam: [42, 22, 112],
    target: [-6, 8, 58],
  },
  {
    id: 'zhuangyuan',
    name: '状元楼（钟楼）',
    tag: '旧教学楼',
    desc: '米黄与浅粉面砖的老教学楼，中央方形钟楼尖顶高耸，顶层拱券连廊，底层暗红圆形门厅，红色楹联竖贯立面。',
    label: [-112, 40, 72],
    cam: [-86, 2, 128],
    target: [-112, 16, 70],
  },
  {
    id: 'hulou',
    name: '弧形阳台楼',
    tag: '践行楼',
    desc: '白色马赛克墙面，橙色面砖弧形阳台逐层叠落，阳台上摆满盆栽；南端白色圆柱楼梯塔以连廊连接钟楼。',
    label: [-152, 28, 62],
    cam: [-122, 1.8, 104],
    target: [-150, 12, 62],
  },
  {
    id: 'canteen',
    name: '食堂',
    tag: '师生餐厅',
    desc: '浅绿色弧形屋面的两层食堂，外墙橙粉面砖，带状玻璃窗，与钟楼之间以林荫步道相连。',
    label: [-42, 16, 70],
    cam: [-8, 12, 112],
    target: [-42, 4, 70],
  },
  {
    id: 'zhiyuan',
    name: '致远楼',
    tag: '书·图书馆与办公',
    desc: '图书馆与行政办公楼，屋顶如一本翻开的书，竖向长窗通透明亮。',
    label: [-75, 33, -18],
    cam: [-40, 8, 38],
    target: [-75, 14, -16],
  },
  {
    id: 'dorm',
    name: '宁逸楼 · 静逸楼',
    tag: '学生宿舍',
    desc: '校园北侧生活区的两栋八层宿舍，白色墙面配连续阳台。',
    label: [-122, 34, -60],
    cam: [-80, 18, 6],
    target: [-122, 12, -60],
  },
  {
    id: 'gate',
    name: '校门',
    tag: '东门',
    desc: '白色石材门楼，灰色花岗岩铭牌镌刻“福建省连江第一中学”，门内即见天文台球顶。',
    label: [176, 14, -26],
    cam: [214, 2.2, -10],
    target: [168, 6, -26],
  },
]

export const placeById = (id: string) => PLACES.find((p) => p.id === id)

/** 自动导览顺序 */
export const TOUR = ['overview', 'duxing', 'flag', 'observatory', 'yiti', 'gate', 'track', 'banyan', 'canteen', 'zhuangyuan', 'hulou', 'zhiyuan', 'dorm']
