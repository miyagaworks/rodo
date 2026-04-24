'use client'

import { useState, useEffect } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import { ChevronRight, X, Plus } from 'lucide-react'
import { FaSave } from 'react-icons/fa'

interface Vehicle {
  id: string
  plateNumber: string
  displayName: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count: { users: number; dispatches: number }
}

export default function VehiclesTab() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Record<string, { plateNumber: string; displayName: string | null; isActive: boolean }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchVehicles()
  }, [])

  const fetchVehicles = async () => {
    const res = await fetch('/api/settings/vehicles')
    if (res.ok) {
      const data = await res.json()
      setVehicles(data)
    }
    setLoading(false)
  }

  const sortedVehicles = [...vehicles].sort((a, b) =>
    a.plateNumber.localeCompare(b.plateNumber, 'ja', { numeric: true })
  )

  const startEditing = (v: Vehicle) => {
    setEditingId(v.id)
    setEditData(prev => ({
      ...prev,
      [v.id]: {
        plateNumber: v.plateNumber,
        displayName: v.displayName,
        isActive: v.isActive,
      },
    }))
  }

  const cancelEditing = () => {
    setEditingId(null)
  }

  const saveVehicle = async (id: string) => {
    const data = editData[id]
    if (!data) return

    await fetch(`/api/settings/vehicles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await fetchVehicles()
    setEditingId(null)
  }

  const deleteVehicle = async (id: string) => {
    if (!confirm('削除しますか？')) return
    const res = await fetch(`/api/settings/vehicles/${id}`, { method: 'DELETE' })
    if (res.status === 409) {
      alert('この車両は進行中の出動に使用されています')
      return
    }
    if (!res.ok) {
      alert('削除に失敗しました')
      return
    }
    await fetchVehicles()
  }

  const addVehicle = async () => {
    const res = await fetch('/api/settings/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plateNumber: `新規-${Date.now()}`, displayName: null, isActive: true }),
    })
    if (res.status === 409) {
      alert('車両の追加に失敗しました')
      return
    }
    await fetchVehicles()
  }

  if (loading) return <div className="text-center py-8 text-gray-500">読み込み中...</div>

  return (
    <div>
      <Accordion.Root type="single" collapsible className="space-y-2">
        {sortedVehicles.map((vehicle) => {
          const isEditing = editingId === vehicle.id
          const data = editData[vehicle.id]

          const headerLabel =
            (vehicle.isActive ? '' : '[停止中] ') +
            vehicle.plateNumber +
            (vehicle.displayName ? ` (${vehicle.displayName})` : '')

          return (
            <Accordion.Item
              key={vehicle.id}
              value={vehicle.id}
              className="bg-white rounded-xl shadow-sm overflow-hidden"
            >
              <Accordion.Header>
                <Accordion.Trigger className="w-full flex items-center justify-between px-4 py-3 text-left group">
                  <div className="flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-gray-400 transition-transform group-data-[state=open]:rotate-90" />
                    <span className="font-medium text-gray-800">{headerLabel}</span>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); deleteVehicle(vehicle.id) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); deleteVehicle(vehicle.id) } }}
                    className="p-1 rounded-full hover:bg-red-50 cursor-pointer"
                  >
                    <X className="w-4 h-4 text-red-400" />
                  </div>
                </Accordion.Trigger>
              </Accordion.Header>

              <Accordion.Content className="px-4 pb-4">
                {!isEditing ? (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">ナンバー: {vehicle.plateNumber}</p>
                    {vehicle.displayName && (
                      <p className="text-sm text-gray-600 mb-1">表示名: {vehicle.displayName}</p>
                    )}
                    <p className="text-sm text-gray-600 mb-1">状態: {vehicle.isActive ? '使用中' : '停止中'}</p>
                    <p className="text-sm text-gray-600 mb-1">所属隊員: {vehicle._count.users}名</p>
                    <p className="text-sm text-gray-600 mb-3">出動実績: {vehicle._count.dispatches}件</p>
                    <button
                      onClick={() => startEditing(vehicle)}
                      className="text-sm px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50"
                    >
                      編集
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 mb-1">ナンバー</label>
                      <input
                        type="text"
                        value={data?.plateNumber ?? ''}
                        onChange={(e) => setEditData(prev => ({
                          ...prev,
                          [vehicle.id]: { ...prev[vehicle.id], plateNumber: e.target.value },
                        }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 mb-1">表示名</label>
                      <input
                        type="text"
                        value={data?.displayName ?? ''}
                        placeholder="任意"
                        onChange={(e) => setEditData(prev => ({
                          ...prev,
                          [vehicle.id]: { ...prev[vehicle.id], displayName: e.target.value || null },
                        }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={data?.isActive ?? true}
                          onChange={(e) => setEditData(prev => ({
                            ...prev,
                            [vehicle.id]: { ...prev[vehicle.id], isActive: e.target.checked },
                          }))}
                          className="rounded border-gray-300"
                        />
                        使用中
                      </label>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={cancelEditing}
                        className="flex-1 py-2 rounded-lg text-sm font-medium"
                        style={{ backgroundColor: '#9CA3AF', color: 'white' }}
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={() => saveVehicle(vehicle.id)}
                        className="flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2.5"
                        style={{ backgroundColor: '#1C2948', color: 'white' }}
                      >
                        <FaSave className="w-4 h-4" />
                        <span style={{ letterSpacing: '0.15em' }}>保存</span>
                      </button>
                    </div>
                  </div>
                )}
              </Accordion.Content>
            </Accordion.Item>
          )
        })}
      </Accordion.Root>

      <button
        onClick={addVehicle}
        className="w-full mt-4 py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 text-sm flex items-center justify-center gap-2 hover:bg-white/50"
      >
        <Plus className="w-4 h-4" />
        車両を追加
      </button>
    </div>
  )
}
