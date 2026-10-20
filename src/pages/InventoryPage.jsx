// src/pages/InventoryPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'
import './InventoryPage.css'

const UNITS      = ['kg','g','L','ml','pcs','dozen','box','bottle','bag','can']
const CATEGORIES = ['general','food','beverage','cleaning','packaging','equipment','other']
const EMPTY_ITEM = { name:'', category:'general', unit:'kg', quantity:0, min_quantity:0, cost_per_unit:0, supplier:'' }
const EMPTY_LOG  = { type:'in', quantity:'', reason:'' }

export default function InventoryPage() {
  const { tenant, staff } = useStore()
  const [items,     setItems]     = useState([])
  const [log,       setLog]       = useState([])
  const [loading,   setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState('stock')
  const [search,    setSearch]    = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [filterStock,setFilterStock] = useState('all')
  const [itemModal,  setItemModal]  = useState(null)
  const [logModal,   setLogModal]   = useState(null)
  const [delConfirm, setDelConfirm] = useState(null)
  const [itemForm,   setItemForm]   = useState(EMPTY_ITEM)
  const [logForm,    setLogForm]    = useState(EMPTY_LOG)
  const [saving,     setSaving]     = useState(false)

  useEffect(() => { if (tenant?.id) loadAll() }, [tenant?.id])

  async function loadAll() {
    setLoading(true)
    try {
      const [itemRes, logRes] = await Promise.all([
        supabase.from('inventory_items').select('*').eq('tenant_id', tenant.id).order('category').order('name'),
        supabase.from('inventory_log').select('*, inventory_items(name,unit), staff(name)').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(100),
      ])
      if (itemRes.error) throw itemRes.error
      if (logRes.error)  throw logRes.error
      setItems(itemRes.data || [])
      setLog(logRes.data   || [])
    } catch(e) { toast.error('Failed to load inventory: ' + e.message) }
    finally { setLoading(false) }
  }

  function openAddItem() { setItemForm({ ...EMPTY_ITEM }); setItemModal('add') }
  function openEditItem(item) {
    setItemForm({ name: item.name, category: item.category, unit: item.unit, quantity: item.quantity,
      min_quantity: item.min_quantity, cost_per_unit: item.cost_per_unit, supplier: item.supplier || '' })
    setItemModal(item)
  }

  async function saveItem() {
    if (!itemForm.name.trim()) { toast.error('Item name required'); return }
    setSaving(true)
    try {
      const payload = { ...itemForm, name: itemForm.name.trim(), quantity: Number(itemForm.quantity) || 0,
        min_quantity: Number(itemForm.min_quantity) || 0, cost_per_unit: Number(itemForm.cost_per_unit) || 0, tenant_id: tenant.id }
      const isEdit = itemModal && itemModal !== 'add'
      const { error } = isEdit
        ? await supabase.from('inventory_items').update(payload).eq('id', itemModal.id)
        : await supabase.from('inventory_items').insert(payload)
      if (error) throw error
      toast.success(isEdit ? 'Item updated!' : 'Item added!')
      setItemModal(null); await loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function deleteItem(item) {
    setSaving(true)
    try {
      const { error } = await supabase.from('inventory_items').delete().eq('id', item.id)
      if (error) throw error
      toast.success('Item deleted'); setDelConfirm(null); await loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  function openLog(item) { setLogForm({ ...EMPTY_LOG }); setLogModal(item) }

  async function saveLog() {
    if (!logForm.quantity || isNaN(Number(logForm.quantity)) || Number(logForm.quantity) <= 0) { toast.error('Enter a valid quantity'); return }
    setSaving(true)
    try {
      const qty    = Number(logForm.quantity)
      const item   = logModal
      const newQty = logForm.type === 'in' ? item.quantity + qty : logForm.type === 'out' ? item.quantity - qty : qty
      if (newQty < 0) { toast.error('Stock cannot go below 0'); setSaving(false); return }

      const { error: logErr } = await supabase.from('inventory_log').insert({
        tenant_id: tenant.id, item_id: item.id, type: logForm.type, quantity: qty,
        reason: logForm.reason || null, staff_id: staff?.id || null,
      })
      if (logErr) throw logErr

      const { error: itemErr } = await supabase.from('inventory_items').update({ quantity: newQty }).eq('id', item.id)
      if (itemErr) throw itemErr

      toast.success(
        logForm.type === 'in' ? `+${qty} ${item.unit} added` :
        logForm.type === 'out' ? `-${qty} ${item.unit} removed` : `Adjusted to ${newQty} ${item.unit}`
      )
      setLogModal(null); await loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const filtered = items.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) || (item.supplier||'').toLowerCase().includes(search.toLowerCase())
    const matchCat    = filterCat   === 'all' || item.category === filterCat
    const isLow       = item.quantity <= item.min_quantity
    const matchStock  = filterStock === 'all' || (filterStock === 'low' ? isLow : !isLow)
    return matchSearch && matchCat && matchStock
  })

  const totalItems  = items.length
  const lowStock    = items.filter(i => i.quantity <= i.min_quantity && i.min_quantity > 0).length
  const totalValue  = items.reduce((s, i) => s + (i.quantity * i.cost_per_unit), 0)
  const categories  = [...new Set(items.map(i => i.category))]

  function fmtQty(item) { return `${Number(item.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${item.unit}` }
  function stockStatus(item) {
    if (item.min_quantity <= 0) return 'ok'
    const ratio = item.quantity / item.min_quantity
    if (ratio <= 0)    return 'empty'
    if (ratio <= 1)    return 'low'
    if (ratio <= 1.5)  return 'warn'
    return 'ok'
  }
  const STATUS_LABEL = { ok:'OK', warn:'Running Low', low:'Low Stock', empty:'Out of Stock' }
  const STATUS_COLOR = { ok:'green', warn:'amber', low:'red', empty:'red' }

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Inventory <small>{items.length} items</small></div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button className="btn" onClick={loadAll} disabled={loading}>🔄</button>
          <button className="btn btn-primary" onClick={openAddItem}>＋ Add Item</button>
        </div>
      </div>

      <div className="inv-stats">
        <div className="inv-stat"><span className="inv-stat-val">{totalItems}</span><span className="inv-stat-lbl">Total Items</span></div>
        <div className={`inv-stat ${lowStock > 0 ? 'red' : 'green'}`}><span className="inv-stat-val">{lowStock}</span><span className="inv-stat-lbl">Low Stock</span></div>
        <div className="inv-stat blue"><span className="inv-stat-val">{categories.length}</span><span className="inv-stat-lbl">Categories</span></div>
        <div className="inv-stat amber"><span className="inv-stat-val">Rs.{totalValue >= 1000 ? (totalValue/1000).toFixed(1)+'K' : totalValue.toFixed(0)}</span><span className="inv-stat-lbl">Stock Value</span></div>
      </div>

      <div className="inv-tabs">
        <button className={`inv-tab ${activeTab==='stock'?'active':''}`} onClick={() => setActiveTab('stock')}>📦 Stock Items</button>
        <button className={`inv-tab ${activeTab==='log'?'active':''}`}   onClick={() => setActiveTab('log')}>📋 Movement Log</button>
      </div>

      {activeTab === 'stock' && (
        <div className="inv-body">
          <div className="inv-filters">
            <div className="mn-search-wrap" style={{ flex:1, minWidth:180 }}>
              <span className="mn-search-icon">🔍</span>
              <input className="mn-search" placeholder="Search items, suppliers..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="mn-search-clear" onClick={() => setSearch('')}>✕</button>}
            </div>
            <div className="mn-filter-pills">
              <button className={`pill ${filterStock==='all'?'active':''}`} onClick={() => setFilterStock('all')}>All</button>
              <button className={`pill ${filterStock==='low'?'active':''}`} onClick={() => setFilterStock('low')}>⚠️ Low Stock</button>
              <button className={`pill ${filterStock==='ok'?'active':''}`}  onClick={() => setFilterStock('ok')}>✅ OK</button>
            </div>
            <select className="mn-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="all">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
            </select>
          </div>

          {lowStock > 0 && filterStock === 'all' && (
            <div className="inv-alert" onClick={() => setFilterStock('low')}>⚠️ <strong>{lowStock} item{lowStock>1?'s':''}</strong> running low or out of stock — click to view</div>
          )}

          {loading ? <div className="mn-loading">Loading inventory...</div> : filtered.length === 0 ? (
            <div className="mn-empty">
              <div style={{ fontSize:48, marginBottom:12 }}>📦</div>
              <div className="mn-empty-title">{search ? 'No items found' : 'No inventory items yet'}</div>
              <div className="mn-empty-sub">{search ? 'Try a different search' : 'Add your first inventory item'}</div>
              {!search && <button className="btn btn-primary" style={{marginTop:16}} onClick={openAddItem}>＋ Add First Item</button>}
            </div>
          ) : (
            <div className="inv-table-wrap">
              <table className="inv-table">
                <thead>
                  <tr><th>Item</th><th>Category</th><th>Stock</th><th>Min</th><th>Status</th><th>Cost/Unit</th><th>Value</th><th>Supplier</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {filtered.map(item => {
                    const st  = stockStatus(item)
                    const val = item.quantity * item.cost_per_unit
                    return (
                      <tr key={item.id} className={st === 'empty' || st === 'low' ? 'row-warn' : ''}>
                        <td><span className="inv-item-name">{item.name}</span></td>
                        <td><span className="inv-cat-badge">{item.category}</span></td>
                        <td className="inv-qty"><span className={`qty-val ${st}`}>{fmtQty(item)}</span></td>
                        <td className="inv-qty-min">{item.min_quantity > 0 ? `${item.min_quantity} ${item.unit}` : '—'}</td>
                        <td><span className={`inv-status-pill ${STATUS_COLOR[st]}`}>{STATUS_LABEL[st]}</span></td>
                        <td className="inv-cost">Rs.{Number(item.cost_per_unit).toLocaleString()}</td>
                        <td className="inv-val">Rs.{val >= 1000 ? (val/1000).toFixed(1)+'K' : val.toFixed(0)}</td>
                        <td className="inv-supplier">{item.supplier || '—'}</td>
                        <td>
                          <div className="inv-actions">
                            <button className="inv-btn move" onClick={() => openLog(item)} title="Stock movement">±</button>
                            <button className="inv-btn edit" onClick={() => openEditItem(item)} title="Edit">✏️</button>
                            <button className="inv-btn del"  onClick={() => setDelConfirm(item)} title="Delete">🗑</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'log' && (
        <div className="inv-body">
          {loading ? <div className="mn-loading">Loading log...</div> : log.length === 0 ? (
            <div className="mn-empty">
              <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
              <div className="mn-empty-title">No movement log yet</div>
              <div className="mn-empty-sub">Stock movements will appear here</div>
            </div>
          ) : (
            <div className="inv-table-wrap">
              <table className="inv-table">
                <thead><tr><th>Date & Time</th><th>Item</th><th>Type</th><th>Quantity</th><th>Reason</th><th>Staff</th></tr></thead>
                <tbody>
                  {log.map(entry => (
                    <tr key={entry.id}>
                      <td className="inv-date">{new Date(entry.created_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
                      <td><span className="inv-item-name">{entry.inventory_items?.name || '—'}</span></td>
                      <td><span className={`log-type-pill ${entry.type}`}>{entry.type === 'in' ? '▲ In' : entry.type === 'out' ? '▼ Out' : '⇄ Adj'}</span></td>
                      <td className="inv-qty"><span className={`qty-val ${entry.type === 'in' ? 'ok' : entry.type === 'out' ? 'low' : ''}`}>{entry.type === 'in' ? '+' : entry.type === 'out' ? '-' : '='}{entry.quantity} {entry.inventory_items?.unit || ''}</span></td>
                      <td className="inv-reason">{entry.reason || '—'}</td>
                      <td className="inv-staff">{entry.staff?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {itemModal && (
        <div className="mn-overlay" onClick={() => setItemModal(null)}>
          <div className="mn-modal mn-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">{itemModal === 'add' ? '＋ Add Inventory Item' : '✏️ Edit Item'}</div>
              <button className="mn-modal-close" onClick={() => setItemModal(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <div className="mn-modal-grid">
                <div>
                  <div className="mn-field">
                    <label>Item Name *</label>
                    <input className="mn-input" placeholder="e.g. Rice, Chicken Breast" value={itemForm.name} onChange={e => setItemForm(f=>({...f,name:e.target.value}))} autoFocus />
                  </div>
                  <div className="mn-field-row">
                    <div className="mn-field">
                      <label>Category</label>
                      <select className="mn-input" value={itemForm.category} onChange={e => setItemForm(f=>({...f,category:e.target.value}))}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                      </select>
                    </div>
                    <div className="mn-field">
                      <label>Unit</label>
                      <select className="mn-input" value={itemForm.unit} onChange={e => setItemForm(f=>({...f,unit:e.target.value}))}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mn-field">
                    <label>Supplier</label>
                    <input className="mn-input" placeholder="Supplier name" value={itemForm.supplier} onChange={e => setItemForm(f=>({...f,supplier:e.target.value}))} />
                  </div>
                </div>
                <div>
                  <div className="mn-field-row">
                    <div className="mn-field">
                      <label>Current Quantity</label>
                      <input className="mn-input" type="number" min="0" step="0.001" value={itemForm.quantity} onChange={e => setItemForm(f=>({...f,quantity:e.target.value}))} />
                    </div>
                    <div className="mn-field">
                      <label>Min Quantity (alert)</label>
                      <input className="mn-input" type="number" min="0" step="0.001" placeholder="0 = no alert" value={itemForm.min_quantity} onChange={e => setItemForm(f=>({...f,min_quantity:e.target.value}))} />
                    </div>
                  </div>
                  <div className="mn-field">
                    <label>Cost per Unit (LKR)</label>
                    <input className="mn-input" type="number" min="0" step="0.01" placeholder="0.00" value={itemForm.cost_per_unit} onChange={e => setItemForm(f=>({...f,cost_per_unit:e.target.value}))} />
                  </div>
                  {itemForm.quantity > 0 && itemForm.cost_per_unit > 0 && (
                    <div className="inv-calc-box"><span>Total Stock Value:</span><strong>Rs. {(Number(itemForm.quantity) * Number(itemForm.cost_per_unit)).toLocaleString()}</strong></div>
                  )}
                </div>
              </div>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={() => setItemModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveItem} disabled={saving}>{saving ? 'Saving...' : itemModal === 'add' ? 'Add Item' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {logModal && (
        <div className="mn-overlay" onClick={() => setLogModal(null)}>
          <div className="mn-modal" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">± Stock Movement</div>
              <button className="mn-modal-close" onClick={() => setLogModal(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <div className="inv-move-item-info">
                <span className="inv-item-name">{logModal.name}</span>
                <span className="inv-move-current">Current: <strong>{fmtQty(logModal)}</strong></span>
              </div>
              <div className="inv-move-types">
                {[
                  { type:'in',         label:'Stock In',    desc:'Received / purchased',  color:'green' },
                  { type:'out',        label:'Stock Out',   desc:'Used / consumed',        color:'red'   },
                  { type:'adjustment', label:'Adjustment',  desc:'Set exact quantity',     color:'amber' },
                ].map(t => (
                  <button key={t.type} className={`inv-type-btn ${logForm.type === t.type ? 'active ' + t.color : ''}`} onClick={() => setLogForm(f => ({ ...f, type: t.type }))}>
                    <span className="inv-type-label">{t.label}</span>
                    <span className="inv-type-desc">{t.desc}</span>
                  </button>
                ))}
              </div>
              <div className="mn-field" style={{ marginTop:16 }}>
                <label>{logForm.type === 'adjustment' ? 'Set Quantity' : 'Quantity'} ({logModal.unit}) *</label>
                <input className="mn-input" type="number" min="0" step="0.001" placeholder={logForm.type === 'adjustment' ? `Current: ${logModal.quantity}` : '0'} value={logForm.quantity} onChange={e => setLogForm(f => ({ ...f, quantity: e.target.value }))} autoFocus />
              </div>
              {logForm.quantity && !isNaN(Number(logForm.quantity)) && Number(logForm.quantity) > 0 && (
                <div className="inv-calc-box">
                  <span>After movement:</span>
                  <strong>{logForm.type === 'in' ? Number(logModal.quantity) + Number(logForm.quantity) : logForm.type === 'out' ? Math.max(0, Number(logModal.quantity) - Number(logForm.quantity)) : Number(logForm.quantity)} {logModal.unit}</strong>
                </div>
              )}
              <div className="mn-field">
                <label>Reason / Note</label>
                <input className="mn-input" placeholder="e.g. Weekly stock, Kitchen use, Damaged..." value={logForm.reason} onChange={e => setLogForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={() => setLogModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveLog} disabled={saving}>{saving ? 'Saving...' : 'Confirm Movement'}</button>
            </div>
          </div>
        </div>
      )}

      {delConfirm && (
        <div className="mn-overlay" onClick={() => setDelConfirm(null)}>
          <div className="mn-modal mn-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">🗑️ Delete Item</div>
              <button className="mn-modal-close" onClick={() => setDelConfirm(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <p style={{ color:'var(--t2)', fontSize:14, lineHeight:1.6 }}>Delete <strong style={{ color:'var(--text)' }}>{delConfirm.name}</strong>? Movement log entries will also be deleted.</p>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={() => setDelConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={saving} onClick={() => deleteItem(delConfirm)}>{saving ? 'Deleting...' : 'Yes, Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
