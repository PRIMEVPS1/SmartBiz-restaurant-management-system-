// src/pages/StaffPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'
import './StaffPage.css'

const ROLES = ['owner','manager','cashier','waiter','kitchen','receptionist']
const COLORS = ['#29b6f6','#10b981','#60a5fa','#a78bfa','#fb923c','#f43f5e','#14b8a6','#8b5cf6']
const EMPTY = { name:'', email:'', phone:'', role:'waiter', pin:'', avatar_color:'#29b6f6', active:true }

export default function StaffPage() {
  const { tenant } = useStore()
  const [staff,   setStaff]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)   // null | 'add' | {staff}
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [delConfirm, setDelConfirm] = useState(null)
  const [search,  setSearch]  = useState('')
  const [filterRole, setFilterRole] = useState('all')

  useEffect(() => { if (tenant?.id) load() }, [tenant?.id])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('staff').select('*')
        .eq('tenant_id', tenant.id)
        .order('role').order('name')
      if (error) throw error
      setStaff(data || [])
    } catch(e) { toast.error(e.message) }
    finally    { setLoading(false) }
  }

  function openAdd() { setForm({ ...EMPTY }); setModal('add') }
  function openEdit(s) {
    setForm({ name:s.name, email:s.email||'', phone:s.phone||'',
      role:s.role, pin:s.pin||'', avatar_color:s.avatar_color||'#29b6f6', active:s.active })
    setModal(s)
  }

  async function save() {
    if (!form.name.trim())       { toast.error('Name required'); return }
    if (!form.role)              { toast.error('Role required'); return }
    if (form.pin && !/^\d{4}$/.test(form.pin)) { toast.error('PIN must be 4 digits'); return }
    setSaving(true)
    try {
      const payload = { ...form, name: form.name.trim(), tenant_id: tenant.id }
      const isEdit  = modal && modal !== 'add'
      const { error } = isEdit
        ? await supabase.from('staff').update(payload).eq('id', modal.id)
        : await supabase.from('staff').insert(payload)
      if (error) throw error
      toast.success(isEdit ? 'Staff updated!' : 'Staff added!')
      setModal(null); await load()
    } catch(e) { toast.error(e.message) }
    finally    { setSaving(false) }
  }

  async function toggleActive(s) {
    try {
      await supabase.from('staff').update({ active: !s.active }).eq('id', s.id)
      setStaff(prev => prev.map(x => x.id === s.id ? { ...x, active: !s.active } : x))
      toast.success(s.active ? 'Staff deactivated' : 'Staff activated')
    } catch(e) { toast.error(e.message) }
  }

  async function del(s) {
    setSaving(true)
    try {
      const { error } = await supabase.from('staff').delete().eq('id', s.id)
      if (error) throw error
      toast.success('Staff removed'); setDelConfirm(null); await load()
    } catch(e) { toast.error(e.message) }
    finally    { setSaving(false) }
  }

  const ROLE_COLOR = {
    owner:'#29b6f6', manager:'#60a5fa', cashier:'#10b981',
    waiter:'#a78bfa', kitchen:'#fb923c', receptionist:'#14b8a6'
  }

  const filtered = staff.filter(s => {
    const m = !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.email||'').toLowerCase().includes(search.toLowerCase())
    const r = filterRole === 'all' || s.role === filterRole
    return m && r
  })

  const initials = s => s.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Staff & HR <small>{staff.length} members</small></div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn" onClick={load} disabled={loading}>🔄</button>
          <button className="btn btn-primary" onClick={openAdd}>＋ Add Staff</button>
        </div>
      </div>

      {/* Stats */}
      <div className="sf-stats">
        {ROLES.map(r => {
          const cnt = staff.filter(s => s.role === r).length
          return (
            <div key={r} className="sf-stat" style={{ borderColor: ROLE_COLOR[r]+'33', cursor:'pointer' }} onClick={() => setFilterRole(r === filterRole ? 'all' : r)}>
              <span className="sf-stat-val" style={{ color: ROLE_COLOR[r] }}>{cnt}</span>
              <span className="sf-stat-lbl">{r}</span>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="sf-filters">
        <div className="mn-search-wrap" style={{flex:1,minWidth:180}}>
          <span className="mn-search-icon">🔍</span>
          <input className="mn-search" placeholder="Search staff..." value={search} onChange={e=>setSearch(e.target.value)} />
          {search && <button className="mn-search-clear" onClick={()=>setSearch('')}>✕</button>}
        </div>
        <div className="mn-filter-pills">
          <button className={`pill ${filterRole==='all'?'active':''}`} onClick={()=>setFilterRole('all')}>All</button>
          {ROLES.map(r => (
            <button key={r} className={`pill ${filterRole===r?'active':''}`} onClick={()=>setFilterRole(r)}
              style={filterRole===r?{background:ROLE_COLOR[r]+'22',borderColor:ROLE_COLOR[r]+'55',color:ROLE_COLOR[r]}:{}}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="mn-loading">Loading staff...</div>
      ) : filtered.length === 0 ? (
        <div className="mn-empty">
          <div style={{fontSize:48,marginBottom:12}}>👥</div>
          <div className="mn-empty-title">{search ? 'No staff found' : 'No staff members yet'}</div>
          <div className="mn-empty-sub">Add your first staff member</div>
          {!search && <button className="btn btn-primary" style={{marginTop:16}} onClick={openAdd}>＋ Add Staff</button>}
        </div>
      ) : (
        <div className="sf-grid">
          {filtered.map(s => (
            <div key={s.id} className={`sf-card ${!s.active?'inactive':''}`}>
              <div className="sf-card-head">
                <div className="sf-avatar" style={{background:s.avatar_color||'#29b6f6'}}>{initials(s)}</div>
                <div className="sf-info">
                  <div className="sf-name">{s.name}</div>
                  <div className="sf-role-badge" style={{background:ROLE_COLOR[s.role]+'22',color:ROLE_COLOR[s.role]}}>{s.role}</div>
                </div>
                <button className={`mn-toggle ${s.active?'on':'off'}`} onClick={()=>toggleActive(s)}><span className="mn-toggle-knob"/></button>
              </div>
              <div className="sf-card-body">
                {s.email && <div className="sf-detail">📧 {s.email}</div>}
                {s.phone && <div className="sf-detail">📱 {s.phone}</div>}
                {s.pin   && <div className="sf-detail">🔑 PIN: ••••</div>}
                {!s.active && <div className="sf-inactive-badge">Inactive</div>}
              </div>
              <div className="sf-card-foot">
                <button className="mn-act-btn edit" onClick={()=>openEdit(s)}>✏️ Edit</button>
                <button className="mn-act-btn del"  onClick={()=>setDelConfirm(s)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="mn-overlay" onClick={()=>setModal(null)}>
          <div className="mn-modal" onClick={e=>e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">{modal==='add'?'＋ Add Staff':'✏️ Edit Staff'}</div>
              <button className="mn-modal-close" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <div className="mn-field">
                <label>Full Name *</label>
                <input className="mn-input" placeholder="e.g. Kasun Perera" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} autoFocus />
              </div>
              <div className="mn-field-row">
                <div className="mn-field">
                  <label>Role *</label>
                  <select className="mn-input" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                    {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="mn-field">
                  <label>PIN (4 digits)</label>
                  <input className="mn-input" placeholder="1234" maxLength={4} value={form.pin} onChange={e=>setForm(f=>({...f,pin:e.target.value.replace(/\D/g,'')}))} />
                </div>
              </div>
              <div className="mn-field">
                <label>Email</label>
                <input className="mn-input" type="email" placeholder="staff@example.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} />
              </div>
              <div className="mn-field">
                <label>Phone</label>
                <input className="mn-input" placeholder="+94 77 123 4567" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} />
              </div>
              <div className="mn-field">
                <label>Avatar Color</label>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:4}}>
                  {COLORS.map(c=>(
                    <button key={c} onClick={()=>setForm(f=>({...f,avatar_color:c}))}
                      style={{width:28,height:28,borderRadius:'50%',background:c,border:form.avatar_color===c?'3px solid #fff':'2px solid transparent',cursor:'pointer'}}/>
                  ))}
                </div>
              </div>
              <div className="mn-field mn-inline">
                <label>Active</label>
                <button className={`mn-toggle ${form.active?'on':'off'}`} onClick={()=>setForm(f=>({...f,active:!f.active}))}><span className="mn-toggle-knob"/></button>
              </div>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={()=>setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving...':modal==='add'?'Add Staff':'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {delConfirm && (
        <div className="mn-overlay" onClick={()=>setDelConfirm(null)}>
          <div className="mn-modal mn-modal-sm" onClick={e=>e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">🗑️ Remove Staff</div>
              <button className="mn-modal-close" onClick={()=>setDelConfirm(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <p style={{color:'var(--t2)',fontSize:14,lineHeight:1.6}}>
                Remove <strong style={{color:'var(--text)'}}>{delConfirm.name}</strong> from the system? This cannot be undone.
              </p>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={()=>setDelConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={saving} onClick={()=>del(delConfirm)}>{saving?'Removing...':'Yes, Remove'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
