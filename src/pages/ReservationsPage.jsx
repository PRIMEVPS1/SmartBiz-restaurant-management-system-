// src/pages/ReservationsPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'
import './ReservationsPage.css'

const STATUSES = ['confirmed','seated','checked_in','checked_out','cancelled','no_show']
const STATUS_COLOR = { confirmed:'blue', seated:'green', checked_in:'green', checked_out:'purple', cancelled:'red', no_show:'red' }
const EMPTY = { type:'table', guest_name:'', guest_phone:'', guest_count:1, date_from:'', date_to:'', notes:'', status:'confirmed', table_id:'', room_id:'' }

export default function ReservationsPage() {
  const { tenant } = useStore()
  const [reservations, setReservations] = useState([])
  const [tables, setTables] = useState([])
  const [rooms,  setRooms]  = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType,   setFilterType]   = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => { if (tenant?.id) loadAll() }, [tenant?.id])

  async function loadAll() {
    setLoading(true)
    try {
      const [resRes, tabRes, romRes] = await Promise.all([
        supabase.from('reservations').select('*, restaurant_tables(number,section), rooms(number,type)').eq('tenant_id', tenant.id).order('date_from', { ascending: false }),
        supabase.from('restaurant_tables').select('id,number,section').eq('tenant_id', tenant.id).order('number'),
        supabase.from('rooms').select('id,number,type').eq('tenant_id', tenant.id).order('number'),
      ])
      if (resRes.error) throw resRes.error
      setReservations(resRes.data || [])
      setTables(tabRes.data || [])
      setRooms(romRes.data || [])
    } catch(e) { toast.error(e.message) }
    finally    { setLoading(false) }
  }

  function openAdd() { setForm({ ...EMPTY, date_from: new Date().toISOString().slice(0,16) }); setModal('add') }
  function openEdit(r) {
    setForm({ type:r.type, guest_name:r.guest_name, guest_phone:r.guest_phone||'', guest_count:r.guest_count,
      date_from:r.date_from?.slice(0,16)||'', date_to:r.date_to?.slice(0,16)||'', notes:r.notes||'',
      status:r.status, table_id:r.table_id||'', room_id:r.room_id||'' })
    setModal(r)
  }

  async function save() {
    if (!form.guest_name.trim()) { toast.error('Guest name required'); return }
    if (!form.date_from) { toast.error('Date/time required'); return }
    setSaving(true)
    try {
      const payload = { ...form, guest_name:form.guest_name.trim(), guest_count:Number(form.guest_count),
        table_id:form.table_id||null, room_id:form.room_id||null, date_to:form.date_to||null, tenant_id:tenant.id }
      const isEdit = modal && modal !== 'add'
      const { error } = isEdit ? await supabase.from('reservations').update(payload).eq('id',modal.id) : await supabase.from('reservations').insert(payload)
      if (error) throw error
      toast.success(isEdit?'Reservation updated!':'Reservation added!'); setModal(null); await loadAll()
    } catch(e) { toast.error(e.message) }
    finally    { setSaving(false) }
  }

  async function updateStatus(res, status) {
    try {
      await supabase.from('reservations').update({ status }).eq('id', res.id)
      setReservations(prev => prev.map(r => r.id === res.id ? { ...r, status } : r))
      toast.success(`Status → ${status}`)
    } catch(e) { toast.error(e.message) }
  }

  const filtered = reservations.filter(r => {
    const ms = filterStatus === 'all' || r.status === filterStatus
    const mt = filterType   === 'all' || r.type   === filterType
    const mq = !search || r.guest_name.toLowerCase().includes(search.toLowerCase()) || (r.guest_phone||'').includes(search)
    return ms && mt && mq
  })

  function fmtDate(d) { return d ? new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—' }

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Reservations <small>{reservations.length} total</small></div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn" onClick={loadAll} disabled={loading}>🔄</button>
          <button className="btn btn-primary" onClick={openAdd}>＋ New Reservation</button>
        </div>
      </div>

      {/* Filters */}
      <div className="sf-filters">
        <div className="mn-search-wrap" style={{flex:1,minWidth:180}}>
          <span className="mn-search-icon">🔍</span>
          <input className="mn-search" placeholder="Search guest name, phone..." value={search} onChange={e=>setSearch(e.target.value)} />
          {search && <button className="mn-search-clear" onClick={()=>setSearch('')}>✕</button>}
        </div>
        <div className="mn-filter-pills">
          <button className={`pill ${filterType==='all'?'active':''}`} onClick={()=>setFilterType('all')}>All</button>
          <button className={`pill ${filterType==='table'?'active':''}`} onClick={()=>setFilterType('table')}>🍽 Table</button>
          <button className={`pill ${filterType==='room'?'active':''}`}  onClick={()=>setFilterType('room')}>🛏 Room</button>
        </div>
        <select className="mn-select" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? <div className="mn-loading">Loading reservations...</div> : filtered.length === 0 ? (
        <div className="mn-empty">
          <div style={{fontSize:48,marginBottom:12}}>📅</div>
          <div className="mn-empty-title">No reservations found</div>
          <div className="mn-empty-sub">Create your first reservation</div>
          <button className="btn btn-primary" style={{marginTop:16}} onClick={openAdd}>＋ New Reservation</button>
        </div>
      ) : (
        <div className="res-list">
          {filtered.map(r => (
            <div key={r.id} className="res-card">
              <div className="res-card-left">
                <div className="res-type-icon">{r.type==='table'?'🍽️':'🛏️'}</div>
                <div className="res-info">
                  <div className="res-guest">{r.guest_name} · {r.guest_count} guest{r.guest_count>1?'s':''}</div>
                  <div className="res-meta">
                    {r.type==='table' ? `Table ${r.restaurant_tables?.number||'?'} · ${r.restaurant_tables?.section||''}` : `Room ${r.rooms?.number||'?'} · ${r.rooms?.type||''}`}
                    {r.guest_phone && ` · 📱 ${r.guest_phone}`}
                  </div>
                  <div className="res-dates">{fmtDate(r.date_from)}{r.date_to ? ` → ${fmtDate(r.date_to)}` : ''}</div>
                  {r.notes && <div className="res-notes">💬 {r.notes}</div>}
                </div>
              </div>
              <div className="res-card-right">
                <span className={`inv-status-pill ${STATUS_COLOR[r.status]}`} style={{marginBottom:8}}>{r.status.replace('_',' ')}</span>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end'}}>
                  {STATUSES.filter(s=>s!==r.status).slice(0,3).map(s=>(
                    <button key={s} className="rm-status-btn" onClick={()=>updateStatus(r,s)}>{s.replace('_',' ')}</button>
                  ))}
                  <button className="mn-act-btn edit" onClick={()=>openEdit(r)}>✏️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="mn-overlay" onClick={()=>setModal(null)}>
          <div className="mn-modal mn-modal-lg" onClick={e=>e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">{modal==='add'?'＋ New Reservation':'✏️ Edit Reservation'}</div>
              <button className="mn-modal-close" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <div className="mn-modal-grid">
                <div>
                  <div className="mn-field">
                    <label>Guest Name *</label>
                    <input className="mn-input" placeholder="Full name" value={form.guest_name} onChange={e=>setForm(f=>({...f,guest_name:e.target.value}))} autoFocus />
                  </div>
                  <div className="mn-field-row">
                    <div className="mn-field">
                      <label>Phone</label>
                      <input className="mn-input" placeholder="+94 77..." value={form.guest_phone} onChange={e=>setForm(f=>({...f,guest_phone:e.target.value}))} />
                    </div>
                    <div className="mn-field">
                      <label>Guests</label>
                      <input className="mn-input" type="number" min="1" value={form.guest_count} onChange={e=>setForm(f=>({...f,guest_count:e.target.value}))} />
                    </div>
                  </div>
                  <div className="mn-field-row">
                    <div className="mn-field">
                      <label>Date & Time *</label>
                      <input className="mn-input" type="datetime-local" value={form.date_from} onChange={e=>setForm(f=>({...f,date_from:e.target.value}))} />
                    </div>
                    <div className="mn-field">
                      <label>Check-out (rooms)</label>
                      <input className="mn-input" type="datetime-local" value={form.date_to} onChange={e=>setForm(f=>({...f,date_to:e.target.value}))} />
                    </div>
                  </div>
                  <div className="mn-field">
                    <label>Notes</label>
                    <textarea className="mn-input mn-textarea" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Special requests..." />
                  </div>
                </div>
                <div>
                  <div className="mn-field">
                    <label>Type</label>
                    <div style={{display:'flex',gap:8}}>
                      {['table','room'].map(t=>(
                        <button key={t} onClick={()=>setForm(f=>({...f,type:t}))}
                          className={`rm-amenity-btn ${form.type===t?'selected':''}`} style={{flex:1,textAlign:'center'}}>
                          {t==='table'?'🍽️ Table':'🛏️ Room'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.type === 'table' && (
                    <div className="mn-field">
                      <label>Table</label>
                      <select className="mn-input" value={form.table_id} onChange={e=>setForm(f=>({...f,table_id:e.target.value}))}>
                        <option value="">Select table</option>
                        {tables.map(t=><option key={t.id} value={t.id}>Table {t.number} · {t.section}</option>)}
                      </select>
                    </div>
                  )}
                  {form.type === 'room' && (
                    <div className="mn-field">
                      <label>Room</label>
                      <select className="mn-input" value={form.room_id} onChange={e=>setForm(f=>({...f,room_id:e.target.value}))}>
                        <option value="">Select room</option>
                        {rooms.map(r=><option key={r.id} value={r.id}>Room {r.number} · {r.type}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="mn-field">
                    <label>Status</label>
                    <select className="mn-input" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                      {STATUSES.map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={()=>setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving...':modal==='add'?'Add Reservation':'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
