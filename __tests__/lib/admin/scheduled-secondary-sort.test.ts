/**
 * scheduled-secondary-sort のテスト
 *
 * - categorize: 5 状態の分類
 * - sortByScheduledSecondary: 優先度順並び替え + 同一カテゴリ内ソート
 * - groupByCategory: カテゴリ別オブジェクト
 * - 空入力
 */
import { describe, it, expect } from 'vitest'
import {
  categorize,
  sortByScheduledSecondary,
  groupByCategory,
  type SortableDispatch,
} from '@/lib/admin/scheduled-secondary-sort'

const TODAY = '2026-04-28'

// JST の日時を ISO に
function jst(dateStr: string, time = '12:00:00'): string {
  return new Date(`${dateStr}T${time}+09:00`).toISOString()
}

describe('categorize', () => {
  it('NULL は undecided', () => {
    expect(categorize(null, TODAY)).toBe('undecided')
  })

  it('undefined は undecided', () => {
    expect(categorize(undefined as unknown as null, TODAY)).toBe('undecided')
  })

  it('今日 (JST 同日) は today', () => {
    expect(categorize(jst('2026-04-28'), TODAY)).toBe('today')
  })

  it('JST 当日の朝 09:00 でも today', () => {
    expect(categorize(jst('2026-04-28', '09:00:00'), TODAY)).toBe('today')
  })

  it('JST 当日の深夜 23:59 でも today', () => {
    expect(categorize(jst('2026-04-28', '23:59:00'), TODAY)).toBe('today')
  })

  it('明日 (JST 翌日) は tomorrow', () => {
    expect(categorize(jst('2026-04-29'), TODAY)).toBe('tomorrow')
  })

  it('明後日以降は future', () => {
    expect(categorize(jst('2026-04-30'), TODAY)).toBe('future')
  })

  it('過去日は past', () => {
    expect(categorize(jst('2026-04-27'), TODAY)).toBe('past')
  })

  it('Date オブジェクト直渡しでも動く', () => {
    expect(categorize(new Date('2026-04-28T03:00:00.000Z'), TODAY)).toBe('today')
  })

  it('不正な ISO は undecided', () => {
    expect(categorize('not-a-date', TODAY)).toBe('undecided')
  })

  it('月跨ぎ: 4/30 が今日 → 5/1 は tomorrow', () => {
    expect(categorize(jst('2026-05-01'), '2026-04-30')).toBe('tomorrow')
  })
})

describe('sortByScheduledSecondary', () => {
  function make(num: string, scheduled: string | null): SortableDispatch {
    return { dispatchNumber: num, scheduledSecondaryAt: scheduled }
  }

  it('5 状態を優先度順 (today→tomorrow→future→undecided→past) で並べる', () => {
    const items = [
      make('past-1', jst('2026-04-26')),
      make('undec-1', null),
      make('future-1', jst('2026-04-30')),
      make('today-1', jst('2026-04-28', '14:00:00')),
      make('tomorrow-1', jst('2026-04-29')),
    ]
    const sorted = sortByScheduledSecondary(items, TODAY)
    expect(sorted.map((s) => s.dispatchNumber)).toEqual([
      'today-1',
      'tomorrow-1',
      'future-1',
      'undec-1',
      'past-1',
    ])
  })

  it('同一カテゴリ内 (today) は時刻昇順', () => {
    const items = [
      make('today-pm', jst('2026-04-28', '15:00:00')),
      make('today-am', jst('2026-04-28', '09:00:00')),
      make('today-noon', jst('2026-04-28', '12:00:00')),
    ]
    const sorted = sortByScheduledSecondary(items, TODAY)
    expect(sorted.map((s) => s.dispatchNumber)).toEqual([
      'today-am',
      'today-noon',
      'today-pm',
    ])
  })

  it('undecided 同士は dispatchNumber 昇順で安定化', () => {
    const items = [
      make('20260428-003', null),
      make('20260428-001', null),
      make('20260428-002', null),
    ]
    const sorted = sortByScheduledSecondary(items, TODAY)
    expect(sorted.map((s) => s.dispatchNumber)).toEqual([
      '20260428-001',
      '20260428-002',
      '20260428-003',
    ])
  })

  it('空配列はそのまま空配列を返す', () => {
    expect(sortByScheduledSecondary([], TODAY)).toEqual([])
  })

  it('元の配列を変更しない (純粋関数)', () => {
    const items = [
      make('a', jst('2026-04-30')),
      make('b', jst('2026-04-28')),
    ]
    const before = items.map((i) => i.dispatchNumber)
    sortByScheduledSecondary(items, TODAY)
    expect(items.map((i) => i.dispatchNumber)).toEqual(before)
  })
})

describe('groupByCategory', () => {
  it('カテゴリごとに振り分ける', () => {
    const items = [
      { dispatchNumber: 'a', scheduledSecondaryAt: jst('2026-04-28') },
      { dispatchNumber: 'b', scheduledSecondaryAt: null },
      { dispatchNumber: 'c', scheduledSecondaryAt: jst('2026-04-29') },
      { dispatchNumber: 'd', scheduledSecondaryAt: null },
    ]
    const groups = groupByCategory(items, TODAY)
    expect(groups.today.map((i) => i.dispatchNumber)).toEqual(['a'])
    expect(groups.tomorrow.map((i) => i.dispatchNumber)).toEqual(['c'])
    expect(groups.undecided.map((i) => i.dispatchNumber)).toEqual(['b', 'd'])
    expect(groups.future).toEqual([])
    expect(groups.past).toEqual([])
  })
})
