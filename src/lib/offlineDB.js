// src/lib/offlineDB.js
// IndexedDB wrapper using 'idb' library
// Stores all data locally → syncs to Supabase when online

import { openDB } from 'idb'

const DB_NAME = 'smartbiz_offline'
const DB_VERSION = 1

// All tables we cache locally
const STORES = [
  'tenants', 'staff', 'rooms', 'restaurant_tables',
  'menu_categories', 'menu_items', 'customers',
  'reservations', 'orders', 'order_items', 'bills',
  'inventory_items', 'sync_queue'
]

let dbInstance = null

export async function getDB() {
  if (dbInstance) return dbInstance

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      STORES.forEach(store => {
        if (!db.objectStoreNames.contains(store)) {
          const s = db.createObjectStore(store, { keyPath: 'id' })
          // Add indexes for common queries
          if (store === 'orders') {
            s.createIndex('tenant_id', 'tenant_id')
            s.createIndex('status', 'status')
            s.createIndex('table_id', 'table_id')
            s.createIndex('synced', 'synced')
          }
          if (store === 'order_items') {
            s.createIndex('order_id', 'order_id')
            s.createIndex('synced', 'synced')
          }
          if (store === 'sync_queue') {
            s.createIndex('synced', 'synced')
            s.createIndex('table_name', 'table_name')
          }
          if (['menu_items','inventory_items','customers'].includes(store)) {
            s.createIndex('tenant_id', 'tenant_id')
          }
        }
      })
    }
  })

  return dbInstance
}

// ─── CRUD helpers ──────────────────────────────────────

export async function localGet(store, id) {
  const db = await getDB()
  return db.get(store, id)
}

export async function localGetAll(store, indexName, value) {
  const db = await getDB()
  if (indexName && value !== undefined) {
    return db.getAllFromIndex(store, indexName, value)
  }
  return db.getAll(store)
}

export async function localPut(store, record) {
  const db = await getDB()
  return db.put(store, record)
}

export async function localPutMany(store, records) {
  const db = await getDB()
  const tx = db.transaction(store, 'readwrite')
  await Promise.all([
    ...records.map(r => tx.store.put(r)),
    tx.done
  ])
}

export async function localDelete(store, id) {
  const db = await getDB()
  return db.delete(store, id)
}

export async function localClear(store) {
  const db = await getDB()
  return db.clear(store)
}

// ─── SYNC QUEUE ─────────────────────────────────────────

export async function addToSyncQueue(tableName, operation, recordId, payload) {
  const db = await getDB()
  const entry = {
    id: crypto.randomUUID(),
    table_name: tableName,
    operation,       // 'INSERT' | 'UPDATE' | 'DELETE'
    record_id: recordId,
    payload,
    synced: false,
    error: null,
    created_at: new Date().toISOString()
  }
  await db.put('sync_queue', entry)
  return entry
}

export async function getPendingSyncItems() {
  const db = await getDB()
  return db.getAllFromIndex('sync_queue', 'synced', false)
}

export async function markSynced(syncId) {
  const db = await getDB()
  const item = await db.get('sync_queue', syncId)
  if (item) {
    item.synced = true
    await db.put('sync_queue', item)
  }
}

export async function markSyncError(syncId, error) {
  const db = await getDB()
  const item = await db.get('sync_queue', syncId)
  if (item) {
    item.error = error
    await db.put('sync_queue', item)
  }
}

// ─── OFFLINE-AWARE WRITE ─────────────────────────────────
// Use this for all writes — works online AND offline

export async function offlineWrite(store, operation, record, supabaseTable) {
  // Always write to local IndexedDB first
  if (operation !== 'DELETE') {
    record.synced = false
    record.updated_at = new Date().toISOString()
    if (!record.id) record.id = crypto.randomUUID()
    await localPut(store, record)
  } else {
    await localDelete(store, record.id)
  }

  // Queue for sync
  await addToSyncQueue(
    supabaseTable || store,
    operation,
    record.id,
    operation !== 'DELETE' ? record : { id: record.id }
  )

  return record
}
