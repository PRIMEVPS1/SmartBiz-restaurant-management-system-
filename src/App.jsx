// src/App.jsx
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import toast, { Toaster } from 'react-hot-toast'
import { useStore } from './store/useStore'
import { startSyncEngine } from './lib/syncEngine'
import { supabase } from './lib/supabase'

// Pages
import LoginPage        from './pages/LoginPage'
import AppShell         from './components/layout/AppShell'
import Dashboard        from './pages/Dashboard'
import TablesPage       from './pages/TablesPage'
import OrdersPage       from './pages/OrdersPage'
import KitchenPage      from './pages/KitchenPage'
import BillingPage      from './pages/BillingPage'
import MenuPage         from './pages/MenuPage'
import ModifiersPage    from './pages/ModifiersPage'
import RoomsPage        from './pages/RoomsPage'
import ReservationsPage from './pages/ReservationsPage'
import InventoryPage    from './pages/InventoryPage'
import StaffHRPage      from './pages/StaffHRPage'
import CustomersPage    from './pages/CustomersPage'
import ReportsPage      from './pages/ReportsPage'
import SettingsPage     from './pages/SettingsPage'
import VoidsPage        from './pages/VoidsPage'
import CashDrawerPage   from './pages/CashDrawerPage'
import CustomerMenu     from './pages/GuestMenuPage'
import RegisterPage     from './pages/RegisterPage'
import AdminPage        from './pages/AdminPage'
import InstallPrompt    from './components/InstallPrompt'
import LockedScreen     from './components/LockedScreen'
import { canAccess, homeFor } from './lib/permissions'

function ProtectedRoute({ children, ready, isAdmin = false, requireTenant = true }) {
  const user   = useStore(s => s.user)
  const tenant = useStore(s => s.tenant)
  const sub    = useStore(s => s.sub)
  if (!ready) return <div style={{ padding: 40, textAlign: 'center', color: '#9aa7bd' }}>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin && sub?.locked) return <LockedScreen sub={sub} />
  // Super Admin without a (usable) restaurant → straight to the admin panel
  if (requireTenant && !tenant) return <Navigate to={isAdmin ? '/admin' : '/register'} replace />
  return children
}

// Role ට අවසර නැති page එකකට URL එකෙන් ආවොත් ඒ role එකේ home page එකට යවනවා
function RoleRoute({ path, children }) {
  const role = useStore(s => s.staff?.role)
  if (!role) return <div style={{ padding: 40, textAlign: 'center', color: '#9aa7bd' }}>Loading...</div>
  if (!canAccess(role, path)) return <Navigate to={homeFor(role)} replace />
  return children
}

function HomeRedirect() {
  const role = useStore(s => s.staff?.role)
  if (!role) return null
  return <Navigate to={homeFor(role)} replace />
}

