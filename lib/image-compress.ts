import imageCompression from 'browser-image-compression'

/**
 * 画像をリサイズ・圧縮する
 * - 長辺1200px以下
 * - JPEG品質80%
 * - EXIF回転情報を考慮
 */
export async function compressImage(file: File): Promise<Blob> {
  const options = {
    maxWidthOrHeight: 1200,
    initialQuality: 0.8,
    useWebWorker: true,
    fileType: 'image/jpeg' as const,
    preserveExif: false, // 回転は自動適用される
  }
  return imageCompression(file, options)
}
