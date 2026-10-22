import { createRoot } from 'react-dom/client'
import FilmApp from './FilmApp'
import './film.css'

async function fontsReady() {
  if (!('fonts' in document)) return
  const zh = '午夜点名福建连江一中广播同学们现在开始规则只有一条天亮之前别被点到名字高二班林晓雾在收拢别回头最后一位第十三号那一夜的没有人缺席编剧导演摄影视效作曲音效剪辑出品配乐每一帧画面个音符皆以代码生成部完全由伦敦白教堂存活'
  await Promise.race([
    Promise.all([
      document.fonts.load('400 64px "Zhi Mang Xing"', zh),
      document.fonts.load('400 32px "Noto Serif SC"', zh),
      document.fonts.load('400 32px "IM Fell English"', 'ROLL CALL'),
      document.fonts.load('400 20px "IBM Plex Mono"', 'SURVIVORS 0123'),
    ]).catch(() => undefined),
    new Promise((r) => setTimeout(r, 4000)),
  ])
}

fontsReady().then(() => createRoot(document.getElementById('root')!).render(<FilmApp />))
