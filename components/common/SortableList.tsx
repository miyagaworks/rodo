'use client'

/**
 * 共通ドラッグ&ドロップ並び替えコンポーネント
 *
 * - dnd-kit の Sortable プリセットを利用
 * - PointerSensor / TouchSensor / KeyboardSensor 対応
 * - 楽観的更新 + 失敗時ロールバック（onReorder reject 時に items を旧順に戻し alert）
 * - ドラッグハンドルは行の最左端に配置（行全体は drag listeners を持たない）
 */

import { useEffect, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { RxDragHandleDots2 } from 'react-icons/rx'

interface SortableListProps<T extends { id: string }> {
  items: T[]
  onReorder: (orderedIds: string[]) => Promise<void>
  renderItem: (item: T, dragHandle: React.ReactNode) => React.ReactNode
}

interface SortableRowProps<T extends { id: string }> {
  item: T
  renderItem: (item: T, dragHandle: React.ReactNode) => React.ReactNode
}

function SortableRow<T extends { id: string }>({ item, renderItem }: SortableRowProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    // ドラッグ中は他要素より前面に出す
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? 'relative' : undefined,
  }

  const dragHandle = (
    <button
      type="button"
      aria-label="並び替え"
      className="cursor-grab touch-none p-2 text-gray-400 active:cursor-grabbing"
      onClick={(e) => e.stopPropagation()}
      {...attributes}
      {...listeners}
    >
      <RxDragHandleDots2 size={20} />
    </button>
  )

  return (
    <div ref={setNodeRef} style={style}>
      {renderItem(item, dragHandle)}
    </div>
  )
}

export function SortableList<T extends { id: string }>({
  items: propItems,
  onReorder,
  renderItem,
}: SortableListProps<T>) {
  const [items, setItems] = useState<T[]>(propItems)

  // 親から新しい items が渡された場合、ローカル状態を同期
  useEffect(() => {
    setItems(propItems)
  }, [propItems])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    const prev = items
    const next = arrayMove(items, oldIndex, newIndex)
    setItems(next)

    try {
      await onReorder(next.map((i) => i.id))
    } catch {
      setItems(prev)
      window.alert('並び替えの保存に失敗しました')
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableRow key={item.id} item={item} renderItem={renderItem} />
        ))}
      </SortableContext>
    </DndContext>
  )
}

export default SortableList
