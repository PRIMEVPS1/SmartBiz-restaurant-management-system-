// src/pages/KitchenPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { localGetAll, localPut } from '../lib/offlineDB'
import { useStore } from '../store/useStore'
import { isOnline } from '../lib/supabase'
import toast from 'react-hot-toast'
import './KitchenPage.css'

const ITEM_STATUS = ['pending','preparing','ready']

export default function KitchenPage() {
  const { tenant } = useStore()
  const [tickets, setTickets] = useState([])
  const [filter,  setFilter]  = useState('active') // active | ready | all
  const [loading, setLoading] = useState(true)
  const [tick,    setTick]    = useState(0)

  // Clock tick for time display
  useEffect(() => {
    const t = setInterval(() => setTick(x=>x+1), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { loadTickets() }, [tenant?.id])

    // Realtime (all handlers must be added BEFORE subscribe())
  useEffect(() => {
    if (!tenant) return
    const sub = supabase.channel('kds-realtime')
      .on('postgres_changes', { event:'*', schema:'public', table:'orders', filter:`tenant_id=eq.${tenant.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          playBeep()
          toast('🔔 New order received!', { icon:'🍽️' })
        }
        loadTickets()
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'order_items', filter:`tenant_id=eq.${tenant.id}` }, () => loadTickets())
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [tenant?.id]) => loadTickets())
      .subscribe()

    // Play sound on new order
    sub.on('postgres_changes', { event:'INSERT', schema:'public', table:'orders' }, () => {
      playBeep()
      toast('🔔 New order received!', { icon:'🍽️' })
    })
    return () => supabase.removeChannel(sub)
  }, [tenant?.id])

  async function loadTickets() {
    try {
      if (isOnline() && tenant) {
        const { data: orders } = await supabase
          .from('orders')
          .select('*, order_items(*), restaurant_tables(number)')
          .eq('tenant_id', tenant.id)
          .in('status', ['pending','confirmed','preparing','ready'])
          .order('created_at', { ascending: true })
        setTickets(orders || [])
      } else {
        const orders = await localGetAll('orders')
        const items  = await localGetAll('order_items')
        const tables = await localGetAll('restaurant_tables')
        const active = orders
          .filter(o => ['pending','confirmed','preparing','ready'].includes(o.status))
          .map(o => ({
            ...o,
            order_items: items.filter(i => i.order_id === o.id),
            restaurant_tables: tables.find(t => t.id === o.table_id)
          }))
          .sort((a,b) => new Date(a.created_at) - new Date(b.created_at))
        setTickets(active)
      }
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function updateOrderStatus(order, status) {
    try {
      const updated = { ...order, status, updated_at: new Date().toISOString() }
      await localPut('orders', updated)
      if (isOnline()) {
        await supabase.from('orders').update({ status }).eq('id', order.id)
      }
      setTickets(prev => prev.map(t => t.id === order.id ? { ...t, status } : t))
      toast.success(`Order ${order.order_number} → ${status}`)
    } catch(e) { toast.error('Update failed') }
  }

  async function updateItemStatus(item, status) {
    try {
      const updated = { ...item, status }
      await localPut('order_items', updated)
      if (isOnline()) {
        await supabase.from('order_items').update({ status }).eq('id', item.id)
      }
      setTickets(prev => prev.map(t => ({
        ...t,
        order_items: t.order_items?.map(i => i.id === item.id ? { ...i, status } : i)
      })))
    } catch(e) { toast.error('Update failed') }
  }

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      osc.connect(ctx.destination)
      osc.frequency.value = 800
      osc.start(); osc.stop(ctx.currentTime + 0.2)
    } catch(e) {}
  }

  const filtered = filter === 'active'
    ? tickets.filter(t => ['pending','confirmed','preparing'].includes(t.status))
    : filter === 'ready'
      ? tickets.filter(t => t.status === 'ready')
      : tickets

  const urgency = (t) => {
    const mins = Math.floor((Date.now() - new Date(t.created_at)) / 60000)
    if (mins >= 20) return 'urgent'
    if (mins >= 10) return 'mid'
    return 'new'
  }
  const elapsed = (ts) => {
    const m = Math.floor((Date.now()-new Date(ts))/60000)
    return m < 1 ? 'just now' : `${m}m`
  }

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Kitchen Display <small>Live KDS</small></div>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          <span className="live-badge">● LIVE</span>
          <span style={{fontSize:'12px',color:'var(--t2)'}}>{filtered.length} ticket{filtered.length!==1?'s':''}</span>
        </div>
      </div>

      <div className="kds-body">
        <div className="kds-filters">
          {[
            {k:'active', l:`Active (${tickets.filter(t=>['pending','confirmed','preparing'].includes(t.status)).length})`},
            {k:'ready',  l:`Ready (${tickets.filter(t=>t.status==='ready').length})`},
            {k:'all',    l:`All (${tickets.length})`},
          ].map(f=>(
            <button key={f.k} className={`kf-btn ${filter===f.k?'active':''}`} onClick={()=>setFilter(f.k)}>{f.l}</button>
          ))}
          <button className="btn" style={{marginLeft:'auto',fontSize:'12px',padding:'7px 14px'}} onClick={loadTickets}>🔄 Refresh</button>
        </div>

        {loading
          ? <div className="empty-state" style={{padding:'80px'}}>Loading tickets...</div>
          : filtered.length === 0
            ? <div className="kds-empty">
                <div style={{fontSize:'64px',marginBottom:'16px'}}>🍳</div>
                <div style={{fontFamily:'Syne,sans-serif',fontWeight:'700',fontSize:'20px',marginBottom:'8px'}}>
                  {filter==='ready' ? 'No ready orders' : 'Kitchen is clear!'}
                </div>
                <div style={{color:'var(--t2)'}}>New orders will appear here automatically</div>
              </div>
            : <div className="kds-grid">
                {filtered.map(ticket => (
                  <KDSTicket
                    key={ticket.id}
                    ticket={ticket}
                    urgency={urgency(ticket)}
                    elapsed={elapsed(ticket.created_at)}
                    onStatus={updateOrderStatus}
                    onItemStatus={updateItemStatus}
                  />
                ))}
              </div>
        }
      </div>
    </div>
  )
}

function KDSTicket({ ticket, urgency, elapsed, onStatus, onItemStatus }) {
  const tableNum = ticket.restaurant_tables?.number || (ticket.room_id ? 'Room' : 'Takeaway')
  const allReady = ticket.order_items?.every(i => i.status === 'ready')

  return (
    <div className={`kds-card kds-${urgency}`}>
      <div className="kds-head">
        <div className="kds-table">{tableNum}</div>
        <div className="kds-meta">
          <span className={`kds-time kt-${urgency}`}>{elapsed}</span>
          <span className={`pill ${
            ticket.status==='pending'?'pill-pending':
            ticket.status==='preparing'?'pill-preparing':'pill-ready'
          }`}>{ticket.status}</span>
        </div>
      </div>

      <div className="kds-num">{ticket.order_number}</div>

      <div className="kds-items">
        {(ticket.order_items || []).map(item => (
          <div key={item.id} className={`kds-item ki-${item.status}`}>
            <div className="ki-qty">{item.quantity}</div>
            <div className="ki-info">
              <div className="ki-name">{item.name}</div>
              {item.notes && <div className="ki-note">⚠ {item.notes}</div>}
            </div>
            <button
              className={`ki-check ${item.status==='ready'?'done':''}`}
              onClick={() => onItemStatus(item, item.status==='ready'?'preparing':'ready')}
            >
              {item.status === 'ready' ? '✓' : '○'}
            </button>
          </div>
        ))}
      </div>

      <div className="kds-foot">
        {ticket.status === 'pending' && (
          <button className="kds-btn kb-start" onClick={() => onStatus(ticket, 'preparing')}>
            ▶ Start Cooking
          </button>
        )}
        {ticket.status === 'preparing' && (
          <>
            <button className="kds-btn kb-bump" onClick={() => onStatus(ticket, 'pending')}>← Back</button>
            <button className="kds-btn kb-done" onClick={() => onStatus(ticket, 'ready')} disabled={!allReady}>
              ✓ Ready to Serve
            </button>
          </>
        )}
        {ticket.status === 'ready' && (
          <button className="kds-btn kb-served" onClick={() => onStatus(ticket, 'served')}>
            🛎 Mark as Served
          </button>
        )}
      </div>
    </div>
  )
}
