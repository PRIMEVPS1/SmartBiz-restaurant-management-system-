-- ═══════════════════════════════════════════════════════
-- SmartBiz — DEMO DATA (optional). Run AFTER 02 patch.
-- Tenant 'grandpalace' schema.sql එකෙන් දැනටමත් හැදිලා.
-- ═══════════════════════════════════════════════════════
DO $$
DECLARE tid UUID; c1 UUID; c2 UUID; c3 UUID;
BEGIN
  SELECT id INTO tid FROM tenants WHERE slug = 'grandpalace';
  IF tid IS NULL THEN RAISE EXCEPTION 'Tenant grandpalace not found'; END IF;

  INSERT INTO menu_categories (tenant_id, name, sort_order, active) VALUES (tid,'Starters',1,true) RETURNING id INTO c1;
  INSERT INTO menu_categories (tenant_id, name, sort_order, active) VALUES (tid,'Mains',2,true)    RETURNING id INTO c2;
  INSERT INTO menu_categories (tenant_id, name, sort_order, active) VALUES (tid,'Drinks',3,true)   RETURNING id INTO c3;

  INSERT INTO menu_items (tenant_id, category_id, name, price, is_available, sort_order) VALUES
    (tid,c1,'Vegetable Spring Rolls',650,true,1),
    (tid,c1,'Devilled Chicken',1450,true,2),
    (tid,c2,'Chicken Fried Rice',1350,true,1),
    (tid,c2,'Seafood Kottu',1750,true,2),
    (tid,c2,'Rice & Curry',1100,true,3),
    (tid,c3,'Fresh Lime Juice',450,true,1),
    (tid,c3,'Ceylon Milk Tea',300,true,2);

  INSERT INTO restaurant_tables (tenant_id, number, section, capacity) VALUES
    (tid,'T1','main',4),(tid,'T2','main',4),(tid,'T3','outdoor',2),(tid,'T4','vip',6)
  ON CONFLICT DO NOTHING;
END $$;

-- ───────────────────────────────────────────────
-- OWNER ACCOUNT LINK  (මේක අනිවාර්යයි)
-- 1. Supabase → Authentication → Users → Add user (email+password)
-- 2. පහත email එක ඔයාගේ email එකට මාරු කරලා run කරන්න
-- ───────────────────────────────────────────────
-- INSERT INTO staff (tenant_id, auth_id, name, role, email)
-- SELECT t.id, u.id, 'Lakmal Kulasinghe', 'owner', u.email
-- FROM tenants t, auth.users u
-- WHERE t.slug='grandpalace' AND u.email='YOUR_EMAIL@example.com';
