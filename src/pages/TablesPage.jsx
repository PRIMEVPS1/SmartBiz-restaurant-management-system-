// src/pages/TablesPage.jsx
import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { localGetAll, offlineWrite } from '../lib/offlineDB'
import { useStore } from '../store/useStore'
import { isOnline } from '../lib/supabase'
import toast from 'react-hot-toast'
import './TablesPage.css'
import './QRSheet.css'

const STATUS = ['all','available','occupied','reserved','cleaning']
const STATUS_LABEL = { available:'Available', occupied:'Occupied', reserved:'Reserved', cleaning:'Cleaning' }

export default function TablesPage() {
  const navigate = useNavigate()
  const { tenant, staff } = useStore()
  const [tables,  setTables]  = useState([])
  const [filter,  setFilter]  = useState('all')
  const [loading, setLoading] = useState(true)
  const [qrModal, setQrModal] = useState(null)
  const [sheet,   setSheet]   = useState(null)    // tables to print as QR cards
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ number: '', capacity: 4, section: 'main', bulk: 0 })
  const [adding,  setAdding]  = useState(false)
  const [editT,   setEditT]   = useState(null)   // { id, number, capacity, section, status }
  const [saving,  setSaving]  = useState(false)

  useEffect(() => { loadTables() }, [tenant?.id])

  // Realtime subscription
  useEffect(() => {
    if (!tenant) return
    const sub = supabase.channel('tables-realtime')
      .on('postgres_changes', { event:'*', schema:'public', table:'restaurant_tables', filter:`tenant_id=eq.${tenant.id}` },
        () => loadTables())
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [tenant?.id])

  async function loadTables() {
    setLoading(true)
    try {
      if (isOnline() && tenant) {
        const { data, error } = await supabase.from('restaurant_tables').select('*').eq('tenant_id', tenant.id).order('number')
        if (error) throw error
        setTables(data || [])
      } else {
        const data = await localGetAll('restaurant_tables')
        setTables(data.sort((a,b)=>a.number.localeCompare(b.number)))
      }
    } catch(e) {
      const data = await localGetAll('restaurant_tables')
      setTables(data)
    } finally {
      setLoading(false)
    }
  }

  async function openTable(table) {
    if (table.status === 'cleaning') { toast.error('Table is being cleaned'); return }
    if (table.status === 'available') {
      // Create new order
      await createOrder(table)
    } else {
      // View existing order
      navigate(`/orders?table=${table.id}`)
    }
  }

  async function createOrder(table) {
    if (!tenant || !staff) return
    const order = {
      id: crypto.randomUUID(),
      tenant_id: tenant.id,
      order_number: '',
      type: 'dine_in',
      table_id: table.id,
      waiter_id: staff.id,
      status: 'pending',
      guest_count: 1,
      subtotal: 0, service_charge: 0, tax: 0, discount: 0, total: 0,
      synced: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    try {
      await offlineWrite('orders', 'INSERT', order, 'orders')
      // Update table status
      const updTable = { ...table, status: 'occupied', updated_at: new Date().toISOString() }
      await offlineWrite('restaurant_tables', 'UPDATE', updTable, 'restaurant_tables')
      toast.success(`Order created for ${table.number}`)
      navigate(`/pos/${order.id}`)
    } catch(e) {
      toast.error('Failed to create order')
    }
  }

  const tokenFor = t => t.qr_code || `${tenant.slug}-${t.id.slice(0, 8)}`
  const urlFor   = tok => `${window.location.origin}/menu/${tok}`
  const qrImg    = url => `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=0&data=${encodeURIComponent(url)}`

  // make sure the table's QR token is saved in the database (required for the public menu)
  async function ensureToken(t) {
    const token = tokenFor(t)
    if (t.qr_code !== token) {
      const { error } = await supabase.from('restaurant_tables').update({ qr_code: token }).eq('id', t.id)
      if (error) throw error
      setTables(ts => ts.map(x => x.id === t.id ? { ...x, qr_code: token } : x))
    }
    return token
  }

  async function generateQR(table) {
    try {
      const token = await ensureToken(table)
      setQrModal({ table, url: urlFor(token), token })
    } catch (e) { toast.error('Could not save QR (check internet): ' + (e.message || '')) }
  }

  function printSheet(list) {
    setSheet(list)
    setTimeout(() => { window.print(); setSheet(null) }, 1200)   // wait for QR images to load
  }

  async function printOne(table) {
    try { await ensureToken(table); printSheet([{ ...table, qr_code: tokenFor(table) }]) }
    catch (e) { toast.error(e.message || 'Failed') }
  }

  async function printAll() {
    if (!tables.length) return toast.error('Add tables first')
    try {
      const list = []
      for (const t of tables) { await ensureToken(t); list.push({ ...t, qr_code: tokenFor(t) }) }
      printSheet(list)
    } catch (e) { toast.error(e.message || 'Failed') }
  }

  async function addTables(e) {
    e.preventDefault()
    const bulk = Number(addForm.bulk) || 0
    let rows = []
    if (bulk > 0) {
      const start = tables.length
      for (let i = 1; i <= Math.min(bulk, 100); i++) rows.push({ number: `T${start + i}` })
    } else {
      if (!addForm.number.trim()) return toast.error('Table name/number required')
      rows.push({ number: addForm.number.trim() })
    }
    setAdding(true)
    const payload = rows.map(r => ({
      tenant_id: tenant.id, number: r.number, capacity: Number(addForm.capacity) || 4,
      section: addForm.section, status: 'available',
    }))
    const { error } = await supabase.from('restaurant_tables').insert(payload)
    setAdding(false)
    if (error) return toast.error(error.message)
    toast.success(`${payload.length} table(s) added`)
    setAddOpen(false); setAddForm({ number: '', capacity: 4, section: 'main', bulk: 0 })
    loadTables()
  }

  async function saveEdit(e) {
    e.preventDefault()
    const number = editT.number.trim()
    if (!number) return toast.error('Table name/number required')
    setSaving(true)
    const { error } = await supabase.from('restaurant_tables').update({
      number, capacity: Number(editT.capacity) || 4, section: editT.section, status: editT.status,
    }).eq('id', editT.id)
    setSaving(false)
    if (error) return toast.error(/duplicate|unique/i.test(error.message) ? `Table "${number}" already exists` : error.message)
    toast.success('Table updated')
    setEditT(null); setQrModal(null); loadTables()
  }

  async function deleteTable(table) {
    if (table.status !== 'available') return toast.error('Only an available table can be deleted')
    if (!window.confirm(`Delete table ${table.number}?`)) return
    const { error } = await supabase.from('restaurant_tables').delete().eq('id', table.id)
    if (error) return toast.error(error.message)
    toast.success('Table deleted'); setQrModal(null); loadTables()
  }

  const filtered = filter === 'all' ? tables : tables.filter(t => t.status === filter)
  const counts   = STATUS.slice(1).reduce((acc,s)=>({...acc,[s]:tables.filter(t=>t.status===s).length}),{})

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Tables & QR <small>Floor Plan</small></div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn" onClick={()=>setAddOpen(true)}>➕ Add table</button>
          <button className="btn" onClick={printAll}>🖨️ Print all QR</button>
          <button className="btn btn-primary" onClick={()=>navigate('/reservations')}>📅 Reserve</button>
        </div>
      </div>

      <div className="tables-body">
        {/* Status summary */}
        <div className="status-row">
          {STATUS.map(s => (
            <button key={s} className={`status-filter ${filter===s?'active':''} sf-${s}`} onClick={()=>setFilter(s)}>
              {s === 'all' ? `All (${tables.length})` : `${STATUS_LABEL[s]} (${counts[s]||0})`}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="legend">
          <span className="legend-item li-available">● Available</span>
          <span className="legend-item li-occupied">● Occupied</span>
          <span className="legend-item li-reserved">● Reserved</span>
          <span className="legend-item li-cleaning">● Cleaning</span>
        </div>

        {loading
          ? <div className="empty-state" style={{padding:'80px'}}>Loading tables...</div>
          : filtered.length === 0
            ? <div className="empty-state" style={{padding:'80px'}}>No tables yet. Tap “➕ Add table” above.</div>
            : <div className="table-grid">
                {filtered.map(t => (
                  <TableCard key={t.id} table={t} onOpen={openTable} onQR={generateQR} onEdit={tb => setEditT({ id: tb.id, number: tb.number, capacity: tb.capacity || 4, section: tb.section || 'main', status: tb.status })} />
                ))}
              </div>
        }
      </div>

      {/* QR Modal */}
      {qrModal && (
        <div className="modal-overlay" onClick={()=>setQrModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">📲 QR Code — {qrModal.table.number}</div>
              <button className="modal-close" onClick={()=>setQrModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{textAlign:'center'}}>
              <div className="qr-display">
                <img className="qr-img" src={qrImg(qrModal.url)} alt="QR" />
              </div>
              <div style={{marginTop:'16px',padding:'12px',background:'var(--s2)',borderRadius:'var(--rs)',fontSize:'12px',color:'var(--t2)',wordBreak:'break-all'}}>
                {qrModal.url}
              </div>
              <div style={{display:'flex',gap:'8px',marginTop:'14px'}}>
                <button className="btn" style={{flex:1}} onClick={()=>{navigator.clipboard.writeText(qrModal.url);toast.success('URL Copied!')}}>📋 Copy URL</button>
                <button className="btn btn-primary" style={{flex:1}} onClick={()=>printOne(qrModal.table)}>🖨️ Print QR</button>
              </div>
              <div style={{display:'flex',gap:'8px',marginTop:10}}>
                <button className="btn" style={{flex:1}} onClick={()=>{ const tb=qrModal.table; setQrModal(null); setEditT({ id: tb.id, number: tb.number, capacity: tb.capacity || 4, section: tb.section || 'main', status: tb.status }) }}>✏️ Edit table</button>
                <button className="btn" style={{flex:1}} onClick={()=>deleteTable(qrModal.table)}>🗑️ Delete</button>
              </div>
              <div style={{marginTop:'12px',fontSize:'12px',color:'var(--t2)'}}>
                Customer scans → opens menu → orders directly → Kitchen & Cashier notified automatically
              </div>
            </div>
          </div>
        </div>
      )}
      {addOpen && (
        <div className="modal-overlay" onClick={()=>setAddOpen(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">➕ Add table</div>
              <button className="modal-close" onClick={()=>setAddOpen(false)}>✕</button>
            </div>
            <form className="modal-body" onSubmit={addTables}>
              <div className="fg"><label className="label">Table name / number</label>
                <input className="input" placeholder="T5" value={addForm.number} onChange={e=>setAddForm(f=>({...f,number:e.target.value}))} /></div>
              <div className="fg"><label className="label">…or add many at once (how many?)</label>
                <input className="input" type="number" min="0" max="100" value={addForm.bulk} onChange={e=>setAddForm(f=>({...f,bulk:e.target.value}))} /></div>
              <div className="fg"><label className="label">Seats</label>
                <input className="input" type="number" min="1" value={addForm.capacity} onChange={e=>setAddForm(f=>({...f,capacity:e.target.value}))} /></div>
              <div className="fg"><label className="label">Section</label>
                <select className="input" value={addForm.section} onChange={e=>setAddForm(f=>({...f,section:e.target.value}))}>
                  <option value="main">Main</option><option value="outdoor">Outdoor</option>
                  <option value="vip">VIP</option><option value="bar">Bar</option>
                </select></div>
              <button className="btn btn-primary" style={{width:'100%',marginTop:8}} disabled={adding}>{adding ? 'Adding...' : 'Add'}</button>
            </form>
          </div>
        </div>
      )}

      {editT && (
        <div className="modal-overlay" onClick={()=>setEditT(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">✏️ Edit table</div>
              <button className="modal-close" onClick={()=>setEditT(null)}>✕</button>
            </div>
            <form className="modal-body" onSubmit={saveEdit}>
              <div className="fg"><label className="label">Table name / number</label>
                <input className="input" value={editT.number} onChange={e=>setEditT(f=>({...f,number:e.target.value}))} autoFocus /></div>
              <div className="fg"><label className="label">Seats</label>
                <input className="input" type="number" min="1" value={editT.capacity} onChange={e=>setEditT(f=>({...f,capacity:e.target.value}))} /></div>
              <div className="fg"><label className="label">Section</label>
                <select className="input" value={editT.section} onChange={e=>setEditT(f=>({...f,section:e.target.value}))}>
                  <option value="main">Main</option><option value="outdoor">Outdoor</option>
                  <option value="vip">VIP</option><option value="bar">Bar</option>
                </select></div>
              <div className="fg"><label className="label">Status</label>
                <select className="input" value={editT.status} onChange={e=>setEditT(f=>({...f,status:e.target.value}))}>
                  {STATUS.slice(1).map(st => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
                </select></div>
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <button type="button" className="btn" style={{flex:1}} onClick={()=>{ const tb = tables.find(x=>x.id===editT.id); if (tb) { setEditT(null); deleteTable(tb) } }}>🗑️ Delete</button>
                <button className="btn btn-primary" style={{flex:2}} disabled={saving}>{saving ? 'Saving...' : '💾 Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sheet && createPortal(
        <div className="qr-sheet">
          {sheet.map(t => (
            <div className="qr-card" key={t.id}>
              {tenant?.logo_url && <img className="logo" src={tenant.logo_url} alt="" />}
              <div className="qr-biz">{tenant?.name}</div>
              <div className="qr-table">Table {t.number}</div>
              <img className="qr" src={qrImg(urlFor(t.qr_code))} alt="QR" />
              <div className="qr-hint">Scan to view menu &amp; order</div>
            </div>
          ))}
        </div>, document.body)}
    </div>
  )
}

function TableCard({ table, onOpen, onQR, onEdit }) {
  return (
    <div className={`table-card tc-${table.status}`} onClick={() => onOpen(table)}>
      <div className="tc-qr" onClick={e=>{e.stopPropagation(); onQR(table)}} title="Generate QR">⬛</div>
      <div className="tc-edit" onClick={e=>{e.stopPropagation(); onEdit(table)}} title="Edit table">✏️</div>
      <div className="tc-num">{table.number}</div>
      <div className={`tc-status ts-${table.status}`}>{STATUS_LABEL[table.status]}</div>
      <div className="tc-cap">👥 {table.capacity} seats</div>
      {table.section && <div className="tc-section">{table.section}</div>}
      {table.status === 'occupied' && (
        <div className="tc-action">Tap to view order</div>
      )}
      {table.status === 'available' && (
        <div className="tc-action" style={{color:'var(--green)'}}>Tap to start order</div>
      )}
    </div>
  )
}
