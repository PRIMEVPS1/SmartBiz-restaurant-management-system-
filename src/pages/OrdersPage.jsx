// src/pages/OrdersPage.jsx
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { localGetAll, localPut } from '../lib/offlineDB'
import { useStore } from '../store/useStore'
import { isOnline } from '../lib/supabase'
import toast from 'react-hot-toast'
import './OrdersPage.css'

const STATUSES = ['all','pending','preparing','ready','served','billed','cancelled']
const STATUS_COLOR = { pending:'pill-pending',preparing:'pill-preparing',ready:'pill-ready',served:'pill-served',billed:'pill-billed',cancelled:'pill-cancelled' }

export default function OrdersPage() {
  const navigate      = useNavigate()
  const [params]      = useSearchParams()
  const { tenant }    = useStore()
  const [orders,  setOrders]  = useState([])
  const [filter,  setFilter]  = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadOrders() }, [tenant?.id, filter])

  async function loadOrders() {
    setLoading(true)
    try {
      if (isOnline() && tenant) {
        let q = supabase.from('orders').select('*, restaurant_tables(number), staff(name)').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(100)
        if (filter !== 'all') q = q.eq('status', filter)
        const { data } = await q
        setOrders(data || [])
      } else {
        const all = await localGetAll('orders')
        setOrders(filter === 'all' ? all : all.filter(o => o.status === filter))
      }
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function updateStatus(order, status) {
    try {
      await localPut('orders', { ...order, status, updated_at: new Date().toISOString() })
      if (isOnline()) await supabase.from('orders').update({ status }).eq('id', order.id)
      setOrders(prev => prev.map(o => o.id===order.id ? { ...o, status } : o))
      toast.success(`Order ${order.order_number} → ${status}`)
    } catch(e) { toast.error('Update failed') }
  }

  const timeAgo = ts => { const m=Math.floor((Date.now()-new Date(ts))/60000); return m<1?'just now':m<60?`${m}m ago`:`${Math.floor(m/60)}h ago` }

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Orders <small>{orders.length} total</small></div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="btn" onClick={loadOrders}>🔄</button>
          <button className="btn btn-primary" onClick={()=>navigate('/tables')}>＋ New</button>
        </div>
      </div>

      <div style={{padding:'20px'}}>
        <div className="order-filters">
          {STATUSES.map(s=>(
            <button key={s} className={`of-btn ${filter===s?'active':''} ${s!=='all'?`of-${s}`:''}`} onClick={()=>setFilter(s)}>
              {s.charAt(0).toUpperCase()+s.slice(1)}
              {s!=='all' && <span className="of-count">{orders.filter(o=>o.status===s).length}</span>}
            </button>
          ))}
        </div>

        {loading
          ? <div className="empty-state" style={{padding:'80px'}}>Loading orders...</div>
          : orders.length === 0
            ? <div className="empty-state" style={{padding:'80px'}}>No {filter!=='all'?filter:''} orders found</div>
            : <div className="card">
                <table className="data-table">
                  <thead><tr><th>Order</th><th>Table/Room</th><th>Waiter</th><th>Total</th><th>Time</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {orders.map(o=>(
                      <tr key={o.id}>
                        <td><strong style={{cursor:'pointer',color:'var(--accent)'}} onClick={()=>navigate(`/pos/${o.id}`)}>{o.order_number||'#–'}</strong></td>
                        <td>{o.restaurant_tables?.number||'–'}</td>
                        <td style={{color:'var(--t2)',fontSize:'13px'}}>{o.staff?.name||'–'}</td>
                        <td>Rs. {(o.total||0).toLocaleString()}</td>
                        <td style={{color:'var(--t2)',fontSize:'12px'}}>{timeAgo(o.created_at)}</td>
                        <td><span className={`pill ${STATUS_COLOR[o.status]||''}`}>{o.status}</span></td>
                        <td>
                          <div style={{display:'flex',gap:'6px'}}>
                            {o.status==='pending'    && <button className="action-btn ab-blue"   onClick={()=>updateStatus(o,'preparing')}>Start</button>}
                            {o.status==='preparing'  && <button className="action-btn ab-green"  onClick={()=>updateStatus(o,'ready')}>Ready</button>}
                            {o.status==='ready'      && <button className="action-btn ab-purple" onClick={()=>updateStatus(o,'served')}>Served</button>}
                            {o.status==='served'     && <button className="action-btn ab-amber"  onClick={()=>navigate(`/pos/${o.id}`)}>Bill</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
        }
      </div>
    </div>
  )
}
