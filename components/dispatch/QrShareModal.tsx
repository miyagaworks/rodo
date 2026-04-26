'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

const MAIN = '#1C2948'

interface Props {
  token: string
  onClose: () => void
}

export default function QrShareModal({ token, onClose }: Props) {
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const url = origin ? `${origin}/c/${token}` : ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-pointer"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-sm w-full cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-2 text-center" style={{ color: MAIN }}>
          作業確認書を共有
        </h2>
        <p className="text-xs mb-4 text-justify" style={{ color: '#555' }}>
          お客様にQRコードを読み取っていただくか、URLをお伝えください。
        </p>

        {origin && (
          <div className="flex justify-center my-4">
            <QRCodeSVG value={url} size={256} />
          </div>
        )}

        <p className="text-xs text-gray-500 break-all select-all mt-3 mb-5 text-center">
          {url}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-lg font-bold text-white"
          style={{ backgroundColor: MAIN }}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
