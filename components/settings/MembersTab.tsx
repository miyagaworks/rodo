'use client'

import { useState, useEffect } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import { ChevronRight, X, CloudUpload, Plus } from 'lucide-react'

interface Vehicle {
  id: string
  plateNumber: string
  displayName: string | null
  isActive: boolean
}

interface Member {
  id: string
  name: string
  vehicleId: string | null
  vehicle: { plateNumber: string; displayName: string | null } | null
  monthlySalary: number | null
  overtimeRate: number | null
  transportationAllowance: number | null
}

export default function MembersTab() {
  const [members, setMembers] = useState<Member[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Record<string, Member>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const [membersRes, vehiclesRes] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/settings/vehicles'),
    ])
    if (membersRes.ok) {
      const data = await membersRes.json()
      setMembers(data)
    }
    if (vehiclesRes.ok) {
      const data = await vehiclesRes.json()
      setVehicles(data)
    }
    setLoading(false)
  }

  const vehicleOptionsFor = (member: Member): Vehicle[] => {
    const activeList = vehicles
      .filter(v => v.isActive)
      .sort((a, b) => a.plateNumber.localeCompare(b.plateNumber, 'ja', { numeric: true }))

    if (member.vehicleId) {
      const current = vehicles.find(v => v.id === member.vehicleId)
      if (current && !current.isActive && !activeList.some(v => v.id === current.id)) {
        return [current, ...activeList]
      }
    }
    return activeList
  }

  const startEditing = (m: Member) => {
    setEditingId(m.id)
    setEditData(prev => ({ ...prev, [m.id]: { ...m } }))
  }

  const saveMember = async (id: string) => {
    const data = editData[id]
    const payload = {
      name: data.name,
      vehicleId: data.vehicleId,
      monthlySalary: data.monthlySalary,
      overtimeRate: data.overtimeRate,
      transportationAllowance: data.transportationAllowance,
    }
    await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    await fetchData()
    setEditingId(null)
  }

  const deleteMember = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await fetch(`/api/users/${id}`, { method: 'DELETE' })
    await fetchData()
  }

  const addMember = async () => {
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '新しい隊員', email: `member-${Date.now()}@example.com` }),
    })
    await fetchData()
  }

  const formatCurrency = (v: number | null) =>
    v != null ? `¥${v.toLocaleString()}` : '未設定'

  if (loading) return <div className="text-center py-8 text-gray-500">読み込み中...</div>

  return (
    <div>
      <Accordion.Root type="single" collapsible className="space-y-2">
        {members.map((member) => {
          const isEditing = editingId === member.id
          const data = editData[member.id]

          return (
            <Accordion.Item
              key={member.id}
              value={member.id}
              className="bg-white rounded-xl shadow-sm overflow-hidden"
            >
              <Accordion.Header>
                <Accordion.Trigger className="w-full flex items-center justify-between px-4 py-3 text-left group">
                  <div className="flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-gray-400 transition-transform group-data-[state=open]:rotate-90" />
                    <span className="font-medium text-gray-800">{member.name}</span>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); deleteMember(member.id) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); deleteMember(member.id) } }}
                    className="p-1 rounded-full hover:bg-red-50 cursor-pointer"
                  >
                    <X className="w-4 h-4 text-red-400" />
                  </div>
                </Accordion.Trigger>
              </Accordion.Header>

              <Accordion.Content className="px-4 pb-4">
                {!isEditing ? (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">
                      使用車両: {member.vehicle
                        ? member.vehicle.plateNumber + (member.vehicle.displayName ? ` (${member.vehicle.displayName})` : '')
                        : '未設定'}
                    </p>
                    <p className="text-sm text-gray-600 mb-1">月給: {formatCurrency(member.monthlySalary)}</p>
                    <p className="text-sm text-gray-600 mb-1">残業単価: {formatCurrency(member.overtimeRate)}</p>
                    <p className="text-sm text-gray-600 mb-3">交通費/月: {formatCurrency(member.transportationAllowance)}</p>
                    <button
                      onClick={() => startEditing(member)}
                      className="text-sm px-3 py-1 rounded-lg border border-gray-300"
                    >
                      編集
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 mb-1">氏名</label>
                      <input
                        type="text"
                        value={data?.name ?? ''}
                        onChange={(e) => setEditData(prev => ({
                          ...prev,
                          [member.id]: { ...prev[member.id], name: e.target.value },
                        }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 mb-1">使用車両</label>
                      <select
                        value={data?.vehicleId ?? ''}
                        onChange={(e) => setEditData(prev => ({
                          ...prev,
                          [member.id]: { ...prev[member.id], vehicleId: e.target.value || null },
                        }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="">未設定</option>
                        {vehicleOptionsFor(member).map(v => (
                          <option key={v.id} value={v.id}>
                            {(v.isActive ? '' : '[停止中] ') + v.plateNumber + (v.displayName ? ` (${v.displayName})` : '')}
                          </option>
                        ))}
                      </select>
                    </div>

                    {([
                      { key: 'monthlySalary' as const, label: '月給（円）' },
                      { key: 'overtimeRate' as const, label: '残業単価（円）' },
                      { key: 'transportationAllowance' as const, label: '交通費/月（円）' },
                    ] as const).map(({ key, label }) => (
                      <div key={key} className="mb-3">
                        <label className="block text-xs text-gray-500 mb-1">{label}</label>
                        <input
                          type="number"
                          value={data?.[key] ?? ''}
                          onChange={(e) => setEditData(prev => ({
                            ...prev,
                            [member.id]: {
                              ...prev[member.id],
                              [key]: Number(e.target.value) || null,
                            }
                          }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex-1 py-2 rounded-lg text-sm font-medium"
                        style={{ backgroundColor: '#F5E6B0' }}
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={() => saveMember(member.id)}
                        className="flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1"
                        style={{ backgroundColor: '#1C2948', color: '#D7AF70' }}
                      >
                        <CloudUpload className="w-4 h-4" />
                        保存
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
        onClick={addMember}
        className="w-full mt-4 py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 text-sm flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        隊員を追加
      </button>
    </div>
  )
}
