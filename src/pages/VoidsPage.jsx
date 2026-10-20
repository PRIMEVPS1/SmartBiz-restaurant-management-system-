// src/pages/VoidsPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'
import './VoidsPage.css'

export default function VoidsPage() {
  const { tenant, staff } = useStore()
  const [voids,   setVoids]   = useState([])
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState({ order_id:'', type:'item_void', reason:'', amount:'' })
  const [orderItems, setOrderItems] = useState([])
  const [selectedItem, setSelectedItem] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [search,  setSearch]  = useState('')

  useEffect(() => { if (tenant?.id) loadAll() }, [tenant?.id])

  async function loadAll() {
    setLoading(true)
    try {
      const [voidRes, orderRes] = await Promise.all([
        supabase.from('voids')
          .select('*, orders(order_number), order_items(name,price), staff!voids_approved_by_fkey(name), staff!voids_created_by_fkey(name)')
          .eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
        supabase.from('orders').select('id,order_number,status,total').eq('tenant_id', tenant.id)
          .in('status', ['pending','confirmed','preparing','ready','served']).order('created_at', { ascending: false }).limit(50),
      ])
      if (voidRes.error)  throw voidRes.error
      if (orderRes.error) throw orderRes.error
      setVoids(voidRes.data  || [])
      setOrders(orderRes.data || [])
    } catch(e) { toast.error(e.message) }
    finally    { setLoading(false) }
  }

  async function loadOrderItems(orderId) {
    if (!orderId) { setOrderItems([]); return }
    const { data } = await supabase.from('order_items').select('*').eq('order_id', orderId).neq('status','cancelled')
    setOrderItems(data || [])
  }

  async function save() {
    if (!form.order_id)    { toast.error('Select an order'); return }
    if (!form.reason.trim()) { toast.error('Reason is required'); return }
    if (form.type === 'item_void' && !selectedItem) { toast.error('Select an item to void'); return }
    if (form.type === 'refund' && (!form.amount || isNaN(Number(form.amount)))) { toast.error('Enter refund amount'); return }

    const canApprove = ['owner','manager'].includes(staff?.role)
    if (!canApprove) { toast.error('Only managers and owners can approve voids'); return }

    setSaving(true)
    try {
      const voidItem = orderItems.find(i => i.id === selectedItem)

      // Insert void record
      const { error: voidErr } = await supabase.from('voids').insert({
        tenant_id:     tenant.id,
        order_id:      form.order_id,
        order_item_id: form.type === 'item_void' ? selectedItem : null,
        type:          form.type,
        reason:        form.reason.trim(),
        amount:        form.type === 'refund' ? Number(form.amount) : (voidItem?.price || 0),
        approved_by:   staff.id,
        created_by:    staff.id,
      })
      if (voidErr) throw voidErr

      // Update item status if item void
      if (form.type === 'item_void' && selectedItem) {
        await supabase.from('order_items').update({ status: 'cancelled' }).eq('id', selectedItem)
      }

      // Cancel order if order void
      if (form.type === 'order_void') {
        await supabase.from('orders').update({ status: 'cancelled' }).eq('id', form.order_id)
        await supabase.from('order_items').update({ status: 'cancelled' }).eq('order_id', form.order_id)
      }

      toast.success('Void recorded successfully')
      setModal(false)
      setForm({ order_id:'', type:'item_void', reason:'', amount:'' })
      setSelectedItem(''); setOrderItems([])
      await loadAll()
    } catch(e) { toast.error(e.message) }
    finally    { setSaving(false) }
  }

  const filtered = voids.filter(v => {
    const mt = filterType === 'all' || v.type === filterType
    const ms = !search || (v.orders?.order_number||'').includes(search) || (v.reason||'').toLowerCase().includes(search.toLowerCase())
    return mt && ms
  })

  const TYPE_LABEL = { item_void:'Item Void', order_void:'Order Void', refund:'Refund' }
  const TYPE_COLOR = { item_void:'amber', order_void:'red', refund:'blue' }

  const canCreate = ['owner','manager'].includes(staff?.role)

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Void & Refunds <small>{voids.length} records</small></div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn" onClick={loadAll} disabled={loading}>🔄</button>
          {canCreate && <button className="btn btn-primary" onClick={() => setModal(true)}>＋ New Void / Refund</button>}
        </div>
      </div>

      {!canCreate && (
        <div className="inv-alert" style={{ margin:'16px 24px', cursor:'default' }}>⚠️ Only managers and owners can create voids. Contact your manager.</div>
      )}

      <div className="sf-filters">
        <div className="mn-search-wrap" style={{ flex:1, minWidth:180 }}>
          <span className="mn-search-icon">🔍</span>
          <input className="mn-search" placeholder="Search order #, reason..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="mn-search-clear" onClick={() => setSearch('')}>✕</button>}
        </div>
        <div className="mn-filter-pills">
          <button className={`pill ${filterType==='all'?'active':''}`}        onClick={() => setFilterType('all')}>All</button>
          <button className={`pill ${filterType==='item_void'?'active':''}`}  onClick={() => setFilterType('item_void')}>Item Void</button>
          <button className={`pill ${filterType==='order_void'?'active':''}`} onClick={() => setFilterType('order_void')}>Order Void</button>
          <button className={`pill ${filterType==='refund'?'active':''}`}     onClick={() => setFilterType('refund')}>Refund</button>
        </div>
      </div>

      {loading ? <div className="mn-loading">Loading records...</div> : filtered.length === 0 ? (
        <div className="mn-empty">
          <div style={{ fontSize:48, marginBottom:12 }}>↩️</div>
          <div className="mn-empty-title">No void records</div>
          <div className="mn-empty-sub">Void and refund records will appear here</div>
        </div>
      ) : (
        <div className="void-list">
          {filtered.map(v => (
            <div key={v.id} className="void-card">
              <div className="void-card-left">
                <span className={`inv-status-pill ${TYPE_COLOR[v.type]}`}>{TYPE_LABEL[v.type]}</span>
                <div className="void-order">Order {v.orders?.order_number || '—'}</div>
                {v.order_items && <div className="void-item">Item: {v.order_items.name}</div>}
                <div className="void-reason">Reason: {v.reason}</div>
              </div>
              <div className="void-card-right">
                <div className="void-amount">Rs. {Number(v.amount).toLocaleString()}</div>
                <div className="void-date">{new Date(v.created_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                <div className="void-staff">Approved by: {v.staff?.name || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="mn-overlay" onClick={() => setModal(false)}>
          <div className="mn-modal mn-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">↩️ New Void / Refund</div>
              <button className="mn-modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <div className="mn-field">
                <label>Type</label>
                <div style={{ display:'flex', gap:8 }}>
                  {[{id:'item_void',label:'Item Void'},{id:'order_void',label:'Order Void'},{id:'refund',label:'Refund'}].map(t => (
                    <button key={t.id} className={`rm-amenity-btn ${form.type===t.id?'selected':''}`} style={{ flex:1, textAlign:'center' }}
                      onClick={() => setForm(f => ({ ...f, type: t.id }))}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mn-field">
                <label>Order *</label>
                <select className="mn-input" value={form.order_id} onChange={e => { setForm(f => ({ ...f, order_id: e.target.value })); loadOrderItems(e.target.value); setSelectedItem('') }}>
                  <option value="">Select active order</option>
                  {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} — Rs.{o.total} ({o.status})</option>)}
                </select>
              </div>

              {form.type === 'item_void' && orderItems.length > 0 && (
                <div className="mn-field">
                  <label>Item to Void *</label>
                  <select className="mn-input" value={selectedItem} onChange={e => setSelectedItem(e.target.value)}>
                    <option value="">Select item</option>
                    {orderItems.map(i => <option key={i.id} value={i.id}>{i.name} × {i.quantity} — Rs.{i.price}</option>)}
                  </select>
                </div>
              )}

              {form.type === 'refund' && (
                <div className="mn-field">
                  <label>Refund Amount (LKR) *</label>
                  <input className="mn-input" type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
              )}

              <div className="mn-field">
                <label>Reason *</label>
                <textarea className="mn-input mn-textarea" rows={3} placeholder="Reason for void/refund (required)..." value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
              </div>

              <div className="inv-calc-box">
                <span>⚠️ This action will be logged and cannot be undone</span>
                <span style={{ color:'var(--red)', fontWeight:700 }}>Requires Manager/Owner</span>
              </div>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={save} disabled={saving}>{saving ? 'Processing...' : 'Confirm Void/Refund'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
