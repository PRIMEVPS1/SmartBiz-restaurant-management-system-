// src/pages/MenuPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'
import './MenuPage.css'

const CATEGORY_ICONS = ['🍽️','🍛','🍜','🍕','🍔','🥗','🍱','🍣','🍤','🥩','🍗','🥘','🍲','🥪','🌮','🍝','🥟','🍦','🍰','☕','🧃','🍺','🥤','🍹']
const EMPTY_CAT  = { name: '', icon: '🍽️', sort_order: 0, active: true }
const EMPTY_ITEM = { name: '', description: '', price: '', category_id: '', is_available: true, is_veg: false, preparation_time: 15, image_url: '', sort_order: 0 }

export default function MenuPage() {
  const { tenant } = useStore()
  const [categories, setCategories] = useState([])
  const [items,      setItems]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [activeTab,  setActiveTab]  = useState('items')
  const [filterCat,  setFilterCat]  = useState('all')
  const [filterAvail,setFilterAvail]= useState('all')
  const [search,     setSearch]     = useState('')
  const [catModal,   setCatModal]   = useState(null)
  const [itemModal,  setItemModal]  = useState(null)
  const [catForm,    setCatForm]    = useState(EMPTY_CAT)
  const [itemForm,   setItemForm]   = useState(EMPTY_ITEM)
  const [saving,     setSaving]     = useState(false)
  const [delConfirm, setDelConfirm] = useState(null)

  useEffect(() => { if (tenant?.id) loadAll() }, [tenant?.id])

  async function loadAll() {
    setLoading(true)
    try {
      const [catRes, itemRes] = await Promise.all([
        supabase.from('menu_categories').select('*').eq('tenant_id', tenant.id).order('sort_order').order('name'),
        supabase.from('menu_items').select('*, menu_categories(name,icon)').eq('tenant_id', tenant.id).order('sort_order').order('name'),
      ])
      if (catRes.error)  throw catRes.error
      if (itemRes.error) throw itemRes.error
      setCategories(catRes.data || [])
      setItems(itemRes.data || [])
    } catch(e) { toast.error('Failed to load menu: ' + e.message) }
    finally { setLoading(false) }
  }

  function openAddCat() { setCatForm({ ...EMPTY_CAT, sort_order: categories.length }); setCatModal('add') }
  function openEditCat(cat) { setCatForm({ name: cat.name, icon: cat.icon, sort_order: cat.sort_order, active: cat.active }); setCatModal(cat) }

  async function saveCat() {
    if (!catForm.name.trim()) { toast.error('Category name required'); return }
    setSaving(true)
    try {
      const payload = { ...catForm, name: catForm.name.trim(), tenant_id: tenant.id }
      const isEdit  = catModal && catModal !== 'add'
      const { error } = isEdit
        ? await supabase.from('menu_categories').update(payload).eq('id', catModal.id)
        : await supabase.from('menu_categories').insert(payload)
      if (error) throw error
      toast.success(isEdit ? 'Category updated!' : 'Category added!')
      setCatModal(null); await loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function deleteCat(cat) {
    const count = items.filter(i => i.category_id === cat.id).length
    if (count > 0) { toast.error(`Remove ${count} item(s) from this category first`); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('menu_categories').delete().eq('id', cat.id)
      if (error) throw error
      toast.success('Category deleted'); setDelConfirm(null); await loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function toggleCatActive(cat) {
    try {
      const { error } = await supabase.from('menu_categories').update({ active: !cat.active }).eq('id', cat.id)
      if (error) throw error
      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, active: !c.active } : c))
    } catch(e) { toast.error(e.message) }
  }

  function openAddItem(catId = '') { setItemForm({ ...EMPTY_ITEM, category_id: catId || (categories[0]?.id || '') }); setItemModal('add') }
  function openEditItem(item) {
    setItemForm({
      name: item.name, description: item.description || '',
      price: item.price, category_id: item.category_id || '',
      is_available: item.is_available, is_veg: item.is_veg,
      preparation_time: item.preparation_time, image_url: item.image_url || '',
      sort_order: item.sort_order,
    })
    setItemModal(item)
  }

  async function saveItem() {
    if (!itemForm.name.trim())    { toast.error('Item name required'); return }
    if (!itemForm.price || isNaN(Number(itemForm.price))) { toast.error('Valid price required'); return }
    setSaving(true)
    try {
      const payload = {
        ...itemForm, name: itemForm.name.trim(), price: Number(itemForm.price),
        preparation_time: Number(itemForm.preparation_time) || 15,
        tenant_id: tenant.id, category_id: itemForm.category_id || null,
      }
      const isEdit = itemModal && itemModal !== 'add'
      const { error } = isEdit
        ? await supabase.from('menu_items').update(payload).eq('id', itemModal.id)
        : await supabase.from('menu_items').insert(payload)
      if (error) throw error
      toast.success(isEdit ? 'Item updated!' : 'Item added!')
      setItemModal(null); await loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function deleteItem(item) {
    setSaving(true)
    try {
      const { error } = await supabase.from('menu_items').delete().eq('id', item.id)
      if (error) throw error
      toast.success('Item deleted'); setDelConfirm(null); await loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function toggleAvailable(item) {
    try {
      const { error } = await supabase.from('menu_items').update({ is_available: !item.is_available }).eq('id', item.id)
      if (error) throw error
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !i.is_available } : i))
      toast.success(item.is_available ? 'Marked unavailable' : 'Marked available')
    } catch(e) { toast.error(e.message) }
  }

  const filteredItems = items.filter(item => {
    const matchCat    = filterCat   === 'all' || item.category_id === filterCat
    const matchAvail  = filterAvail === 'all' || (filterAvail === 'available' ? item.is_available : !item.is_available)
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) || (item.description||'').toLowerCase().includes(search.toLowerCase())
    return matchCat && matchAvail && matchSearch
  })

  const totalItems     = items.length
  const availableItems = items.filter(i => i.is_available).length
  const vegItems       = items.filter(i => i.is_veg).length

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Menu Management <small>{items.length} items</small></div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button className="btn" onClick={loadAll} disabled={loading}>🔄</button>
          {activeTab === 'categories'
            ? <button className="btn btn-primary" onClick={openAddCat}>＋ Category</button>
            : <button className="btn btn-primary" onClick={() => openAddItem()}>＋ Add Item</button>}
        </div>
      </div>

      <div className="mn-stats">
        <div className="mn-stat"><span className="mn-stat-val">{totalItems}</span><span className="mn-stat-lbl">Total Items</span></div>
        <div className="mn-stat green"><span className="mn-stat-val">{availableItems}</span><span className="mn-stat-lbl">Available</span></div>
        <div className="mn-stat red"><span className="mn-stat-val">{totalItems - availableItems}</span><span className="mn-stat-lbl">Unavailable</span></div>
        <div className="mn-stat amber"><span className="mn-stat-val">{vegItems}</span><span className="mn-stat-lbl">Veg Items</span></div>
        <div className="mn-stat blue"><span className="mn-stat-val">{categories.length}</span><span className="mn-stat-lbl">Categories</span></div>
      </div>

      <div className="mn-tabs">
        <button className={`mn-tab ${activeTab==='items'?'active':''}`} onClick={() => setActiveTab('items')}>🍜 Menu Items</button>
        <button className={`mn-tab ${activeTab==='categories'?'active':''}`} onClick={() => setActiveTab('categories')}>📂 Categories</button>
      </div>

      {activeTab === 'items' && (
        <div className="mn-body">
          <div className="mn-filters">
            <div className="mn-search-wrap">
              <span className="mn-search-icon">🔍</span>
              <input className="mn-search" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="mn-search-clear" onClick={() => setSearch('')}>✕</button>}
            </div>
            <div className="mn-filter-pills">
              <button className={`pill ${filterAvail==='all'?'active':''}`} onClick={() => setFilterAvail('all')}>All</button>
              <button className={`pill ${filterAvail==='available'?'active':''}`} onClick={() => setFilterAvail('available')}>Available</button>
              <button className={`pill ${filterAvail==='unavailable'?'active':''}`} onClick={() => setFilterAvail('unavailable')}>Unavailable</button>
            </div>
            <select className="mn-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>

          <div className="mn-cat-chips">
            <button className={`cat-chip ${filterCat==='all'?'active':''}`} onClick={() => setFilterCat('all')}>All <span className="chip-count">{items.length}</span></button>
            {categories.map(c => {
              const cnt = items.filter(i => i.category_id === c.id).length
              return <button key={c.id} className={`cat-chip ${filterCat===c.id?'active':''}`} onClick={() => setFilterCat(c.id)}>{c.icon} {c.name} <span className="chip-count">{cnt}</span></button>
            })}
          </div>

          {loading ? <div className="mn-loading">Loading menu...</div> : filteredItems.length === 0 ? (
            <div className="mn-empty">
              <div style={{ fontSize:48, marginBottom:12 }}>🍽️</div>
              <div className="mn-empty-title">{search ? 'No items found' : 'No menu items yet'}</div>
              <div className="mn-empty-sub">{search ? 'Try a different search' : 'Add your first menu item to get started'}</div>
              {!search && <button className="btn btn-primary" style={{marginTop:16}} onClick={() => openAddItem()}>＋ Add First Item</button>}
            </div>
          ) : (
            <div className="mn-grid">
              {filteredItems.map(item => (
                <div key={item.id} className={`mn-item-card ${!item.is_available ? 'unavailable' : ''}`}>
                  <div className="mn-img-wrap">
                    {item.image_url && <img src={item.image_url} alt={item.name} className="mn-img" onError={e => { e.target.style.display='none' }} />}
                    <div className="mn-img-placeholder" style={{ display: item.image_url ? 'none' : 'flex' }}>🍽️</div>
                    <div className="mn-badges">
                      {item.is_veg && <span className="badge veg">🌿 Veg</span>}
                      {!item.is_available && <span className="badge unavail">Unavailable</span>}
                    </div>
                    <button className={`mn-avail-toggle ${item.is_available ? 'on' : 'off'}`} onClick={() => toggleAvailable(item)}>{item.is_available ? '✓' : '✕'}</button>
                  </div>
                  <div className="mn-item-body">
                    <div className="mn-item-cat">{item.menu_categories?.icon} {item.menu_categories?.name || 'Uncategorised'}</div>
                    <div className="mn-item-name">{item.name}</div>
                    {item.description && <div className="mn-item-desc">{item.description}</div>}
                    <div className="mn-item-footer">
                      <div className="mn-item-price">Rs. {Number(item.price).toLocaleString()}</div>
                      <div className="mn-item-prep">⏱ {item.preparation_time}m</div>
                    </div>
                  </div>
                  <div className="mn-item-actions">
                    <button className="mn-act-btn edit" onClick={() => openEditItem(item)}>✏️ Edit</button>
                    <button className="mn-act-btn del"  onClick={() => setDelConfirm({ type:'item', obj: item })}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="mn-body">
          {loading ? <div className="mn-loading">Loading categories...</div> : categories.length === 0 ? (
            <div className="mn-empty">
              <div style={{ fontSize:48, marginBottom:12 }}>📂</div>
              <div className="mn-empty-title">No categories yet</div>
              <div className="mn-empty-sub">Add categories to organise your menu</div>
              <button className="btn btn-primary" style={{marginTop:16}} onClick={openAddCat}>＋ Add Category</button>
            </div>
          ) : (
            <div className="mn-cat-list">
              {categories.map(cat => {
                const count = items.filter(i => i.category_id === cat.id).length
                return (
                  <div key={cat.id} className={`mn-cat-row ${!cat.active ? 'inactive' : ''}`}>
                    <div className="mn-cat-icon">{cat.icon}</div>
                    <div className="mn-cat-info">
                      <div className="mn-cat-name">{cat.name}</div>
                      <div className="mn-cat-meta">{count} item{count !== 1 ? 's' : ''} · order #{cat.sort_order}</div>
                    </div>
                    <div className="mn-cat-right">
                      <button className={`mn-toggle ${cat.active ? 'on' : 'off'}`} onClick={() => toggleCatActive(cat)}><span className="mn-toggle-knob" /></button>
                      <button className="mn-act-btn edit" onClick={() => openEditCat(cat)}>✏️ Edit</button>
                      <button className="mn-act-btn del"  onClick={() => setDelConfirm({ type:'category', obj: cat })}>🗑</button>
                      <button className="mn-act-btn" style={{color:'var(--accent)'}} onClick={() => { setActiveTab('items'); setFilterCat(cat.id); openAddItem(cat.id) }}>＋ Item</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {catModal && (
        <div className="mn-overlay" onClick={() => setCatModal(null)}>
          <div className="mn-modal" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">{catModal === 'add' ? '＋ Add Category' : '✏️ Edit Category'}</div>
              <button className="mn-modal-close" onClick={() => setCatModal(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <div className="mn-field">
                <label>Category Name *</label>
                <input className="mn-input" placeholder="e.g. Main Course" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div className="mn-field">
                <label>Icon</label>
                <div className="mn-icon-grid">
                  {CATEGORY_ICONS.map(ic => <button key={ic} className={`mn-icon-btn ${catForm.icon === ic ? 'selected' : ''}`} onClick={() => setCatForm(f => ({ ...f, icon: ic }))}>{ic}</button>)}
                </div>
              </div>
              <div className="mn-field">
                <label>Sort Order</label>
                <input className="mn-input" type="number" min="0" value={catForm.sort_order} onChange={e => setCatForm(f => ({ ...f, sort_order: Number(e.target.value) }))} />
              </div>
              <div className="mn-field mn-inline">
                <label>Active</label>
                <button className={`mn-toggle ${catForm.active ? 'on' : 'off'}`} onClick={() => setCatForm(f => ({ ...f, active: !f.active }))}><span className="mn-toggle-knob" /></button>
              </div>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={() => setCatModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveCat} disabled={saving}>{saving ? 'Saving...' : catModal === 'add' ? 'Add Category' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {itemModal && (
        <div className="mn-overlay" onClick={() => setItemModal(null)}>
          <div className="mn-modal mn-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">{itemModal === 'add' ? '＋ Add Menu Item' : '✏️ Edit Item'}</div>
              <button className="mn-modal-close" onClick={() => setItemModal(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <div className="mn-modal-grid">
                <div>
                  <div className="mn-field">
                    <label>Item Name *</label>
                    <input className="mn-input" placeholder="e.g. Grilled Chicken" value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} autoFocus />
                  </div>
                  <div className="mn-field">
                    <label>Description</label>
                    <textarea className="mn-input mn-textarea" placeholder="Short description..." value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} rows={3} />
                  </div>
                  <div className="mn-field-row">
                    <div className="mn-field">
                      <label>Price (LKR) *</label>
                      <input className="mn-input" type="number" min="0" step="0.01" placeholder="0.00" value={itemForm.price} onChange={e => setItemForm(f => ({ ...f, price: e.target.value }))} />
                    </div>
                    <div className="mn-field">
                      <label>Prep Time (min)</label>
                      <input className="mn-input" type="number" min="1" value={itemForm.preparation_time} onChange={e => setItemForm(f => ({ ...f, preparation_time: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mn-field">
                    <label>Category</label>
                    <select className="mn-input" value={itemForm.category_id} onChange={e => setItemForm(f => ({ ...f, category_id: e.target.value }))}>
                      <option value="">No Category</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                    </select>
                  </div>
                  <div className="mn-field">
                    <label>Image URL</label>
                    <input className="mn-input" placeholder="https://..." value={itemForm.image_url} onChange={e => setItemForm(f => ({ ...f, image_url: e.target.value }))} />
                    {itemForm.image_url && <img src={itemForm.image_url} alt="preview" className="mn-img-preview" onError={e => e.target.style.display='none'} />}
                  </div>
                  <div className="mn-field">
                    <label>Sort Order</label>
                    <input className="mn-input" type="number" min="0" value={itemForm.sort_order} onChange={e => setItemForm(f => ({ ...f, sort_order: Number(e.target.value) }))} />
                  </div>
                  <div className="mn-toggles-row">
                    <div className="mn-field mn-inline">
                      <label>Available</label>
                      <button className={`mn-toggle ${itemForm.is_available ? 'on' : 'off'}`} onClick={() => setItemForm(f => ({ ...f, is_available: !f.is_available }))}><span className="mn-toggle-knob" /></button>
                    </div>
                    <div className="mn-field mn-inline">
                      <label>🌿 Veg</label>
                      <button className={`mn-toggle ${itemForm.is_veg ? 'on' : 'off'}`} onClick={() => setItemForm(f => ({ ...f, is_veg: !f.is_veg }))}><span className="mn-toggle-knob" /></button>
                    </div>
                  </div>
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

      {delConfirm && (
        <div className="mn-overlay" onClick={() => setDelConfirm(null)}>
          <div className="mn-modal mn-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">🗑️ Delete {delConfirm.type === 'item' ? 'Item' : 'Category'}</div>
              <button className="mn-modal-close" onClick={() => setDelConfirm(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <p style={{ color:'var(--t2)', fontSize:14, lineHeight:1.6 }}>Are you sure you want to delete <strong style={{ color:'var(--text)' }}>{delConfirm.obj.name}</strong>? This cannot be undone.</p>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={() => setDelConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={saving} onClick={() => delConfirm.type === 'item' ? deleteItem(delConfirm.obj) : deleteCat(delConfirm.obj)}>{saving ? 'Deleting...' : 'Yes, Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
