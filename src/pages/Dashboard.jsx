// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { localGetAll } from '../lib/offlineDB'
import { useStore } from '../store/useStore'
import { isOnline } from '../lib/supabase'
import './Dashboard.css'

const STATUS_COLOR = {
  pending:'pill-pending', preparing:'pill-preparing', ready:'pill-ready',
  served:'pill-served', billed:'pill-billed', cancelled:'pill-cancelled'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { tenant } = useStore()
  const [stats,    setStats]    = useState({ revenue:0, orders:0, rooms:'–', customers:0 })
  const [orders,   setOrders]   = useState([])
  const [week,     setWeek]     = useState([])
  const [lowStock, setLowStock] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => { loadData() }, [tenant?.id])

  async function loadData() {
    setLoading(true)
    try {
      if (isOnline() && tenant) await loadOnline()
      else await loadOffline()
    } catch(e) { await loadOffline() }
    finally { setLoading(false) }
  }

  async function loadOnline() {
    const today = new Date(); today.setHours(0,0,0,0)
    const [ordRes, roomRes, custRes, invRes] = await Promise.all([
      supabase.from('orders').select('*').eq('tenant_id', tenant.id).gte('created_at', today.toISOString()).order('created_at',{ascending:false}),
      supabase.from('rooms').select('status').eq('tenant_id', tenant.id),
      supabase.from('customers').select('id',{count:'exact'}).eq('tenant_id', tenant.id),
      supabase.from('inventory_items').select('name,quantity,min_quantity,unit').eq('tenant_id', tenant.id).gt('min_quantity', 0),
    ])
    const tod = ordRes.data || []
    const revenue = tod.filter(o=>o.status!=='cancelled').reduce((s,o)=>s+(o.total||0),0)
    const rooms   = roomRes.data || []
    setStats({ revenue, orders:tod.length, rooms:`${rooms.filter(r=>r.status==='occupied').length}/${rooms.length}`, customers:custRes.count||0 })
    setOrders(tod.slice(0,8))
    setLowStock((invRes.data||[]).filter(i=>i.quantity<=i.min_quantity))

    // 7-day chart
    const days = []
    for (let i=6;i>=0;i--) {
      const d = new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0)
      const e = new Date(d); e.setHours(23,59,59,999)
      const {data} = await supabase.from('orders').select('total').eq('tenant_id',tenant.id).gte('created_at',d.toISOString()).lte('created_at',e.toISOString()).neq('status','cancelled')
      days.push({ label:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()], total:(data||[]).reduce((s,o)=>s+(o.total||0),0) })
    }
    setWeek(days)
  }

  async function loadOffline() {
    const all = await localGetAll('orders')
    const today = new Date(); today.setHours(0,0,0,0)
    const tod = all.filter(o=>new Date(o.created_at)>=today)
    setStats({ revenue:tod.filter(o=>o.status!=='cancelled').reduce((s,o)=>s+(o.total||0),0), orders:tod.length, rooms:'–', customers:'–' })
    setOrders(tod.slice(0,8))
  }

  const maxW = Math.max(...week.map(d=>d.total),1)
  const fmt  = n => n>=1000 ? `Rs.${(n/1000).toFixed(0)}K` : `Rs.${n}`

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Dashboard <small>Today's Overview</small></div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="btn" onClick={loadData}>🔄</button>
          <button className="btn btn-primary" onClick={()=>navigate('/tables')}>＋ New Order</button>
        </div>
      </div>

      <div className="dash-body">

        {/* Low stock alert */}
        {lowStock.length > 0 && (
          <div className="inv-alert" style={{margin:'0 0 16px',cursor:'pointer'}} onClick={()=>navigate('/inventory')}>
            ⚠️ <strong>{lowStock.length} inventory item{lowStock.length>1?'s':''}</strong> running low:
            {lowStock.slice(0,3).map(i=>` ${i.name} (${i.quantity}${i.unit})`).join(',')}
            {lowStock.length>3 && ` +${lowStock.length-3} more`} — click to view
          </div>
        )}

        {/* Stats */}
        <div className="stats-grid">
          {[
            {icon:'💰',color:'amber',  label:"Today's Revenue",  val:`Rs. ${stats.revenue.toLocaleString()}`},
            {icon:'🍽️',color:'green',  label:'Orders Today',     val:stats.orders},
            {icon:'🛏️',color:'blue',   label:'Rooms Occupied',   val:stats.rooms},
            {icon:'👥',color:'purple', label:'Total Customers',  val:stats.customers},
          ].map((s,i)=>(
            <div key={i} className={`stat-card sc-${s.color}`}>
              <div className={`sc-icon sc-${s.color}-bg`}>{s.icon}</div>
              <div className="sc-val">{s.val}</div>
              <div className="sc-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Quick status */}
        <div className="quick-row">
          {[
            {e:'🟢',v:orders.filter(o=>['pending','preparing','ready'].includes(o.status)).length,l:'Active',path:'/orders'},
            {e:'🟡',v:orders.filter(o=>o.status==='preparing').length,l:'Cooking',path:'/kitchen'},
            {e:'🔵',v:orders.filter(o=>o.status==='ready').length,l:'Ready',path:'/kitchen'},
            {e:'🟠',v:orders.filter(o=>o.status==='pending').length,l:'Waiting',path:'/orders'},
            {e:'✅',v:orders.filter(o=>o.status==='billed').length,l:'Billed Today',path:'/reports'},
          ].map((q,i)=>(
            <div key={i} className="qs-item" style={{cursor:'pointer'}} onClick={()=>navigate(q.path)}>
              <span style={{fontSize:'20px'}}>{q.e}</span>
              <div><div className="qs-val">{q.v}</div><div className="qs-lbl">{q.l}</div></div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="quick-actions">
          {[
            {icon:'🍽️',label:'Tables',    path:'/tables'},
            {icon:'📋',label:'Orders',    path:'/orders'},
            {icon:'👨‍🍳',label:'Kitchen',  path:'/kitchen'},
            {icon:'💵',label:'POS',       path:'/pos'},
            {icon:'🛏️',label:'Rooms',     path:'/rooms'},
            {icon:'📅',label:'Reservations',path:'/reservations'},
            {icon:'📦',label:'Inventory', path:'/inventory'},
            {icon:'📈',label:'Reports',   path:'/reports'},
          ].map(a=>(
            <button key={a.path} className="qa-btn" onClick={()=>navigate(a.path)}>
              <span className="qa-icon">{a.icon}</span>
              <span className="qa-label">{a.label}</span>
            </button>
          ))}
        </div>

        <div className="db-grid">
          {/* Recent Orders */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">📋 Recent Orders</div>
              <span className="link" onClick={()=>navigate('/orders')}>View all →</span>
            </div>
            {loading ? <div className="empty-state">Loading...</div> : (
              <table className="data-table">
                <thead><tr><th>Order</th><th>Amount</th><th>Status</th><th>Time</th></tr></thead>
                <tbody>
                  {orders.length===0
                    ? <tr><td colSpan={4}><div className="empty-state">No orders today yet 🍽️</div></td></tr>
                    : orders.map(o=>(
                        <tr key={o.id} onClick={()=>navigate(`/orders/${o.id}`)} style={{cursor:'pointer'}}>
                          <td><strong>{o.order_number}</strong></td>
                          <td>Rs. {(o.total||0).toLocaleString()}</td>
                          <td><span className={`pill ${STATUS_COLOR[o.status]||''}`}>{o.status}</span></td>
                          <td style={{color:'var(--t2)',fontSize:'12px'}}>{timeAgo(o.created_at)}</td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            )}
          </div>

          {/* Weekly chart */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">📊 This Week</div>
              <span style={{fontSize:'12px',color:'var(--accent)',fontWeight:'600'}}>
                {fmt(week.reduce((s,d)=>s+d.total,0))}
              </span>
            </div>
            <div className="card-body">
              <div className="bar-chart">
                {week.length===0
                  ? <div className="empty-state">Loading...</div>
                  : week.map((d,i)=>(
                      <div key={i} className="bc-col">
                        <div className="bc-amt">{d.total>0?fmt(d.total):''}</div>
                        <div className="bc-track">
                          <div className={`bc-fill ${i===6?'today':''}`} style={{height:`${Math.max((d.total/maxW)*100,3)}%`}}/>
                        </div>
                        <div className="bc-day">{d.label}</div>
                      </div>
                    ))
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function timeAgo(ts) {
  const mins = Math.floor((Date.now()-new Date(ts))/60000)
  if (mins<1) return 'just now'
  if (mins<60) return `${mins}m ago`
  return `${Math.floor(mins/60)}h ago`
}
