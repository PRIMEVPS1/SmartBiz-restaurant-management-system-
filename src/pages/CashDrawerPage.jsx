// src/pages/CashDrawerPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'
import './CashDrawerPage.css'

export default function CashDrawerPage() {
  const { tenant, staff } = useStore()
  const [shifts,     setShifts]     = useState([])
  const [activeShift,setActiveShift]= useState(null)
  const [movements,  setMovements]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [openModal,  setOpenModal]  = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [moveModal,  setMoveModal]  = useState(false)
  const [openFloat,  setOpenFloat]  = useState('')
  const [closeCash,  setCloseCash]  = useState('')
  const [moveForm,   setMoveForm]   = useState({ type:'in', amount:'', reason:'' })
  const [saving,     setSaving]     = useState(false)

  useEffect(() => { if (tenant?.id) loadAll() }, [tenant?.id])

  async function loadAll() {
    setLoading(true)
    try {
      const [shiftRes, moveRes] = await Promise.all([
        supabase.from('cash_shifts').select('*, staff(name)').eq('tenant_id', tenant.id).order('opened_at', { ascending: false }).limit(20),
        supabase.from('cash_movements').select('*, staff(name)').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(100),
      ])
      if (shiftRes.error) throw shiftRes.error
      setShifts(shiftRes.data || [])
      setMovements(moveRes.data || [])
      const active = (shiftRes.data || []).find(s => s.status === 'open')
      setActiveShift(active || null)
    } catch(e) { toast.error(e.message) }
    finally    { setLoading(false) }
  }

  async function openShift() {
    if (!openFloat || isNaN(Number(openFloat))) { toast.error('Enter opening float'); return }
    setSaving(true)
    try {
      const { data, error } = await supabase.from('cash_shifts').insert({
        tenant_id: tenant.id, staff_id: staff.id,
        opening_float: Number(openFloat), status: 'open',
      }).select().single()
      if (error) throw error
      await supabase.from('cash_movements').insert({
        tenant_id: tenant.id, shift_id: data.id, type: 'in',
        amount: Number(openFloat), reason: 'Opening float', staff_id: staff.id,
      })
      toast.success('Shift opened!'); setOpenModal(false); setOpenFloat(''); await loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function closeShift() {
    if (!closeCash || isNaN(Number(closeCash))) { toast.error('Enter closing cash'); return }
    if (!activeShift) return
    setSaving(true)
    try {
      // Calculate expected: opening_float + all sales - all payouts
      const shiftMoves = movements.filter(m => m.shift_id === activeShift.id)
      const expected = shiftMoves.reduce((s, m) => s + (['in','sale'].includes(m.type) ? Number(m.amount) : -Number(m.amount)), 0)
      const variance = Number(closeCash) - expected

      const { error } = await supabase.from('cash_shifts').update({
        status: 'closed', closed_at: new Date().toISOString(),
        closing_cash: Number(closeCash), expected_cash: expected, variance,
      }).eq('id', activeShift.id)
      if (error) throw error
      toast.success(`Shift closed. Variance: Rs.${variance.toFixed(2)}`); setCloseModal(false); setCloseCash(''); await loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function addMovement() {
    if (!activeShift) { toast.error('No active shift'); return }
    if (!moveForm.amount || isNaN(Number(moveForm.amount))) { toast.error('Enter amount'); return }
    if (!moveForm.reason.trim()) { toast.error('Enter reason'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('cash_movements').insert({
        tenant_id: tenant.id, shift_id: activeShift.id,
        type: moveForm.type, amount: Number(moveForm.amount),
        reason: moveForm.reason.trim(), staff_id: staff.id,
      })
      if (error) throw error
      toast.success('Movement recorded!'); setMoveModal(false); setMoveForm({ type:'in', amount:'', reason:'' }); await loadAll()
    } catch(e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const activeMovements = movements.filter(m => m.shift_id === activeShift?.id)
  const currentBalance  = activeMovements.reduce((s, m) => s + (['in','sale'].includes(m.type) ? Number(m.amount) : -Number(m.amount)), 0)

  function fmtTime(d) { return d ? new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—' }

  return (
    <div className="page-wrap">
      <div className="topbar">
        <div className="topbar-title">Cash Drawer</div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn" onClick={loadAll} disabled={loading}>🔄</button>
          {!activeShift
            ? <button className="btn btn-primary" onClick={() => setOpenModal(true)}>🔓 Open Shift</button>
            : <>
                <button className="btn" onClick={() => setMoveModal(true)}>± Movement</button>
                <button className="btn btn-danger" onClick={() => setCloseModal(true)}>🔒 Close Shift</button>
              </>
          }
        </div>
      </div>

      {/* Active shift banner */}
      {activeShift ? (
        <div className="cash-active-banner">
          <div className="cash-active-info">
            <span className="cash-active-dot">●</span>
            <span>Shift Active — Opened by <strong>{activeShift.staff?.name}</strong> at {fmtTime(activeShift.opened_at)}</span>
          </div>
          <div className="cash-balance">
            <span style={{ fontSize:12, color:'var(--t2)' }}>Current Balance:</span>
            <span className="cash-balance-val">Rs. {currentBalance.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
          </div>
        </div>
      ) : (
        <div className="inv-alert" style={{ margin:'16px 24px', cursor:'default' }}>
          🔴 No active shift — open a shift to start accepting payments
        </div>
      )}

      {/* Stats */}
      {activeShift && (
        <div className="mn-stats" style={{ padding:'0 24px 0' }}>
          <div className="mn-stat green">
            <span className="mn-stat-val">Rs.{activeShift.opening_float?.toLocaleString()}</span>
            <span className="mn-stat-lbl">Opening Float</span>
          </div>
          <div className="mn-stat blue">
            <span className="mn-stat-val">{activeMovements.filter(m=>m.type==='in').length}</span>
            <span className="mn-stat-lbl">Cash In Movements</span>
          </div>
          <div className="mn-stat red">
            <span className="mn-stat-val">{activeMovements.filter(m=>m.type==='out').length}</span>
            <span className="mn-stat-lbl">Cash Out Movements</span>
          </div>
          <div className="mn-stat amber">
            <span className="mn-stat-val">Rs.{currentBalance.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}</span>
            <span className="mn-stat-lbl">Expected in Drawer</span>
          </div>
        </div>
      )}

      {/* Movement log */}
      {activeShift && (
        <div style={{ padding:'20px 24px' }}>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:15, marginBottom:12 }}>Movement Log — Current Shift</div>
          {activeMovements.length === 0 ? (
            <div style={{ color:'var(--t2)', fontSize:13 }}>No movements yet</div>
          ) : (
            <div className="inv-table-wrap">
              <table className="inv-table">
                <thead><tr><th>Time</th><th>Type</th><th>Amount</th><th>Reason</th><th>Staff</th></tr></thead>
                <tbody>
                  {activeMovements.map(m => (
                    <tr key={m.id}>
                      <td className="inv-date">{fmtTime(m.created_at)}</td>
                      <td><span className={`log-type-pill ${m.type}`}>{m.type === 'in' ? '▲ In' : m.type === 'out' ? '▼ Out' : m.type === 'sale' ? '💵 Sale' : '↩ Refund'}</span></td>
                      <td className="inv-qty"><span className={`qty-val ${['in','sale'].includes(m.type) ? 'ok' : 'low'}`}>{['in','sale'].includes(m.type) ? '+' : '-'}Rs.{Number(m.amount).toLocaleString()}</span></td>
                      <td className="inv-reason">{m.reason}</td>
                      <td className="inv-staff">{m.staff?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Past shifts */}
      {shifts.filter(s => s.status === 'closed').length > 0 && (
        <div style={{ padding:'0 24px 24px' }}>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:15, marginBottom:12 }}>Past Shifts</div>
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead><tr><th>Opened</th><th>Closed</th><th>Staff</th><th>Opening</th><th>Expected</th><th>Actual</th><th>Variance</th></tr></thead>
              <tbody>
                {shifts.filter(s => s.status === 'closed').map(s => (
                  <tr key={s.id}>
                    <td className="inv-date">{fmtTime(s.opened_at)}</td>
                    <td className="inv-date">{fmtTime(s.closed_at)}</td>
                    <td>{s.staff?.name || '—'}</td>
                    <td>Rs.{Number(s.opening_float).toLocaleString()}</td>
                    <td>Rs.{Number(s.expected_cash||0).toLocaleString()}</td>
                    <td>Rs.{Number(s.closing_cash||0).toLocaleString()}</td>
                    <td>
                      <span className={`qty-val ${s.variance >= 0 ? 'ok' : 'low'}`}>
                        {s.variance >= 0 ? '+' : ''}Rs.{Number(s.variance||0).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Open shift modal */}
      {openModal && (
        <div className="mn-overlay" onClick={() => setOpenModal(false)}>
          <div className="mn-modal mn-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head"><div className="mn-modal-title">🔓 Open Shift</div><button className="mn-modal-close" onClick={() => setOpenModal(false)}>✕</button></div>
            <div className="mn-modal-body">
              <div className="mn-field">
                <label>Opening Float (LKR) *</label>
                <input className="mn-input" type="number" min="0" step="0.01" placeholder="e.g. 5000.00" value={openFloat} onChange={e => setOpenFloat(e.target.value)} autoFocus />
              </div>
              <div style={{ fontSize:12, color:'var(--t2)' }}>Count the cash in the drawer and enter the total amount before opening the shift.</div>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={() => setOpenModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={openShift} disabled={saving}>{saving ? 'Opening...' : 'Open Shift'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Close shift modal */}
      {closeModal && (
        <div className="mn-overlay" onClick={() => setCloseModal(false)}>
          <div className="mn-modal mn-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head"><div className="mn-modal-title">🔒 Close Shift</div><button className="mn-modal-close" onClick={() => setCloseModal(false)}>✕</button></div>
            <div className="mn-modal-body">
              <div className="inv-calc-box" style={{ marginBottom:14 }}>
                <span>Expected in drawer:</span>
                <strong>Rs. {currentBalance.toFixed(2)}</strong>
              </div>
              <div className="mn-field">
                <label>Actual Cash Count (LKR) *</label>
                <input className="mn-input" type="number" min="0" step="0.01" placeholder="Count and enter actual cash" value={closeCash} onChange={e => setCloseCash(e.target.value)} autoFocus />
              </div>
              {closeCash && !isNaN(Number(closeCash)) && (
                <div className={`inv-calc-box ${Number(closeCash) - currentBalance < 0 ? '' : ''}`}>
                  <span>Variance:</span>
                  <strong style={{ color: (Number(closeCash) - currentBalance) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {(Number(closeCash) - currentBalance) >= 0 ? '+' : ''}Rs. {(Number(closeCash) - currentBalance).toFixed(2)}
                  </strong>
                </div>
              )}
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={() => setCloseModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={closeShift} disabled={saving}>{saving ? 'Closing...' : 'Close Shift'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Movement modal */}
      {moveModal && (
        <div className="mn-overlay" onClick={() => setMoveModal(false)}>
          <div className="mn-modal mn-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="mn-modal-head"><div className="mn-modal-title">± Cash Movement</div><button className="mn-modal-close" onClick={() => setMoveModal(false)}>✕</button></div>
            <div className="mn-modal-body">
              <div className="mn-field">
                <label>Type</label>
                <div style={{ display:'flex', gap:8 }}>
                  {[{id:'in',label:'Cash In'},{id:'out',label:'Cash Out'}].map(t => (
                    <button key={t.id} className={`rm-amenity-btn ${moveForm.type===t.id?'selected':''}`} style={{ flex:1, textAlign:'center' }}
                      onClick={() => setMoveForm(f => ({ ...f, type: t.id }))}>{t.label}</button>
                  ))}
                </div>
              </div>
              <div className="mn-field">
                <label>Amount (LKR) *</label>
                <input className="mn-input" type="number" min="0" step="0.01" value={moveForm.amount} onChange={e => setMoveForm(f => ({ ...f, amount: e.target.value }))} autoFocus />
              </div>
              <div className="mn-field">
                <label>Reason *</label>
                <input className="mn-input" placeholder="e.g. Petty cash, Supplier payment..." value={moveForm.reason} onChange={e => setMoveForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
            </div>
            <div className="mn-modal-foot">
              <button className="btn" onClick={() => setMoveModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addMovement} disabled={saving}>{saving ? 'Saving...' : 'Record Movement'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
