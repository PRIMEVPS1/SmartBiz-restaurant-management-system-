// src/pages/SettingsPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'
import './SettingsPage.css'

const CURRENCIES = ['LKR','USD','EUR','GBP','INR']

export default function SettingsPage() {
  const { tenant, setTenant, staff } = useStore()
  const [tab, setTab] = useState('general')
  const [form, setForm] = useState({
    name:'', slug:'', address:'', phone:'', email:'',
    currency:'LKR', service_charge:10, tax_rate:8,
    corkage_fee:0, receipt_width:80, receipt_footer:'',
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (tenant) {
      setForm({
        name: tenant.name||'', slug: tenant.slug||'', address: tenant.address||'',
        phone: tenant.phone||'', email: tenant.email||'',
        currency: tenant.currency||'LKR', service_charge: tenant.service_charge ?? 10,
        tax_rate: tenant.tax_rate ?? 8,
        corkage_fee: tenant.corkage_fee ?? 0, receipt_width: tenant.receipt_width || 80,
        receipt_footer: tenant.receipt_footer || '',
      })
    }
  }, [tenant])

  async function save() {
    if (!form.name.trim()) { toast.error('Business name required'); return }
    setSaving(true)
    try {
      const payload = { ...form, service_charge:Number(form.service_charge), tax_rate:Number(form.tax_rate),
        corkage_fee:Number(form.corkage_fee||0), receipt_width:Number(form.receipt_width) }
      const { data, error } = await supabase.from('tenants').update(payload).eq('id', tenant.id).select().single()
      if (error) throw error
      setTenant(data)
      toast.success('Settings saved!')
    } catch(e) { toast.error(e.message) }
    finally    { setSaving(false) }
  }

  async function uploadLogo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image'); return }
    setUploading(true)
    try {
      // resize to max 480px so receipts stay light
      const bmp = await createImageBitmap(file)
      const scale = Math.min(1, 480 / Math.max(bmp.width, bmp.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'))
      const path = `${tenant.id}/logo-${Date.now()}.png`
      const { error: upErr } = await supabase.storage.from('logos').upload(path, blob, { contentType: 'image/png', upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('logos').getPublicUrl(path)
      const { data, error } = await supabase.from('tenants').update({ logo_url: pub.publicUrl }).eq('id', tenant.id).select().single()
      if (error) throw error
      setTenant(data)
      toast.success('Logo updated!')
    } catch (err) { toast.error(err.message || 'Upload failed') }
    finally { setUploading(false) }
  }

  const isOwner = staff?.role === 'owner' || staff?.role === 'manager'

  return (
    <div className="page-wrap">
      <div className="topbar"><div className="topbar-title">Settings</div></div>

      <div className="set-tabs">
        {[
          {id:'general', label:'🏢 General'},
          {id:'billing', label:'💵 Tax & Billing'},
          {id:'plan',    label:'💎 Plan'},
          {id:'about',   label:'ℹ️ About'},
        ].map(t => (
          <button key={t.id} className={`set-tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div className="set-body">
        {tab === 'general' && (
          <div className="card" style={{maxWidth:560}}>
            <div className="card-head"><div className="card-title">Business Information</div></div>
            <div className="card-body">
              <div className="mn-field">
                <label>Logo (printed on bills)</label>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  {tenant?.logo_url
                    ? <img src={tenant.logo_url} alt="logo" style={{width:64,height:64,objectFit:'contain',background:'#fff',borderRadius:10}} />
                    : <div style={{width:64,height:64,borderRadius:10,background:'var(--s3)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--t3)',fontSize:11}}>No logo</div>}
                  {isOwner && <label className="btn" style={{cursor:'pointer'}}>
                    {uploading ? 'Uploading...' : '📷 Upload logo'}
                    <input type="file" accept="image/*" onChange={uploadLogo} disabled={uploading} style={{display:'none'}} />
                  </label>}
                </div>
              </div>
              <div className="mn-field">
                <label>Business Name *</label>
                <input className="mn-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} disabled={!isOwner} />
              </div>
              <div className="mn-field">
                <label>Slug (login identifier)</label>
                <input className="mn-input" value={form.slug} disabled />
              </div>
              <div className="mn-field">
                <label>Address</label>
                <textarea className="mn-input mn-textarea" rows={2} value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} disabled={!isOwner} />
              </div>
              <div className="mn-field-row">
                <div className="mn-field"><label>Phone</label><input className="mn-input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} disabled={!isOwner} /></div>
                <div className="mn-field"><label>Email</label><input className="mn-input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} disabled={!isOwner} /></div>
              </div>
              {isOwner && <button className="btn btn-primary" onClick={save} disabled={saving} style={{marginTop:8}}>{saving?'Saving...':'Save Changes'}</button>}
              {!isOwner && <div className="set-readonly-note">⚠️ Only owners can edit business settings</div>}
            </div>
          </div>
        )}

        {tab === 'billing' && (
          <div className="card" style={{maxWidth:560}}>
            <div className="card-head"><div className="card-title">Tax & Billing Configuration</div></div>
            <div className="card-body">
              <div className="mn-field">
                <label>Currency</label>
                <select className="mn-input" value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))} disabled={!isOwner}>
                  {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="mn-field-row">
                <div className="mn-field">
                  <label>Service Charge (%)</label>
                  <input className="mn-input" type="number" min="0" max="100" step="0.5" value={form.service_charge} onChange={e=>setForm(f=>({...f,service_charge:e.target.value}))} disabled={!isOwner} />
                </div>
                <div className="mn-field">
                  <label>Tax / VAT Rate (%)</label>
                  <input className="mn-input" type="number" min="0" max="100" step="0.5" value={form.tax_rate} onChange={e=>setForm(f=>({...f,tax_rate:e.target.value}))} disabled={!isOwner} />
                </div>
              </div>
              <div className="mn-field-row">
                <div className="mn-field">
                  <label>BYOB corkage fee (per bottle)</label>
                  <input className="mn-input" type="number" min="0" step="1" value={form.corkage_fee} onChange={e=>setForm(f=>({...f,corkage_fee:e.target.value}))} disabled={!isOwner} />
                </div>
                <div className="mn-field">
                  <label>Receipt paper width</label>
                  <select className="mn-input" value={form.receipt_width} onChange={e=>setForm(f=>({...f,receipt_width:e.target.value}))} disabled={!isOwner}>
                    <option value={58}>58 mm</option><option value={80}>80 mm</option>
                  </select>
                </div>
              </div>
              <div className="mn-field">
                <label>Receipt footer message</label>
                <input className="mn-input" placeholder="Thank you! Come again." value={form.receipt_footer} onChange={e=>setForm(f=>({...f,receipt_footer:e.target.value}))} disabled={!isOwner} />
              </div>
              <div className="set-preview">
                <div className="set-preview-title">Bill Preview (Rs. 1,000 order)</div>
                <div className="set-preview-row"><span>Subtotal</span><span>Rs. 1,000.00</span></div>
                <div className="set-preview-row"><span>Service Charge ({form.service_charge}%)</span><span>Rs. {(1000*form.service_charge/100).toFixed(2)}</span></div>
                <div className="set-preview-row"><span>Tax ({form.tax_rate}%)</span><span>Rs. {(1000*form.tax_rate/100).toFixed(2)}</span></div>
                <div className="set-preview-row total"><span>Total</span><span>Rs. {(1000 + 1000*form.service_charge/100 + 1000*form.tax_rate/100).toFixed(2)}</span></div>
              </div>
              {isOwner && <button className="btn btn-primary" onClick={save} disabled={saving} style={{marginTop:8}}>{saving?'Saving...':'Save Changes'}</button>}
            </div>
          </div>
        )}

        {tab === 'plan' && (
          <div className="card" style={{maxWidth:560}}>
            <div className="card-head"><div className="card-title">Subscription Plan</div></div>
            <div className="card-body">
              <div className="set-plan-current">
                <div>
                  <div className="set-plan-label">Current Plan</div>
                  <div className="set-plan-name">{(tenant?.plan||'free').toUpperCase()}</div>
                </div>
                <span className="inv-status-pill green">Active</span>
              </div>
              <div className="set-plan-grid">
                {[
                  {id:'free', name:'Free', price:'Rs. 0', features:['1 location','Up to 5 staff','Basic reports']},
                  {id:'pro', name:'Pro', price:'Rs. 4,990/mo', features:['Unlimited staff','Advanced reports','Priority support','Loyalty & CRM']},
                  {id:'enterprise', name:'Enterprise', price:'Custom', features:['Multi-branch','API access','Dedicated support']},
                ].map(p => (
                  <div key={p.id} className={`set-plan-card ${tenant?.plan===p.id?'active':''}`}>
                    <div className="set-plan-card-name">{p.name}</div>
                    <div className="set-plan-card-price">{p.price}</div>
                    <ul className="set-plan-features">
                      {p.features.map(f=><li key={f}>✓ {f}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'about' && (
          <div className="card" style={{maxWidth:560}}>
            <div className="card-head"><div className="card-title">About SmartBiz Restaurant Management System</div></div>
            <div className="card-body">
              <div className="sf-detail">Version: 1.0.0</div>
              <div className="sf-detail">Tenant ID: {tenant?.id}</div>
              <div className="sf-detail">Plan: {tenant?.plan}</div>
              <div className="sf-detail">Logged in as: {staff?.name} ({staff?.role})</div>
              <div style={{marginTop:16,fontSize:12,color:'var(--t3)'}}>SmartBiz Restaurant Management System — built for Sri Lankan businesses 🇱🇰</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
