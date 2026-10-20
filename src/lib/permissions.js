// src/lib/permissions.js
// Role → අවසර ඇති pages. මෙතන විතරක් වෙනස් කරන්න, ඉතුරු ඔක්කොම මේකෙන් ගන්නවා.

const ALL_STAFF = ['owner', 'manager', 'cashier', 'waiter', 'kitchen', 'receptionist']

export const ROLE_ACCESS = {
  '/dashboard':    ['owner', 'manager', 'cashier'],
  '/tables':       ['owner', 'manager', 'cashier', 'waiter', 'receptionist'],
  '/orders':       ['owner', 'manager', 'cashier', 'waiter', 'kitchen'],
  '/kitchen':      ['owner', 'manager', 'kitchen'],
  '/pos':          ['owner', 'manager', 'cashier', 'waiter'],
  '/rooms':        ['owner', 'manager', 'receptionist'],
  '/reservations': ['owner', 'manager', 'cashier', 'waiter', 'receptionist'],
  '/menu':         ['owner', 'manager'],
  '/modifiers':    ['owner', 'manager'],
  '/inventory':    ['owner', 'manager', 'kitchen'],
  '/staff':        ['owner', 'manager'],
  '/customers':    ['owner', 'manager', 'cashier', 'receptionist'],
  '/cash-drawer':  ['owner', 'manager', 'cashier'],
  '/voids':        ['owner', 'manager', 'cashier'],
  '/reports':      ['owner', 'manager'],
  '/settings':     ['owner', 'manager'],
}

// Login වුණාම යන මුල් page එක
export const HOME_BY_ROLE = {
  owner: '/dashboard',
  manager: '/dashboard',
  cashier: '/dashboard',
  waiter: '/tables',
  kitchen: '/kitchen',
  receptionist: '/rooms',
}

export function canAccess(role, path) {
  if (!role) return false
  const key = Object.keys(ROLE_ACCESS).find(k => path === k || path.startsWith(k + '/'))
  if (!key) return ALL_STAFF.includes(role)
  return ROLE_ACCESS[key].includes(role)
}

export const homeFor = (role) => HOME_BY_ROLE[role] || '/tables'
export const isManagerRole = (role) => role === 'owner' || role === 'manager'
