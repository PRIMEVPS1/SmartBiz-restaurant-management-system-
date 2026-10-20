// src/lib/syncEngine.js
// Background sync: pushes offline queue → Supabase when connection restored

import { supabase, isOnline } from './supabase'
import { getPendingSyncItems, markSynced, markSyncError, localPutMany, localPut } from './offlineDB'

let syncInProgress = false
let syncInterval = null

// ─── PUSH: local → Supabase ──────────────────────────────

export async function pushPendingChanges() {
  if (!isOnline() || syncInProgress) return
  syncInProgress = true

  try {
    const pending = await getPendingSyncItems()
    if (pending.length === 0) { syncInProgress = false; return }

    console.log(`🔄 Syncing ${pending.length} pending changes...`)

    for (const item of pending) {
      try {
        let error = null

        if (item.operation === 'INSERT' || item.operation === 'UPDATE') {
          const { error: e } = await supabase
            .from(item.table_name)
            .upsert(item.payload, { onConflict: 'id' })
          error = e
        } else if (item.operation === 'DELETE') {
          const { error: e } = await supabase
            .from(item.table_name)
            .delete()
            .eq('id', item.record_id)
          error = e
        }

        if (error) {
          console.error(`❌ Sync failed for ${item.table_name}:`, error.message)
          await markSyncError(item.id, error.message)
        } else {
          await markSynced(item.id)
          console.log(`✅ Synced: ${item.table_name} #${item.record_id}`)
        }
      } catch (err) {
        await markSyncError(item.id, err.message)
      }
    }
  } finally {
    syncInProgress = false
  }
}

// ─── PULL: Supabase → local IndexedDB ───────────────────
// Full refresh of reference data (menu, tables, staff)

export async function pullReferenceData(tenantId) {
  if (!isOnline()) return

  const tables = [
    'restaurant_tables', 'menu_categories', 'menu_items',
    'staff', 'inventory_items', 'customers'
  ]

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('tenant_id', tenantId)

      if (!error && data) {
        await localPutMany(table, data)
        console.log(`📥 Pulled ${data.length} ${table}`)
      }
    } catch (e) {
      console.warn(`⚠️ Could not pull ${table}:`, e.message)
    }
  }
}

// Pull recent orders (last 24 hours)
export async function pullRecentOrders(tenantId) {
  if (!isOnline()) return

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: orders } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('tenant_id', tenantId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (orders) {
    for (const order of orders) {
      const items = order.order_items || []
      delete order.order_items
      await localPut('orders', order)
      for (const item of items) {
        await localPut('order_items', item)
      }
    }
    console.log(`📥 Pulled ${orders.length} recent orders`)
  }
}

// ─── START background sync ──────────────────────────────

export function startSyncEngine() {
  // Sync when coming back online
  window.addEventListener('online', () => {
    console.log('🌐 Online — starting sync')
    pushPendingChanges()
  })

  // Periodic sync every 30 seconds when online
  syncInterval = setInterval(() => {
    if (isOnline()) pushPendingChanges()
  }, 30_000)

  // Sync on startup if online
  if (isOnline()) pushPendingChanges()

  console.log('🚀 SmartBiz Sync Engine started')
}

export function stopSyncEngine() {
  if (syncInterval) clearInterval(syncInterval)
}
