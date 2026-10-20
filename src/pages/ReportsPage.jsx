// src/pages/ReportsPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import './ReportsPage.css'

const RANGES = [
  { id:'7d',  label:'7 Days',  days:7 },
  { id:'30d', label:'30 Days', days:30 },
  { id:'90d', label:'90 Days', days:90 },
]
const COLORS = ['#29b6f6','#10b981','#60a5fa','#a78bfa','#fb923c','#f43f5e']

export default function ReportsPage() {
  const { tenant } = useStore()
  const [range,   setRange]   = useState('7d')
  const [loading, setLoading] = useState(true)
  const [bills,   setBills]   = useState([])
  const [items,   setItems]   = useState([])
  const [orders,  setOrders]  = useState([])

  useEffect(() => { if (tenant?.id) load() }, [tenant?.id, range])

  async function load() {
    setLoading(true)
    try {
      const days = RANGES.find(r=>r.id===range).days
      const since = new Date(Date.now() - days*24*60*60*1000).toISOString()

      const [billRes, itemRes, orderRes] = await Promise.all([
        supabase.from('bills').select('*').eq('tenant_id', tenant.id).gte('created_at', since).eq('payment_status','paid'),
        supabase.from('order_items').select('*, menu_items(name,category_id)').eq('tenant_id', tenant.id).gte('created_at', since),
        supabase.from('orders').select('*').eq('tenant_id', tenant.id).gte('created_at', since),
      ])
      setBills(billRes.data || [])
      setItems(itemRes.data || [])
      setOrders(orderRes.data || [])
    } catch(e) { toast.error(e.message) }
    finally    { setLoading(false) }
  }

  // ── Revenue by day ──
  const revenueByDay = {}
  bills.forEach(b => {
    const day = new Date(b.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})
    revenueByDay[day] = (revenueByDay[day]||0) + Number(b.total)
  })
  const revenueData = Object.entries(revenueByDay).map(([date,total]) => ({ date, total }))

  // ── Top items ──
  const itemCounts = {}
  items.forEach(i => {
    const name = i.name
    itemCounts[name] = (itemCounts[name]||0) + i.quantity
  })
  const topItems = Object.entries(itemCounts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,qty])=>({name,qty}))

  // ── Order type breakdown ──
  const typeCounts = {}
  orders.forEach(o => { typeCounts[o.type] = (typeCounts[o.type]||0) + 1 })
  const typeData = Object.entries(typeCounts).map(([name,value])=>({name,value}))

  // ── Payment method ──
  const payCounts = {}
  bills.forEach(b => { payCounts[b.payment_method] = (payCounts[b.payment_method]||0) + Number(b.total) })
  const payData = Object.entries(payCounts).map(([name,value])=>({name,value}))

  // ── Stats ──
  const totalRevenue = bills.reduce((s,b)=>s+Number(b.total),0)
  const totalOrders   = orders.length
  const avgOrder      = totalOrders > 0 ? totalRevenue/bills.length : 0
  const completedOrders = orders.filter(o=>o.status==='billed').length

  function exportCSV() {
    const rows = [['Date','Bill Number','Subtotal','Service Charge','Tax','Discount','Total','Payment Method']]
    bills.forEach(b => rows.push([
      new Date(b.created_at).toLocaleDateString(), b.bill_number, b.subtotal, b.service_charge, b.tax, b.discount, b.total, b.payment_method
    ]))
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `smartbiz-report-${range}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported!')
  }

  const tooltipStyle = { background:'#151a24', border:'1px solid rgba(255,255,255,0.11)', borderRadius:8, fontSize:12, color:'#f0f4ff' }

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Reports & Analytics</div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn" onClick={load} disabled={loading}>🔄</button>
          <button className="btn" onClick={exportCSV}>⬇️ Export CSV</button>
        </div>
      </div>

      <div className="rep-range-row">
        {RANGES.map(r => (
          <button key={r.id} className={`pill ${range===r.id?'active':''}`} onClick={()=>setRange(r.id)}>{r.label}</button>
        ))}
      </div>

      <div className="rep-body">
        {/* Stats */}
        <div className="mn-stats" style={{padding:0,marginBottom:20}}>
          <div className="mn-stat green"><span className="mn-stat-val">Rs.{totalRevenue>=1000?(totalRevenue/1000).toFixed(1)+'K':totalRevenue.toFixed(0)}</span><span className="mn-stat-lbl">Total Revenue</span></div>
          <div className="mn-stat blue"><span className="mn-stat-val">{totalOrders}</span><span className="mn-stat-lbl">Total Orders</span></div>
          <div className="mn-stat amber"><span className="mn-stat-val">Rs.{avgOrder.toFixed(0)}</span><span className="mn-stat-lbl">Avg Order Value</span></div>
          <div className="mn-stat"><span className="mn-stat-val">{completedOrders}</span><span className="mn-stat-lbl">Completed</span></div>
        </div>

        {loading ? (
          <div className="mn-loading">Loading reports...</div>
        ) : (
          <div className="rep-grid">
            {/* Revenue trend */}
            <div className="card rep-chart-card span-2">
              <div className="card-head"><div className="card-title">📈 Revenue Trend</div></div>
              <div className="card-body" style={{height:260}}>
                {revenueData.length === 0 ? <div className="mn-empty-sub" style={{textAlign:'center',paddingTop:80}}>No revenue data yet</div> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="date" stroke="#4a5568" fontSize={11} />
                      <YAxis stroke="#4a5568" fontSize={11} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="total" stroke="#29b6f6" strokeWidth={2} dot={{ fill:'#29b6f6', r:3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Top items */}
            <div className="card rep-chart-card">
              <div className="card-head"><div className="card-title">🍜 Top Selling Items</div></div>
              <div className="card-body" style={{height:260}}>
                {topItems.length === 0 ? <div className="mn-empty-sub" style={{textAlign:'center',paddingTop:80}}>No item data yet</div> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topItems} layout="vertical" margin={{left:10}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis type="number" stroke="#4a5568" fontSize={11} />
                      <YAxis type="category" dataKey="name" stroke="#4a5568" fontSize={10} width={90} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="qty" fill="#10b981" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Order types */}
            <div className="card rep-chart-card">
              <div className="card-head"><div className="card-title">📋 Order Types</div></div>
              <div className="card-body" style={{height:260}}>
                {typeData.length === 0 ? <div className="mn-empty-sub" style={{textAlign:'center',paddingTop:80}}>No order data yet</div> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,value})=>`${name}: ${value}`}>
                        {typeData.map((e,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Payment methods */}
            <div className="card rep-chart-card span-2">
              <div className="card-head"><div className="card-title">💳 Payment Methods</div></div>
              <div className="card-body" style={{height:240}}>
                {payData.length === 0 ? <div className="mn-empty-sub" style={{textAlign:'center',paddingTop:80}}>No payment data yet</div> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={payData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="name" stroke="#4a5568" fontSize={11} />
                      <YAxis stroke="#4a5568" fontSize={11} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v)=>`Rs. ${v.toLocaleString()}`} />
                      <Bar dataKey="value" fill="#60a5fa" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
