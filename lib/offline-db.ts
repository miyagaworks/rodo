import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

// --- Schema ---

export interface PendingAction {
  id: string
  type: 'dispatch_create' | 'dispatch_update' | 'report_save' | 'report_complete' | 'confirmation_save'
  dispatchId: string | null
  timestamp: number
  gps: { lat: number; lng: number } | null
  data: Record<string, unknown>
  /** API endpoint path (e.g. /api/dispatches/xxx) */
  endpoint: string
  method: 'POST' | 'PATCH'
}

export interface DispatchDraft {
  /** dispatchId or 'new' */
  key: string
  formData: Record<string, unknown>
  updatedAt: number
}

export interface OfflinePhoto {
  id: string
  dispatchId: string
  blob: Blob
  createdAt: number
}

export interface SyncMeta {
  key: 'lastSync' | 'syncState'
  value: string | number
}

interface RodoOfflineDB extends DBSchema {
  pendingActions: {
    key: string
    value: PendingAction
    indexes: { 'by-timestamp': number }
  }
  dispatchDraft: {
    key: string
    value: DispatchDraft
  }
  photos: {
    key: string
    value: OfflinePhoto
    indexes: { 'by-dispatch': string }
  }
  syncMeta: {
    key: string
    value: SyncMeta
  }
}

const DB_NAME = 'rodo-offline'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<RodoOfflineDB>> | null = null

export function getDB(): Promise<IDBPDatabase<RodoOfflineDB>> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available on server'))
  }
  if (!dbPromise) {
    dbPromise = openDB<RodoOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // pendingActions
        const actionStore = db.createObjectStore('pendingActions', { keyPath: 'id' })
        actionStore.createIndex('by-timestamp', 'timestamp')

        // dispatchDraft
        db.createObjectStore('dispatchDraft', { keyPath: 'key' })

        // photos
        const photoStore = db.createObjectStore('photos', { keyPath: 'id' })
        photoStore.createIndex('by-dispatch', 'dispatchId')

        // syncMeta
        db.createObjectStore('syncMeta', { keyPath: 'key' })
      },
    })
  }
  return dbPromise
}

// --- pendingActions helpers ---

export async function addPendingAction(action: Omit<PendingAction, 'id'>): Promise<string> {
  const db = await getDB()
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  await db.put('pendingActions', { ...action, id })
  return id
}

export async function getAllPendingActions(): Promise<PendingAction[]> {
  const db = await getDB()
  return db.getAllFromIndex('pendingActions', 'by-timestamp')
}

export async function deletePendingAction(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('pendingActions', id)
}

export async function getPendingActionCount(): Promise<number> {
  const db = await getDB()
  return db.count('pendingActions')
}

// --- dispatchDraft helpers ---

export async function saveDraft(key: string, formData: Record<string, unknown>): Promise<void> {
  const db = await getDB()
  await db.put('dispatchDraft', { key, formData, updatedAt: Date.now() })
}

export async function getDraft(key: string): Promise<DispatchDraft | undefined> {
  const db = await getDB()
  return db.get('dispatchDraft', key)
}

export async function deleteDraft(key: string): Promise<void> {
  const db = await getDB()
  await db.delete('dispatchDraft', key)
}

// --- photos helpers ---

export async function savePhoto(dispatchId: string, blob: Blob): Promise<string> {
  const db = await getDB()
  const id = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  await db.put('photos', { id, dispatchId, blob, createdAt: Date.now() })
  return id
}

export async function getPhotosByDispatch(dispatchId: string): Promise<OfflinePhoto[]> {
  const db = await getDB()
  return db.getAllFromIndex('photos', 'by-dispatch', dispatchId)
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('photos', id)
}

export async function getAllOfflinePhotos(): Promise<OfflinePhoto[]> {
  const db = await getDB()
  return db.getAll('photos')
}

// --- syncMeta helpers ---

export async function setSyncMeta(key: SyncMeta['key'], value: string | number): Promise<void> {
  const db = await getDB()
  await db.put('syncMeta', { key, value })
}

export async function getSyncMeta(key: SyncMeta['key']): Promise<string | number | undefined> {
  const db = await getDB()
  const record = await db.get('syncMeta', key)
  return record?.value
}
