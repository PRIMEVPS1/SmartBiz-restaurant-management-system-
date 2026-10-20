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
import StaffPage        from './pages/StaffPage'
import CustomersPage    from './pages/CustomersPage'
import ReportsPage      from './pages/ReportsPage'
import SettingsPage     from './pages/SettingsPage'
import VoidsPage        from './pages/VoidsPage'
import CashDrawerPage   from './pages/CashDrawerPage'
import CustomerMenu     from './pages/CustomerMenu'
import RegisterPage     from './pages/RegisterPage'
import AdminPage        from './pages/AdminPage'
import InstallPrompt    from './components/InstallPrompt'

function ProtectedRoute({ children, ready, requireTenant = true }) {
  const user   = useStore(s => s.user)
  const tenant = useStore(s => s.tenant)
  if (!ready) return <div style={{ padding: 40, textAlign: 'center', color: '#9aa7bd' }}>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (requireTenant && !tenant) return <Navigate to="/register" replace />
  return children
}

export default function App() {
  const { setUser, setStaff, setOnline } = useStore()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function loadStaff(session) {
      const st = useStore.getState()
      st.setUser(session?.user ?? null)
      if (!session?.user) { st.setStaff(null); st.setTenant(null); return }
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
        toast.error('This restaurant account is suspended. Contact SmartBiz support.')
        await supabase.auth.signOut()
        st.logout()
        return
      }
      st.setStaff(data)
      st.setTenant(data.tenants)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
        <Route path="/admin"          element={<ProtectedRoute ready={ready} requireTenant={false}><AdminPage /></ProtectedRoute>} />
        <Route path="/menu/:qrToken"  element={<CustomerMenu />} />
        <Route path="/" element={
          <ProtectedRoute ready={ready}><AppShell /></ProtectedRoute>
        }>
          <Route index                   element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"        element={<Dashboard />} />
          <Route path="tables"           element={<TablesPage />} />
          <Route path="orders"           element={<OrdersPage />} />
          <Route path="orders/:id"       element={<OrdersPage />} />
          <Route path="kitchen"          element={<KitchenPage />} />
          <Route path="pos"              element={<BillingPage />} />
          <Route path="pos/:orderId"     element={<BillingPage />} />
          <Route path="menu"             element={<MenuPage />} />
          <Route path="modifiers"        element={<ModifiersPage />} />
          <Route path="rooms"            element={<RoomsPage />} />
          <Route path="reservations"     element={<ReservationsPage />} />
          <Route path="inventory"        element={<InventoryPage />} />
          <Route path="staff"            element={<StaffPage />} />
          <Route path="customers"        element={<CustomersPage />} />
          <Route path="reports"          element={<ReportsPage />} />
          <Route path="settings"         element={<SettingsPage />} />
          <Route path="voids"            element={<VoidsPage />} />
          <Route path="cash-drawer"      element={<CashDrawerPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
