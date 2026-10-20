// src/components/layout/AppShell.jsx
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import LogoMark from '../Logo'
import { useStore } from '../../store/useStore'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { canAccess } from '../../lib/permissions'
import './AppShell.css'

const NAV = [
  { section: 'Main' },
  { path: '/dashboard',    icon: '📊', label: 'Dashboard' },
  { path: '/tables',       icon: '🍽️', label: 'Tables & QR' },
  { path: '/orders',       icon: '📋', label: 'Orders' },
  { path: '/kitchen',      icon: '👨‍🍳', label: 'Kitchen Display' },
  { path: '/pos',          icon: '💵', label: 'Billing & POS' },
  { section: 'Hotel' },
  { path: '/rooms',        icon: '🛏️', label: 'Rooms' },
  { path: '/reservations', icon: '📅', label: 'Reservations' },
  { section: 'Management' },
  { path: '/menu',         icon: '🍜', label: 'Menu Management' },
  { path: '/modifiers',    icon: '⚙️', label: 'Modifiers' },
  { path: '/inventory',    icon: '📦', label: 'Inventory' },
  { path: '/staff',        icon: '👥', label: 'Staff & HR' },
  { path: '/customers',    icon: '🎁', label: 'Loyalty & CRM' },
  { section: 'Finance' },
  { path: '/cash-drawer',  icon: '🏦', label: 'Cash Drawer' },
  { path: '/voids',        icon: '↩️', label: 'Void & Refunds' },
  { path: '/reports',      icon: '📈', label: 'Reports' },
  { section: 'System' },
  { path: '/settings',     icon: '🔧', label: 'Settings' },
]

export default function AppShell() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { staff, tenant, isOnline, pendingSyncCount, sidebarOpen, setSidebarOpen } = useStore()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
    toast.success('Logged out successfully')
  }

  // Role ට අවසර නැති menu items සැඟවීම (හිස් section ත් අයින් වෙනවා)
  const visibleNav = NAV
    .filter(item => item.section || canAccess(staff?.role, item.path))
    .filter((item, i, arr) => !item.section || (arr[i + 1] && !arr[i + 1].section))

  const initials = staff?.name
    ? staff.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'SB'

  return (
    <div className={`shell ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <aside className="sidebar">
        <div className="sb-head">
          <div className="sb-brand">
            <LogoMark size={36} />
            <div>
              <div className="sb-name">Smart<span>Biz</span></div>
              <div className="sb-tag">Restaurant Management</div>
            </div>
          </div>
          <button className="sb-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
        </div>

        <div className="sb-tenant">
          <div className="sb-t-av">🏩</div>
          <div className="sb-t-info">
            <div className="sb-t-name">{tenant?.name || 'SmartBiz'}</div>
            <div className="sb-t-plan">{tenant?.plan || 'free'}</div>
          </div>
        </div>

        {!isOnline && (
          <div className="offline-banner">
            🔴 Offline Mode
            {pendingSyncCount > 0 && <span className="sync-count">{pendingSyncCount} pending</span>}
          </div>
        )}

        <nav className="sb-nav">
          {visibleNav.map((item, i) => {
            if (item.section) return <div key={i} className="sb-section">{item.section}</div>
            const active = location.pathname === item.path ||
              (item.path !== '/dashboard' && location.pathname.startsWith(item.path))
            return (
              <div key={item.path} className={`nav-item ${active ? 'active' : ''}`} onClick={() => navigate(item.path)}>
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </div>
            )
          })}
        </nav>

        <div className="sb-foot">
          <div className="sb-user">
            <div className="sb-avatar" style={{ background: staff?.avatar_color || '#29b6f6' }}>{initials}</div>
            <div className="sb-uinfo">
              <div className="sb-uname">{staff?.name || 'Admin'}</div>
              <div className="sb-urole">{staff?.role || 'owner'} · {tenant?.name || ''}</div>
            </div>
            <button className="sb-logout" onClick={handleLogout} title="Logout">↩</button>
          </div>
        </div>
      </aside>

      <main className="main-content"><Outlet /></main>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
    </div>
  )
}
