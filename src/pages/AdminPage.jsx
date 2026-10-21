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

            <div className="adm-plans">
              {PLANS.map(p => <button key={p} className={`adm-plan ${d.plan === p ? 'on' : ''}`} onClick={() => changePlan(r.id, p)}>{p}</button>)}
            </div>

            <div className="adm-row" style={{ marginTop: 8 }}>
              <button className="adm-btn" onClick={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))}>
                {open[r.id] ? '▲' : '▼'} Menu options ({on}/{MODULES.length})
              </button>
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

            {open[r.id] && (
              <div className="adm-mods">
                {MODULES.map(m => (
                  <div className="adm-mod" key={m.key}>
                    <span>{m.label}</span>
                    <label className="sw">
                      <input type="checkbox" checked={!!d.features[m.key]} disabled={m.locked} onChange={() => toggleMod(r.id, m.key)} /><span />
                    </label>
                  </div>
                ))}
              </div>
            )}
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
