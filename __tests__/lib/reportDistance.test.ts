import { describe, it, expect } from 'vitest'
import {
  calculateRecoveryDistance,
  calculateTransportDistance,
  calculateReturnDistance,
  enrichReportDistances,
  type DispatchLikeForEnrich,
  type ReportLikeForEnrich,
} from '@/lib/reportDistance'

describe('calculateRecoveryDistance', () => {
  it('通常値 — 到着 ODO − 出発 ODO を返す', () => {
    expect(calculateRecoveryDistance(10000, 10050)).toBe(50)
  })

  it('境界値 — 出発 = 到着 の場合 0 を返す', () => {
    expect(calculateRecoveryDistance(10000, 10000)).toBe(0)
  })

  it('負の値 — 到着 < 出発 の場合はそのまま負数を返す（単調増加違反）', () => {
    expect(calculateRecoveryDistance(10050, 10000)).toBe(-50)
  })

  it('出発 ODO が null の場合 null を返す', () => {
    expect(calculateRecoveryDistance(null, 10050)).toBeNull()
  })

  it('到着 ODO が null の場合 null を返す', () => {
    expect(calculateRecoveryDistance(10000, null)).toBeNull()
  })

  it('両方 null の場合 null を返す', () => {
    expect(calculateRecoveryDistance(null, null)).toBeNull()
  })

  it('undefined を null と同等に扱う', () => {
    expect(calculateRecoveryDistance(undefined, 10050)).toBeNull()
    expect(calculateRecoveryDistance(10000, undefined)).toBeNull()
    expect(calculateRecoveryDistance(undefined, undefined)).toBeNull()
  })

  it('出発 ODO が 0 の場合は有効値として扱う（到着との差を返す）', () => {
    expect(calculateRecoveryDistance(0, 50)).toBe(50)
  })
})

describe('calculateTransportDistance', () => {
  it('通常値 — 完了 ODO − 開始 ODO を返す', () => {
    expect(calculateTransportDistance(10050, 10080)).toBe(30)
  })

  it('境界値 — 開始 = 完了 の場合 0 を返す', () => {
    expect(calculateTransportDistance(10050, 10050)).toBe(0)
  })

  it('負の値 — 完了 < 開始 の場合はそのまま負数を返す', () => {
    expect(calculateTransportDistance(10080, 10050)).toBe(-30)
  })

  it('開始 ODO が null の場合 null を返す', () => {
    expect(calculateTransportDistance(null, 10080)).toBeNull()
  })

  it('完了 ODO が null の場合 null を返す', () => {
    expect(calculateTransportDistance(10050, null)).toBeNull()
  })

  it('両方 null の場合 null を返す', () => {
    expect(calculateTransportDistance(null, null)).toBeNull()
  })

  it('undefined を null と同等に扱う', () => {
    expect(calculateTransportDistance(undefined, 10080)).toBeNull()
    expect(calculateTransportDistance(10050, undefined)).toBeNull()
  })

  it('開始 ODO が 0 の場合は有効値として扱う', () => {
    expect(calculateTransportDistance(0, 80)).toBe(80)
  })
})

describe('calculateReturnDistance', () => {
  it('通常値 — 帰社 ODO − 完了 ODO を返す', () => {
    expect(calculateReturnDistance(10080, 10120)).toBe(40)
  })

  it('境界値 — 完了 = 帰社 の場合 0 を返す', () => {
    expect(calculateReturnDistance(10080, 10080)).toBe(0)
  })

  it('負の値 — 帰社 < 完了 の場合はそのまま負数を返す', () => {
    expect(calculateReturnDistance(10120, 10080)).toBe(-40)
  })

  it('完了 ODO が null の場合 null を返す', () => {
    expect(calculateReturnDistance(null, 10120)).toBeNull()
  })

  it('帰社 ODO が null の場合 null を返す', () => {
    expect(calculateReturnDistance(10080, null)).toBeNull()
  })

  it('両方 null の場合 null を返す', () => {
    expect(calculateReturnDistance(null, null)).toBeNull()
  })

  it('undefined を null と同等に扱う', () => {
    expect(calculateReturnDistance(undefined, 10120)).toBeNull()
    expect(calculateReturnDistance(10080, undefined)).toBeNull()
  })

  it('完了 ODO が 0 の場合は有効値として扱う', () => {
    expect(calculateReturnDistance(0, 120)).toBe(120)
  })
})

