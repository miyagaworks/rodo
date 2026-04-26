import { Font } from '@react-pdf/renderer'
import path from 'path'

let registered = false

export function registerFonts() {
  if (registered) return
  registered = true

  Font.register({
    family: 'LineSeedJP',
    fonts: [
      { src: path.join(process.cwd(), 'fonts/LINESeedJP_A_TTF_Rg.ttf'), fontWeight: 'normal' },
      { src: path.join(process.cwd(), 'fonts/LINESeedJP_A_TTF_Bd.ttf'), fontWeight: 'bold' },
    ],
  })

  // 日本語テキストのハイフネーション無効化（必須）
  Font.registerHyphenationCallback((word) => [word])
}
