// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase env vars. Check your .env file.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: { eventsPerSecond: 10 }
  }
})

// ─── Network status helper ───────────────────────────
export const isOnline = () => navigator.onLine

// Listen for online/offline events globally
window.addEventListener('online',  () => console.log('🟢 Back online — syncing...'))
window.addEventListener('offline', () => console.log('🔴 Offline mode active'))
