/**
 * Report 距離の自動計算ヘルパー (純関数)
 *
 * Dispatch / Report の各 ODO フィールドから、回送・搬送・帰社の距離を算出する。
 * 入力のいずれかが null / undefined の場合は null を返す。
 * 負の値（単調増加違反）はそのまま返す — 呼び出し側 / 下流の表示で扱う。
 */

/**
 * 回送距離 = 現場到着 ODO − 出発 ODO
 * - ONSITE / TRANSPORT 1 次で使用。
 * - SECONDARY TRANSPORT では呼び出さない想定（呼び出し側で null をセット）。
 */
export function calculateRecoveryDistance(
  departureOdo: number | null | undefined,
  arrivalOdo: number | null | undefined,
): number | null {
  if (departureOdo == null || arrivalOdo == null) return null
  return arrivalOdo - departureOdo
}

/**
 * 搬送距離 = 搬送完了 ODO − 搬送開始 ODO
 * - TRANSPORT 1 次: startOdo = transportStartOdo
 * - SECONDARY TRANSPORT: startOdo = departureOdo（2 次は出発がそのまま搬送開始）
 * - ONSITE では呼び出さない想定。
 */
export function calculateTransportDistance(
  startOdo: number | null | undefined,
  completionOdo: number | null | undefined,
): number | null {
  if (startOdo == null || completionOdo == null) return null
  return completionOdo - startOdo
}

/**
 * 帰社距離 = 帰社 ODO − 搬送完了 ODO
 * - 全フロー共通で使用。
 */
export function calculateReturnDistance(
  completionOdo: number | null | undefined,
  returnOdo: number | null | undefined,
): number | null {
  if (completionOdo == null || returnOdo == null) return null
  return returnOdo - completionOdo
}

// -------------------------------------------------------
// enrichReportDistances — SSR 段階で Report 距離 3 種を自動補完する
// -------------------------------------------------------

/**
 * enrich に必要な Dispatch の最小形。
 * 実際の Prisma Dispatch は多数のフィールドを持つが、距離計算に使うのはこれだけ。
 */
export interface DispatchLikeForEnrich {
  type: 'ONSITE' | 'TRANSPORT'
  isSecondaryTransport?: boolean | null
  departureOdo: number | null
  arrivalOdo: number | null
  transportStartOdo: number | null
  completionOdo: number | null
  returnOdo: number | null
}

/**
 * enrich に必要な Report の最小形（ODO 各種 + 距離 3 種）。
 * Report が存在する場合は既存の distance 値を尊重する。
 */
export interface ReportLikeForEnrich {
  departureOdo?: number | null
  arrivalOdo?: number | null
  transportStartOdo?: number | null
  completionOdo?: number | null
  returnOdo?: number | null
  recoveryDistance?: number | null
  transportDistance?: number | null
  returnDistance?: number | null
}

/**
 * distance 3 フィールドのみを持つ最小オブジェクト（Report が null の場合の戻り値）。
 */
export interface EnrichedDistancesOnly {
  recoveryDistance: number | null
  transportDistance: number | null
  returnDistance: number | null
}

/** Report / Dispatch のうち、Report 側に有効値があればそれを、なければ Dispatch 側を使う。 */
function pickOdo(
  reportVal: number | null | undefined,
  dispatchVal: number | null | undefined,
): number | null {
  if (reportVal != null) return reportVal
  if (dispatchVal != null) return dispatchVal
  return null
}

/**
 * Report 距離 3 種を SSR で自動補完する。
 *
 * フロー分岐:
 * - ONSITE              : recovery = arrival − departure, transport = null,                 return = returnOdo − completion
 * - TRANSPORT 1 次      : recovery = arrival − departure, transport = completion − tStart,  return = returnOdo − completion
 * - SECONDARY TRANSPORT : recovery = null,                transport = completion − departure, return = returnOdo − completion
 *
 * ODO 取得優先順位: Report 側が非 null → Report、そうでなければ Dispatch。
 * 既存の distance 値（report 側が number）は上書きしない（ユーザー意図を尊重）。
 *
 * @param report   既存の Report（null の場合は新規扱い）
 * @param dispatch Dispatch（必須）
 * @returns Report が存在すれば T に distance を上書きした新オブジェクト、Report が null なら distance 3 種のみのオブジェクト
 */
export function enrichReportDistances<T extends ReportLikeForEnrich>(
  report: T | null,
  dispatch: DispatchLikeForEnrich,
): T | EnrichedDistancesOnly {
  const isSecondary = dispatch.isSecondaryTransport === true
  const isTransport = dispatch.type === 'TRANSPORT'

  // ODO は Report 側優先で取得
  const departureOdo = pickOdo(report?.departureOdo, dispatch.departureOdo)
  const arrivalOdo = pickOdo(report?.arrivalOdo, dispatch.arrivalOdo)
  const transportStartOdo = pickOdo(report?.transportStartOdo, dispatch.transportStartOdo)
  const completionOdo = pickOdo(report?.completionOdo, dispatch.completionOdo)
  const returnOdo = pickOdo(report?.returnOdo, dispatch.returnOdo)

  // フロー別に distance 3 種を計算
  let computedRecovery: number | null
  let computedTransport: number | null
  const computedReturn = calculateReturnDistance(completionOdo, returnOdo)

  if (isSecondary) {
    // 2 次搬送: 出発 → 搬送完了 = 搬送距離（回送は無し）
    computedRecovery = null
    computedTransport = calculateTransportDistance(departureOdo, completionOdo)
  } else if (isTransport) {
    // TRANSPORT 1 次
    computedRecovery = calculateRecoveryDistance(departureOdo, arrivalOdo)
    computedTransport = calculateTransportDistance(transportStartOdo, completionOdo)
  } else {
    // ONSITE
    computedRecovery = calculateRecoveryDistance(departureOdo, arrivalOdo)
    computedTransport = null
  }

  // Report が null → distance 3 種のみのオブジェクトを返す
  if (report == null) {
    return {
      recoveryDistance: computedRecovery,
      transportDistance: computedTransport,
      returnDistance: computedReturn,
    }
  }

  // Report が存在 → 既存の distance を尊重しつつ null のみ補完
  return {
    ...report,
    recoveryDistance:
      typeof report.recoveryDistance === 'number' ? report.recoveryDistance : computedRecovery,
    transportDistance:
      typeof report.transportDistance === 'number' ? report.transportDistance : computedTransport,
    returnDistance:
      typeof report.returnDistance === 'number' ? report.returnDistance : computedReturn,
  }
}

