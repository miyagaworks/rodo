'use client'

import { useState, useEffect } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import { ChevronRight, X, CloudUpload, Plus } from 'lucide-react'

interface Member {
  id: string
  name: string
  vehicleNumber: string | null
  monthlySalary: number | null
  overtimeRate: number | null
  transportationAllowance: number | null
}

export default function MembersTab() {
  const [members, setMembers] = useState<Member[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Record<string, Member>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMembers()
  }, [])

  const fetchMembers = async () => {
    const res = await fetch('/api/users')
    if (res.ok) {
      const data = await res.json()
      setMembers(data)
    }
    setLoading(false)
  }

  const startEditing = (m: Member) => {
    setEditingId(m.id)
    setEditData(prev => ({ ...prev, [m.id]: { ...m } }))
  }

  const saveMember = async (id: string) => {
    const data = editData[id]
    await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await fetchMembers()
    setEditingId(null)
  }

  const deleteMember = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await fetch(`/api/users/${id}`, { method: 'DELETE' })
    await fetchMembers()
  }

  const addMember = async () => {
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '新しい隊員', email: `member-${Date.now()}@example.com` }),
    })
    await fetchMembers()
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
                    <p className="text-sm text-gray-600 mb-1">使用車両: {member.vehicleNumber || '未設定'}</p>
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
                    {[
                      { key: 'name', label: '氏名', type: 'text' },
                      { key: 'vehicleNumber', label: '使用車両', type: 'text' },
                      { key: 'monthlySalary', label: '月給（円）', type: 'number' },
                      { key: 'overtimeRate', label: '残業単価（円）', type: 'number' },
                      { key: 'transportationAllowance', label: '交通費/月（円）', type: 'number' },
                    ].map(({ key, label, type }) => (
                      <div key={key} className="mb-3">
                        <label className="block text-xs text-gray-500 mb-1">{label}</label>
                        <input
                          type={type}
                          value={(data as any)?.[key] ?? ''}
                          onChange={(e) => setEditData(prev => ({
                            ...prev,
                            [member.id]: {
                              ...prev[member.id],
                              [key]: type === 'number' ? Number(e.target.value) || null : e.target.value,
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
