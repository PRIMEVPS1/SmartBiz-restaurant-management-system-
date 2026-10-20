# SmartBiz Restaurant Management System

POS, kitchen display, QR ordering, inventory, rooms, reservations, loyalty, reports and cash drawer — built for Sri Lankan restaurants and hotels.

**Stack:** Vite + React 18 · Supabase (Postgres, Auth, Realtime) · Zustand · PWA/offline (IndexedDB)

## 1. Supabase setup
1. Create a project at supabase.com
2. SQL Editor → run in order:
   - `supabase/schema.sql`
   - `supabase/02_fixes_and_public_menu.sql`
   - `supabase/04_multitenant_admin_byob.sql` (register restaurant, super admin, logo storage, BYOB)
   - `supabase/03_seed_demo.sql` (optional demo data)
3. Authentication → Providers → Email → turn OFF "Confirm email" (so new restaurants can register instantly)
4. Open the app → `/register` → create YOUR account + a restaurant (or just any account)
5. Make yourself Super Admin: run the commented `INSERT INTO platform_admins ...` at the bottom of `04_...sql` with your email, then open `/admin`
6. Settings → API → copy Project URL and anon key

## Multi-tenant flow
- New restaurant: `/register` (owner account + restaurant). Each restaurant sees only its own data (RLS).
- Settings → upload logo, tax/service charge, BYOB corkage fee per bottle, receipt width (58/80 mm), footer.
- Super Admin: `/admin` lists all restaurants; change plan or suspend/activate.
- Bills print logo + name + address on 58/80mm thermal paper (browser print → thermal printer driver).

## 2. Local run
```bash
npm install
cp .env.example .env     # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

## 3. Deploy: GitHub + Cloudflare Pages
```bash
git init && git add . && git commit -m "SmartBiz Restaurant Management System"
git branch -M main
git remote add origin https://github.com/<you>/smartbiz-restaurant.git
git push -u origin main
```
Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git:
- Framework preset: **Vite** (or None)
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `NODE_VERSION=20`

`public/_redirects` already handles React Router deep links (/menu/<token>, /dashboard ...).
