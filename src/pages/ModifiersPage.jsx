// src/pages/ModifiersPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'
import './ModifiersPage.css'

const EMPTY_GROUP = { name: '', required: false, multi_select: false, min_select: 0, max_select: 1, sort_order: 0 }
const EMPTY_MOD   = { name: '', price_delta: 0, is_default: false, sort_order: 0 }

export default function ModifiersPage() {
  const { tenant } = useStore()
  const [groups,     setGroups]     = useState([])
  const [modifiers,  setModifiers]  = useState([])
  const [menuItems,  setMenuItems]  = useState([])
  const [linkMap,    setLinkMap]    = useState({})   // menu_item_id -> [group_id]
  const [loading,    setLoading]    = useState(true)
  const [activeGroup,setActiveGroup]= useState(null)

  // Modals
  const [groupModal, setGroupModal] = useState(null)
  const [modModal,   setModModal]   = useState(null)
  const [linkModal,  setLinkModal]  = useState(null) // {menuItem}
  const [groupForm,  setGroupForm]  = useState(EMPTY_GROUP)
  const [modForm,    setModForm]    = useState(EMPTY_MOD)
  const [saving,     setSaving]     = useState(false)
  const [delConfirm, setDelConfirm] = useState(null)

  useEffect(() => { if (tenant?.id) loadAll() }, [tenant?.id])

  async function loadAll() {
    setLoading(true)
    try {
      const [grpRes, modRes, itemRes, linkRes] = await Promise.all([
        supabase.from('modifier_groups').select('*').eq('tenant_id', tenant.id).order('sort_order').order('name'),
        supabase.from('modifiers').select('*').eq('tenant_id', tenant.id).order('group_id').order('sort_order'),
        supabase.from('menu_items').select('id,name,menu_categories(name)').eq('tenant_id', tenant.id).eq('is_available', true).order('name'),
        supabase.from('menu_item_modifier_groups').select('menu_item_id, group_id'),
      ])
      if (grpRes.error)  throw grpRes.error
      if (modRes.error)  throw modRes.error
      if (itemRes.error) throw itemRes.error
      setGroups(grpRes.data   || [])
      setModifiers(modRes.data || [])
      setMenuItems(itemRes.data || [])
      // Build link map: menu_item_id -> Set of group_ids
      const map = {}
      ;(linkRes.data || []).forEach(l => {
        if (!map[l.menu_item_id]) map[l.menu_item_id] = new Set()
        map[l.menu_item_id].add(l.group_id)
      })
      setLinkMap(map)
      if (!activeGroup && grpRes.data?.length > 0) setActiveGroup(grpRes.data[0].id)
    } catch(e) { toast.error(e.message) }
    finally    { setLoading(false) }
  }

  // ── Group CRUD ──
  async function saveGroup() {
    if (!groupForm.name.trim()) { toast.error('Group name required'); return }
    setSaving(true)
    try {
      const payload = { ...groupForm, name: groupForm.name.trim(), tenant_id: tenant.id }
      const isEdit  = groupModal && groupModal !== 'add'
      const { error } = isEdit
        ? await supabase.from('modifier_groups').update(payload).eq('id', groupModal.id)
        : await supabase.from('modifier_groups').insert(payload)
      if (error) throw error
      toast.success(isEdit ? 'Group updated!' : 'Group added!')
      setGroupModal(null); await loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function deleteGroup(g) {
    setSaving(true)
    try {
      await supabase.from('modifier_groups').delete().eq('id', g.id)
      toast.success('Group deleted'); setDelConfirm(null)
      if (activeGroup === g.id) setActiveGroup(null)
      await loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  // ── Modifier CRUD ──
  async function saveMod() {
    if (!modForm.name.trim()) { toast.error('Modifier name required'); return }
    if (!activeGroup) { toast.error('Select a group first'); return }
    setSaving(true)
    try {
      const payload = { ...modForm, name: modForm.name.trim(), price_delta: Number(modForm.price_delta) || 0, tenant_id: tenant.id, group_id: activeGroup }
      const isEdit  = modModal && modModal !== 'add'
      const { error } = isEdit
        ? await supabase.from('modifiers').update(payload).eq('id', modModal.id)
        : await supabase.from('modifiers').insert(payload)
      if (error) throw error
      toast.success(isEdit ? 'Modifier updated!' : 'Modifier added!')
      setModModal(null); await loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function deleteMod(m) {
    setSaving(true)
    try {
      await supabase.from('modifiers').delete().eq('id', m.id)
      toast.success('Modifier deleted'); setDelConfirm(null); await loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  // ── Menu item linking ──
  async function toggleLink(menuItemId, groupId) {
    const linked = linkMap[menuItemId]?.has(groupId)
    try {
      if (linked) {
        await supabase.from('menu_item_modifier_groups').delete().match({ menu_item_id: menuItemId, group_id: groupId })
      } else {
        await supabase.from('menu_item_modifier_groups').insert({ menu_item_id: menuItemId, group_id: groupId })
      }
      // Update local map
      setLinkMap(prev => {
        const next = { ...prev }
        if (!next[menuItemId]) next[menuItemId] = new Set()
        else next[menuItemId] = new Set(next[menuItemId])
        linked ? next[menuItemId].delete(groupId) : next[menuItemId].add(groupId)
        return next
      })
      toast.success(linked ? 'Unlinked' : 'Linked!')
    } catch(e) { toast.error(e.message) }
  }

  const activeGroupData  = groups.find(g => g.id === activeGroup)
  const activeModifiers  = modifiers.filter(m => m.group_id === activeGroup)
  const linkedItems      = menuItems.filter(i => linkMap[i.id]?.has(activeGroup))

  function fmtDelta(d) {
    if (!d || d === 0) return 'free'
    return d > 0 ? `+Rs.${d}` : `-Rs.${Math.abs(d)}`
  }

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Menu Modifiers <small>{groups.length} groups</small></div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn" onClick={loadAll} disabled={loading}>🔄</button>
          <button className="btn btn-primary" onClick={() => { setGroupForm({ ...EMPTY_GROUP, sort_order: groups.length }); setGroupModal('add') }}>＋ Add Group</button>
        </div>
      </div>

      {loading ? <div className="mn-loading">Loading modifiers...</div> : (
        <div className="mod-layout">

          {/* Left — Groups list */}
          <div className="mod-groups-panel">
            <div className="mod-panel-title">Modifier Groups</div>
            {groups.length === 0 ? (
              <div className="mod-empty-panel">
                <div style={{ fontSize:32, marginBottom:8 }}>⚙️</div>
                <div style={{ fontSize:13, color:'var(--t2)' }}>No groups yet</div>
              </div>
            ) : groups.map(g => (
              <div key={g.id} className={`mod-group-item ${activeGroup === g.id ? 'active' : ''}`} onClick={() => setActiveGroup(g.id)}>
                <div className="mod-group-info">
                  <div className="mod-group-name">{g.name}</div>
                  <div className="mod-group-meta">
                    {g.required && <span className="mod-badge req">Required</span>}
                    {g.multi_select && <span className="mod-badge multi">Multi</span>}
                    <span style={{ fontSize:11, color:'var(--t3)' }}>{modifiers.filter(m => m.group_id === g.id).length} options</span>
                  </div>
                </div>
                <div className="mod-group-actions" onClick={e => e.stopPropagation()}>
                  <button className="inv-btn edit" onClick={() => { setGroupForm({ name:g.name, required:g.required, multi_select:g.multi_select, min_select:g.min_select, max_select:g.max_select, sort_order:g.sort_order }); setGroupModal(g) }}>✏️</button>
                  <button className="inv-btn del"  onClick={() => setDelConfirm({ type:'group', obj: g })}>🗑</button>
                </div>
              </div>
            ))}
          </div>

          {/* Right — Modifiers + Links */}
          <div className="mod-detail-panel">
            {!activeGroup ? (
              <div className="mn-empty" style={{ paddingTop:80 }}>
                <div style={{ fontSize:48, marginBottom:12 }}>👈</div>
                <div className="mn-empty-title">Select a group</div>
                <div className="mn-empty-sub">Or create a new modifier group</div>
              </div>
            ) : (
              <>
                <div className="mod-detail-head">
                  <div>
                    <div className="mod-detail-title">{activeGroupData?.name}</div>
                    <div className="mod-detail-meta">
                      {activeGroupData?.required ? '✓ Required' : '○ Optional'} ·
                      {activeGroupData?.multi_select ? ' Multi-select' : ' Single-select'} ·
                      Max {activeGroupData?.max_select} choice{activeGroupData?.max_select !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={() => { setModForm({ ...EMPTY_MOD, sort_order: activeModifiers.length }); setModModal('add') }}>＋ Add Option</button>
                </div>

                {/* Options list */}
                <div className="mod-options-list">
                  {activeModifiers.length === 0 ? (
                    <div style={{ padding:'24px', textAlign:'center', color:'var(--t2)', fontSize:13 }}>No options yet — add your first modifier option</div>
                  ) : activeModifiers.map(m => (
                    <div key={m.id} className="mod-option-row">
                      <div className="mod-option-info">
                        <span className="mod-option-name">{m.name}</span>
                        {m.is_default && <span className="mod-badge">Default</span>}
                      </div>
                      <span className={`mod-price-delta ${m.price_delta > 0 ? 'plus' : m.price_delta < 0 ? 'minus' : ''}`}>{fmtDelta(m.price_delta)}</span>
                      <div className="inv-actions">
                        <button className="inv-btn edit" onClick={() => { setModForm({ name:m.name, price_delta:m.price_delta, is_default:m.is_default, sort_order:m.sort_order }); setModModal(m) }}>✏️</button>
                        <button className="inv-btn del"  onClick={() => setDelConfirm({ type:'modifier', obj: m })}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Linked menu items */}
                <div className="mod-link-section">
                  <div className="mod-link-head">
                    <div className="mod-detail-title" style={{ fontSize:14 }}>Linked Menu Items</div>
                    <button className="btn" style={{ fontSize:12, padding:'6px 12px' }} onClick={() => setLinkModal(true)}>Manage Links</button>
                  </div>
                  {linkedItems.length === 0 ? (
                    <div style={{ fontSize:12, color:'var(--t3)', padding:'12px 0' }}>No menu items linked to this group yet</div>
                  ) : (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
                      {linkedItems.map(i => (
                        <span key={i.id} className="rm-amenity" style={{ fontSize:12 }}>{i.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Group Modal */}
      {groupModal && (
        <div className="mn-overlay" onClick={() => setGroupModal(null)}>
          <div className="mn-modal" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">{groupModal === 'add' ? '＋ Add Modifier Group' : '✏️ Edit Group'}</div>
              <button className="mn-modal-close" onClick={() => setGroupModal(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <div className="mn-field">
                <label>Group Name * <span style={{ color:'var(--t3)', fontWeight:400 }}>(e.g. Spice Level, Size, Add-ons)</span></label>
                <input className="mn-input" placeholder="Modifier group name" value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div className="mn-field-row">
                <div className="mn-field mn-inline" style={{ margin:0 }}>
                  <label>Required</label>
                  <button className={`mn-toggle ${groupForm.required ? 'on' : 'off'}`} onClick={() => setGroupForm(f => ({ ...f, required: !f.required }))}><span className="mn-toggle-knob" /></button>
                </div>
                <div className="mn-field mn-inline" style={{ margin:0 }}>
                  <label>Multi-select</label>
                  <button className={`mn-toggle ${groupForm.multi_select ? 'on' : 'off'}`} onClick={() => setGroupForm(f => ({ ...f, multi_select: !f.multi_select }))}><span className="mn-toggle-knob" /></button>
                </div>
              </div>
              {groupForm.multi_select && (
                <div className="mn-field-row" style={{ marginTop:12 }}>
                  <div className="mn-field"><label>Min Selections</label><input className="mn-input" type="number" min="0" value={groupForm.min_select} onChange={e => setGroupForm(f => ({ ...f, min_select: Number(e.target.value) }))} /></div>
                  <div className="mn-field"><label>Max Selections</label><input className="mn-input" type="number" min="1" value={groupForm.max_select} onChange={e => setGroupForm(f => ({ ...f, max_select: Number(e.target.value) }))} /></div>
                </div>
              )}
              <div className="mn-field" style={{ marginTop:12 }}>
                <label>Sort Order</label>
                <input className="mn-input" type="number" min="0" value={groupForm.sort_order} onChange={e => setGroupForm(f => ({ ...f, sort_order: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={() => setGroupModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveGroup} disabled={saving}>{saving ? 'Saving...' : groupModal === 'add' ? 'Add Group' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modifier option modal */}
      {modModal && (
        <div className="mn-overlay" onClick={() => setModModal(null)}>
          <div className="mn-modal" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">{modModal === 'add' ? '＋ Add Option' : '✏️ Edit Option'}</div>
              <button className="mn-modal-close" onClick={() => setModModal(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <div className="mn-field">
                <label>Option Name *</label>
                <input className="mn-input" placeholder="e.g. Extra Hot, Large, Add Cheese" value={modForm.name} onChange={e => setModForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div className="mn-field">
                <label>Price Adjustment (LKR) <span style={{ color:'var(--t3)', fontWeight:400 }}>— use negative for discount</span></label>
                <input className="mn-input" type="number" step="0.01" placeholder="0 = free" value={modForm.price_delta} onChange={e => setModForm(f => ({ ...f, price_delta: e.target.value }))} />
              </div>
              <div className="mn-field-row">
                <div className="mn-field">
                  <label>Sort Order</label>
                  <input className="mn-input" type="number" min="0" value={modForm.sort_order} onChange={e => setModForm(f => ({ ...f, sort_order: Number(e.target.value) }))} />
                </div>
                <div className="mn-field mn-inline" style={{ alignItems:'flex-end' }}>
                  <label>Default</label>
                  <button className={`mn-toggle ${modForm.is_default ? 'on' : 'off'}`} onClick={() => setModForm(f => ({ ...f, is_default: !f.is_default }))}><span className="mn-toggle-knob" /></button>
                </div>
              </div>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={() => setModModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveMod} disabled={saving}>{saving ? 'Saving...' : modModal === 'add' ? 'Add Option' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Link menu items modal */}
      {linkModal && activeGroup && (
        <div className="mn-overlay" onClick={() => setLinkModal(null)}>
          <div className="mn-modal mn-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">🔗 Link "{activeGroupData?.name}" to Menu Items</div>
              <button className="mn-modal-close" onClick={() => setLinkModal(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <div style={{ fontSize:12, color:'var(--t2)', marginBottom:14 }}>Toggle to link/unlink this modifier group to menu items</div>
              <div className="mod-link-grid">
                {menuItems.map(item => {
                  const linked = linkMap[item.id]?.has(activeGroup)
                  return (
                    <div key={item.id} className={`mod-link-item ${linked ? 'linked' : ''}`} onClick={() => toggleLink(item.id, activeGroup)}>
                      <span className="mod-link-check">{linked ? '✓' : '+'}</span>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600 }}>{item.name}</div>
                        <div style={{ fontSize:11, color:'var(--t3)' }}>{item.menu_categories?.name || 'No category'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="mn-modal-foot">
              <button className="btn btn-primary" onClick={() => setLinkModal(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {delConfirm && (
        <div className="mn-overlay" onClick={() => setDelConfirm(null)}>
          <div className="mn-modal mn-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head">
              <div className="mn-modal-title">🗑️ Delete {delConfirm.type === 'group' ? 'Group' : 'Option'}</div>
              <button className="mn-modal-close" onClick={() => setDelConfirm(null)}>✕</button>
            </div>
            <div className="mn-modal-body">
              <p style={{ color:'var(--t2)', fontSize:14, lineHeight:1.6 }}>
                Delete <strong style={{ color:'var(--text)' }}>{delConfirm.obj.name}</strong>?
                {delConfirm.type === 'group' && ' All options in this group will also be deleted.'}
              </p>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={() => setDelConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={saving} onClick={() => delConfirm.type === 'group' ? deleteGroup(delConfirm.obj) : deleteMod(delConfirm.obj)}>
                {saving ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
