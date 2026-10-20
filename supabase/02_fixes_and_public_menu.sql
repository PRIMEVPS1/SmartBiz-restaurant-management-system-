-- ═══════════════════════════════════════════════════════
-- SmartBiz Restaurant Management System
-- PATCH 02 — run AFTER schema.sql
--  1. tenants RLS policy (login ට අත්‍යවශ්‍යයි)
--  2. Public QR menu — secure RPC functions (anon key)
-- ═══════════════════════════════════════════════════════

-- 1. tenants: staff can read/update only their own tenant
DROP POLICY IF EXISTS "tenants_own_select" ON tenants;
DROP POLICY IF EXISTS "tenants_own_update" ON tenants;
CREATE POLICY "tenants_own_select" ON tenants FOR SELECT USING (id = get_tenant_id());
CREATE POLICY "tenants_own_update" ON tenants FOR UPDATE USING (id = get_tenant_id()) WITH CHECK (id = get_tenant_id());

-- 2a. Public: load menu by QR token (no direct table access for anon)
CREATE OR REPLACE FUNCTION get_qr_menu(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t restaurant_tables; ten tenants;
BEGIN
  SELECT * INTO t FROM restaurant_tables WHERE qr_code = p_token LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO ten FROM tenants WHERE id = t.tenant_id AND active;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'table', to_jsonb(t),
    'tenant', jsonb_build_object('id',ten.id,'name',ten.name,'currency',ten.currency,
              'service_charge',ten.service_charge,'tax_rate',ten.tax_rate,'logo_url',ten.logo_url),
    'categories', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sort_order)
                  FROM menu_categories c WHERE c.tenant_id = t.tenant_id AND c.active), '[]'::jsonb),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order)
                  FROM menu_items i WHERE i.tenant_id = t.tenant_id AND i.is_available), '[]'::jsonb)
  );
END $$;

-- 2b. Public: place order from QR (prices re-calculated server-side)
CREATE OR REPLACE FUNCTION place_qr_order(p_token TEXT, p_guest TEXT, p_items JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t restaurant_tables; ten tenants; o_id UUID; o_no TEXT;
        sub NUMERIC := 0; sc NUMERIC; tx NUMERIC; it JSONB; mi menu_items; q INT;
BEGIN
  SELECT * INTO t FROM restaurant_tables WHERE qr_code = p_token LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid QR'; END IF;
  SELECT * INTO ten FROM tenants WHERE id = t.tenant_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive tenant'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  INSERT INTO orders (tenant_id, order_number, type, table_id, status, guest_count, notes, subtotal, service_charge, tax, total)
  VALUES (t.tenant_id, '', 'dine_in', t.id, 'pending', 1,
          CASE WHEN COALESCE(p_guest,'') <> '' THEN 'Guest: ' || left(p_guest,60) ELSE '' END, 0,0,0,0)
  RETURNING id, order_number INTO o_id, o_no;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    q := LEAST(GREATEST(COALESCE((it->>'qty')::INT,1),1),50);
    SELECT * INTO mi FROM menu_items
      WHERE id = (it->>'id')::UUID AND tenant_id = t.tenant_id AND is_available;
    IF FOUND THEN
      INSERT INTO order_items (tenant_id, order_id, menu_item_id, name, price, quantity, notes, status)
      VALUES (t.tenant_id, o_id, mi.id, mi.name, mi.price, q, NULLIF(left(COALESCE(it->>'note',''),200),''), 'pending');
      sub := sub + mi.price * q;
    END IF;
  END LOOP;
  IF sub = 0 THEN RAISE EXCEPTION 'No valid items'; END IF;

  sc := sub * COALESCE(ten.service_charge,0) / 100;
  tx := (sub + sc) * COALESCE(ten.tax_rate,0) / 100;
  UPDATE orders SET subtotal = sub, service_charge = sc, tax = tx, total = sub + sc + tx, status = 'confirmed'
   WHERE id = o_id;
  UPDATE restaurant_tables SET status = 'occupied' WHERE id = t.id AND status = 'available';
  RETURN jsonb_build_object('order_id', o_id, 'order_number', o_no, 'total', sub + sc + tx);
END $$;

GRANT EXECUTE ON FUNCTION get_qr_menu(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION place_qr_order(TEXT, TEXT, JSONB) TO anon, authenticated;
