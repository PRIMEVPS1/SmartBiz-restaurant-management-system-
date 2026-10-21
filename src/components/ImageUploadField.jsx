// src/components/ImageUploadField.jsx — photo upload (phone camera/gallery) for menu items
import { useState } from 'react'
import toast from 'react-hot-toast'
import { uploadImage } from '../lib/image'

export default function ImageUploadField({ value, onChange, tenantId, label = 'Item photo' }) {
  const [busy, setBusy] = useState(false)

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const url = await uploadImage('menu-images', tenantId, file, { max: 800 })
      onChange(url)
      toast.success('Photo uploaded')
    } catch (err) { toast.error(err.message || 'Upload failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="mn-field">
      <label>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {value
          ? <img src={value} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10 }}
                 onError={e => { e.target.style.display = 'none' }} />
          : <div style={{ width: 72, height: 72, borderRadius: 10, background: 'rgba(255,255,255,0.05)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🍽️</div>}
        <label className="btn" style={{ cursor: 'pointer' }}>
          {busy ? 'Uploading...' : '📷 Upload photo'}
          <input type="file" accept="image/*" onChange={pick} disabled={busy} style={{ display: 'none' }} />
        </label>
        {value && <button type="button" className="btn" onClick={() => onChange('')}>Remove</button>}
      </div>
    </div>
  )
}
