import React from 'react'
import { Document, Page, View, Text, Image } from '@react-pdf/renderer'
import { styles } from './styles'

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export interface ConfirmationPdfProps {
  workDate: Date | null
  preApprovalChecks: boolean[] | null
  customerSignature: string | null
  vehicleType: string | null
  registrationNumber: string | null
  workContent: string | null
  shopCompanyName: string | null
  shopSignature: string | null
  postApprovalCheck: boolean
  postApprovalSignature: string | null
  postApprovalName: string | null
  batteryDetails: Record<string, unknown> | null
  notes: string | null
}

// -------------------------------------------------------
// Constants
// -------------------------------------------------------

const preCheckLabels = [
  '不可抗力、経年劣化による作業中の車両の損傷・不具合については、責任を負いかねますのでご了承ください。',
  'バッテリージャンピング作業時における電装系（コンピューター・ナビゲーション・警告灯等）の不具合については、責任を負いかねますのでご了承ください。',
  '貴重品（現金・クレジットカード・ETCカード等）についてはお客様自身にて管理をお願いいたします。紛失・破損については責任を負いかねます。',
  '保管料金が発生する場合がございます。',
  '保管中における、盗難・損傷については責任を負いかねますのでご了承ください。',
]

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function formatDate(d: Date | null): string {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`
}

function hasBatteryData(details: Record<string, unknown> | null): boolean {
  if (!details) return false
  return Object.values(details).some((v) => v !== '' && v !== null && v !== undefined)
}

// -------------------------------------------------------
// Components
// -------------------------------------------------------

/**
 * 署名ブロック。
 *
 * P0-13 (2026-04-29): src は DataURL（旧）/ HTTPS URL（新: Vercel Blob `access:'public'`）
 *   のどちらでも `@react-pdf/renderer` の <Image> がサーバー側 fetch して描画する。
 *
 * P0-14 対応予告: Blob を private 化（access:'private' + 署名付きURL）した場合、
 *   ここで HTTPS URL のまま渡すと 401/403 で fetch 失敗する。対応案は以下のいずれか：
 *
 *   A. PDF 生成時にサーバー側で `getDownloadUrl(pathname)` を呼び、
 *      短期署名 URL を生成してテンプレートに渡す。
 *   B. PDF 生成時にサーバー側で `fetch(blob_url)` してバッファを取り、
 *      `<Image src={Buffer}>` に渡す（@react-pdf は Buffer も受け付ける）。
 *
 *   いずれも実装は P0-14 のスコープ。本テンプレートでは src の型を `string | null` のまま維持する。
 */
function SignatureBlock({ src, label }: { src: string | null; label?: string }) {
  if (src) {
    return <Image src={src} style={styles.signatureImage} />
  }
  return <Text style={{ fontSize: 10, color: '#999999' }}>（署名なし）</Text>
}

// -------------------------------------------------------
// Main template
// -------------------------------------------------------

export function ConfirmationPdf(props: ConfirmationPdfProps) {
  const {
    workDate,
    preApprovalChecks,
    customerSignature,
    vehicleType,
    registrationNumber,
    workContent,
    shopCompanyName,
    shopSignature,
    postApprovalCheck,
    postApprovalSignature,
    postApprovalName,
    batteryDetails,
    notes,
  } = props

  const checks = preApprovalChecks ?? [false, false, false, false, false]
  const showBattery = hasBatteryData(batteryDetails)
  const bd = (batteryDetails ?? {}) as Record<string, string>

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 1. ヘッダー */}
        <Text style={styles.header}>作業確認書</Text>

        {/* 2. 作業日 */}
        <Text style={styles.dateText}>作業日：{formatDate(workDate)}</Text>

        {/* 3. 作業前承認欄 */}
        <Text style={styles.sectionTitle}>作業前承認欄（お客様ご署名欄）</Text>
        <View style={styles.sectionBox}>
          <Text style={{ fontSize: 9, marginBottom: 6 }}>
            専門的な作業もございますので作業をお手伝い頂く事はご遠慮ください。（お客様の安全の為スタッフが指示する事もございます）
          </Text>
          {preCheckLabels.map((label, i) => (
            <View key={i} style={styles.checkItem}>
              <Text style={{ fontSize: 10 }}>{checks[i] ? '☑' : '☐'}</Text>
              <Text style={{ fontSize: 9, flex: 1 }}>{label}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 9, marginTop: 6, marginBottom: 4 }}>
            上記、作業前の承認事項に同意いたします。
          </Text>
          <SignatureBlock src={customerSignature} />
        </View>

        {/* 4. 車両情報 */}
        <Text style={styles.sectionTitle}>車両情報</Text>
        <View style={styles.sectionBox}>
          <Text style={styles.label}>車種名</Text>
          <Text style={styles.value}>{vehicleType ?? ''}</Text>
          <Text style={[styles.label, { marginTop: 4 }]}>登録番号</Text>
          <Text style={styles.value}>{registrationNumber ?? ''}</Text>
        </View>

        {/* 5. 作業内容 */}
        <Text style={styles.sectionTitle}>作業内容</Text>
        <View style={styles.sectionBox}>
          <Text style={styles.value}>{workContent ?? ''}</Text>
        </View>

        {/* 6. 入庫先ご担当者様記入欄 */}
        <Text style={styles.sectionTitle}>入庫先ご担当者様記入欄</Text>
        <View style={styles.sectionBox}>
          <Text style={{ fontSize: 9, marginBottom: 6 }}>
            本紙の内容を確認の上、車両をお預かりいたしました。
          </Text>
          <Text style={styles.label}>会社名</Text>
          <Text style={styles.value}>{shopCompanyName ?? ''}</Text>
          <Text style={[styles.label, { marginTop: 4 }]}>担当者署名</Text>
          <SignatureBlock src={shopSignature} />
        </View>

        {/* 7. 作業完了後承認欄 */}
        <Text style={styles.sectionTitle}>作業完了後承認欄</Text>
        <View style={styles.sectionBox}>
          <Text style={{ fontSize: 9, marginBottom: 6 }}>
            今回の作業はあくまで応急処置です。早急に修理工場での点検・整備をお勧めいたします。（点検・整備費用はロードサービス対象外となります）
          </Text>
          <View style={styles.checkItem}>
            <Text style={{ fontSize: 10 }}>{postApprovalCheck ? '☑' : '☐'}</Text>
            <Text style={{ fontSize: 9, flex: 1 }}>
              作業が異常なく完了し、外観及び内装に新たな傷がないことを確認いたしました。
            </Text>
          </View>
          <Text style={[styles.label, { marginTop: 4 }]}>お客様署名</Text>
          <SignatureBlock src={postApprovalSignature} />
        </View>

        {/* 8. バッテリー作業明細 */}
        {showBattery && (
          <>
            <Text style={styles.sectionTitle}>バッテリー作業明細</Text>
            <View style={styles.sectionBox}>
              <View style={styles.batteryRow}>
                <Text style={styles.label}>電装：使用 / 類</Text>
                <Text style={styles.value}>{bd.electricUsage ?? ''}</Text>
              </View>
              <View style={styles.batteryRow}>
                <Text style={styles.label}>時間未乗車 / バッテリー / 年使用</Text>
                <Text style={styles.value}>{bd.timeUnused ?? ''}</Text>
              </View>
              <View style={styles.batteryRow}>
                <Text style={styles.label}>バッテリー電圧：作業前</Text>
                <Text style={styles.value}>{bd.voltageBefore ?? ''}</Text>
              </View>
              <View style={styles.batteryRow}>
                <Text style={styles.label}>発生電圧</Text>
                <Text style={styles.value}>{bd.voltageGenerated ?? ''}</Text>
              </View>
              <View style={styles.batteryRow}>
                <Text style={styles.label}>バッテリー比重：MF値</Text>
                <Text style={styles.value}>{bd.gravityMF ?? ''}</Text>
              </View>
              <View style={styles.batteryRow}>
                <Text style={styles.label}>負荷点検</Text>
                <Text style={styles.value}>{bd.loadInspection ?? ''}</Text>
              </View>
              <View style={styles.batteryRow}>
                <Text style={styles.label}>再始動</Text>
                <Text style={styles.value}>{bd.restart ?? ''}</Text>
              </View>
              <View style={styles.batteryRow}>
                <Text style={styles.label}>差異</Text>
                <Text style={styles.value}>{bd.difference ?? ''}</Text>
              </View>
            </View>
          </>
        )}

        {/* 9. 注意事項・その他 */}
        {notes && (
          <>
            <Text style={styles.sectionTitle}>注意事項・その他</Text>
            <View style={styles.sectionBox}>
              <Text style={styles.value}>{notes}</Text>
            </View>
          </>
        )}

        {/* 10. 担当者氏名 */}
        <View style={styles.footer}>
          <Text style={styles.label}>担当者氏名</Text>
          <Text style={styles.value}>{postApprovalName ?? ''}</Text>
        </View>
      </Page>
    </Document>
  )
}
