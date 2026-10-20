// src/pages/CustomerMenu.jsx
// Public page — customer scans QR → sees menu → places order
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import './CustomerMenu.css'

export default function CustomerMenu() {
  const { qrToken } = useParams()
  const [table,    setTable]    = useState(null)
  const [tenant,   setTenant]   = useState(null)
  const [cats,     setCats]     = useState([])
  const [items,    setItems]    = useState([])
  const [activeCat,setActiveCat]= useState(null)
  const [cart,     setCart]     = useState([])
  const [step,     setStep]     = useState('menu') // menu | cart | confirm | done
  const [guestName,setGuestName]= useState('')
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  useEffect(() => { loadMenu() }, [qrToken])

  async function loadMenu() {
    try {
      const { data, error } = await supabase.rpc('get_qr_menu', { p_token: qrToken })
      if (error || !data) { setLoading(false); return }
      setTable(data.table)
      setTenant(data.tenant)
      setCats(data.categories || [])
      setItems(data.items || [])
      setActiveCat(data.categories?.[0]?.id || null)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  function addToCart(item) {
    setCart(prev => {
      const ex = prev.find(c => c.id === item.id)
      if (ex) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty+1 } : c)
      return [...prev, { ...item, qty: 1, note: '' }]
    })
  }
  function removeFromCart(id) { setCart(prev => prev.filter(c => c.id !== id)) }
  function updateQty(id, delta) { setCart(prev => prev.map(c=>c.id===id?{...c,qty:Math.max(0,c.qty+delta)}:c).filter(c=>c.qty>0)) }
  function updateNote(id, note) { setCart(prev => prev.map(c=>c.id===id?{...c,note}:c)) }

  async function placeOrder() {
    if (!cart.length || !table) return
    try {
      const { data, error } = await supabase.rpc('place_qr_order', {
        p_token: qrToken,
        p_guest: guestName || '',
        p_items: cart.map(c => ({ id: c.id, qty: c.qty, note: c.note || '' })),
      })
      if (error || !data) throw error || new Error('Order failed')
      setStep('done')
    } catch(e) { toast.error('Order failed. Please try again.') }
  }

  const cartTotal  = cart.reduce((s,c)=>s+(c.price*c.qty),0)
  const cartCount  = cart.reduce((s,c)=>s+c.qty,0)
  const dispItems  = items.filter(i => {
    const mc = !activeCat || i.category_id === activeCat
    const ms = !search || i.name.toLowerCase().includes(search.toLowerCase())
    return mc && ms
  })

  if (loading) return <div className="cm-loading">🍽️ Loading menu...</div>
  if (!table)  return <div className="cm-loading">❌ Invalid QR code. Please scan the table QR again.</div>

  if (step === 'done') return (
    <div className="cm-done">
      <div className="cm-done-icon">✅</div>
      <h2>Order Placed!</h2>
      <p>Your order has been sent to the kitchen.<br/>Our team will serve you shortly.</p>
      <div className="cm-done-table">📍 {table.number}</div>
      <button className="cm-back-btn" onClick={()=>{setCart([]);setStep('menu')}}>Order More</button>
    </div>
  )

  return (
    <div className="cm-wrap">
      {/* Header */}
      <div className="cm-header">
        <div className="cm-brand">
          {tenant?.name || 'SmartBiz'}
          <div className="cm-table-badge">📍 {table.number}</div>
        </div>
      </div>

      {step === 'menu' && (
        <>
          <div className="cm-search-wrap">
            <input className="cm-search" placeholder="🔍 Search..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>

          <div className="cm-cats">
            <button className={`cm-cat ${!activeCat?'active':''}`} onClick={()=>setActiveCat(null)}>All</button>
            {cats.map(c=>(
              <button key={c.id} className={`cm-cat ${activeCat===c.id?'active':''}`} onClick={()=>setActiveCat(c.id)}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>

          <div className="cm-menu">
            {dispItems.map(item=>{
              const inCart = cart.find(c=>c.id===item.id)
              return (
                <div key={item.id} className="cm-item">
                  <div className="cm-item-info">
                    <div className="cm-item-name">{item.is_veg&&'🌿 '}{item.name}</div>
                    {item.description && <div className="cm-item-desc">{item.description}</div>}
                    <div className="cm-item-price">Rs. {item.price.toLocaleString()}</div>
                    {item.preparation_time && <div className="cm-item-time">⏱ {item.preparation_time} min</div>}
                  </div>
                  <div className="cm-item-action">
                    {inCart
                      ? <div className="cm-qty-ctrl">
                          <button onClick={()=>updateQty(item.id,-1)}>−</button>
                          <span>{inCart.qty}</span>
                          <button onClick={()=>addToCart(item)}>+</button>
                        </div>
                      : <button className="cm-add-btn" onClick={()=>addToCart(item)}>Add</button>
                    }
                  </div>
                </div>
              )
            })}
            {dispItems.length===0 && <div className="cm-empty">No items in this category</div>}
          </div>

          {cart.length > 0 && (
            <div className="cm-cart-bar" onClick={()=>setStep('cart')}>
              <span>{cartCount} item{cartCount>1?'s':''}</span>
              <span>View Cart →</span>
              <span>Rs. {cartTotal.toLocaleString()}</span>
            </div>
          )}
        </>
      )}

      {step === 'cart' && (
        <div className="cm-cart-view">
          <button className="cm-back" onClick={()=>setStep('menu')}>← Back to Menu</button>
          <h2 className="cm-cart-title">Your Order</h2>
          {cart.map(item=>(
            <div key={item.id} className="cm-cart-item">
              <div className="cm-ci-top">
                <span className="cm-ci-name">{item.name}</span>
                <span className="cm-ci-price">Rs. {(item.price*item.qty).toLocaleString()}</span>
              </div>
              <div className="cm-ci-bottom">
                <div className="cm-qty-ctrl">
                  <button onClick={()=>updateQty(item.id,-1)}>−</button>
                  <span>{item.qty}</span>
                  <button onClick={()=>updateQty(item.id,+1)}>+</button>
                </div>
                <input className="cm-note-input" placeholder="Special request..." value={item.note} onChange={e=>updateNote(item.id,e.target.value)}/>
              </div>
            </div>
          ))}
          <div className="cm-cart-total">
            <span>Total</span><span>Rs. {cartTotal.toLocaleString()}</span>
          </div>
          <div className="cm-name-wrap">
            <input className="cm-name-input" placeholder="Your name (optional)" value={guestName} onChange={e=>setGuestName(e.target.value)}/>
          </div>
          <button className="cm-order-btn" onClick={placeOrder}>Place Order 🚀</button>
        </div>
      )}
    </div>
  )
}
