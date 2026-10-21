// src/lib/features.js — modules, plans and per-restaurant toggles
export const MODULES = [
  { key: 'dashboard',   label: 'Dashboard',        locked: true },
  { key: 'tables',      label: 'Tables & QR' },
  { key: 'orders',      label: 'Orders' },
  { key: 'kitchen',     label: 'Kitchen Display' },
  { key: 'pos',         label: 'Billing & POS' },
  { key: 'rooms',       label: 'Rooms' },
  { key: 'reservations',label: 'Reservations' },
  { key: 'menu',        label: 'Menu Management' },
  { key: 'modifiers',   label: 'Modifiers' },
  { key: 'inventory',   label: 'Inventory' },
  { key: 'staff',       label: 'Staff & HR' },
  { key: 'customers',   label: 'Loyalty & CRM' },
  { key: 'cash-drawer', label: 'Cash Drawer' },
  { key: 'voids',       label: 'Void & Refunds' },
  { key: 'reports',     label: 'Reports' },
  { key: 'settings',    label: 'Settings',         locked: true },
]
const ALL  = MODULES.map(m => m.key)
const FREE = ['dashboard','tables','orders','kitchen','pos','menu','modifiers','inventory','settings']
const PRO  = [...FREE, 'staff','customers','cash-drawer','voids','reports']

export const PLAN_MODULES = { free: FREE, pro: PRO, enterprise: ALL }

// Plan defaults, overridden by tenant.features ({key: true/false}); locked modules always on
export function enabledModules(tenant) {
  const set = new Set(PLAN_MODULES[tenant?.plan] || FREE)
  const f = tenant?.features
  if (f && typeof f === 'object') {
    Object.keys(f).forEach(k => { f[k] ? set.add(k) : set.delete(k) })
  }
  MODULES.filter(m => m.locked).forEach(m => set.add(m.key))
  return set
}

export function featuresMap(set) {
  const m = {}
  MODULES.forEach(x => { m[x.key] = set.has(x.key) })
  return m
}

export function moduleForPath(pathname) {
  const seg = (pathname || '').split('/')[1] || ''
  return MODULES.find(m => m.key === seg)?.key || null
}