// -------------------------------------------------------
// enrichReportDistances
// -------------------------------------------------------

function makeDispatch(
  overrides: Partial<DispatchLikeForEnrich> = {},
): DispatchLikeForEnrich {
  return {
    type: 'ONSITE',
    isSecondaryTransport: false,
    departureOdo: null,
    arrivalOdo: null,
    transportStartOdo: null,
    completionOdo: null,
    returnOdo: null,
    ...overrides,
  }
}

describe('enrichReportDistances — Report が null（新規ケース）', () => {
  it('ONSITE / Dispatch に ODO あり → recovery / return を計算、transport は null', () => {
    const dispatch = makeDispatch({
      type: 'ONSITE',
      departureOdo: 10000,
      arrivalOdo: 10050,
      completionOdo: 10050,
      returnOdo: 10120,
    })
    const result = enrichReportDistances(null, dispatch)
    expect(result).toEqual({
      recoveryDistance: 50,
      transportDistance: null,
      returnDistance: 70,
    })
  })

  it('TRANSPORT 1 次 / Dispatch に ODO あり → 3 種すべて計算', () => {
    const dispatch = makeDispatch({
      type: 'TRANSPORT',
      isSecondaryTransport: false,
      departureOdo: 10000,
      arrivalOdo: 10050,
      transportStartOdo: 10050,
      completionOdo: 10080,
      returnOdo: 10120,
    })
    const result = enrichReportDistances(null, dispatch)
    expect(result).toEqual({
      recoveryDistance: 50,
      transportDistance: 30,
      returnDistance: 40,
    })
  })

  it('SECONDARY TRANSPORT / Dispatch に ODO あり → recovery = arrival − departure、transport = completion − arrival', () => {
    const dispatch = makeDispatch({
      type: 'TRANSPORT',
      isSecondaryTransport: true,
      departureOdo: 20000,
      arrivalOdo: 20050,
      completionOdo: 20080,
      returnOdo: 20120,
    })
    const result = enrichReportDistances(null, dispatch)
    expect(result).toEqual({
      recoveryDistance: 50,
      transportDistance: 30,
      returnDistance: 40,
    })
  })

  it('Dispatch の ODO が null → distance はすべて null', () => {
    const dispatch = makeDispatch({ type: 'ONSITE' })
    const result = enrichReportDistances(null, dispatch)
    expect(result).toEqual({
      recoveryDistance: null,
      transportDistance: null,
      returnDistance: null,
    })
  })
})

