// src/components/LockedScreen.jsx — shown when the restaurant's subscription has expired (after grace days)
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import { SUPPORT } from '../lib/support'
import LogoMark from './Logo'

export default function LockedScreen({ sub }) {
  async function logout() {
    await supabase.auth.signOut()
    useStore.getState().logout()
    window.location.href = '/login'
  }
  const msg = encodeURIComponent(`Hello SmartBiz, I'd like to renew the subscription for ${sub?.name || 'my restaurant'}.`)
  const box = { maxWidth: 440, width: '100%', background: '#0f151e', border: '1px solid rgba(255,255,255,.1)', borderRadius: 20, padding: 28, textAlign: 'center' }
  const btn = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '13px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: '#f0f4ff', fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', marginTop: 10, fontFamily: 'inherit' }
  return (
    <div style={{ minHeight: '100vh', background: '#080b12', color: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><LogoMark size={46} /></div>
        <div style={{ fontSize: 44 }}>🔒</div>
        <h2 style={{ margin: '8px 0 6px', fontSize: 22 }}>Subscription expired</h2>
        <p style={{ color: '#9aa7bd', fontSize: 14, lineHeight: 1.6, margin: '0 0 6px' }}>
          {sub?.name ? <b style={{ color: '#f0f4ff' }}>{sub.name}</b> : 'Your restaurant'} is locked because the payment was not received
          {sub?.paid_until ? <> (paid until <b style={{ color: '#f0f4ff' }}>{sub.paid_until}</b>)</> : null}.
        </p>
        {Number(sub?.monthly_fee) > 0 && <p style={{ color: '#9aa7bd', fontSize: 14, margin: '0 0 10px' }}>Monthly fee: <b style={{ color: '#29b6f6' }}>Rs. {Number(sub.monthly_fee).toLocaleString()}</b></p>}
        <p style={{ color: '#9aa7bd', fontSize: 13, margin: '0 0 6px' }}>Your data is safe. The system opens again as soon as the payment is confirmed.</p>
        {SUPPORT.whatsapp && <a style={{ ...btn, background: '#25d366', color: '#04200e', border: 0 }} href={`https://wa.me/${SUPPORT.whatsapp}?text=${msg}`} target="_blank" rel="noreferrer">💬 WhatsApp SmartBiz</a>}
        <a style={btn} href={`mailto:${SUPPORT.email}?subject=${encodeURIComponent('Subscription renewal')}&body=${msg}`}>✉️ {SUPPORT.email}</a>
        <button style={btn} onClick={() => window.location.reload()}>🔄 I have paid — check again</button>
        <button style={{ ...btn, border: 0, color: '#7b879c' }} onClick={logout}>↩ Logout</button>
      </div>
    </div>
  )
}
