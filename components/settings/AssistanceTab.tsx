'use client'

import { useState, useEffect } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import { ChevronRight, X, Plus } from 'lucide-react'
import { FaSave } from 'react-icons/fa'

interface InsuranceCompany {
  id: string
  name: string
}

interface Assistance {
  id: string
  name: string
  displayAbbreviation: string
  insuranceCompanies: InsuranceCompany[]
}

export default function AssistanceTab() {
  const [assistances, setAssistances] = useState<Assistance[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Record<string, { name: string; abbr: string; companies: InsuranceCompany[] }>>({})
  const [newCompanyInput, setNewCompanyInput] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [newAssistance, setNewAssistance] = useState<{ name: string; displayAbbreviation: string }>({
    name: '',
    displayAbbreviation: '',
  })

  useEffect(() => {
    fetchAssistances()
  }, [])

  const fetchAssistances = async () => {
    const res = await fetch('/api/assistances')
    if (res.ok) {
      const data = await res.json()
      setAssistances(data)
    }
    setLoading(false)
  }

  const startEditing = (a: Assistance) => {
    setEditingId(a.id)
    setEditData(prev => ({
      ...prev,
      [a.id]: {
        name: a.name,
        abbr: a.displayAbbreviation,
        companies: [...a.insuranceCompanies],
      }
    }))
  }

  const cancelEditing = () => {
    setEditingId(null)
  }

  const saveAssistance = async (id: string) => {
    const data = editData[id]
    if (!data) return

    const res = await fetch(`/api/assistances/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        displayAbbreviation: data.abbr,
        insuranceCompanies: data.companies.map(c => c.name),
      }),
    })

    if (res.ok) {
      await fetchAssistances()
      setEditingId(null)
    }
  }

  const deleteAssistance = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await fetch(`/api/assistances/${id}`, { method: 'DELETE' })
    await fetchAssistances()
  }

  const addCompany = (assistanceId: string) => {
    const name = newCompanyInput[assistanceId]?.trim()
    if (!name) return
    setEditData(prev => ({
      ...prev,
      [assistanceId]: {
        ...prev[assistanceId],
        companies: [...prev[assistanceId].companies, { id: `new-${Date.now()}`, name }],
      }
    }))
    setNewCompanyInput(prev => ({ ...prev, [assistanceId]: '' }))
  }

  const removeCompany = (assistanceId: string, companyId: string) => {
    setEditData(prev => ({
      ...prev,
      [assistanceId]: {
        ...prev[assistanceId],
        companies: prev[assistanceId].companies.filter(c => c.id !== companyId),
      }
    }))
  }

  const addAssistance = async () => {
    const name = newAssistance.name.trim()
    const displayAbbreviation = newAssistance.displayAbbreviation.trim()
    if (!name || !displayAbbreviation) return

    const res = await fetch('/api/assistances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, displayAbbreviation }),
    })
    if (!res.ok) {
      alert('アシスタンスの追加に失敗しました')
      return
    }
    setIsAdding(false)
    setNewAssistance({ name: '', displayAbbreviation: '' })
    await fetchAssistances()
  }

  const canSubmitNewAssistance =
    newAssistance.name.trim() !== '' &&
    newAssistance.displayAbbreviation.trim() !== ''

  if (loading) return <div className="text-center py-8 text-gray-500">読み込み中...</div>

  return (
    <div>
      <Accordion.Root type="single" collapsible className="space-y-2">
        {assistances.map((assistance) => {
          const isEditing = editingId === assistance.id
          const data = editData[assistance.id]

          return (
            <Accordion.Item
              key={assistance.id}
              value={assistance.id}
              className="bg-white rounded-xl shadow-sm overflow-hidden"
            >
              <Accordion.Header>
                <Accordion.Trigger className="w-full flex items-center justify-between px-4 py-3 text-left group">
                  <div className="flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-gray-400 transition-transform group-data-[state=open]:rotate-90" />
                    <span className="font-medium text-gray-800">{assistance.name}</span>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); deleteAssistance(assistance.id) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); deleteAssistance(assistance.id) } }}
                    className="p-1 rounded-full hover:bg-red-50 cursor-pointer"
                  >
                    <X className="w-4 h-4 text-red-400" />
                  </div>
                </Accordion.Trigger>
              </Accordion.Header>

              <Accordion.Content className="px-4 pb-4">
                {!isEditing ? (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">
                      損保: {assistance.insuranceCompanies.map(c => c.name).join('、') || 'なし'}
                    </p>
                    <p className="text-sm text-gray-500 mb-3">略称: {assistance.displayAbbreviation}</p>
                    <button
                      onClick={() => startEditing(assistance)}
                      className="text-sm px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50"
                    >
                      編集
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 mb-1">アシスタンス名</label>
                      <input
                        type="text"
                        value={data?.name || ''}
                        onChange={(e) => setEditData(prev => ({
                          ...prev,
                          [assistance.id]: { ...prev[assistance.id], name: e.target.value }
                        }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 mb-1">表示略称</label>
                      <input
                        type="text"
                        value={data?.abbr || ''}
                        onChange={(e) => setEditData(prev => ({
                          ...prev,
                          [assistance.id]: { ...prev[assistance.id], abbr: e.target.value }
                        }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 mb-1">損保会社</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {data?.companies.map(c => (
                          <span
                            key={c.id}
                            className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full"
                          >
                            {c.name}
                            <button onClick={() => removeCompany(assistance.id, c.id)}>
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCompanyInput[assistance.id] || ''}
                          onChange={(e) => setNewCompanyInput(prev => ({ ...prev, [assistance.id]: e.target.value }))}
                          placeholder="損保会社名"
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && addCompany(assistance.id)}
                        />
                        <button
                          onClick={() => addCompany(assistance.id)}
                          className="text-sm px-3 py-1.5 rounded-lg text-white"
                          style={{ backgroundColor: '#71A9F7' }}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
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
                        onClick={() => saveAssistance(assistance.id)}
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
            <label className="block text-xs text-gray-500 mb-1">名称 (必須)</label>
            <input
              type="text"
              value={newAssistance.name}
              onChange={(e) => setNewAssistance(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例: JAFロードアシスタンス"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">表示略称 (必須)</label>
            <input
              type="text"
              value={newAssistance.displayAbbreviation}
              onChange={(e) => setNewAssistance(prev => ({ ...prev, displayAbbreviation: e.target.value }))}
              placeholder="例: JAF"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setIsAdding(false); setNewAssistance({ name: '', displayAbbreviation: '' }) }}
              className="flex-1 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: '#9CA3AF', color: 'white' }}
            >
              キャンセル
            </button>
            <button
              onClick={addAssistance}
              disabled={!canSubmitNewAssistance}
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
        className="w-full mt-4 py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 text-sm flex items-center justify-center gap-2 hover:bg-white/50 disabled:opacity-50"
      >
        <Plus className="w-4 h-4" />
        アシスタンスを追加
      </button>
    </div>
  )
}
