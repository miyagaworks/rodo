import { z } from 'zod'

export const reorderSchema = z.object({
  orderedIds: z
    .array(z.string().min(1))
    .min(1, '並び替え対象が空です')
    .refine(
      (ids) => new Set(ids).size === ids.length,
      { message: 'ID が重複しています' }
    ),
})

export type ReorderInput = z.infer<typeof reorderSchema>
