import imageCompression from 'browser-image-compression'

/**
 * 画像をリサイズ・圧縮する
 * - 長辺1200px以下
 * - JPEG品質80%
 * - EXIF回転情報を考慮
 *
 * 戻り値は File に正規化する（MIMEタイプ image/jpeg を確実に保持するため）。
 * Blob のまま返すと FormData.append 時に MIME が欠落し、
 * サーバー側バリデーションで 400 になる可能性がある。
 */
export async function compressImage(file: File): Promise<File> {
  const options = {
    maxWidthOrHeight: 1200,
    initialQuality: 0.8,
    useWebWorker: false,
    fileType: 'image/jpeg' as const,
    preserveExif: false, // 回転は自動適用される
  }
  const result = await imageCompression(file, options)
  return new File([result], 'photo.jpg', { type: 'image/jpeg' })
}
