import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// 画布上的中文（铭牌、楹联、楼名）在纹理生成时绘制，先等字体就绪，最多等 3 秒
async function fontsReady() {
  if (!('fonts' in document)) return
  const sample = '别回头他在看着你你逃不掉下一个是你不要回应广播还剩一个福建省连江第一中学笃行楼致远楼宁逸静百年桃李芬芳不忘初心砥砺奋进每天锻炼一小时'
  const wait = Promise.all([
    document.fonts.load(`700 64px "Noto Serif SC"`, sample),
    document.fonts.load(`400 16px "Zhi Mang Xing"`, '别回头他在看着你你逃不掉下一个是你'),
    document.fonts.load(`400 16px "Noto Serif SC"`, sample),
  ]).catch(() => undefined)
  await Promise.race([wait, new Promise((r) => setTimeout(r, 3000))])
}

fontsReady().then(() => {
  createRoot(document.getElementById('root')!).render(<App />)
})
