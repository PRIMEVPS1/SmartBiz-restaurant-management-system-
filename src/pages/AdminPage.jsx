// src/pages/AdminPage.jsx — Super Admin: manage all restaurants (platform admins only)
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import LogoMark from '../components/Logo'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

const PLANS = ['free', 'pro', 'enterprise']

export default function AdminPage() {
  const navigate = useNavigate()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied]   = useState(false)
  const [q, setQ]             = useState('')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_tenants')
    if (error) { setDenied(true) } else { setRows(data || []) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function update(t, patch) {
    const next = { ...t, ...patch }
    const { error } = await supabase.rpc('admin_update_tenant', { p_id: t.id, p_active: next.active, p_plan: next.plan })
    if (error) return toast.error(error.message)
    setRows(r => r.map(x => x.id === t.id ? next : x))
    toast.success('Updated')
  }

  const shown = rows.filter(t => !q || (t.name + t.slug + (t.email || '')).toLowerCase().includes(q.toLowerCase()))
  const fmt = d => d ? new Date(d).toLocaleDateString() : '—'

  if (denied) return (
    <div className="page-wrap"><div className="mn-empty"><div className="mn-empty-title">Not allowed</div>
      <div className="mn-empty-sub">This page is for SmartBiz platform admins only.</div>
      <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Back</button></div></div>
  )

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <LogoMark size={30} /><div className="topbar-title">Super Admin — Restaurants ({rows.length})</div>
        </div>
        <button className="btn" onClick={() => navigate('/dashboard')}>← App</button>
      </div>
      <div style={{ padding:'0 16px 24px' }}>
        <input className="mn-input" placeholder="Search restaurants..." value={q} onChange={e => setQ(e.target.value)} style={{ margin:'12px 0', maxWidth:360 }} />
        {loading ? <div className="mn-loading">Loading...</div> : (
          <div className="inv-table-wrap">
            <table className="data-table inv-table">
              <thead><tr><th>Restaurant</th><th>Plan</th><th>Staff</th><th>Orders</th><th>Last order</th><th>Created</th><th>Active</th></tr></thead>
              <tbody>
                {shown.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        {t.logo_url && <img src={t.logo_url} alt="" style={{ width:28, height:28, objectFit:'contain', borderRadius:6 }} />}
                        <div><strong>{t.name}</strong><div style={{ fontSize:11, color:'var(--t2)' }}>{t.slug} · {t.email || t.phone || ''}</div></div>
                      </div>
                    </td>
                    <td>
                      <select className="mn-select" value={t.plan} onChange={e => update(t, { plan: e.target.value })}>
                        {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td>{t.staff_count}</td><td>{t.orders_count}</td>
                    <td>{fmt(t.last_order_at)}</td><td>{fmt(t.created_at)}</td>
                    <td>
                      <button className={`btn ${t.active ? '' : 'btn-danger'}`} onClick={() => update(t, { active: !t.active })}>
                        {t.active ? '✅ Active' : '⛔ Suspended'}
                      </button>
                    </td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--t2)' }}>No restaurants</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
