// src/pages/CustomersPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'
import './CustomersPage.css'

const EMPTY = { name:'', phone:'', email:'', notes:'' }

export default function CustomersPage() {
  const { tenant } = useStore()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [delConfirm, setDelConfirm] = useState(null)
  const [search,  setSearch]  = useState('')
  const [sortBy,  setSortBy]  = useState('spent')

  useEffect(() => { if (tenant?.id) load() }, [tenant?.id])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('customers').select('*').eq('tenant_id', tenant.id).order('total_spent', { ascending:false })
      if (error) throw error
      setCustomers(data || [])
    } catch(e) { toast.error(e.message) }
    finally    { setLoading(false) }
  }

  function openAdd() { setForm({ ...EMPTY }); setModal('add') }
  function openEdit(c) { setForm({ name:c.name, phone:c.phone||'', email:c.email||'', notes:c.notes||'' }); setModal(c) }

  async function save() {
    if (!form.name.trim()) { toast.error('Name required'); return }
    setSaving(true)
    try {
      const payload = { ...form, name:form.name.trim(), tenant_id:tenant.id }
      const isEdit = modal && modal !== 'add'
      const { error } = isEdit ? await supabase.from('customers').update(payload).eq('id',modal.id) : await supabase.from('customers').insert(payload)
      if (error) throw error
      toast.success(isEdit?'Customer updated!':'Customer added!'); setModal(null); await load()
    } catch(e) { toast.error(e.message) }
    finally    { setSaving(false) }
  }

  async function adjustPoints(c, delta) {
    const newPoints = Math.max(0, c.loyalty_points + delta)
    try {
      await supabase.from('customers').update({ loyalty_points: newPoints }).eq('id', c.id)
      setCustomers(prev => prev.map(x => x.id === c.id ? { ...x, loyalty_points: newPoints } : x))
      toast.success(`Points ${delta>0?'+':''}${delta}`)
    } catch(e) { toast.error(e.message) }
  }

  async function del(c) {
    setSaving(true)
    try {
      const { error } = await supabase.from('customers').delete().eq('id', c.id)
      if (error) throw error
      toast.success('Customer deleted'); setDelConfirm(null); await load()
    } catch(e) { toast.error(e.message) }
    finally    { setSaving(false) }
  }

  let filtered = customers.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone||'').includes(search))
  filtered = [...filtered].sort((a,b) => sortBy==='spent' ? b.total_spent-a.total_spent : sortBy==='points' ? b.loyalty_points-a.loyalty_points : b.visit_count-a.visit_count)

  const totalCustomers = customers.length
  const totalPoints    = customers.reduce((s,c)=>s+c.loyalty_points,0)
  const totalSpent     = customers.reduce((s,c)=>s+Number(c.total_spent),0)
  const vipCount        = customers.filter(c=>c.total_spent >= 10000).length

  function tier(c) {
    if (c.total_spent >= 50000) return { label:'Platinum', color:'#a78bfa' }
    if (c.total_spent >= 20000) return { label:'Gold',     color:'#29b6f6' }
    if (c.total_spent >= 5000)  return { label:'Silver',   color:'#94a3b8' }
    return { label:'Bronze', color:'#fb923c' }
  }

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Loyalty & CRM <small>{customers.length} customers</small></div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn" onClick={load} disabled={loading}>🔄</button>
          <button className="btn btn-primary" onClick={openAdd}>＋ Add Customer</button>
        </div>
      </div>

      <div className="mn-stats">
        <div className="mn-stat"><span className="mn-stat-val">{totalCustomers}</span><span className="mn-stat-lbl">Customers</span></div>
        <div className="mn-stat amber"><span className="mn-stat-val">{vipCount}</span><span className="mn-stat-lbl">VIP (10K+)</span></div>
        <div className="mn-stat blue"><span className="mn-stat-val">{totalPoints.toLocaleString()}</span><span className="mn-stat-lbl">Total Points</span></div>
        <div className="mn-stat green"><span className="mn-stat-val">Rs.{totalSpent>=1000?(totalSpent/1000).toFixed(1)+'K':totalSpent.toFixed(0)}</span><span className="mn-stat-lbl">Total Spend</span></div>
      </div>

      <div className="sf-filters">
        <div className="mn-search-wrap" style={{flex:1,minWidth:180}}>
          <span className="mn-search-icon">🔍</span>
          <input className="mn-search" placeholder="Search customers..." value={search} onChange={e=>setSearch(e.target.value)} />
          {search && <button className="mn-search-clear" onClick={()=>setSearch('')}>✕</button>}
        </div>
        <div className="mn-filter-pills">
          <button className={`pill ${sortBy==='spent'?'active':''}`}  onClick={()=>setSortBy('spent')}>💰 By Spend</button>
          <button className={`pill ${sortBy==='points'?'active':''}`} onClick={()=>setSortBy('points')}>⭐ By Points</button>
          <button className={`pill ${sortBy==='visits'?'active':''}`} onClick={()=>setSortBy('visits')}>🔁 By Visits</button>
        </div>
      </div>

      {loading ? <div className="mn-loading">Loading customers...</div> : filtered.length === 0 ? (
        <div className="mn-empty">
          <div style={{fontSize:48,marginBottom:12}}>🎁</div>
          <div className="mn-empty-title">No customers yet</div>
          <div className="mn-empty-sub">Add your first customer to start building loyalty</div>
          <button className="btn btn-primary" style={{marginTop:16}} onClick={openAdd}>＋ Add Customer</button>
        </div>
      ) : (
        <div className="cust-grid">
          {filtered.map(c => {
            const t = tier(c)
            return (
              <div key={c.id} className="cust-card">
                <div className="cust-head">
                  <div className="cust-avatar" style={{background:t.color}}>{c.name.charAt(0).toUpperCase()}</div>
                  <div className="cust-info">
                    <div className="cust-name">{c.name}</div>
                    <span className="cust-tier" style={{color:t.color,background:t.color+'22'}}>{t.label}</span>
                  </div>
                </div>
                <div className="cust-body">
                  {c.phone && <div className="sf-detail">📱 {c.phone}</div>}
                  {c.email && <div className="sf-detail">📧 {c.email}</div>}
                  <div className="cust-stat-row">
                    <div className="cust-stat"><span>{c.visit_count}</span><small>Visits</small></div>
                    <div className="cust-stat"><span>Rs.{Number(c.total_spent)>=1000?(c.total_spent/1000).toFixed(1)+'K':c.total_spent}</span><small>Spent</small></div>
                    <div className="cust-stat"><span>{c.loyalty_points}</span><small>Points</small></div>
                  </div>
                  {c.notes && <div className="cust-notes">💬 {c.notes}</div>}
                </div>
                <div className="cust-points-row">
                  <button className="rm-status-btn" onClick={()=>adjustPoints(c,-10)}>-10 pts</button>
                  <button className="rm-status-btn" onClick={()=>adjustPoints(c,10)}>+10 pts</button>
                  <button className="rm-status-btn" onClick={()=>adjustPoints(c,50)}>+50 pts</button>
                </div>
                <div className="sf-card-foot">
                  <button className="mn-act-btn edit" onClick={()=>openEdit(c)}>✏️ Edit</button>
                  <button className="mn-act-btn del"  onClick={()=>setDelConfirm(c)}>🗑</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className="mn-overlay" onClick={()=>setModal(null)}>
          <div className="mn-modal" onClick={e=>e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">{modal==='add'?'＋ Add Customer':'✏️ Edit Customer'}</div>
              <button className="mn-modal-close" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <div className="mn-field"><label>Name *</label><input className="mn-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} autoFocus /></div>
              <div className="mn-field-row">
                <div className="mn-field"><label>Phone</label><input className="mn-input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></div>
                <div className="mn-field"><label>Email</label><input className="mn-input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></div>
              </div>
              <div className="mn-field"><label>Notes</label><textarea className="mn-input mn-textarea" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></div>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={()=>setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving...':modal==='add'?'Add Customer':'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {delConfirm && (
        <div className="mn-overlay" onClick={()=>setDelConfirm(null)}>
          <div className="mn-modal mn-modal-sm" onClick={e=>e.stopPropagation()}>
            <div className="mn-modal-head"><div className="mn-modal-title">🗑️ Delete Customer</div><button className="mn-modal-close" onClick={()=>setDelConfirm(null)}>✕</button></div>
            <div className="mn-modal-body"><p style={{color:'var(--t2)',fontSize:14}}>Delete <strong style={{color:'var(--text)'}}>{delConfirm.name}</strong>?</p></div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={()=>setDelConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={saving} onClick={()=>del(delConfirm)}>{saving?'Deleting...':'Yes, Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
