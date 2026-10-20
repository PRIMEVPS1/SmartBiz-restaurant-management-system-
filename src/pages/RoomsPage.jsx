// src/pages/RoomsPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'
import './RoomsPage.css'

const TYPES   = ['standard','deluxe','suite','penthouse']
const STATUSES= ['available','occupied','reserved','maintenance','cleaning']
const STATUS_COLOR = { available:'green', occupied:'red', reserved:'amber', maintenance:'red', cleaning:'blue' }
const EMPTY = { number:'', type:'standard', floor:1, capacity:2, rate_per_night:0, status:'available', amenities:[] }
const AMENITY_LIST = ['WiFi','AC','TV','Mini Bar','Jacuzzi','Sea View','Balcony','Kitchen','Safe','Bathtub']

export default function RoomsPage() {
  const { tenant } = useStore()
  const [rooms,   setRooms]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [delConfirm, setDelConfirm] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType,   setFilterType]   = useState('all')

  useEffect(() => { if (tenant?.id) load() }, [tenant?.id])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('rooms').select('*').eq('tenant_id', tenant.id).order('floor').order('number')
      if (error) throw error
      setRooms(data || [])
    } catch(e) { toast.error(e.message) }
    finally    { setLoading(false) }
  }

  function openAdd() { setForm({ ...EMPTY }); setModal('add') }
  function openEdit(r) {
    setForm({ number:r.number, type:r.type, floor:r.floor, capacity:r.capacity,
      rate_per_night:r.rate_per_night, status:r.status, amenities:r.amenities||[] })
    setModal(r)
  }

  async function save() {
    if (!form.number.trim()) { toast.error('Room number required'); return }
    setSaving(true)
    try {
      const payload = { ...form, number:form.number.trim(), floor:Number(form.floor), capacity:Number(form.capacity), rate_per_night:Number(form.rate_per_night), tenant_id:tenant.id }
      const isEdit = modal && modal !== 'add'
      const { error } = isEdit ? await supabase.from('rooms').update(payload).eq('id',modal.id) : await supabase.from('rooms').insert(payload)
      if (error) throw error
      toast.success(isEdit?'Room updated!':'Room added!'); setModal(null); await load()
    } catch(e) { toast.error(e.message) }
    finally    { setSaving(false) }
  }

  async function changeStatus(room, status) {
    try {
      await supabase.from('rooms').update({ status }).eq('id', room.id)
      setRooms(prev => prev.map(r => r.id === room.id ? { ...r, status } : r))
      toast.success(`Room ${room.number} → ${status}`)
    } catch(e) { toast.error(e.message) }
  }

  async function del(r) {
    setSaving(true)
    try {
      const { error } = await supabase.from('rooms').delete().eq('id', r.id)
      if (error) throw error
      toast.success('Room deleted'); setDelConfirm(null); await load()
    } catch(e) { toast.error(e.message) }
    finally    { setSaving(false) }
  }

  const filtered = rooms.filter(r => {
    const ms = filterStatus === 'all' || r.status === filterStatus
    const mt = filterType   === 'all' || r.type   === filterType
    return ms && mt
  })

  const stats = STATUSES.reduce((a,s) => ({ ...a, [s]: rooms.filter(r=>r.status===s).length }), {})

  function toggleAmenity(a) {
    setForm(f => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter(x=>x!==a) : [...f.amenities, a] }))
  }

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Rooms <small>{rooms.length} rooms</small></div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn" onClick={load} disabled={loading}>🔄</button>
          <button className="btn btn-primary" onClick={openAdd}>＋ Add Room</button>
        </div>
      </div>

      {/* Stats */}
      <div className="rm-stats">
        {STATUSES.map(s => (
          <div key={s} className={`rm-stat ${STATUS_COLOR[s]}`} onClick={()=>setFilterStatus(s===filterStatus?'all':s)} style={{cursor:'pointer'}}>
            <span className="rm-stat-val">{stats[s]||0}</span>
            <span className="rm-stat-lbl">{s}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="sf-filters">
        <div className="mn-filter-pills">
          <button className={`pill ${filterStatus==='all'?'active':''}`} onClick={()=>setFilterStatus('all')}>All Status</button>
          {STATUSES.map(s=><button key={s} className={`pill ${filterStatus===s?'active':''}`} onClick={()=>setFilterStatus(s)}>{s}</button>)}
        </div>
        <select className="mn-select" value={filterType} onChange={e=>setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          {TYPES.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Grid */}
      {loading ? <div className="mn-loading">Loading rooms...</div> : filtered.length === 0 ? (
        <div className="mn-empty">
          <div style={{fontSize:48,marginBottom:12}}>🛏️</div>
          <div className="mn-empty-title">No rooms found</div>
          <div className="mn-empty-sub">Add your first room</div>
          <button className="btn btn-primary" style={{marginTop:16}} onClick={openAdd}>＋ Add Room</button>
        </div>
      ) : (
        <div className="rm-grid">
          {filtered.map(r => (
            <div key={r.id} className={`rm-card status-${r.status}`}>
              <div className="rm-card-head">
                <div className="rm-number">🛏 {r.number}</div>
                <span className={`inv-status-pill ${STATUS_COLOR[r.status]}`}>{r.status}</span>
              </div>
              <div className="rm-card-body">
                <div className="rm-type">{r.type} · Floor {r.floor} · {r.capacity} guests</div>
                <div className="rm-rate">Rs. {Number(r.rate_per_night).toLocaleString()} / night</div>
                {r.amenities?.length > 0 && (
                  <div className="rm-amenities">
                    {r.amenities.slice(0,4).map(a=><span key={a} className="rm-amenity">{a}</span>)}
                    {r.amenities.length > 4 && <span className="rm-amenity">+{r.amenities.length-4}</span>}
                  </div>
                )}
              </div>
              <div className="rm-status-btns">
                {STATUSES.filter(s=>s!==r.status).map(s=>(
                  <button key={s} className="rm-status-btn" onClick={()=>changeStatus(r,s)}>{s}</button>
                ))}
              </div>
              <div className="sf-card-foot">
                <button className="mn-act-btn edit" onClick={()=>openEdit(r)}>✏️ Edit</button>
                <button className="mn-act-btn del"  onClick={()=>setDelConfirm(r)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="mn-overlay" onClick={()=>setModal(null)}>
          <div className="mn-modal mn-modal-lg" onClick={e=>e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">{modal==='add'?'＋ Add Room':'✏️ Edit Room'}</div>
              <button className="mn-modal-close" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <div className="mn-modal-grid">
                <div>
                  <div className="mn-field">
                    <label>Room Number *</label>
                    <input className="mn-input" placeholder="e.g. 101, A2" value={form.number} onChange={e=>setForm(f=>({...f,number:e.target.value}))} autoFocus />
                  </div>
                  <div className="mn-field-row">
                    <div className="mn-field">
                      <label>Type</label>
                      <select className="mn-input" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                        {TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="mn-field">
                      <label>Status</label>
                      <select className="mn-input" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                        {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mn-field-row">
                    <div className="mn-field">
                      <label>Floor</label>
                      <input className="mn-input" type="number" min="1" value={form.floor} onChange={e=>setForm(f=>({...f,floor:e.target.value}))} />
                    </div>
                    <div className="mn-field">
                      <label>Capacity</label>
                      <input className="mn-input" type="number" min="1" value={form.capacity} onChange={e=>setForm(f=>({...f,capacity:e.target.value}))} />
                    </div>
                  </div>
                  <div className="mn-field">
                    <label>Rate per Night (LKR)</label>
                    <input className="mn-input" type="number" min="0" value={form.rate_per_night} onChange={e=>setForm(f=>({...f,rate_per_night:e.target.value}))} />
                  </div>
                </div>
                <div>
                  <div className="mn-field">
                    <label>Amenities</label>
                    <div className="rm-amenity-grid">
                      {AMENITY_LIST.map(a=>(
                        <button key={a} className={`rm-amenity-btn ${form.amenities.includes(a)?'selected':''}`} onClick={()=>toggleAmenity(a)}>{a}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={()=>setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving...':modal==='add'?'Add Room':'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {delConfirm && (
        <div className="mn-overlay" onClick={()=>setDelConfirm(null)}>
          <div className="mn-modal mn-modal-sm" onClick={e=>e.stopPropagation()}>
            <div className="mn-modal-head"><div className="mn-modal-title">🗑️ Delete Room</div><button className="mn-modal-close" onClick={()=>setDelConfirm(null)}>✕</button></div>
            <div className="mn-modal-body"><p style={{color:'var(--t2)',fontSize:14,lineHeight:1.6}}>Delete room <strong style={{color:'var(--text)'}}>{delConfirm.number}</strong>? This cannot be undone.</p></div>
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