describe('enrichReportDistances — Report が存在', () => {
  it('既存 distance（number）は上書きせず尊重する', () => {
    const report: ReportLikeForEnrich = {
      recoveryDistance: 99, // 既存値（ユーザー保存済み）
      transportDistance: null,
      returnDistance: 88,
    }
    const dispatch = makeDispatch({
      type: 'ONSITE',
      departureOdo: 10000,
      arrivalOdo: 10050,
      completionOdo: 10050,
      returnOdo: 10120,
    })
    const result = enrichReportDistances(report, dispatch)
    expect(result.recoveryDistance).toBe(99)
    expect(result.returnDistance).toBe(88)
    // transport は ONSITE なので null のまま
    expect(result.transportDistance).toBeNull()
  })

  it('Report の distance が null → Dispatch の ODO から計算で補完', () => {
    const report: ReportLikeForEnrich = {
      recoveryDistance: null,
      transportDistance: null,
      returnDistance: null,
    }
    const dispatch = makeDispatch({
      type: 'TRANSPORT',
      isSecondaryTransport: false,
      departureOdo: 10000,
      arrivalOdo: 10050,
      transportStartOdo: 10050,
      completionOdo: 10080,
      returnOdo: 10120,
    })
    const result = enrichReportDistances(report, dispatch)
    expect(result.recoveryDistance).toBe(50)
    expect(result.transportDistance).toBe(30)
    expect(result.returnDistance).toBe(40)
  })

  it('Report / Dispatch どちらにも ODO がない → distance は null のまま', () => {
    const report: ReportLikeForEnrich = {
      recoveryDistance: null,
      transportDistance: null,
      returnDistance: null,
    }
    const dispatch = makeDispatch({ type: 'ONSITE' })
    const result = enrichReportDistances(report, dispatch)
    expect(result.recoveryDistance).toBeNull()
    expect(result.transportDistance).toBeNull()
    expect(result.returnDistance).toBeNull()
  })

  it('Report 側の ODO が Dispatch より優先される', () => {
    const report: ReportLikeForEnrich = {
      departureOdo: 500, // Report 側の値を優先
      arrivalOdo: 600,
      recoveryDistance: null,
      transportDistance: null,
      returnDistance: null,
    }
    const dispatch = makeDispatch({
      type: 'ONSITE',
      departureOdo: 10000, // 無視される
      arrivalOdo: 10050,
      completionOdo: 600,
      returnOdo: 700,
    })
    const result = enrichReportDistances(report, dispatch)
    // Report 側 departureOdo=500, arrivalOdo=600 → recovery = 100
    expect(result.recoveryDistance).toBe(100)
    // return は Report 側 completionOdo なし → Dispatch の 600 を使う → 700 − 600 = 100
    expect(result.returnDistance).toBe(100)
  })

  it('Report の他のフィールドは保持される（スプレッドで型を維持）', () => {
    const report = {
      departureOdo: 10000,
      arrivalOdo: 10050,
      recoveryDistance: null,
      transportDistance: null,
      returnDistance: null,
      customField: 'foo', // 任意フィールド
    } as ReportLikeForEnrich & { customField: string }
    const dispatch = makeDispatch({
      type: 'ONSITE',
      completionOdo: 10050,
      returnOdo: 10120,
    })
    const result = enrichReportDistances(report, dispatch)
    // @ts-expect-error — 型 T の拡張フィールドにアクセス
    expect(result.customField).toBe('foo')
    expect(result.recoveryDistance).toBe(50)
  })

  it('SECONDARY TRANSPORT + Report 存在 → recovery / transport / return すべて区間分割で補完', () => {
    const report: ReportLikeForEnrich = {
      recoveryDistance: null,
      transportDistance: null,
      returnDistance: null,
    }
    const dispatch = makeDispatch({
      type: 'TRANSPORT',
      isSecondaryTransport: true,
      departureOdo: 20000,
      arrivalOdo: 20050,
      completionOdo: 20080,
      returnOdo: 20120,
    })
    const result = enrichReportDistances(report, dispatch)
    expect(result.recoveryDistance).toBe(50)
    expect(result.transportDistance).toBe(30)
    expect(result.returnDistance).toBe(40)
  })

  it('既存の distance が 0 は number なので尊重される（計算で上書きしない）', () => {
    const report: ReportLikeForEnrich = {
      recoveryDistance: 0, // 0 は number なので既存値として尊重
      transportDistance: null,
      returnDistance: null,
    }
    const dispatch = makeDispatch({
      type: 'ONSITE',
      departureOdo: 10000,
      arrivalOdo: 10050, // これは無視される
      completionOdo: 10050,
      returnOdo: 10120,
    })
    const result = enrichReportDistances(report, dispatch)
    expect(result.recoveryDistance).toBe(0)
    expect(result.returnDistance).toBe(70)
  })
})

