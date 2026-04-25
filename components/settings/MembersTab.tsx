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
  const [isAdding, setIsAdding] = useState(false)
  const [newMember, setNewMember] = useState<{
    name: string
    email: string
    password: string
    role: 'ADMIN' | 'MEMBER'
    vehicleId: string | null
    monthlySalary: number | null
    overtimeRate: number | null
    transportationAllowance: number | null
  }>({
    name: '',
    email: '',
    password: '',
    role: 'MEMBER',
    vehicleId: null,
    monthlySalary: null,
    overtimeRate: null,
    transportationAllowance: null,
  })

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
    const name = newMember.name.trim()
    const email = newMember.email.trim()
    const password = newMember.password
    if (!name || !email || password.length < 8) return

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        password,
        role: newMember.role,
        vehicleId: newMember.vehicleId,
        monthlySalary: newMember.monthlySalary,
        overtimeRate: newMember.overtimeRate,
        transportationAllowance: newMember.transportationAllowance,
      }),
    })
    if (res.status === 409) {
      alert('このメールアドレスは既に登録されています')
      return
    }
    if (res.status === 400) {
      alert('入力内容に誤りがあります')
      return
    }
    if (!res.ok) {
      alert('隊員の追加に失敗しました')
      return
    }
    setIsAdding(false)
    setNewMember({ name: '', email: '', password: '', role: 'MEMBER', vehicleId: null, monthlySalary: null, overtimeRate: null, transportationAllowance: null })
    await fetchData()
  }

  const canSubmitNewMember =
    newMember.name.trim() !== '' &&
    newMember.email.trim() !== '' &&
    newMember.password.length >= 8

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
                        style={{ backgroundColor: '#9CA3AF', color: 'white' }}
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={() => saveMember(member.id)}
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

      {isAdding && (
        <div className="bg-white rounded-xl shadow-sm p-4 mt-2">
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">氏名 (必須)</label>
            <input
              type="text"
              value={newMember.name}
              onChange={(e) => setNewMember(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例: 山田太郎"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">メールアドレス (必須)</label>
            <input
              type="email"
              value={newMember.email}
              onChange={(e) => setNewMember(prev => ({ ...prev, email: e.target.value }))}
              placeholder="例: yamada@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">パスワード (8文字以上)</label>
            <input
              type="password"
              value={newMember.password}
              onChange={(e) => setNewMember(prev => ({ ...prev, password: e.target.value }))}
              placeholder="8文字以上"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">権限</label>
            <select
              value={newMember.role}
              onChange={(e) => setNewMember(prev => ({ ...prev, role: e.target.value as 'ADMIN' | 'MEMBER' }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="MEMBER">隊員</option>
              <option value="ADMIN">管理者</option>
            </select>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">使用車両</label>
            <select
              value={newMember.vehicleId ?? ''}
              onChange={(e) => setNewMember(prev => ({ ...prev, vehicleId: e.target.value || null }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">未設定</option>
              {vehicles.filter(v => v.isActive)
                .sort((a, b) => a.plateNumber.localeCompare(b.plateNumber, 'ja', { numeric: true }))
                .map(v => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber + (v.displayName ? ` (${v.displayName})` : '')}
                  </option>
                ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">月給（円）</label>
            <input
              type="number"
              value={newMember.monthlySalary ?? ''}
              onChange={(e) => setNewMember(prev => ({ ...prev, monthlySalary: Number(e.target.value) || null }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">残業単価（円）</label>
            <input
              type="number"
              value={newMember.overtimeRate ?? ''}
              onChange={(e) => setNewMember(prev => ({ ...prev, overtimeRate: Number(e.target.value) || null }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">交通費/月（円）</label>
            <input
              type="number"
              value={newMember.transportationAllowance ?? ''}
              onChange={(e) => setNewMember(prev => ({ ...prev, transportationAllowance: Number(e.target.value) || null }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setIsAdding(false); setNewMember({ name: '', email: '', password: '', role: 'MEMBER', vehicleId: null, monthlySalary: null, overtimeRate: null, transportationAllowance: null }) }}
              className="flex-1 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: '#9CA3AF', color: 'white' }}
            >
              キャンセル
            </button>
            <button
              onClick={addMember}
              disabled={!canSubmitNewMember}
              className="flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2.5 disabled:opacity-50"
              style={{ backgroundColor: '#1C2948', color: 'white' }}
            >
              <FaSave className="w-4 h-4" />
              <span style={{ letterSpacing: '0.15em' }}>保存</span>
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsAdding(true)}
        disabled={isAdding}
        className="w-full mt-4 py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Plus className="w-4 h-4" />
        隊員を追加
      </button>
    </div>
  )
}
