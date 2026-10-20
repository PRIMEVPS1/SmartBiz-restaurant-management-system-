-- ═══════════════════════════════════════════════════════
-- SmartBiz — PATCH 04  (run AFTER 02)
--  • Register new restaurant (multi-tenant onboarding)
--  • Super Admin (platform_admins) functions
--  • Logo storage bucket
--  • BYOB corkage + receipt settings
-- ═══════════════════════════════════════════════════════

-- 1. New columns
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS corkage_fee    NUMERIC(10,2) DEFAULT 0;   -- per bottle (BYOB)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS receipt_width  INT DEFAULT 80;            -- 58 or 80 (mm)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS receipt_footer TEXT;
ALTER TABLE bills   ADD COLUMN IF NOT EXISTS byob_bottles   INT DEFAULT 0;
ALTER TABLE bills   ADD COLUMN IF NOT EXISTS corkage        NUMERIC(10,2) DEFAULT 0;

-- 2. Only owner/manager may edit tenant settings
DROP POLICY IF EXISTS "tenants_own_update" ON tenants;
CREATE POLICY "tenants_own_update" ON tenants FOR UPDATE
  USING (id = get_tenant_id() AND EXISTS (SELECT 1 FROM staff WHERE auth_id = auth.uid() AND role IN ('owner','manager')))
  WITH CHECK (id = get_tenant_id());

-- 3. Platform (super) admins — no direct table access, only via functions
CREATE TABLE IF NOT EXISTS platform_admins (auth_id UUID PRIMARY KEY);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE auth_id = auth.uid());
$$;

-- 4. Register a new restaurant for the logged-in auth user
CREATE OR REPLACE FUNCTION register_restaurant(
  p_name TEXT, p_slug TEXT, p_owner_name TEXT, p_phone TEXT DEFAULT NULL, p_address TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_slug TEXT; v_tid UUID; v_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not logged in'; END IF;
  IF EXISTS (SELECT 1 FROM staff WHERE auth_id = auth.uid()) THEN RAISE EXCEPTION 'This account already belongs to a restaurant'; END IF;
  IF length(trim(COALESCE(p_name,''))) < 2 THEN RAISE EXCEPTION 'Restaurant name required'; END IF;

  v_slug := regexp_replace(lower(trim(COALESCE(NULLIF(p_slug,''), p_name))), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  IF v_slug = '' THEN v_slug := 'restaurant-' || substr(md5(random()::text),1,6); END IF;
  IF EXISTS (SELECT 1 FROM tenants WHERE slug = v_slug) THEN RAISE EXCEPTION 'Slug "%" already taken', v_slug; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO tenants (name, slug, phone, address, email, currency, service_charge, tax_rate, plan)
  VALUES (trim(p_name), v_slug, p_phone, p_address, v_email, 'LKR', 10, 0, 'free')
  RETURNING id INTO v_tid;

  INSERT INTO staff (tenant_id, auth_id, name, email, role)
  VALUES (v_tid, auth.uid(), COALESCE(NULLIF(trim(p_owner_name),''), 'Owner'), v_email, 'owner');

  RETURN jsonb_build_object('tenant_id', v_tid, 'slug', v_slug);
END $$;
GRANT EXECUTE ON FUNCTION register_restaurant(TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

-- 5. Super admin: list + update tenants
CREATE OR REPLACE FUNCTION admin_list_tenants()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'slug', t.slug, 'plan', t.plan, 'active', t.active,
      'phone', t.phone, 'email', t.email, 'logo_url', t.logo_url, 'created_at', t.created_at,
      'staff_count',  (SELECT count(*) FROM staff  s WHERE s.tenant_id = t.id),
      'orders_count', (SELECT count(*) FROM orders o WHERE o.tenant_id = t.id),
      'last_order_at',(SELECT max(created_at) FROM orders o WHERE o.tenant_id = t.id)
    ) ORDER BY t.created_at DESC) FROM tenants t), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION admin_update_tenant(p_id UUID, p_active BOOLEAN, p_plan TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_plan NOT IN ('free','pro','enterprise') THEN RAISE EXCEPTION 'Bad plan'; END IF;
  UPDATE tenants SET active = p_active, plan = p_plan WHERE id = p_id;
END $$;
GRANT EXECUTE ON FUNCTION is_platform_admin(), admin_list_tenants(), admin_update_tenant(UUID,BOOLEAN,TEXT) TO authenticated;

-- 6. Suspended tenants cannot load data (staff row stays, tenant.active=false is checked in app + QR menu)

-- 7. Logo storage (public read, tenant-folder write)
INSERT INTO storage.buckets (id, name, public) VALUES ('logos','logos', true) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "logos_read"   ON storage.objects;
DROP POLICY IF EXISTS "logos_write"  ON storage.objects;
DROP POLICY IF EXISTS "logos_update" ON storage.objects;
DROP POLICY IF EXISTS "logos_delete" ON storage.objects;
CREATE POLICY "logos_read"   ON storage.objects FOR SELECT USING (bucket_id = 'logos');
CREATE POLICY "logos_write"  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos' AND (storage.foldername(name))[1] = get_tenant_id()::text);
CREATE POLICY "logos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = get_tenant_id()::text);
CREATE POLICY "logos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = get_tenant_id()::text);

-- 8. Make YOURSELF the platform admin (after creating your auth user):
-- INSERT INTO platform_admins (auth_id) SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL@example.com';
