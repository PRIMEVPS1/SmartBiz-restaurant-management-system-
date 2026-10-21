// src/pages/AdminPage.jsx — Super Admin: restaurants, plans, module toggles, logos, create customers
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { MODULES, PLAN_MODULES, enabledModules, featuresMap } from '../lib/features'
import { uploadImage } from '../lib/image'
import LogoMark from '../components/Logo'
import { useStore } from '../store/useStore'
import './AdminPage.css'

const PLANS = ['free', 'pro', 'enterprise']
const EMPTY = { owner: '', email: '', password: '', name: '', slug: '', phone: '', address: '', plan: 'free' }

const OVERLAY = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const MODAL   = { width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto', margin: 0 }

const GROUPS = [
  { title: 'Main',       keys: ['dashboard', 'tables', 'orders', 'kitchen', 'pos'] },
  { title: 'Hotel',      keys: ['rooms', 'reservations'] },
  { title: 'Management', keys: ['menu', 'modifiers', 'inventory', 'staff', 'customers'] },
  { title: 'Finance',    keys: ['cash-drawer', 'voids', 'reports'] },
  { title: 'System',     keys: ['settings'] },
]
const ROLES = ['owner', 'manager', 'cashier', 'waiter', 'kitchen', 'receptionist']
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysFromToday = iso => { const a = new Date(iso + 'T00:00:00'), b = new Date(); b.setHours(0, 0, 0, 0); return Math.round((a - b) / 864e5) }
const waNumber = ph => { const d = String(ph || '').replace(/\D/g, ''); return d.startsWith('0') ? '94' + d.slice(1) : d }
function billChip(r) {
  if (r.paid_until == null) return { t: 'No billing set', c: '#7b879c' }
  if (r.locked)             return { t: '🔒 LOCKED', c: '#ff6b6b' }
  if (r.days_left < 0)      return { t: `⛔ Overdue ${-r.days_left}d`, c: '#ff8a65' }
  if (r.days_left <= 7)     return { t: `⚠️ Due in ${r.days_left}d`, c: '#ffb74d' }
  return { t: `✓ Paid until ${r.paid_until}`, c: '#4ade80' }
}

const toRow = t => ({ ...t, draft: { plan: t.plan, active: t.active, features: featuresMap(enabledModules(t)) } })
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export default function AdminPage() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    useStore.getState().logout()
    navigate('/login', { replace: true })
  }
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied]   = useState(false)
  const [q, setQ]             = useState('')
  const [open, setOpen]       = useState({})      // expanded module panels
  const [busy, setBusy]       = useState({})
  const [showNew, setShowNew] = useState(false)
  const [form, setForm]       = useState(EMPTY)
  const [creating, setCreating] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const [edit, setEdit]       = useState(null)   // { id, name, slug, email, phone, address }
  const [del, setDel]         = useState(null)   // { row, slug, password }
  const [working, setWorking] = useState(false)
  const [bill, setBill]       = useState(null)   // billing modal
  const [lg, setLg]           = useState(null)   // staff-logins modal

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_tenants')
    if (error) setDenied(true)
    else setRows((data || []).map(toRow))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const patch = (id, fn) => setRows(rs => rs.map(r => r.id === id ? { ...r, draft: fn(r.draft) } : r))
  const changePlan = (id, plan) => patch(id, d => ({ ...d, plan, features: featuresMap(new Set(PLAN_MODULES[plan])) }))
  const toggleMod  = (id, key) => patch(id, d => ({ ...d, features: { ...d.features, [key]: !d.features[key] } }))
  const toggleActive = id => patch(id, d => ({ ...d, active: !d.active }))
  const isDirty = r => r.draft.plan !== r.plan || r.draft.active !== r.active ||
                       !same(r.draft.features, featuresMap(enabledModules(r)))

  async function save(r) {
    setBusy(b => ({ ...b, [r.id]: true }))
    const { error } = await supabase.rpc('admin_update_tenant', {
      p_id: r.id, p_active: r.draft.active, p_plan: r.draft.plan, p_features: r.draft.features,
    })
    setBusy(b => ({ ...b, [r.id]: false }))
    if (error) return toast.error(error.message)
    setRows(rs => rs.map(x => x.id === r.id ? toRow({ ...x, plan: r.draft.plan, active: r.draft.active, features: r.draft.features }) : x))
    toast.success('Saved')
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (!edit.name.trim()) return toast.error('Restaurant name required')
    setWorking(true)
    const { error } = await supabase.rpc('admin_update_tenant_info', {
      p_id: edit.id, p_name: edit.name, p_slug: edit.slug, p_email: edit.email, p_phone: edit.phone, p_address: edit.address,
    })
    setWorking(false)
    if (error) return toast.error(error.message)
    toast.success('Updated')
    setEdit(null); load()
  }

  async function confirmDelete(e) {
    e.preventDefault()
    const r = del.row
    if (del.slug.trim().toLowerCase() !== r.slug.toLowerCase()) return toast.error('Short ID does not match')
    if (!del.password) return toast.error('Enter your admin password')
    setWorking(true)
    try {
      // verify admin password with a temporary client (keeps current session)
      const { data: u } = await supabase.auth.getUser()
      const tmp = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sb-tmp-verify' },
      })
      const { error: pe } = await tmp.auth.signInWithPassword({ email: u?.user?.email, password: del.password })
      if (pe) throw new Error('Wrong admin password')
      const { error } = await supabase.rpc('admin_delete_tenant', { p_id: r.id, p_confirm_slug: del.slug.trim() })
      if (error) throw error
      toast.success(`${r.name} deleted`)
      setRows(rs => rs.filter(x => x.id !== r.id))
      setDel(null)
    } catch (err) { toast.error(err.message || 'Delete failed') }
    setWorking(false)
  }

  // ── billing ──
  function openBill(r) {
    setBill({ id: r.id, name: r.name, phone: r.phone, paid_until: r.paid_until || '', monthly_fee: r.monthly_fee || 0,
              grace_days: r.grace_days ?? 3, allow: !!r.allow_staff_logins, notes: r.billing_notes || '' })
  }
  function plusMonth() {
    const t = new Date(); t.setHours(0, 0, 0, 0)
    const cur = bill.paid_until ? new Date(bill.paid_until + 'T00:00:00') : t
    const base = cur > t ? cur : t
    const d = new Date(base); d.setMonth(d.getMonth() + 1)
    setBill(b => ({ ...b, paid_until: ymd(d) }))
  }
  async function saveBill(e) {
    e.preventDefault()
    setWorking(true)
    const { error } = await supabase.rpc('admin_set_billing', {
      p_id: bill.id, p_paid_until: bill.paid_until || null, p_monthly_fee: Number(bill.monthly_fee) || 0,
      p_grace: Number(bill.grace_days) || 0, p_allow: bill.allow, p_notes: bill.notes,
    })
    setWorking(false)
    if (error) return toast.error(/does not exist|admin_set_billing/.test(error.message) ? 'Run supabase/09_subscription_and_logins.sql first' : error.message)
    const dl = bill.paid_until ? daysFromToday(bill.paid_until) : null
    setRows(rs => rs.map(x => x.id === bill.id ? { ...x, paid_until: bill.paid_until || null, monthly_fee: Number(bill.monthly_fee) || 0,
      grace_days: Number(bill.grace_days) || 0, allow_staff_logins: bill.allow, billing_notes: bill.notes,
      days_left: dl, locked: dl != null && dl < -(Number(bill.grace_days) || 0) } : x))
    toast.success('Billing saved'); setBill(null)
  }

  // ── staff logins ──
  async function openLogins(r) {
    setLg({ row: r, staff: [], loading: true, form: { name: '', email: '', password: '', role: 'waiter' } })
    const { data, error } = await supabase.rpc('admin_list_staff', { p_tenant: r.id })
    setLg(l => l && ({ ...l, staff: error ? [] : (data || []), loading: false }))
    if (error) toast.error('Run supabase/09_subscription_and_logins.sql first')
  }
  async function createLogin(e) {
    e.preventDefault()
    const f = lg.form
    if (!f.name.trim() || !f.email.trim() || f.password.length < 6) return toast.error('Name, email and password (6+) required')
    setWorking(true)
    try {
      const tmp = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sb-tmp-login' },
      })
      const { data, error } = await tmp.auth.signUp({ email: f.email.trim(), password: f.password })
      if (error) throw error
      if (!data.user?.id) throw new Error('Could not create user')
      const { error: e2 } = await supabase.rpc('create_staff_login', {
        p_tenant_id: lg.row.id, p_user_id: data.user.id, p_name: f.name, p_email: f.email, p_role: f.role,
      })
      if (e2) throw e2
      toast.success(`Login created: ${f.email.trim()}`)
      const { data: list } = await supabase.rpc('admin_list_staff', { p_tenant: lg.row.id })
      setLg(l => ({ ...l, staff: list || [], form: { name: '', email: '', password: '', role: 'waiter' } }))
      load()
    } catch (err) { toast.error(err.message || 'Failed') }
    setWorking(false)
  }

  async function uploadLogo(r, e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setBusy(b => ({ ...b, [r.id]: true }))
    try {
      const url = await uploadImage('logos', r.id, file, { max: 480, type: 'image/png', ext: 'png' })
      const { error } = await supabase.rpc('admin_set_tenant_logo', { p_id: r.id, p_logo_url: url })
      if (error) throw error
      setRows(rs => rs.map(x => x.id === r.id ? { ...x, logo_url: url } : x))
      toast.success('Logo updated')
    } catch (err) { toast.error(err.message || 'Upload failed') }
    setBusy(b => ({ ...b, [r.id]: false }))
  }

  async function createRestaurant(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.email || form.password.length < 6) {
      return toast.error('Restaurant name, owner email and password (6+) required')
    }
    setCreating(true)
    try {
      // temporary client so the admin's own session is not replaced
      const tmp = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sb-tmp-create' },
      })
      const { data, error } = await tmp.auth.signUp({ email: form.email.trim(), password: form.password })
      if (error) throw error
      const uid = data.user?.id
      if (!uid) throw new Error('Could not create user')
      const { error: e2 } = await supabase.rpc('admin_create_restaurant', {
        p_user_id: uid, p_name: form.name, p_slug: form.slug, p_owner_name: form.owner,
        p_phone: form.phone, p_address: form.address, p_plan: form.plan,
        p_features: featuresMap(new Set(PLAN_MODULES[form.plan])),
      })
      if (e2) throw e2
      toast.success(`Created! Owner login: ${form.email}`)
      setForm(EMPTY); setShowNew(false); load()
    } catch (err) { toast.error(err.message || 'Failed') }
    setCreating(false)
  }

  const shown = rows.filter(t => !q || (t.name + t.slug + (t.email || '')).toLowerCase().includes(q.toLowerCase()))
  const fmt = d => d ? new Date(d).toLocaleDateString() : '—'

  if (denied) return (
    <div className="adm"><div className="adm-card" style={{ textAlign: 'center' }}>
      <h3>Not allowed</h3><p className="adm-sub">This page is for SmartBiz platform admins only.</p>
      <button className="adm-btn pri" onClick={() => navigate('/dashboard')}>Back</button></div></div>
  )

  return (
    <div className="adm">
      <div className="adm-top">
        <LogoMark size={30} />
        <h1>Super Admin ({rows.length})</h1>
        <button className="adm-btn pri" onClick={() => setShowNew(s => !s)}>{showNew ? '✕ Close' : '➕ New restaurant'}</button>
        <button className="adm-btn" onClick={() => navigate('/dashboard')}>← App</button>
        <button className="adm-btn danger" onClick={handleLogout}>↩ Logout</button>
      </div>

      {showNew && (
        <form className="adm-card" onSubmit={createRestaurant}>
          <div className="adm-name" style={{ marginBottom: 10 }}>New restaurant + owner login</div>
          <div className="adm-form">
            <div><label>Restaurant name *</label><input className="adm-input" value={form.name} onChange={set('name')} /></div>
            <div><label>Short ID (optional)</label><input className="adm-input" value={form.slug} onChange={set('slug')} placeholder="my-restaurant" /></div>
            <div><label>Owner name</label><input className="adm-input" value={form.owner} onChange={set('owner')} /></div>
            <div><label>Owner email *</label><input className="adm-input" type="email" value={form.email} onChange={set('email')} /></div>
            <div><label>Password * (6+)</label><input className="adm-input" type="text" value={form.password} onChange={set('password')} /></div>
            <div><label>Phone</label><input className="adm-input" value={form.phone} onChange={set('phone')} /></div>
            <div className="full"><label>Address</label><input className="adm-input" value={form.address} onChange={set('address')} /></div>
            <div className="full"><label>Plan</label>
              <div className="adm-plans" style={{ margin: 0 }}>
                {PLANS.map(p => <button type="button" key={p} className={`adm-plan ${form.plan === p ? 'on' : ''}`} onClick={() => setForm(f => ({ ...f, plan: p }))}>{p}</button>)}
              </div>
            </div>
          </div>
          <button className="adm-btn pri" style={{ marginTop: 12, width: '100%' }} disabled={creating}>{creating ? '⏳ Creating...' : '🚀 Create restaurant'}</button>
          <div className="adm-sub" style={{ marginTop: 8 }}>Supabase → Authentication → Email: "Confirm email" must be OFF.</div>
        </form>
      )}

      <input className="adm-input" placeholder="🔍 Search restaurants..." value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 12 }} />

      {!loading && rows.some(r => r.paid_until != null) && (
        <div className="adm-sub" style={{ marginBottom: 10 }}>
          💳 {rows.filter(r => r.locked).length} locked · {rows.filter(r => !r.locked && r.days_left != null && r.days_left < 0).length} overdue · {rows.filter(r => r.days_left != null && r.days_left >= 0 && r.days_left <= 7).length} due in 7 days
        </div>
      )}

      {loading ? <div className="adm-sub">Loading...</div> : shown.map(r => {
        const d = r.draft
        const on = MODULES.filter(m => d.features[m.key]).length
        return (
          <div key={r.id} className={`adm-card ${d.active ? '' : 'off'}`}>
            <div className="adm-row">
              {r.logo_url ? <img className="adm-logo" src={r.logo_url} alt="" /> : <div className="adm-logo ph">No logo</div>}
              <div style={{ flex: 1, minWidth: 120 }}>
                <div className="adm-name">{r.name}</div>
                <div className="adm-sub">{r.slug} · {r.email || r.phone || ''}</div>
              </div>
              <label className="sw" title="Active / Suspended">
                <input type="checkbox" checked={d.active} onChange={() => toggleActive(r.id)} /><span />
              </label>
              <span className="adm-sub">{d.active ? 'Active' : 'Suspended'}</span>
            </div>

            {/* ⚙️ Features on/off (Super Admin only) */}
            <div className="adm-row" style={{ marginTop: 10 }}>
              <button className="adm-btn" onClick={() => setOpen(o => ({ ...o, [r.id]: o[r.id] === false }))}>
                {open[r.id] !== false ? '▲' : '▼'} ⚙️ Features on/off ({on}/{MODULES.length})
              </button>
              {open[r.id] !== false && <>
                <button className="adm-btn" onClick={() => patch(r.id, dd => ({ ...dd, features: Object.fromEntries(MODULES.map(m => [m.key, true])) }))}>All ON</button>
                <button className="adm-btn" onClick={() => patch(r.id, dd => ({ ...dd, features: Object.fromEntries(MODULES.map(m => [m.key, !!m.locked])) }))}>All OFF</button>
              </>}
            </div>

            {open[r.id] !== false && (
              <div style={{ marginTop: 8 }}>
                {GROUPS.map(g => (
                  <div key={g.title}>
                    <div className="adm-sub" style={{ margin: '10px 0 4px', textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 11 }}>{g.title}</div>
                    <div className="adm-mods" style={{ marginTop: 0 }}>
                      {MODULES.filter(m => g.keys.includes(m.key)).map(m => (
                        <div className="adm-mod" key={m.key}>
                          <span>{m.label}{m.locked ? ' 🔒' : ''}</span>
                          <label className="sw">
                            <input type="checkbox" checked={!!d.features[m.key]} disabled={m.locked} onChange={() => toggleMod(r.id, m.key)} /><span />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Plan presets (apply a ready-made set of features) */}
            <div className="adm-sub" style={{ margin: '12px 0 4px', textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 11 }}>Plan (quick preset)</div>
            <div className="adm-plans" style={{ marginTop: 0 }}>
              {PLANS.map(p => <button key={p} className={`adm-plan ${d.plan === p ? 'on' : ''}`} onClick={() => changePlan(r.id, p)}>{p}</button>)}
            </div>

            {(() => { const c = billChip(r); return (
              <div className="adm-row" style={{ marginTop: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: c.c }}>{c.t}</span>
                {Number(r.monthly_fee) > 0 && <span className="adm-sub">Rs. {Number(r.monthly_fee).toLocaleString()}/mo</span>}
              </div>
            ) })()}

            <div className="adm-row" style={{ marginTop: 8 }}>
              <button className="adm-btn" onClick={() => openBill(r)}>💳 Billing</button>
              <button className="adm-btn" onClick={() => openLogins(r)}>👤 Logins</button>
              <label className="adm-btn" style={{ cursor: 'pointer' }}>
                📷 Logo
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadLogo(r, e)} disabled={busy[r.id]} />
              </label>
              <button className="adm-btn" onClick={() => setEdit({ id: r.id, name: r.name || '', slug: r.slug || '', email: r.email || '', phone: r.phone || '', address: r.address || '' })}>✏️ Edit</button>
              <button className="adm-btn" style={{ color: '#ff6b6b' }} onClick={() => setDel({ row: r, slug: '', password: '' })}>🗑️ Delete</button>
              <button className="adm-btn pri" style={{ marginLeft: 'auto' }} disabled={!isDirty(r) || busy[r.id]} onClick={() => save(r)}>
                {busy[r.id] ? '⏳' : isDirty(r) ? '💾 Save' : '✓ Saved'}
              </button>
            </div>
            <div className="adm-stats">Staff {r.staff_count} · Orders {r.orders_count} · Last order {fmt(r.last_order_at)} · Created {fmt(r.created_at)}</div>
          </div>
        )
      })}
      {!loading && !shown.length && <div className="adm-sub">No restaurants</div>}

      {edit && (
        <div style={OVERLAY} onClick={() => !working && setEdit(null)}>
          <form className="adm-card" style={MODAL} onClick={e => e.stopPropagation()} onSubmit={saveEdit}>
            <div className="adm-name" style={{ marginBottom: 10 }}>✏️ Edit restaurant</div>
            <div className="adm-form">
              <div className="full"><label>Restaurant name *</label><input className="adm-input" value={edit.name} onChange={e => setEdit(v => ({ ...v, name: e.target.value }))} /></div>
              <div className="full"><label>Short ID</label><input className="adm-input" value={edit.slug} onChange={e => setEdit(v => ({ ...v, slug: e.target.value }))} /></div>
              <div><label>Email</label><input className="adm-input" type="email" value={edit.email} onChange={e => setEdit(v => ({ ...v, email: e.target.value }))} /></div>
              <div><label>Phone</label><input className="adm-input" value={edit.phone} onChange={e => setEdit(v => ({ ...v, phone: e.target.value }))} /></div>
              <div className="full"><label>Address</label><input className="adm-input" value={edit.address} onChange={e => setEdit(v => ({ ...v, address: e.target.value }))} /></div>
            </div>
            <div className="adm-row" style={{ marginTop: 12 }}>
              <button type="button" className="adm-btn" onClick={() => setEdit(null)} disabled={working}>Cancel</button>
              <button className="adm-btn pri" style={{ marginLeft: 'auto' }} disabled={working}>{working ? '⏳' : '💾 Save'}</button>
            </div>
          </form>
        </div>
      )}

      {bill && (
        <div style={OVERLAY} onClick={() => !working && setBill(null)}>
          <form className="adm-card" style={MODAL} onClick={e => e.stopPropagation()} onSubmit={saveBill}>
            <div className="adm-name" style={{ marginBottom: 10 }}>💳 Billing — {bill.name}</div>
            <div className="adm-form">
              <div><label>Paid until</label><input className="adm-input" type="date" value={bill.paid_until} onChange={e => setBill(b => ({ ...b, paid_until: e.target.value }))} /></div>
              <div><label>Monthly fee (Rs.)</label><input className="adm-input" type="number" min="0" value={bill.monthly_fee} onChange={e => setBill(b => ({ ...b, monthly_fee: e.target.value }))} /></div>
              <div><label>Grace days after due date</label><input className="adm-input" type="number" min="0" value={bill.grace_days} onChange={e => setBill(b => ({ ...b, grace_days: e.target.value }))} /></div>
              <div className="full"><label>Notes</label><input className="adm-input" value={bill.notes} onChange={e => setBill(b => ({ ...b, notes: e.target.value }))} placeholder="e.g. paid by bank transfer" /></div>
            </div>
            <div className="adm-row" style={{ marginTop: 10 }}>
              <button type="button" className="adm-btn" onClick={plusMonth}>＋1 month (mark paid)</button>
              <button type="button" className="adm-btn" onClick={() => setBill(b => ({ ...b, paid_until: '' }))}>No billing rule</button>
            </div>
            <div className="adm-mod" style={{ marginTop: 10 }}>
              <span>Owner may create staff logins</span>
              <label className="sw"><input type="checkbox" checked={bill.allow} onChange={() => setBill(b => ({ ...b, allow: !b.allow }))} /><span /></label>
            </div>
            <div className="adm-sub" style={{ marginTop: 8 }}>
              When “Paid until” + grace days has passed the restaurant is locked automatically (data stays safe). Setting a new date unlocks it instantly. Empty date = never locks.
            </div>
            <div className="adm-row" style={{ marginTop: 12 }}>
              <button type="button" className="adm-btn" onClick={() => setBill(null)} disabled={working}>Cancel</button>
              {bill.phone && bill.paid_until && (
                <a className="adm-btn" target="_blank" rel="noreferrer"
                   href={`https://wa.me/${waNumber(bill.phone)}?text=${encodeURIComponent(`Hello ${bill.name}, your SmartBiz subscription${Number(bill.monthly_fee) > 0 ? ` (Rs. ${Number(bill.monthly_fee).toLocaleString()})` : ''} is due on ${bill.paid_until}. Please pay to keep the service active. Thank you!`)}`}>📲 Remind</a>
              )}
              <button className="adm-btn pri" style={{ marginLeft: 'auto' }} disabled={working}>{working ? '⏳' : '💾 Save'}</button>
            </div>
          </form>
        </div>
      )}

      {lg && (
        <div style={OVERLAY} onClick={() => !working && setLg(null)}>
          <div className="adm-card" style={MODAL} onClick={e => e.stopPropagation()}>
            <div className="adm-name" style={{ marginBottom: 8 }}>👤 Logins — {lg.row.name}</div>
            {lg.loading ? <div className="adm-sub">Loading...</div> : lg.staff.length === 0 ? <div className="adm-sub">No staff yet</div> : (
              <div style={{ marginBottom: 10 }}>
                {lg.staff.map(st => (
                  <div className="adm-mod" key={st.id} style={{ marginBottom: 6 }}>
                    <span>{st.name} <span className="adm-sub">· {st.role}{st.email ? ` · ${st.email}` : ''}</span></span>
                    <span className="adm-sub">{st.has_login ? '🔑 login' : 'no login'}{st.active ? '' : ' · off'}</span>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={createLogin}>
              <div className="adm-sub" style={{ marginBottom: 6 }}>➕ New login</div>
              <div className="adm-form">
                <div><label>Name *</label><input className="adm-input" value={lg.form.name} onChange={e => setLg(l => ({ ...l, form: { ...l.form, name: e.target.value } }))} /></div>
                <div><label>Role</label>
                  <select className="adm-input" value={lg.form.role} onChange={e => setLg(l => ({ ...l, form: { ...l.form, role: e.target.value } }))}>
                    {ROLES.map(x => <option key={x} value={x}>{x}</option>)}
                  </select></div>
                <div><label>Email *</label><input className="adm-input" type="email" value={lg.form.email} onChange={e => setLg(l => ({ ...l, form: { ...l.form, email: e.target.value } }))} /></div>
                <div><label>Password * (6+)</label><input className="adm-input" type="text" value={lg.form.password} onChange={e => setLg(l => ({ ...l, form: { ...l.form, password: e.target.value } }))} /></div>
              </div>
              <div className="adm-row" style={{ marginTop: 12 }}>
                <button type="button" className="adm-btn" onClick={() => setLg(null)} disabled={working}>Close</button>
                <button className="adm-btn pri" style={{ marginLeft: 'auto' }} disabled={working}>{working ? '⏳ Creating...' : '🔑 Create login'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {del && (
        <div style={OVERLAY} onClick={() => !working && setDel(null)}>
          <form className="adm-card" style={MODAL} onClick={e => e.stopPropagation()} onSubmit={confirmDelete}>
            <div className="adm-name" style={{ marginBottom: 6, color: '#ff6b6b' }}>🗑️ Delete “{del.row.name}”</div>
            <div className="adm-sub" style={{ marginBottom: 10 }}>
              Orders {del.row.orders_count} · Staff {del.row.staff_count}. All data of this restaurant will be permanently removed. This cannot be undone.
            </div>
            {del.row.active ? (
              <div className="adm-sub" style={{ color: '#ffb74d', marginBottom: 10 }}>
                ⚠️ First turn the Active switch OFF (Suspended) and press 💾 Save, then delete.
              </div>
            ) : (
              <>
                <label className="adm-sub">Type the short ID <b>{del.row.slug}</b> to confirm</label>
                <input className="adm-input" style={{ margin: '4px 0 10px' }} value={del.slug} onChange={e => setDel(v => ({ ...v, slug: e.target.value }))} autoComplete="off" />
                <label className="adm-sub">Your admin password</label>
                <input className="adm-input" style={{ margin: '4px 0 10px' }} type="password" value={del.password} onChange={e => setDel(v => ({ ...v, password: e.target.value }))} autoComplete="current-password" />
              </>
            )}
            <div className="adm-row">
              <button type="button" className="adm-btn" onClick={() => setDel(null)} disabled={working}>Cancel</button>
              <button className="adm-btn" style={{ marginLeft: 'auto', background: '#e53935', color: '#fff', border: 0 }}
                disabled={working || del.row.active || del.slug.trim().toLowerCase() !== del.row.slug.toLowerCase() || !del.password}>
                {working ? '⏳ Deleting...' : '🗑️ Delete forever'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
