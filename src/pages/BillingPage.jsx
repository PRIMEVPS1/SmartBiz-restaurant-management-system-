// src/pages/BillingPage.jsx — Full POS with Split Billing + Inventory auto-deduct
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { localGetAll, localPut, offlineWrite } from '../lib/offlineDB'
import { useStore } from '../store/useStore'
import { isOnline } from '../lib/supabase'
import toast from 'react-hot-toast'
import './BillingPage.css'

const PAY_METHODS = [
  { k:'cash',   icon:'💵', label:'Cash'   },
  { k:'card',   icon:'💳', label:'Card'   },
  { k:'mobile', icon:'📱', label:'Mobile' },
]

export default function BillingPage() {
  const { orderId } = useParams()
  const navigate    = useNavigate()
  const { tenant, staff } = useStore()

  const [order,      setOrder]     = useState(null)
  const [items,      setItems]     = useState([])
  const [menuCats,   setMenuCats]  = useState([])
  const [menuItems,  setMenuItems] = useState([])
  const [activeCat,  setActiveCat] = useState(null)
  const [cart,       setCart]      = useState([])
  const [search,     setSearch]    = useState('')
  const [payMethod,  setPayMethod] = useState('cash')
  const [discount,   setDiscount]  = useState(0)
  const [byob,       setByob]      = useState(0)
  const [loading,    setLoading]   = useState(true)
  const [printing,   setPrinting]  = useState(false)
  const scrollRef = useRef(null)
  const secRefs   = useRef({})
  const spyLock   = useRef(false)

  // Split billing state
  const [splitMode,  setSplitMode]  = useState(false)  // false | 'equal' | 'custom'
  const [splitCount, setSplitCount] = useState(2)
  const [splits,     setSplits]     = useState([])      // [{amount, method, paid}]
  const [splitModal, setSplitModal] = useState(false)

  useEffect(() => { loadAll() }, [orderId, tenant?.id])

  async function loadAll() {
    setLoading(true)
    try { await Promise.all([loadOrder(), loadMenu()]) }
    finally { setLoading(false) }
  }

  async function loadOrder() {
    if (!orderId) return
    if (isOnline() && tenant) {
      const { data } = await supabase.from('orders')
        .select('*, order_items(*), restaurant_tables(number)')
        .eq('id', orderId).single()
      if (data) { setOrder(data); setItems(data.order_items || []) }
    } else {
      const orders = await localGetAll('orders')
      const o = orders.find(x => x.id === orderId)
      if (o) {
        const allItems = await localGetAll('order_items')
        setOrder(o); setItems(allItems.filter(i => i.order_id === orderId))
      }
    }
  }

  async function loadMenu() {
    if (!tenant) return
    if (isOnline()) {
      const [cRes, iRes] = await Promise.all([
        supabase.from('menu_categories').select('*').eq('tenant_id', tenant.id).eq('active', true).order('sort_order'),
        supabase.from('menu_items').select('*').eq('tenant_id', tenant.id).eq('is_available', true).order('sort_order'),
      ])
      setMenuCats(cRes.data || [])
      setMenuItems(iRes.data || [])
      setActiveCat(cRes.data?.[0]?.id || null)
    } else {
      const cats   = await localGetAll('menu_categories')
      const mitems = await localGetAll('menu_items')
      setMenuCats(cats.filter(c => c.active))
      setMenuItems(mitems.filter(i => i.is_available))
      setActiveCat(cats[0]?.id || null)
    }
  }

  function addToCart(item) {
    setCart(prev => {
      const existing = prev.find(c => c.menu_item_id === item.id)
      if (existing) return prev.map(c => c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, quantity: 1, notes: '' }]
    })
    toast.success(`${item.name} added`, { duration: 800 })
  }

  function updateQty(menuItemId, delta) {
    setCart(prev => prev.map(c => c.menu_item_id === menuItemId ? { ...c, quantity: c.quantity + delta } : c).filter(c => c.quantity > 0))
  }

  async function submitCart() {
    if (!cart.length) { toast.error('Cart is empty'); return }
    if (!order)       { toast.error('No active order'); return }
    try {
      const newItems = cart.map(c => ({
        id: crypto.randomUUID(), tenant_id: tenant.id, order_id: order.id,
        menu_item_id: c.menu_item_id, name: c.name, price: c.price,
        quantity: c.quantity, notes: c.notes, status: 'pending',
        synced: false, created_at: new Date().toISOString(),
      }))
      for (const item of newItems) {
        await offlineWrite('order_items', 'INSERT', item, 'order_items')
      }
      // Auto-deduct inventory if online
      if (isOnline()) {
        await deductInventory(newItems)
      }
      const allItems = [...items, ...newItems]
      await recalcOrder(allItems)
      setItems(allItems); setCart([])
      toast.success(`${newItems.length} item(s) sent to kitchen 🍳`)
    } catch(e) { toast.error('Failed to add items') }
  }

  // ── Inventory auto-deduct ──────────────────────────────
  async function deductInventory(orderItems) {
    try {
      for (const oi of orderItems) {
        // Find linked inventory items via menu_item_id
        // We look for inventory_items where name loosely matches (simplified)
        // In production: add a menu_item_inventory_links table
        // For now: deduct using item name matching
        const { data: inv } = await supabase
          .from('inventory_items')
          .select('*')
          .eq('tenant_id', tenant.id)
          .ilike('name', `%${oi.name.split(' ')[0]}%`)
          .limit(1)
        if (inv?.length > 0) {
          const stock = inv[0]
          const newQty = Math.max(0, stock.quantity - oi.quantity)
          await supabase.from('inventory_items').update({ quantity: newQty }).eq('id', stock.id)
          // Log the deduction
          await supabase.from('inventory_log').insert({
            tenant_id: tenant.id, item_id: stock.id, type: 'out',
            quantity: oi.quantity, reason: `Order item: ${oi.name}`, staff_id: staff?.id || null,
          })
          if (newQty <= stock.min_quantity && stock.min_quantity > 0) {
            toast(`⚠️ Low stock: ${stock.name} (${newQty} ${stock.unit} left)`, { duration: 4000 })
          }
        }
      }
    } catch(e) { console.error('Inventory deduct error:', e) }
  }

  async function recalcOrder(allItems) {
    const sc_rate  = tenant?.service_charge ?? 10
    const tax_rate = tenant?.tax_rate ?? 8
    const subtotal = allItems.filter(i => i.status !== 'cancelled').reduce((s, i) => s + (i.price * i.quantity), 0)
    const sc       = parseFloat((subtotal * sc_rate / 100).toFixed(2))
    const tax      = parseFloat(((subtotal + sc) * tax_rate / 100).toFixed(2))
    const disc     = parseFloat(discount || 0)
    const total    = parseFloat((subtotal + sc + tax - disc).toFixed(2))
    const updated  = { ...order, subtotal, service_charge: sc, tax, discount: disc, total, status: 'preparing', updated_at: new Date().toISOString() }
    await offlineWrite('orders', 'UPDATE', updated, 'orders')
    setOrder(updated)
  }

  // ── Split billing ──────────────────────────────────────
  function initSplit(mode) {
    const n   = splitCount
    const amt = total / n
    if (mode === 'equal') {
      setSplits(Array.from({ length: n }, (_, i) => ({
        index: i + 1,
        amount: parseFloat(amt.toFixed(2)),
        method: 'cash',
        paid: false,
      })))
    } else {
      setSplits(Array.from({ length: n }, (_, i) => ({
        index: i + 1,
        amount: i === 0 ? parseFloat(total.toFixed(2)) : 0,
        method: 'cash',
        paid: false,
      })))
    }
    setSplitMode(mode)
    setSplitModal(true)
  }

  function updateSplit(idx, field, val) {
    setSplits(prev => prev.map(s => s.index === idx ? { ...s, [field]: val } : s))
  }

  async function settleSplit() {
    const totalSplit = splits.reduce((s, sp) => s + Number(sp.amount), 0)
    if (Math.abs(totalSplit - total) > 0.5) {
      toast.error(`Split total Rs.${totalSplit.toFixed(0)} ≠ bill total Rs.${total.toFixed(0)}`); return
    }
    try {
      const billId = crypto.randomUUID()
      const bill = {
        id: billId, tenant_id: tenant.id, order_id: order.id,
        bill_number: `B-${Date.now().toString().slice(-6)}`,
        subtotal: order.subtotal || subtotal, service_charge: order.service_charge || sc,
        tax: order.tax || tax, discount: order.discount || discount, total,
        byob_bottles: byob, corkage,
        payment_method: 'split', payment_status: 'paid',
        cashier_id: staff?.id, paid_at: new Date().toISOString(),
        synced: false, created_at: new Date().toISOString(),
      }
      await offlineWrite('bills', 'INSERT', bill, 'bills')

      // Insert split records
      for (const sp of splits) {
        await supabase.from('split_bills').insert({
          tenant_id: tenant.id, bill_id: billId,
          split_index: sp.index, amount: Number(sp.amount),
          payment_method: sp.method, paid: true, paid_at: new Date().toISOString(),
        })
      }

      const updated = { ...order, status: 'billed', updated_at: new Date().toISOString() }
      await offlineWrite('orders', 'UPDATE', updated, 'orders')
      toast.success('✅ Split bill settled!')
      setSplitModal(false)
      navigate('/tables')
    } catch(e) { toast.error('Split settlement failed') }
  }

  async function settleBill() {
    if (!order) return
    try {
      const bill = {
        id: crypto.randomUUID(), tenant_id: tenant.id, order_id: order.id,
        bill_number: `B-${Date.now().toString().slice(-6)}`,
        subtotal: order.subtotal || subtotal, service_charge: order.service_charge || sc,
        tax: order.tax || tax, discount: order.discount || discount, total,
        byob_bottles: byob, corkage,
        payment_method: payMethod, payment_status: 'paid',
        cashier_id: staff?.id, paid_at: new Date().toISOString(),
        synced: false, created_at: new Date().toISOString(),
      }
      await offlineWrite('bills', 'INSERT', bill, 'bills')
      const updated = { ...order, status: 'billed', updated_at: new Date().toISOString() }
      await offlineWrite('orders', 'UPDATE', updated, 'orders')
      toast.success('✅ Bill settled!')
      navigate('/tables')
    } catch(e) { toast.error('Settlement failed') }
  }

  function printReceipt() {
    setPrinting(true)
    setTimeout(() => { window.print(); setPrinting(false) }, 300)
  }

  const subtotal = items.filter(i => i.status !== 'cancelled').reduce((s, i) => s + (i.price * i.quantity), 0)
  const sc       = subtotal * (tenant?.service_charge ?? 10) / 100
  const tax      = (subtotal + sc) * (tenant?.tax_rate ?? 8) / 100
  const corkage  = byob * Number(tenant?.corkage_fee || 0)
  const total    = subtotal + sc + tax - (discount || 0) + corkage
  const cartTotal = cart.reduce((s, c) => s + (c.price * c.quantity), 0)

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase()
    const match = m => !q || m.name.toLowerCase().includes(q) || (m.name_si || '').toLowerCase().includes(q)
    const list = menuCats.map(c => ({ cat: c, items: menuItems.filter(m => m.category_id === c.id && match(m)) }))
    const known = new Set(menuCats.map(c => c.id))
    const other = menuItems.filter(m => !known.has(m.category_id) && match(m))
    if (other.length) list.push({ cat: { id: '_other', name: 'Other', icon: '' }, items: other })
    return list.filter(s => s.items.length)
  }, [menuCats, menuItems, search])

  function goCat(id) {
    setActiveCat(id)
    const box = scrollRef.current, el = secRefs.current[id]
    if (!box || !el) return
    spyLock.current = true
    box.scrollTo({ top: el.offsetTop - box.offsetTop - 4, behavior: 'smooth' })
    setTimeout(() => { spyLock.current = false }, 600)
  }
  function onMenuScroll() {
    if (spyLock.current) return
    const box = scrollRef.current
    if (!box) return
    let cur = null
    for (const s of sections) {
      const el = secRefs.current[s.cat.id]
      if (el && el.offsetTop - box.offsetTop - 12 <= box.scrollTop) cur = s.cat.id
    }
    if (cur && cur !== activeCat) setActiveCat(cur)
  }
  const qtyInCart = id => cart.find(c => c.menu_item_id === id)?.quantity || 0

  if (loading) return <div className="empty-state" style={{ padding:'80px' }}>Loading POS...</div>

  return (
    <div className="pos-wrap">
      {/* ── LEFT: Menu Panel ── */}
      <div className="pos-menu">
        <div className="topbar">
          <div className="topbar-title">POS <small>{order?.order_number || 'New Order'}</small></div>
          <button className="btn" onClick={() => navigate('/tables')}>← Tables</button>
        </div>

        <div className="menu-search-wrap">
          <input className="input menu-search" placeholder="🔍 Search menu..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="menu-cats">
          {sections.map(sec => (
            <button key={sec.cat.id} className={`cat-btn ${activeCat === sec.cat.id ? 'active' : ''}`} onClick={() => goCat(sec.cat.id)}>
              {sec.cat.icon} {sec.cat.name}
            </button>
          ))}
        </div>

        <div className="pos-scroll" ref={scrollRef} onScroll={onMenuScroll}>
          {sections.length === 0 && <div style={{ padding:'40px', textAlign:'center', color:'var(--t2)' }}>No items found</div>}
          {sections.map(sec => (
            <section key={sec.cat.id} ref={el => { secRefs.current[sec.cat.id] = el }} className="pos-sec">
              <div className="pos-sec-title">{sec.cat.icon} {sec.cat.name} <small>{sec.items.length}</small></div>
              <div className="pos-tiles">
                {sec.items.map(item => {
                  const q = qtyInCart(item.id)
                  return (
                    <button key={item.id} className={`pos-tile ${q ? 'in' : ''}`} onClick={() => addToCart(item)}>
                      <div className="pt-photo">
                        {item.image_url
                          ? <img src={item.image_url} alt="" loading="lazy" onError={e => { e.target.style.display = 'none' }} />
                          : null}
                        <span className="pt-ph">🍽️</span>
                        {item.badge && <span className="pt-badge">{item.badge}</span>}
                        {item.is_veg && <span className="pt-veg" />}
                        {q > 0 && <span className="pt-qty">{q}</span>}
                      </div>
                      <div className="pt-body">
                        <div className="pt-name">{item.name}</div>
                        <div className="pt-price">Rs. {Number(item.price).toLocaleString()}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* ── RIGHT: Order + Bill ── */}
      <div className="pos-right">
        <div className="pos-order">
          <div className="card-head" style={{ borderBottom:'1px solid var(--border)' }}>
            <div className="card-title">
              {order?.restaurant_tables?.number ? `🍽️ Table ${order.restaurant_tables.number}` : '🛒 Order'}
              {order && <span className="pill pill-pending" style={{ marginLeft:'8px', fontSize:'10px' }}>{order.status}</span>}
            </div>
          </div>

          <div className="order-items-list">
            {items.filter(i => i.status !== 'cancelled').map(item => (
              <div key={item.id} className="oi-row">
                <div className="oi-qty">{item.quantity}×</div>
                <div className="oi-name">{item.name}{item.notes && <div className="oi-note">{item.notes}</div>}</div>
                <div className="oi-price">Rs. {(item.price * item.quantity).toLocaleString()}</div>
              </div>
            ))}
            {items.length === 0 && (
              <div style={{ padding:'24px', textAlign:'center', color:'var(--t2)', fontSize:'13px' }}>No items yet</div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="cart-section">
              <div className="cart-title">🛒 Cart (not sent)</div>
              {cart.map(c => (
                <div key={c.menu_item_id} className="oi-row cart-row">
                  <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                    <button className="qty-btn" onClick={() => updateQty(c.menu_item_id, -1)}>−</button>
                    <span className="oi-qty">{c.quantity}×</span>
                    <button className="qty-btn" onClick={() => updateQty(c.menu_item_id, +1)}>+</button>
                  </div>
                  <div className="oi-name">{c.name}</div>
                  <div className="oi-price">Rs. {(c.price * c.quantity).toLocaleString()}</div>
                </div>
              ))}
              <button className="btn btn-primary" style={{ width:'100%', marginTop:'10px' }} onClick={submitCart}>
                🍳 Send to Kitchen (Rs. {cartTotal.toLocaleString()})
              </button>
            </div>
          )}
        </div>

        {/* Bill summary */}
        <div className="bill-summary">
          <div className="bs-row"><span>Subtotal</span><span>Rs. {subtotal.toLocaleString()}</span></div>
          <div className="bs-row"><span>Service ({tenant?.service_charge ?? 10}%)</span><span>Rs. {sc.toFixed(0)}</span></div>
          <div className="bs-row"><span>Tax ({tenant?.tax_rate ?? 8}%)</span><span>Rs. {tax.toFixed(0)}</span></div>
          <div className="bs-row">
            <span>Discount</span>
            <input type="number" className="discount-input" value={discount} onChange={e => setDiscount(Number(e.target.value))} placeholder="0" min="0" />
          </div>
          {Number(tenant?.corkage_fee) > 0 && (
            <div className="bs-row">
              <span>🍾 BYOB bottles (Rs. {Number(tenant.corkage_fee).toLocaleString()} each)</span>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                <button className="qty-btn" onClick={() => setByob(b => Math.max(0, b - 1))}>−</button>
                <strong>{byob}</strong>
                <button className="qty-btn" onClick={() => setByob(b => b + 1)}>+</button>
              </span>
            </div>
          )}
          <div className="bs-divider" />
          <div className="bs-row bs-total"><span>TOTAL</span><span>Rs. {total.toFixed(0)}</span></div>

          <div className="pay-label">Payment Method</div>
          <div className="pay-methods">
            {PAY_METHODS.map(p => (
              <button key={p.k} className={`pay-btn ${payMethod === p.k ? 'active' : ''}`} onClick={() => setPayMethod(p.k)}>
                <span>{p.icon}</span><span>{p.label}</span>
              </button>
            ))}
          </div>

          <button className="settle-btn" onClick={settleBill} disabled={!items.length}>✅ Settle & Close</button>

          {/* Split bill */}
          <div className="split-row">
            <span className="split-label">Split Bill</span>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <button className="qty-btn" onClick={() => setSplitCount(Math.max(2, splitCount - 1))}>−</button>
              <span style={{ minWidth:20, textAlign:'center', fontSize:13 }}>{splitCount}</span>
              <button className="qty-btn" onClick={() => setSplitCount(Math.min(10, splitCount + 1))}>+</button>
            </div>
          </div>
          <div style={{ display:'flex', gap:6, marginBottom:8 }}>
            <button className="split-btn" onClick={() => initSplit('equal')} disabled={!items.length}>✂️ Split Equally</button>
            <button className="split-btn" onClick={() => initSplit('custom')} disabled={!items.length}>⚖️ Custom Split</button>
          </div>

          <button className="print-btn" onClick={printReceipt} disabled={printing}>🖨️ Print Receipt</button>
        </div>
      </div>

      {/* ── Split Modal ── */}
      {splitModal && (
        <div className="mn-overlay" onClick={() => setSplitModal(false)}>
          <div className="mn-modal mn-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">✂️ Split Bill — {splits.length} ways</div>
              <button className="mn-modal-close" onClick={() => setSplitModal(false)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <div className="split-total-bar">
                <span>Bill Total: <strong>Rs. {total.toFixed(2)}</strong></span>
                <span style={{ color: Math.abs(splits.reduce((s,sp)=>s+Number(sp.amount),0)-total)>0.5?'var(--red)':'var(--green)', fontWeight:600 }}>
                  Split Total: Rs. {splits.reduce((s,sp)=>s+Number(sp.amount),0).toFixed(2)}
                </span>
              </div>
              <div className="split-parts">
                {splits.map(sp => (
                  <div key={sp.index} className="split-part">
                    <div className="split-part-num">Part {sp.index}</div>
                    <div className="mn-field-row">
                      <div className="mn-field">
                        <label>Amount (Rs.)</label>
                        <input className="mn-input" type="number" min="0" step="0.01"
                          value={sp.amount}
                          onChange={e => updateSplit(sp.index, 'amount', e.target.value)} />
                      </div>
                      <div className="mn-field">
                        <label>Payment</label>
                        <select className="mn-input" value={sp.method} onChange={e => updateSplit(sp.index, 'method', e.target.value)}>
                          {PAY_METHODS.map(p => <option key={p.k} value={p.k}>{p.icon} {p.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={() => setSplitModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={settleSplit}>✅ Confirm & Settle All Parts</button>
            </div>
          </div>
        </div>
      )}

      {/* Print receipt (portal → body, so printing hides the whole app) */}
      {createPortal(<div className="print-receipt" style={{ width: `${tenant?.receipt_width || 80}mm` }}>
        <style>{`@media print { @page { size: ${tenant?.receipt_width || 80}mm auto; margin: 0; } }`}</style>
        <div className="receipt-head">
          {tenant?.logo_url && <img src={tenant.logo_url} alt="" className="receipt-logo" />}
          <div className="receipt-biz">{tenant?.name || 'SmartBiz'}</div>
          {tenant?.address && <div className="receipt-addr">{tenant.address}</div>}
          {tenant?.phone && <div className="receipt-addr">Tel: {tenant.phone}</div>}
          <div className="receipt-addr">{new Date().toLocaleString()}{order?.order_number ? ` · ${order.order_number}` : ''}{order?.restaurant_tables?.number ? ` · Table ${order.restaurant_tables.number}` : ''}</div>
          <div className="receipt-line" />
        </div>
        <div className="receipt-items">
          {items.filter(i => i.status !== 'cancelled').map(i => (
            <div key={i.id} className="receipt-item">
              <span>{i.name} × {i.quantity}</span>
              <span>Rs. {(i.price * i.quantity).toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="receipt-line" />
        <div className="receipt-row"><span>Subtotal</span><span>Rs. {subtotal.toFixed(2)}</span></div>
        <div className="receipt-row"><span>Service Charge</span><span>Rs. {sc.toFixed(2)}</span></div>
        <div className="receipt-row"><span>Tax</span><span>Rs. {tax.toFixed(2)}</span></div>
        {discount > 0 && <div className="receipt-row"><span>Discount</span><span>-Rs. {discount.toFixed(2)}</span></div>}
        {corkage > 0 && <div className="receipt-row"><span>Corkage (BYOB x{byob})</span><span>Rs. {corkage.toFixed(2)}</span></div>}
        <div className="receipt-line" />
        <div className="receipt-total"><span>TOTAL</span><span>Rs. {total.toFixed(2)}</span></div>
        <div className="receipt-foot">{tenant?.receipt_footer || 'Thank you! Come again.'}<div className="receipt-powered">Powered by SmartBiz</div></div>
      </div>, document.body)}
    </div>
  )
}