export default function App() {
  const { setUser, setStaff, setOnline } = useStore()
  const [ready, setReady] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function loadStaff(session) {
      const st = useStore.getState()
      st.setUser(session?.user ?? null)
      if (!session?.user) { st.setStaff(null); st.setTenant(null); st.setSub(null); setIsAdmin(false); return }
      // is this a SmartBiz platform (Super) admin?
      let admin = false
      try { const { data: a } = await supabase.rpc('is_platform_admin'); admin = !!a } catch { admin = false }
      setIsAdmin(admin)
      // subscription / disabled-account check (works only after SQL patch 09)
      let sub = null
      try { const { data: sb } = await supabase.rpc('my_subscription'); sub = sb || null } catch { sub = null }
      st.setSub(sub)
      if (!admin && sub?.has_restaurant && sub.staff_active === false) {
        toast.error('Your account is disabled. Contact your manager.')
        await supabase.auth.signOut(); st.logout(); return
      }
      if (!admin && sub?.locked) { st.setStaff(null); st.setTenant(null); return }   // LockedScreen is shown
      const { data, error } = await supabase
        .from('staff').select('*, tenants(*)')
        .eq('auth_id', session.user.id).maybeSingle()
      if (error) console.error('staff load error', error)
      if (!data) { st.setStaff(null); st.setTenant(null); return }
      if (!data.tenants) {
        toast.error('Restaurant data blocked. Run the Supabase SQL patches (02 and 04).')
        st.setStaff(data); st.setTenant(null); return
      }
      if (data.tenants.active === false) {
        if (admin) {
          // Super Admin whose own restaurant is suspended: stay signed in, work from /admin
          st.setStaff(null); st.setTenant(null)
          return
        }
        toast.error('This restaurant account is suspended. Contact SmartBiz support.')
        await supabase.auth.signOut()
        st.logout()
        return
      }
      st.setStaff(data)
      st.setTenant(data.tenants)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return
      // hold the router on "Loading..." until staff + tenant + admin flag are loaded
      // (otherwise right after login the app sees "no tenant" and jumps to /register)
      setReady(false)
      // defer to avoid deadlock inside the auth callback
      setTimeout(async () => { await loadStaff(session); setReady(true) }, 0)
    })
    // fallback in case no initial event fires
    supabase.auth.getSession().then(async ({ data }) => { await loadStaff(data.session); setReady(true) })

    const onOnline  = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    startSyncEngine()
    return () => {
      subscription.unsubscribe()
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#111318', color: '#f0f4ff',
            border: '1px solid rgba(255,255,255,0.11)',
            borderRadius: '12px', fontSize: '13.5px',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
      <InstallPrompt />
      <Routes>
        <Route path="/login"          element={<LoginPage />} />
        <Route path="/register"       element={<RegisterPage />} />
        <Route path="/admin"          element={<ProtectedRoute ready={ready} isAdmin={isAdmin} requireTenant={false}><AdminPage /></ProtectedRoute>} />
        <Route path="/menu/:qrToken"  element={<CustomerMenu />} />
        <Route path="/" element={
          <ProtectedRoute ready={ready} isAdmin={isAdmin}><AppShell /></ProtectedRoute>
        }>
          <Route index                   element={<HomeRedirect />} />
          <Route path="dashboard"        element={<RoleRoute path="/dashboard"><Dashboard /></RoleRoute>} />
          <Route path="tables"           element={<RoleRoute path="/tables"><TablesPage /></RoleRoute>} />
          <Route path="orders"           element={<RoleRoute path="/orders"><OrdersPage /></RoleRoute>} />
          <Route path="orders/:id"       element={<RoleRoute path="/orders"><OrdersPage /></RoleRoute>} />
          <Route path="kitchen"          element={<RoleRoute path="/kitchen"><KitchenPage /></RoleRoute>} />
          <Route path="pos"              element={<RoleRoute path="/pos"><BillingPage /></RoleRoute>} />
          <Route path="pos/:orderId"     element={<RoleRoute path="/pos"><BillingPage /></RoleRoute>} />
          <Route path="menu"             element={<RoleRoute path="/menu"><MenuPage /></RoleRoute>} />
          <Route path="modifiers"        element={<RoleRoute path="/modifiers"><ModifiersPage /></RoleRoute>} />
          <Route path="rooms"            element={<RoleRoute path="/rooms"><RoomsPage /></RoleRoute>} />
          <Route path="reservations"     element={<RoleRoute path="/reservations"><ReservationsPage /></RoleRoute>} />
          <Route path="inventory"        element={<RoleRoute path="/inventory"><InventoryPage /></RoleRoute>} />
          <Route path="staff"            element={<RoleRoute path="/staff"><StaffHRPage /></RoleRoute>} />
          <Route path="customers"        element={<RoleRoute path="/customers"><CustomersPage /></RoleRoute>} />
          <Route path="reports"          element={<RoleRoute path="/reports"><ReportsPage /></RoleRoute>} />
          <Route path="settings"         element={<RoleRoute path="/settings"><SettingsPage /></RoleRoute>} />
          <Route path="voids"            element={<RoleRoute path="/voids"><VoidsPage /></RoleRoute>} />
          <Route path="cash-drawer"      element={<RoleRoute path="/cash-drawer"><CashDrawerPage /></RoleRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
