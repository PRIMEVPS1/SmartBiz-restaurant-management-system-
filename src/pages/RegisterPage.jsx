// src/pages/RegisterPage.jsx — create a new restaurant (multi-tenant onboarding)
import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import LogoMark from '../components/Logo'
import toast from 'react-hot-toast'
import './LoginPage.css'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ owner:'', email:'', password:'', name:'', slug:'', phone:'', address:'' })
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const s = data.session
      if (s) {
        const { data: admin } = await supabase.rpc('is_platform_admin')
        if (admin) { navigate('/admin', { replace: true }); return }
        const { data: staffRow } = await supabase.from('staff').select('id').eq('auth_id', s.user.id).maybeSingle()
        if (staffRow) {
          toast.error('This account already has a restaurant (it may be suspended). Contact SmartBiz support.')
          await supabase.auth.signOut(); useStore.getState().logout()
          navigate('/login', { replace: true }); return
        }
      }
      setSession(s); setChecking(false)
    })
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Restaurant name required')
    setLoading(true)
    try {
      let sess = session
      if (!sess) {
        if (!form.email || form.password.length < 6) throw new Error('Email and a password (6+ chars) required')
        const { data, error } = await supabase.auth.signUp({ email: form.email, password: form.password })
        if (error) throw error
        sess = data.session
        if (!sess) {
          toast.success('Check your email to confirm, then log in — you will return here to finish.', { duration: 8000 })
          navigate('/login'); return
        }
      }
      const { error } = await supabase.rpc('register_restaurant', {
        p_name: form.name, p_slug: form.slug, p_owner_name: form.owner,
        p_phone: form.phone || null, p_address: form.address || null,
      })
      if (error) throw error

      const { data: staff } = await supabase.from('staff').select('*, tenants(*)').eq('auth_id', sess.user.id).single()
      const st = useStore.getState()
      st.setUser(sess.user)
      if (staff) { st.setStaff(staff); st.setTenant(staff.tenants) }
      toast.success('Restaurant created! Add your logo in Settings.')
      navigate('/settings')
    } catch (err) {
      toast.error(err.message || 'Registration failed')
    } finally { setLoading(false) }
  }

  if (checking) return null

  return (
    <div className="login-page">
      <div className="login-bg" /><div className="login-grid" />
      <div className="login-card">
        <div className="brand">
          <LogoMark size={46} />
          <div>
            <div className="brand-name">Smart<span>Biz</span></div>
            <div className="brand-sub">RESTAURANT MANAGEMENT SYSTEM</div>
          </div>
        </div>
        <h1 className="login-title">{session ? 'Finish setting up' : 'Create your restaurant'}</h1>
        <p className="login-sub">{session ? 'Tell us about your restaurant.' : 'Create an owner account and your restaurant workspace.'}</p>

        <form onSubmit={submit}>
          {!session && (<>
            <div className="fg"><label className="label">Your name</label>
              <input className="input" value={form.owner} onChange={set('owner')} /></div>
            <div className="fg"><label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" /></div>
            <div className="fg"><label className="label">Password</label>
              <input className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" /></div>
          </>)}
          {session && (
            <div className="fg"><label className="label">Your name</label>
              <input className="input" value={form.owner} onChange={set('owner')} /></div>
          )}
          <div className="fg"><label className="label">Restaurant name *</label>
            <input className="input" value={form.name} onChange={set('name')} /></div>
          <div className="fg"><label className="label">Short ID (optional, letters/numbers)</label>
            <input className="input" placeholder="my-restaurant" value={form.slug} onChange={set('slug')} /></div>
          <div className="fg"><label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={set('phone')} /></div>
          <div className="fg"><label className="label">Address</label>
            <input className="input" value={form.address} onChange={set('address')} /></div>
          <button className="login-btn" type="submit" disabled={loading}>{loading ? '⏳ Creating...' : '🚀 Create restaurant'}</button>
        </form>

        {!session && <div className="login-footer">Already have an account? <Link to="/login"><span>Sign in</span></Link></div>}
      </div>
    </div>
  )
}
