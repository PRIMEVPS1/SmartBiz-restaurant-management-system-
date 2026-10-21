// src/store/useStore.js
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useStore = create(
  persist(
    (set, get) => ({
      // ─── Auth ───────────────────────────────
      user: null,
      staff: null,         // current staff member record
      tenant: null,        // current tenant/hotel record
      setUser: (user) => set({ user }),
      setStaff: (staff) => set({ staff }),
      setTenant: (tenant) => set({ tenant }),
      sub: null,           // subscription info (not persisted)
      setSub: (sub) => set({ sub }),
      logout: () => set({ user: null, staff: null, tenant: null, sub: null }),

      // ─── Network ────────────────────────────
      isOnline: navigator.onLine,
      pendingSyncCount: 0,
      setOnline: (v) => set({ isOnline: v }),
      setPendingSyncCount: (n) => set({ pendingSyncCount: n }),

      // ─── Active order (POS) ─────────────────
      activeTableId: null,
      activeOrderId: null,
      setActiveTable: (id) => set({ activeTableId: id }),
      setActiveOrder: (id) => set({ activeOrderId: id }),

      // ─── UI ────────────────────────────────
      sidebarOpen: true,
      setSidebarOpen: (v) => set({ sidebarOpen: v }),
      currentPage: 'dashboard',
      setCurrentPage: (page) => set({ currentPage: page }),

      // ─── Notifications ──────────────────────
      notifications: [],
      addNotification: (n) => set(s => ({
        notifications: [{ id: Date.now(), ...n, read: false }, ...s.notifications].slice(0, 50)
      })),
      markAllRead: () => set(s => ({
        notifications: s.notifications.map(n => ({ ...n, read: true }))
      })),
      unreadCount: () => get().notifications.filter(n => !n.read).length,
    }),
    {
      name: 'smartbiz-store',
      partialize: (s) => ({
        // Only persist these fields (not transient UI state)
        user: s.user,
        staff: s.staff,
        tenant: s.tenant,
      })
    }
  )
)

// ─── Orders store (separate for performance) ──────────
export const useOrdersStore = create((set, get) => ({
  orders: [],
  orderItems: {},       // keyed by order_id
  tables: [],
  menuItems: [],
  menuCategories: [],

  setOrders: (orders) => set({ orders }),
  setTables: (tables) => set({ tables }),
  setMenuItems: (items) => set({ menuItems: items }),
  setMenuCategories: (cats) => set({ menuCategories: cats }),

  updateOrderStatus: (orderId, status) => set(s => ({
    orders: s.orders.map(o => o.id === orderId ? { ...o, status } : o)
  })),

  updateTableStatus: (tableId, status) => set(s => ({
    tables: s.tables.map(t => t.id === tableId ? { ...t, status } : t)
  })),

  addOrderItem: (orderId, item) => set(s => ({
    orderItems: {
      ...s.orderItems,
      [orderId]: [...(s.orderItems[orderId] || []), item]
    }
  })),

  getOrderItems: (orderId) => get().orderItems[orderId] || [],

  getTableOrders: (tableId) => get().orders.filter(o =>
    o.table_id === tableId && !['billed','cancelled'].includes(o.status)
  ),
}))
