/**
 * OdoDialInput コンポーネントのテスト
 *
 * 新 UX:
 *   - 通常はコンパクト枠に値を表示
 *   - タッチデバイス (pointer: coarse) → タップでボトムシート + 6桁ダイヤル
 *   - マウス環境 (PC) → タップで枠内 input にフォーカス
 *
 * 注意:
 *   - matchMedia は jsdom で mock 必要
 *   - スクロールは jsdom で完全再現不可なため、ダイヤル数値変更はキーボード操作で検証
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import OdoDialInput from '@/components/common/OdoDialInput'

// ── AudioContext mock (jsdom には存在しないため) ──
// 値変更時に OdoDialInput が AudioContext を new するので、
// エラーにならないスタブを用意しておく。テストごとに spy できるよう grobal に注入。
const audioContextSpy = vi.fn()

class MockAudioContext {
  currentTime = 0
  destination = {}
  constructor() {
    audioContextSpy()
  }
  createOscillator() {
    return {
      type: 'square',
      frequency: { value: 0 },
      connect: () => {},
      start: () => {},
      stop: () => {},
    }
  }
  createGain() {
    return {
      connect: () => {},
      gain: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
    }
  }
  close() {
    return Promise.resolve()
  }
}

// jsdom 環境にグローバルで仕込む（beforeEach で spy をリセットする）
;(globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext =
  MockAudioContext as unknown as typeof AudioContext
;(window as unknown as { AudioContext: typeof AudioContext }).AudioContext =
  MockAudioContext as unknown as typeof AudioContext

// ── matchMedia mock helpers ──
type Listener = (e: MediaQueryListEvent) => void

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>()
  const mql = {
    matches,
    media: '(pointer: coarse)',
    onchange: null,
    addEventListener: (type: string, listener: Listener) => {
      if (type === 'change') listeners.add(listener)
    },
    removeEventListener: (type: string, listener: Listener) => {
      if (type === 'change') listeners.delete(listener)
    },
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    dispatchEvent: () => false,
  }
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation(() => mql),
  })
  return mql
}

afterEach(() => {
  cleanup()
  // body.overflow が ボトムシートで書き換えられるため、テスト毎に戻す
  document.body.style.overflow = ''
})

beforeEach(() => {
  audioContextSpy.mockReset()
})

describe('OdoDialInput (new UX)', () => {
  describe('コンパクト表示', () => {
    beforeEach(() => {
      mockMatchMedia(false) // PC 環境として
    })

    it('value=123456 でコンパクト枠に "123456" (6桁 0 パッド) が表示される', () => {
      render(
        <OdoDialInput label="出発" value={123456} onChange={() => {}} />
      )
      expect(screen.getByTestId('odo-display-value')).toHaveTextContent('123456')
    })

    it('value=0 でも "000000" が表示される', () => {
      render(<OdoDialInput label="出発" value={0} onChange={() => {}} />)
      expect(screen.getByTestId('odo-display-value')).toHaveTextContent('000000')
    })

    it('value=null で placeholder なしの場合、"------" が薄色で表示', () => {
      render(<OdoDialInput label="出発" value={null} onChange={() => {}} />)
      const disp = screen.getByTestId('odo-display-value')
      expect(disp).toHaveTextContent('------')
      // isEmpty なので #9CA3AF (gray-400)
      expect(disp).toHaveStyle({ color: '#9CA3AF' })
    })

    it('value=null かつ placeholder=12000 で placeholder の値が薄色で表示', () => {
      render(
        <OdoDialInput
          label="出発"
          value={null}
          onChange={() => {}}
          placeholder={12000}
        />
      )
      const disp = screen.getByTestId('odo-display-value')
      expect(disp).toHaveTextContent('012000')
      expect(disp).toHaveStyle({ color: '#9CA3AF' })
    })

    it('label + "ODO" が DOM に存在', () => {
      render(<OdoDialInput label="現着" value={0} onChange={() => {}} />)
      expect(screen.getByText('現着')).toBeInTheDocument()
      expect(screen.getByText('ODO')).toBeInTheDocument()
    })

    it('role="group" と aria-label が存在する', () => {
      render(<OdoDialInput label="現着" value={0} onChange={() => {}} />)
      const group = screen.getByRole('group')
      expect(group).toHaveAttribute('aria-label', '現着ODO 入力')
    })

    it('disabled=true で aria-disabled が true になる', () => {
      render(
        <OdoDialInput label="帰社" value={100} onChange={() => {}} disabled />
      )
      const group = screen.getByRole('group')
      expect(group).toHaveAttribute('aria-disabled', 'true')
    })
  })

  describe('disabled 時の挙動', () => {
    it('disabled=true で button の tabIndex=-1、クリックしてもボトムシートが開かない', () => {
      mockMatchMedia(true) // タッチデバイス
      render(
        <OdoDialInput label="出発" value={0} onChange={() => {}} disabled />
      )
      const compact = screen.getByTestId('odo-compact')
      expect(compact).toHaveAttribute('aria-disabled', 'true')
      fireEvent.click(compact)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('disabled=true のとき PC 環境でも input にフォーカスしない', () => {
      mockMatchMedia(false)
      render(
        <OdoDialInput label="出発" value={0} onChange={() => {}} disabled />
      )
      const compact = screen.getByTestId('odo-compact')
      fireEvent.click(compact)
      const input = screen.getByTestId('odo-native-input') as HTMLInputElement
      expect(document.activeElement).not.toBe(input)
    })
  })

  describe('タッチデバイス (pointer: coarse) 時', () => {
    beforeEach(() => {
      mockMatchMedia(true)
    })

    it('コンパクト枠タップでボトムシート (role="dialog") が開く', () => {
      render(<OdoDialInput label="出発" value={0} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('ボトムシート内に 6 個の spinbutton (ダイヤル桁) が存在する', () => {
      render(<OdoDialInput label="出発" value={123456} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      expect(spinbuttons).toHaveLength(6)
      const values = spinbuttons.map((el) => Number(el.getAttribute('aria-valuenow')))
      expect(values).toEqual([1, 2, 3, 4, 5, 6])
    })

    it('各 spinbutton に aria-valuemin=0 / aria-valuemax=9 が設定される', () => {
      render(<OdoDialInput label="出発" value={0} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      spinbuttons.forEach((el) => {
        expect(el).toHaveAttribute('aria-valuemin', '0')
        expect(el).toHaveAttribute('aria-valuemax', '9')
      })
    })

    it('各 spinbutton に一意な aria-label ("N 桁目") が設定される', () => {
      render(<OdoDialInput label="帰社" value={0} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      for (let i = 1; i <= 6; i++) {
        expect(
          screen.getByRole('spinbutton', { name: `帰社ODO ${i} 桁目` })
        ).toBeInTheDocument()
      }
    })

    it('ダイヤル ArrowDown でシート内値が変化、✓ ボタンで onChange が呼ばれる', () => {
      const handleChange = vi.fn()
      render(
        <OdoDialInput label="出発" value={123456} onChange={handleChange} />
      )
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      // 最下位桁 (index=5, 現在 6) に ArrowDown → 7
      fireEvent.keyDown(spinbuttons[5], { key: 'ArrowDown' })
      // この時点ではシート内部 state のみ変化、onChange は未呼出
      expect(handleChange).not.toHaveBeenCalled()
      // ✓ 確定ボタン
      fireEvent.click(screen.getByRole('button', { name: '確定' }))
      expect(handleChange).toHaveBeenCalledTimes(1)
      expect(handleChange).toHaveBeenCalledWith(123457)
    })

    it('ダイヤル ArrowUp で桁値が -1（ラップあり）', () => {
      const handleChange = vi.fn()
      render(
        <OdoDialInput label="出発" value={123450} onChange={handleChange} />
      )
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      // 最下位桁 0 → ArrowUp → 9 にラップ
      fireEvent.keyDown(spinbuttons[5], { key: 'ArrowUp' })
      fireEvent.click(screen.getByRole('button', { name: '確定' }))
      expect(handleChange).toHaveBeenCalledWith(123459)
    })

    it('数字キー直接入力で該当桁値を置き換え', () => {
      const handleChange = vi.fn()
      render(
        <OdoDialInput label="出発" value={123456} onChange={handleChange} />
      )
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      // 最上位桁 1 → 9
      fireEvent.keyDown(spinbuttons[0], { key: '9' })
      fireEvent.click(screen.getByRole('button', { name: '確定' }))
      expect(handleChange).toHaveBeenCalledWith(923456)
    })

    it('× キャンセルボタンで onChange は呼ばれず、ダイアログが閉じる', () => {
      const handleChange = vi.fn()
      render(
        <OdoDialInput label="出発" value={123456} onChange={handleChange} />
      )
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      fireEvent.keyDown(spinbuttons[5], { key: 'ArrowDown' })
      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
      expect(handleChange).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('ESC キーでキャンセル扱い（onChange 呼ばれず閉じる）', () => {
      const handleChange = vi.fn()
      render(
        <OdoDialInput label="出発" value={123456} onChange={handleChange} />
      )
      fireEvent.click(screen.getByTestId('odo-compact'))
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(handleChange).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('背景オーバーレイタップでキャンセル扱い', () => {
      const handleChange = vi.fn()
      render(
        <OdoDialInput label="出発" value={123456} onChange={handleChange} />
      )
      fireEvent.click(screen.getByTestId('odo-compact'))
      // オーバーレイクリック（シート自体は stopPropagation で除外）
      fireEvent.click(screen.getByTestId('odo-bottom-sheet-overlay'))
      expect(handleChange).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('value=null で placeholder 付きの場合、シート open 時に placeholder 値のダイヤルが表示される', () => {
      render(
        <OdoDialInput
          label="出発"
          value={null}
          onChange={() => {}}
          placeholder={12000}
        />
      )
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      const values = spinbuttons.map((el) => Number(el.getAttribute('aria-valuenow')))
      expect(values).toEqual([0, 1, 2, 0, 0, 0])
    })

    it('同じ値を再入力しても onChange は毎回呼ばれる（値一致でも確定で通知）', () => {
      const handleChange = vi.fn()
      render(
        <OdoDialInput label="出発" value={123456} onChange={handleChange} />
      )
      fireEvent.click(screen.getByTestId('odo-compact'))
      fireEvent.click(screen.getByRole('button', { name: '確定' }))
      // 何も変更していなくても確定は明示操作なので onChange は呼ばれてよい
      // (仕様: ✓ 押下で常に通知)
      expect(handleChange).toHaveBeenCalledWith(123456)
    })

    it('body の overflow がシート open 中は hidden になり、閉じると戻る', () => {
      const prev = document.body.style.overflow
      render(<OdoDialInput label="出発" value={0} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      expect(document.body.style.overflow).toBe('hidden')
      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
      expect(document.body.style.overflow).toBe(prev)
    })
  })

  describe('マウス環境 (pointer: coarse = false) 時', () => {
    beforeEach(() => {
      mockMatchMedia(false)
    })

    it('コンパクト枠クリックで内部 input にフォーカスが移る', () => {
      render(<OdoDialInput label="出発" value={123} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      const input = screen.getByTestId('odo-native-input') as HTMLInputElement
      expect(document.activeElement).toBe(input)
    })

    it('コンパクト枠クリックでボトムシートは開かない', () => {
      render(<OdoDialInput label="出発" value={0} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('input に数値を入力 → blur で onChange が呼ばれる', () => {
      const handleChange = vi.fn()
      render(<OdoDialInput label="出発" value={0} onChange={handleChange} />)
      const input = screen.getByTestId('odo-native-input') as HTMLInputElement
      act(() => input.focus())
      fireEvent.change(input, { target: { value: '45678' } })
      fireEvent.blur(input)
      expect(handleChange).toHaveBeenCalledTimes(1)
      expect(handleChange).toHaveBeenCalledWith(45678)
    })

    it('input に数値を入力 → Enter で onChange が呼ばれる', () => {
      const handleChange = vi.fn()
      render(<OdoDialInput label="出発" value={0} onChange={handleChange} />)
      const input = screen.getByTestId('odo-native-input') as HTMLInputElement
      act(() => input.focus())
      fireEvent.change(input, { target: { value: '99999' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(handleChange).toHaveBeenCalledWith(99999)
    })

    it('999999 を超える値は 999999 にクランプ', () => {
      const handleChange = vi.fn()
      render(<OdoDialInput label="出発" value={0} onChange={handleChange} />)
      const input = screen.getByTestId('odo-native-input') as HTMLInputElement
      act(() => input.focus())
      fireEvent.change(input, { target: { value: '9999999' } })
      fireEvent.blur(input)
      expect(handleChange).toHaveBeenCalledWith(999999)
    })

    it('数値以外の入力は拒否（state に反映されない）', () => {
      const handleChange = vi.fn()
      render(<OdoDialInput label="出発" value={0} onChange={handleChange} />)
      const input = screen.getByTestId('odo-native-input') as HTMLInputElement
      act(() => input.focus())
      fireEvent.change(input, { target: { value: 'abc' } })
      fireEvent.blur(input)
      // 空入力として扱われ、onChange は呼ばれない（現状値維持）
      expect(handleChange).not.toHaveBeenCalled()
    })

    it('同じ値を入力して blur しても onChange は呼ばれない', () => {
      const handleChange = vi.fn()
      render(<OdoDialInput label="出発" value={123} onChange={handleChange} />)
      const input = screen.getByTestId('odo-native-input') as HTMLInputElement
      act(() => input.focus())
      fireEvent.change(input, { target: { value: '123' } })
      fireEvent.blur(input)
      expect(handleChange).not.toHaveBeenCalled()
    })

    it('Escape で draft を破棄して blur、onChange は呼ばれない', () => {
      const handleChange = vi.fn()
      render(<OdoDialInput label="出発" value={100} onChange={handleChange} />)
      const input = screen.getByTestId('odo-native-input') as HTMLInputElement
      act(() => input.focus())
      fireEvent.change(input, { target: { value: '999' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      // Escape 経由では draft リセット + blur → blur の commitInput は
      // value と同じ '100' になるため onChange 呼ばれない想定
      expect(handleChange).not.toHaveBeenCalled()
    })
  })

  describe('UI ポリッシュ: 確定ボタンアイコン / 音再生', () => {
    beforeEach(() => {
      mockMatchMedia(true)
    })

    it('確定ボタンには FaCheckCircle 相当のアイコン (data-icon="check-circle") が含まれる', () => {
      render(<OdoDialInput label="出発" value={123456} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      const confirmBtn = screen.getByRole('button', { name: '確定' })
      expect(confirmBtn.querySelector('[data-icon="check-circle"]')).not.toBeNull()
    })

    it('ダイヤル値変更時に AudioContext の生成が試みられる（音再生の副作用）', () => {
      render(<OdoDialInput label="出発" value={123456} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      // 値が変化する ArrowDown（6 → 7） → AudioContext が new される
      expect(audioContextSpy).not.toHaveBeenCalled()
      fireEvent.keyDown(spinbuttons[5], { key: 'ArrowDown' })
      expect(audioContextSpy).toHaveBeenCalledTimes(1)
    })

    it('AudioContext が未定義の環境でもダイヤル操作はエラーにならない', () => {
      // 一時的に undefined へ
      const originalGlobal = (globalThis as unknown as { AudioContext?: unknown }).AudioContext
      const originalWin = (window as unknown as { AudioContext?: unknown }).AudioContext
      ;(globalThis as unknown as { AudioContext?: unknown }).AudioContext = undefined
      ;(window as unknown as { AudioContext?: unknown }).AudioContext = undefined
      try {
        render(<OdoDialInput label="出発" value={123456} onChange={() => {}} />)
        fireEvent.click(screen.getByTestId('odo-compact'))
        const spinbuttons = screen.getAllByRole('spinbutton')
        expect(() =>
          fireEvent.keyDown(spinbuttons[5], { key: 'ArrowDown' })
        ).not.toThrow()
      } finally {
        ;(globalThis as unknown as { AudioContext?: unknown }).AudioContext = originalGlobal
        ;(window as unknown as { AudioContext?: unknown }).AudioContext = originalWin
      }
    })

    it('ボトムシート全体の背景は黒系（#1c1c1e）になる', () => {
      render(<OdoDialInput label="出発" value={0} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      const dialog = screen.getByRole('dialog')
      // シート本体（オーバーレイの子）の backgroundColor を確認
      const sheet = dialog.querySelector('[class*="rounded-t-2xl"]') as HTMLElement | null
      expect(sheet).not.toBeNull()
      expect(sheet?.style.backgroundColor).toBe('rgb(28, 28, 30)') // #1c1c1e
    })
  })

  describe('SSR / 初回 render (matchMedia 未判定)', () => {
    it('matchMedia が存在しない環境でもエラーなくコンパクト表示が描画される', () => {
      // matchMedia を未定義に
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: undefined,
      })
      expect(() => {
        render(<OdoDialInput label="出発" value={123} onChange={() => {}} />)
      }).not.toThrow()
      expect(screen.getByTestId('odo-display-value')).toHaveTextContent('000123')
    })
  })

  // -------------------------------------------------------
  // 無限ループのダイヤル (バッファ方式)
  // -------------------------------------------------------
  //
  // DialColumn は 0-9 を 5 セット並べ (計 50 セル)、中央セット (index 20-29)
  // を初期スクロール位置とする。onScroll で端のセットに入ったら中央へワープ。
  //
  // jsdom は実スクロールを再現できないため、以下は主に「DOM 構造と
  // 初期 scrollTop の値」で検証する。ワープは onScroll を直接呼び出して
  // scrollTop の変化を確認する。
  describe('無限ループのダイヤル (バッファ方式)', () => {
    beforeEach(() => {
      mockMatchMedia(true)
    })

    it('各桁に 0-9 が 5 セット分（50 セル）並んでいる', () => {
      render(<OdoDialInput label="出発" value={123456} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      // 各 spinbutton 内の data-digit セルを数える
      spinbuttons.forEach((el) => {
        const cells = el.querySelectorAll('[data-digit]')
        expect(cells).toHaveLength(50) // 5 セット × 10 数字
      })
    })

    it('初期マウント時、各桁の scrollTop が中央セットの該当数字位置になる', () => {
      render(<OdoDialInput label="出発" value={123456} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      // value=123456 → digits [1,2,3,4,5,6]
      // 中央セット開始 index = 20、CELL_HEIGHT = 48
      // 各桁の期待 scrollTop = (20 + digit) * 48
      const expectedDigits = [1, 2, 3, 4, 5, 6]
      spinbuttons.forEach((el, i) => {
        const expected = (20 + expectedDigits[i]) * 48
        expect(el.scrollTop).toBe(expected)
      })
    })

    it('onScroll で最上位セットに入るとワープして中央セットへ戻る', () => {
      render(<OdoDialInput label="出発" value={123456} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      const col = spinbuttons[5] as HTMLDivElement // 最下位桁（初期値=6、scrollTop=26*48）

      // 最上位セット (index=3 → scrollTop = 3*48 = 144) にいる状態を模擬
      // すると数字 3 の中央セット位置 (23 * 48 = 1104) へワープするはず。
      act(() => {
        col.scrollTop = 3 * 48
        fireEvent.scroll(col)
      })
      expect(col.scrollTop).toBe(23 * 48)
    })

    it('onScroll で最下位セットに入るとワープして中央セットへ戻る', () => {
      render(<OdoDialInput label="出発" value={123456} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      const col = spinbuttons[5] as HTMLDivElement

      // 最下位セット (index=45 → 数字 5、scrollTop = 45*48 = 2160) を模擬
      // → 中央セットの 5 の位置 (25 * 48 = 1200) へワープ
      act(() => {
        col.scrollTop = 45 * 48
        fireEvent.scroll(col)
      })
      expect(col.scrollTop).toBe(25 * 48)
    })

    it('中央セット内 (index 10-39) ではワープしない', () => {
      render(<OdoDialInput label="出発" value={123456} onChange={() => {}} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      const col = spinbuttons[5] as HTMLDivElement

      // index=15 → 中央セット内（WARP_LOWER_THRESHOLD=10, WARP_UPPER_THRESHOLD=40）
      act(() => {
        col.scrollTop = 15 * 48
        fireEvent.scroll(col)
      })
      // ワープしない → そのまま
      expect(col.scrollTop).toBe(15 * 48)
    })

    it('ArrowUp で 0 → 9 のラップは維持される（既存仕様）', () => {
      const handleChange = vi.fn()
      render(<OdoDialInput label="出発" value={123450} onChange={handleChange} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      fireEvent.keyDown(spinbuttons[5], { key: 'ArrowUp' })
      fireEvent.click(screen.getByRole('button', { name: '確定' }))
      expect(handleChange).toHaveBeenCalledWith(123459)
    })

    it('ArrowDown で 9 → 0 のラップは維持される（既存仕様）', () => {
      const handleChange = vi.fn()
      render(<OdoDialInput label="出発" value={123459} onChange={handleChange} />)
      fireEvent.click(screen.getByTestId('odo-compact'))
      const spinbuttons = screen.getAllByRole('spinbutton')
      fireEvent.keyDown(spinbuttons[5], { key: 'ArrowDown' })
      fireEvent.click(screen.getByRole('button', { name: '確定' }))
      expect(handleChange).toHaveBeenCalledWith(123450)
    })
  })
})
