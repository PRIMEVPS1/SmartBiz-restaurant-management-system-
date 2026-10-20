// src/components/InstallPrompt.jsx — "Install app" button for Android/Chrome (PWA)
import { useEffect, useState } from 'react'

export default function InstallPrompt() {
  const [evt, setEvt] = useState(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setEvt(e) }
    const onInstalled = () => { setEvt(null); setHidden(true) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!evt || hidden) return null

  async function install() {
    evt.prompt()
    await evt.userChoice
    setEvt(null)
  }

  return (
    <div style={{
      position: 'fixed', left: 12, right: 12, bottom: 16, zIndex: 9999,
      background: '#0f151e', border: '1px solid rgba(41,182,246,0.5)', borderRadius: 14,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 30px rgba(0,0,0,0.5)', color: '#f0f4ff', fontSize: 14,
    }}>
      <span style={{ flex: 1 }}>📲 Install <strong>SmartBiz</strong> on your phone</span>
      <button onClick={install} style={{
        background: '#29b6f6', color: '#04131c', border: 0, borderRadius: 10,
        padding: '8px 14px', fontWeight: 700, cursor: 'pointer',
      }}>Install</button>
      <button onClick={() => setHidden(true)} aria-label="Dismiss" style={{
        background: 'transparent', color: '#9aa7bd', border: 0, fontSize: 18, cursor: 'pointer',
      }}>✕</button>
    </div>
  )
}
