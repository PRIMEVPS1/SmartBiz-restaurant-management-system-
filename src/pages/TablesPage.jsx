// src/pages/TablesPage.jsx
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { localGetAll, offlineWrite } from '../lib/offlineDB'
import { useStore } from '../store/useStore'
import { isOnline } from '../lib/supabase'
import toast from 'react-hot-toast'
import './TablesPage.css'

const STATUS = ['all','available','occupied','reserved','cleaning']
const STATUS_LABEL = { available:'Available', occupied:'Occupied', reserved:'Reserved', cleaning:'Cleaning' }

export default function TablesPage() {
  const navigate = useNavigate()
  const { tenant, staff } = useStore()
  const [tables,  setTables]  = useState([])
  const [filter,  setFilter]  = useState('all')
  const [loading, setLoading] = useState(true)
  const [qrModal, setQrModal] = useState(null)

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

  async function generateQR(table) {
    const token = `${tenant.slug}-${table.id.slice(0,8)}`
    const url   = `${window.location.origin}/menu/${token}`
    setQrModal({ table, url, token })
    // Save QR token
    if (isOnline()) {
      await supabase.from('restaurant_tables').update({ qr_code: token }).eq('id', table.id)
    }
  }

  const filtered = filter === 'all' ? tables : tables.filter(t => t.status === filter)
  const counts   = STATUS.slice(1).reduce((acc,s)=>({...acc,[s]:tables.filter(t=>t.status===s).length}),{})

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Tables & QR <small>Floor Plan</small></div>
        <button className="btn btn-primary" onClick={()=>navigate('/reservations')}>📅 Reserve</button>
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
            ? <div className="empty-state" style={{padding:'80px'}}>No tables found. Add tables in Settings.</div>
            : <div className="table-grid">
                {filtered.map(t => (
                  <TableCard key={t.id} table={t} onOpen={openTable} onQR={generateQR} />
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
                {/* QR visual placeholder — in production use a QR library */}
                <div className="qr-box">
                  <div style={{fontSize:'64px'}}>⬛</div>
                  <div style={{fontSize:'11px',color:'var(--t2)',marginTop:'8px'}}>QR Code</div>
                </div>
              </div>
              <div style={{marginTop:'16px',padding:'12px',background:'var(--s2)',borderRadius:'var(--rs)',fontSize:'12px',color:'var(--t2)',wordBreak:'break-all'}}>
                {qrModal.url}
              </div>
              <div style={{display:'flex',gap:'8px',marginTop:'14px'}}>
                <button className="btn" style={{flex:1}} onClick={()=>{navigator.clipboard.writeText(qrModal.url);toast.success('URL Copied!')}}>📋 Copy URL</button>
                <button className="btn btn-primary" style={{flex:1}} onClick={()=>window.print()}>🖨️ Print QR</button>
              </div>
              <div style={{marginTop:'12px',fontSize:'12px',color:'var(--t2)'}}>
                Customer scans → opens menu → orders directly → Kitchen & Cashier notified automatically
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TableCard({ table, onOpen, onQR }) {
  return (
    <div className={`table-card tc-${table.status}`} onClick={() => onOpen(table)}>
      <div className="tc-qr" onClick={e=>{e.stopPropagation(); onQR(table)}} title="Generate QR">⬛</div>
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
