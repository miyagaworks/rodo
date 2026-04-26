import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { WorkConfirmation } from '@prisma/client'

import { ConfirmationView } from '@/components/confirmation/ConfirmationView'

/**
 * ConfirmationView — 公開閲覧ページのレンダリング検証。
 *
 *  - 必須セクション (作業前/作業後/車両/作業内容/担当者欄/担当者氏名) の表示
 *  - 作業日が和暦フォーマットで表示
 *  - 署名画像 / 署名なし表示
 *  - チェック項目 (preApprovalChecks)
 *  - バッテリー明細の表示制御
 *  - 注意事項の条件表示
 *  - PDF リンクの URL
 */

function makeConfirmation(
  overrides: Partial<WorkConfirmation> = {},
): WorkConfirmation {
  return {
    id: 'cfm1',
    dispatchId: 'd1',
    workDate: new Date('2026-04-26'),
    preApprovalChecks: [true, true, false, false, false],
    customerSignature: 'data:image/png;base64,sigCustomer',
    customerName: null,
    customerDate: null,
    vehicleType: 'トヨタ プリウス',
    registrationNumber: '品川 500 あ 1234',
    workContent: 'バッテリー上がり対応',
    shopCompanyName: '太郎自動車',
    shopContactName: null,
    shopSignature: null,
    postApprovalCheck: true,
    postApprovalSignature: 'data:image/png;base64,sigPost',
    postApprovalName: '宮川 清美',
    batteryDetails: null,
    notes: null,
    shareToken: 'tok1',
    sharedAt: new Date('2026-04-26'),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as WorkConfirmation
}

describe('ConfirmationView', () => {
  it('必須セクションのヘッダーがすべて表示される', () => {
    render(
      React.createElement(ConfirmationView, {
        token: 'tok1',
        confirmation: makeConfirmation(),
      }),
    )

    expect(
      screen.getByRole('heading', { name: '作業確認書' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('作業前承認欄（お客様ご署名欄）'),
    ).toBeInTheDocument()
    expect(screen.getByText('車両情報')).toBeInTheDocument()
    expect(screen.getByText('作業内容')).toBeInTheDocument()
    expect(screen.getByText('入庫先ご担当者様記入欄')).toBeInTheDocument()
    expect(
      screen.getByText('作業完了後承認欄（お客様ご署名欄）'),
    ).toBeInTheDocument()
    expect(screen.getByText('担当者氏名')).toBeInTheDocument()
  })

  it('作業日が日本語フォーマットで表示される', () => {
    render(
      React.createElement(ConfirmationView, {
        token: 'tok1',
        confirmation: makeConfirmation({ workDate: new Date('2026-04-26') }),
      }),
    )

    expect(screen.getByText('作業日：2026年4月26日')).toBeInTheDocument()
  })

  it('車種名・登録番号が表示される', () => {
    render(
      React.createElement(ConfirmationView, {
        token: 'tok1',
        confirmation: makeConfirmation(),
      }),
    )

    expect(screen.getByText('トヨタ プリウス')).toBeInTheDocument()
    expect(screen.getByText('品川 500 あ 1234')).toBeInTheDocument()
  })

  it('署名画像が src 付きで描画される', () => {
    render(
      React.createElement(ConfirmationView, {
        token: 'tok1',
        confirmation: makeConfirmation(),
      }),
    )

    const customerImg = screen.getByAltText('お客様署名') as HTMLImageElement
    expect(customerImg).toBeInTheDocument()
    expect(customerImg.src).toBe('data:image/png;base64,sigCustomer')

    const postImg = screen.getByAltText('お客様署名（作業後）') as HTMLImageElement
    expect(postImg).toBeInTheDocument()
    expect(postImg.src).toBe('data:image/png;base64,sigPost')
  })

  it('署名なしの場合は「（署名なし）」が表示される', () => {
    render(
      React.createElement(ConfirmationView, {
        token: 'tok1',
        confirmation: makeConfirmation({
          customerSignature: null,
          shopSignature: null,
          postApprovalSignature: null,
        }),
      }),
    )

    // 3 箇所 (customer / shop / post) すべて「（署名なし）」になる
    expect(screen.getAllByText('（署名なし）')).toHaveLength(3)
  })

  it('preApprovalChecks の 5 項目がすべて表示される', () => {
    render(
      React.createElement(ConfirmationView, {
        token: 'tok1',
        confirmation: makeConfirmation(),
      }),
    )

    expect(
      screen.getByText(/不可抗力、経年劣化による作業中の車両の損傷/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/バッテリージャンピング作業時における電装系/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/貴重品（現金・クレジットカード・ETCカード等）/),
    ).toBeInTheDocument()
    expect(screen.getByText(/保管料金が発生する場合がございます/)).toBeInTheDocument()
    expect(
      screen.getByText(/保管中における、盗難・損傷については責任を負いかねます/),
    ).toBeInTheDocument()
  })

  it('batteryDetails に値があればバッテリー明細セクションが表示される', () => {
    render(
      React.createElement(ConfirmationView, {
        token: 'tok1',
        confirmation: makeConfirmation({
          batteryDetails: {
            voltageBefore: '11.8',
            voltageGenerated: '14.2',
            loadInspection: 'OK',
            restart: 'OK',
            difference: 'NG',
          } as unknown as WorkConfirmation['batteryDetails'],
        }),
      }),
    )

    expect(screen.getByText('バッテリー作業明細')).toBeInTheDocument()
    expect(screen.getByText('11.8')).toBeInTheDocument()
    expect(screen.getByText('14.2')).toBeInTheDocument()
    // OK が 2 つ、NG が 1 つ
    expect(screen.getAllByText('OK')).toHaveLength(2)
    expect(screen.getByText('NG')).toBeInTheDocument()
  })

  it('batteryDetails が null のときバッテリー明細セクションは表示されない', () => {
    render(
      React.createElement(ConfirmationView, {
        token: 'tok1',
        confirmation: makeConfirmation({ batteryDetails: null }),
      }),
    )

    expect(screen.queryByText('バッテリー作業明細')).not.toBeInTheDocument()
  })

  it('batteryDetails の全フィールドが空のときバッテリー明細セクションは表示されない', () => {
    render(
      React.createElement(ConfirmationView, {
        token: 'tok1',
        confirmation: makeConfirmation({
          batteryDetails: {
            electricUsage: '',
            timeUnused: '',
            voltageBefore: '',
            voltageGenerated: '',
            gravityMF: '',
            loadInspection: '',
            restart: '',
            difference: '',
          } as unknown as WorkConfirmation['batteryDetails'],
        }),
      }),
    )

    expect(screen.queryByText('バッテリー作業明細')).not.toBeInTheDocument()
  })

  it('notes があれば「注意事項・その他」セクションが表示される', () => {
    render(
      React.createElement(ConfirmationView, {
        token: 'tok1',
        confirmation: makeConfirmation({ notes: '次回点検要' }),
      }),
    )

    expect(screen.getByText('注意事項・その他')).toBeInTheDocument()
    expect(screen.getByText('次回点検要')).toBeInTheDocument()
  })

  it('notes が null のときは「注意事項・その他」セクションは表示されない', () => {
    render(
      React.createElement(ConfirmationView, {
        token: 'tok1',
        confirmation: makeConfirmation({ notes: null }),
      }),
    )

    expect(screen.queryByText('注意事項・その他')).not.toBeInTheDocument()
  })

  it('PDF 保存リンクが /api/c/{token}/pdf を指す', () => {
    render(
      React.createElement(ConfirmationView, {
        token: 'tok-XYZ',
        confirmation: makeConfirmation(),
      }),
    )

    const link = screen.getByRole('link', { name: 'PDFを保存' })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('/api/c/tok-XYZ/pdf')
    expect(link.hasAttribute('download')).toBe(true)
  })

  it('担当者氏名が表示される', () => {
    render(
      React.createElement(ConfirmationView, {
        token: 'tok1',
        confirmation: makeConfirmation({ postApprovalName: '山田 太郎' }),
      }),
    )

    expect(screen.getByText('山田 太郎')).toBeInTheDocument()
  })
})
