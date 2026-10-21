// src/pages/CustomerMenu.jsx
// Public page — customer scans QR → browses a photo menu → places order
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import './CustomerMenu.css'

const BADGE_CLS = { 'Best Seller':'bs', 'Signature':'sg', 'New':'nw', "Chef's Special":'cs', 'Spicy':'sp' }
const money = n => 'Rs. ' + Number(n || 0).toLocaleString()

function Photo({ src, name, className = '', badge }) {
  const [bad, setBad] = useState(false)
  return (
    <div className={`cm-photo ${className}`}>
      {badge && <span className={`cm-badge ${BADGE_CLS[badge] || ''}`}>{badge}</span>}
      {src && !bad
        ? <img src={src} alt={name} loading="lazy" onError={() => setBad(true)} />
        : <span className="cm-photo-ph">🍽️</span>}
    </div>
  )
}

export default function CustomerMenu() {
  const { qrToken } = useParams()
  const [table,   setTable]   = useState(null)
  const [tenant,  setTenant]  = useState(null)
  const [cats,    setCats]    = useState([])
  const [items,   setItems]   = useState([])
  const [activeCat, setActiveCat] = useState(null)
  const [cart,    setCart]    = useState([])
  const [step,    setStep]    = useState('menu') // menu | cart | done
  const [guestName, setGuestName] = useState('')
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [sheet,   setSheet]   = useState(null)   // item being viewed
  const [sQty,    setSQty]    = useState(1)
  const [sNote,   setSNote]   = useState('')
  const [placing, setPlacing] = useState(false)
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('cm-lang') || 'en' } catch { return 'en' } })
  const secRefs = useRef({})
  const lock = useRef(false)

  useEffect(() => { loadMenu() }, [qrToken])

  async function loadMenu() {
    try {
      const { data, error } = await supabase.rpc('get_qr_menu', { p_token: qrToken })
      if (error || !data) { setLoading(false); return }
      setTable(data.table); setTenant(data.tenant)
      setCats(data.categories || []); setItems(data.items || [])
      setActiveCat(data.categories?.[0]?.id || null)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  // sections: category → its items (filtered by search)
  const sections = useMemo(() => {
    const q = search.trim().toLowerCase()
    const match = i => !q || i.name.toLowerCase().includes(q) || (i.name_si || '').toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q)
    const list = cats.map(c => ({ cat: c, items: items.filter(i => i.category_id === c.id && match(i)) }))
    const known = new Set(cats.map(c => c.id))
    const other = items.filter(i => !known.has(i.category_id) && match(i))
    if (other.length) list.push({ cat: { id: '_other', name: 'Other', icon: '' }, items: other })
    return list.filter(s => s.items.length)
  }, [cats, items, search])

  // scroll-spy: highlight the category whose section is at the top
  useEffect(() => {
    if (step !== 'menu') return
    function onScroll() {
      if (lock.current) return
      let cur = null
      for (const s of sections) {
        const el = secRefs.current[s.cat.id]
        if (el && el.getBoundingClientRect().top <= 140) cur = s.cat.id
      }
      if (cur) setActiveCat(cur)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [sections, step])

  // keep the active tab visible in the tab bar
  useEffect(() => {
    document.getElementById('cm-tab-' + activeCat)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeCat])

  function goCat(id) {
    setActiveCat(id)
    lock.current = true
    secRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => { lock.current = false }, 700)
  }

  const qtyOf = id => cart.find(c => c.id === id)?.qty || 0
  function setQty(item, qty, note) {
    setCart(prev => {
      const ex = prev.find(c => c.id === item.id)
      if (qty <= 0) return prev.filter(c => c.id !== item.id)
      if (ex) return prev.map(c => c.id === item.id ? { ...c, qty, note: note ?? c.note } : c)
      return [...prev, { ...item, qty, note: note || '' }]
    })
  }
  const updateNote = (id, note) => setCart(p => p.map(c => c.id === id ? { ...c, note } : c))

  function openSheet(item) {
    const ex = cart.find(c => c.id === item.id)
    setSheet(item); setSQty(ex?.qty || 1); setSNote(ex?.note || '')
  }
  function sheetSave() {
    setQty(sheet, sQty, sNote)
    setSheet(null)
    if (sQty > 0) toast.success('Added to order')
  }

  async function placeOrder() {
    if (!cart.length || !table || placing) return
    setPlacing(true)
    try {
      const { data, error } = await supabase.rpc('place_qr_order', {
        p_token: qrToken, p_guest: guestName || '',
        p_items: cart.map(c => ({ id: c.id, qty: c.qty, note: c.note || '' })),
      })
      if (error || !data) throw error || new Error('Order failed')
      setStep('done')
    } catch (e) { toast.error('Order failed. Please try again.') }
    setPlacing(false)
  }

  const hasSi = items.some(i => i.name_si)
  const L = lang === 'si' && hasSi
  const nm   = i => (L && i.name_si) || i.name
  const desc = i => (L && i.description_si) || i.description
  function changeLang(v) { setLang(v); try { localStorage.setItem('cm-lang', v) } catch {} }

  const cartTotal = cart.reduce((s, c) => s + Number(c.price) * c.qty, 0)
  const cartCount = cart.reduce((s, c) => s + c.qty, 0)

  if (loading) return <div className="cm-loading">🍽️ Loading menu...</div>
  if (!table)  return <div className="cm-loading">❌ Invalid QR code. Please scan the table QR again.</div>

  if (step === 'done') return (
    <div className="cm-done">
      <div className="cm-done-icon">✅</div>
      <h2>Order Placed!</h2>
      <p>Your order has been sent to the kitchen.<br />Our team will serve you shortly.</p>
      <div className="cm-done-table">📍 {table.number}</div>
      <button className="cm-back-btn" onClick={() => { setCart([]); setStep('menu') }}>Order More</button>
    </div>
  )

  if (step === 'cart') return (
    <div className="cm-wrap">
      <div className="cm-cart-view">
        <button className="cm-back" onClick={() => setStep('menu')}>← Back to menu</button>
        <h2 className="cm-cart-title">Your order</h2>
        {cart.map(item => (
          <div key={item.id} className="cm-cart-item">
            <Photo src={item.image_url} name={item.name} className="cm-cart-photo" />
            <div className="cm-ci-body">
              <div className="cm-ci-top">
                <span className="cm-ci-name">{nm(item)}</span>
                <span className="cm-ci-price">{money(item.price * item.qty)}</span>
              </div>
              <div className="cm-ci-bottom">
                <div className="cm-qty-ctrl">
                  <button onClick={() => setQty(item, item.qty - 1)}>−</button>
                  <span>{item.qty}</span>
                  <button onClick={() => setQty(item, item.qty + 1)}>+</button>
                </div>
                <input className="cm-note-input" placeholder="Special request..." value={item.note} onChange={e => updateNote(item.id, e.target.value)} />
              </div>
            </div>
          </div>
        ))}
        <div className="cm-cart-total"><span>Total</span><span>{money(cartTotal)}</span></div>
        <div className="cm-sub-note">Service charge & tax are added on the final bill.</div>
        <input className="cm-name-input" placeholder="Your name (optional)" value={guestName} onChange={e => setGuestName(e.target.value)} />
        <button className="cm-order-btn" onClick={placeOrder} disabled={placing}>{placing ? 'Sending...' : 'Place order 🚀'}</button>
      </div>
    </div>
  )

  return (
    <div className="cm-wrap">
      {/* Hero header */}
      <div className="cm-hero">
        <div className="cm-hero-row">
          {tenant?.logo_url
            ? <img className="cm-logo" src={tenant.logo_url} alt="" onError={e => { e.target.style.display = 'none' }} />
            : <div className="cm-logo ph">🍴</div>}
          <div className="cm-hero-txt">
            <div className="cm-brand-name">{tenant?.name || 'Menu'}</div>
            <div className="cm-hero-sub">Scan • Order • Enjoy</div>
          </div>
          {hasSi && (
            <div className="cm-lang">
              <button className={lang !== 'si' ? 'on' : ''} onClick={() => changeLang('en')}>EN</button>
              <button className={lang === 'si' ? 'on' : ''} onClick={() => changeLang('si')}>සිං</button>
            </div>
          )}
          <div className="cm-table-badge">📍 {table.number}</div>
        </div>
        <div className="cm-search-wrap">
          <input className="cm-search" placeholder="🔍 Search dishes..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Sticky category tabs */}
      <div className="cm-tabs">
        {sections.map(s => (
          <button key={s.cat.id} id={'cm-tab-' + s.cat.id} className={`cm-tab ${activeCat === s.cat.id ? 'active' : ''}`} onClick={() => goCat(s.cat.id)}>
            {s.cat.icon} {s.cat.name}
          </button>
        ))}
      </div>

      {/* Sections */}
      <div className="cm-menu">
        {sections.map(s => (
          <section key={s.cat.id} ref={el => { secRefs.current[s.cat.id] = el }} className="cm-section">
            <h2 className="cm-sec-title">{s.cat.icon} {s.cat.name}</h2>
            <div className="cm-list">
              {s.items.map(item => {
                const q = qtyOf(item.id)
                return (
                  <div key={item.id} className="cm-item" onClick={() => openSheet(item)}>
                    <Photo src={item.image_url} name={item.name} badge={item.badge} />
                    <div className="cm-item-info">
                      <div className="cm-item-name">
                        {item.is_veg && <span className="cm-veg" title="Vegetarian" />}{nm(item)}
                      </div>
                      {desc(item) && <div className="cm-item-desc">{desc(item)}</div>}
                      <div className="cm-item-bottom">
                        <div>
                          <div className="cm-item-price">{money(item.price)}</div>
                          <div className="cm-item-time">
                            {item.calories ? <span>🔥 {item.calories} kcal</span> : null}
                            {item.preparation_time ? <span>⏱ {item.preparation_time} min</span> : null}
                          </div>
                        </div>
                        {q > 0
                          ? <div className="cm-qty-ctrl" onClick={e => e.stopPropagation()}>
                              <button onClick={() => setQty(item, q - 1)}>−</button><span>{q}</span><button onClick={() => setQty(item, q + 1)}>+</button>
                            </div>
                          : <button className="cm-add-btn" onClick={e => { e.stopPropagation(); setQty(item, 1) }}>+</button>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
        {!sections.length && <div className="cm-empty">{search ? 'No dishes found' : 'Menu is empty'}</div>}
      </div>

      {cart.length > 0 && !sheet && (
        <div className="cm-cart-bar" onClick={() => setStep('cart')}>
          <span className="cm-cb-count">{cartCount}</span>
          <span>View order</span>
          <span>{money(cartTotal)}</span>
        </div>
      )}

      {/* Item detail sheet */}
      {sheet && (
        <div className="cm-sheet-bg" onClick={() => setSheet(null)}>
          <div className="cm-sheet" onClick={e => e.stopPropagation()}>
            <button className="cm-sheet-x" onClick={() => setSheet(null)}>✕</button>
            <Photo src={sheet.image_url} name={sheet.name} className="cm-sheet-photo" badge={sheet.badge} />
            <div className="cm-sheet-body">
              <div className="cm-sheet-name">{sheet.is_veg && <span className="cm-veg" />}{nm(sheet)}</div>
              <div className="cm-sheet-meta">
                <span className="cm-sheet-price">{money(sheet.price)}</span>
                {sheet.calories ? <span>🔥 {sheet.calories} kcal</span> : null}
                {sheet.preparation_time ? <span>⏱ {sheet.preparation_time} min</span> : null}
              </div>
              {desc(sheet) && <p className="cm-sheet-desc">{desc(sheet)}</p>}
              <input className="cm-note-input full" placeholder="Special request (e.g. less spicy)" value={sNote} onChange={e => setSNote(e.target.value)} />
              <div className="cm-sheet-actions">
                <div className="cm-qty-ctrl big">
                  <button onClick={() => setSQty(q => Math.max(0, q - 1))}>−</button>
                  <span>{sQty}</span>
                  <button onClick={() => setSQty(q => q + 1)}>+</button>
                </div>
                <button className="cm-order-btn slim" onClick={sheetSave}>
                  {sQty === 0 ? 'Remove' : `Add • ${money(sheet.price * sQty)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
