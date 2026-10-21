// src/pages/LoginPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import LogoMark from '../components/Logo'
import './LoginPage.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail]     = useState('')
  const [password, setPass]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Please enter email and password')
      return
    }
    setLoading(true)
    try {
      const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      toast.success('Welcome to SmartBiz!')
      const { data: staffRow } = await supabase.from('staff').select('id').eq('auth_id', auth.user.id).maybeSingle()
      if (!staffRow) {
        const { data: isAdmin } = await supabase.rpc('is_platform_admin')
        navigate(isAdmin ? '/admin' : '/register')
        return
      }
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-grid" />
      <div className="corner tl" />
      <div className="corner br" />

      <div className="login-card">
        <div className="brand">
          <LogoMark size={46} />
          <div>
            <div className="brand-name">Smart<span>Biz</span></div>
            <div className="brand-sub">RESTAURANT MANAGEMENT SYSTEM</div>
          </div>
        </div>

        <h1 className="login-title">Welcome back 👋</h1>
        <p className="login-sub">Sign in to your workspace to manage your business.</p>

        <form onSubmit={handleLogin}>
          <div className="fg">
            <label className="label">Email address</label>
            <input
              className="input"
              type="email"
              placeholder="admin@smartbiz.lk"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="fg">
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPass(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? '⏳ Signing in...' : '🚀 Sign in to SmartBiz'}
          </button>
        </form>

        <div className="login-footer" style={{ marginBottom: 8 }}>
          Need an account? Contact <span>SmartBiz</span> · info.smartbizsoftwares@gmail.com
        </div>
        <div className="login-footer">
          Powered by <span>SmartBiz</span> · Multi-tenant Cloud Platform
        </div>
      </div>
    </div>
  )
}
