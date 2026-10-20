-- ═══════════════════════════════════════════════════════
-- SmartBiz Restaurant Management System — Complete Supabase Schema
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- ENABLE UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- 1. TENANTS (Hotels / Restaurants)
-- ─────────────────────────────────────────────
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,           -- subdomain / login key
  logo_url      TEXT,
  address       TEXT,
  phone         TEXT,
  email         TEXT,
  currency      TEXT DEFAULT 'LKR',
  service_charge NUMERIC(5,2) DEFAULT 10,       -- %
  tax_rate      NUMERIC(5,2) DEFAULT 8,         -- %
  plan          TEXT DEFAULT 'free',            -- free | pro | enterprise
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 2. USERS / STAFF
-- ─────────────────────────────────────────────
CREATE TABLE staff (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  auth_id       UUID UNIQUE,                    -- links to Supabase Auth
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  role          TEXT NOT NULL CHECK (role IN ('owner','manager','cashier','waiter','kitchen','receptionist')),
  pin           TEXT,                           -- 4-digit PIN for quick login
  avatar_color  TEXT DEFAULT '#29b6f6',
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 3. ROOMS (Hotel)
-- ─────────────────────────────────────────────
CREATE TABLE rooms (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  number        TEXT NOT NULL,
  type          TEXT DEFAULT 'standard',        -- standard | deluxe | suite
  floor         INT DEFAULT 1,
  capacity      INT DEFAULT 2,
  rate_per_night NUMERIC(10,2) DEFAULT 0,
  status        TEXT DEFAULT 'available' CHECK (status IN ('available','occupied','reserved','maintenance','cleaning')),
  amenities     JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, number)
);

-- ─────────────────────────────────────────────
-- 4. RESTAURANT TABLES
-- ─────────────────────────────────────────────
CREATE TABLE restaurant_tables (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  number        TEXT NOT NULL,
  section       TEXT DEFAULT 'main',            -- main | outdoor | vip | bar
  capacity      INT DEFAULT 4,
  status        TEXT DEFAULT 'available' CHECK (status IN ('available','occupied','reserved','cleaning')),
  qr_code       TEXT,                           -- unique QR token
  position_x    INT DEFAULT 0,                  -- floor plan coords
  position_y    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, number)
);

-- ─────────────────────────────────────────────
-- 5. MENU CATEGORIES
-- ─────────────────────────────────────────────
CREATE TABLE menu_categories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  icon          TEXT DEFAULT '🍽️',
  sort_order    INT DEFAULT 0,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 6. MENU ITEMS
-- ─────────────────────────────────────────────
CREATE TABLE menu_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  category_id   UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url     TEXT,
  is_available  BOOLEAN DEFAULT true,
  is_veg        BOOLEAN DEFAULT false,
  preparation_time INT DEFAULT 15,              -- minutes
  tags          TEXT[] DEFAULT '{}',
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 7. CUSTOMERS / LOYALTY
-- ─────────────────────────────────────────────
CREATE TABLE customers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  loyalty_points INT DEFAULT 0,
  total_spent   NUMERIC(12,2) DEFAULT 0,
  visit_count   INT DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 8. RESERVATIONS
-- ─────────────────────────────────────────────
CREATE TABLE reservations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  type          TEXT DEFAULT 'table' CHECK (type IN ('table','room')),
  table_id      UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  room_id       UUID REFERENCES rooms(id) ON DELETE SET NULL,
  guest_name    TEXT NOT NULL,
  guest_phone   TEXT,
  guest_count   INT DEFAULT 1,
  date_from     TIMESTAMPTZ NOT NULL,
  date_to       TIMESTAMPTZ,
  notes         TEXT,
  status        TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed','seated','checked_in','checked_out','cancelled','no_show')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 9. ORDERS
-- ─────────────────────────────────────────────
CREATE TABLE orders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  order_number  TEXT NOT NULL,                  -- e.g. #1042
  type          TEXT DEFAULT 'dine_in' CHECK (type IN ('dine_in','room_service','takeaway','delivery')),
  table_id      UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  room_id       UUID REFERENCES rooms(id) ON DELETE SET NULL,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  waiter_id     UUID REFERENCES staff(id) ON DELETE SET NULL,
  guest_count   INT DEFAULT 1,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','preparing','ready','served','billed','cancelled')),
  notes         TEXT,
  subtotal      NUMERIC(10,2) DEFAULT 0,
  service_charge NUMERIC(10,2) DEFAULT 0,
  tax           NUMERIC(10,2) DEFAULT 0,
  discount      NUMERIC(10,2) DEFAULT 0,
  total         NUMERIC(10,2) DEFAULT 0,
  -- offline sync fields
  local_id      TEXT,                           -- UUID generated offline
  synced        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, order_number)
);

-- ─────────────────────────────────────────────
-- 10. ORDER ITEMS
-- ─────────────────────────────────────────────
CREATE TABLE order_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id  UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,                  -- snapshot at time of order
  price         NUMERIC(10,2) NOT NULL,
  quantity      INT DEFAULT 1,
  notes         TEXT,                           -- special requests
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','preparing','ready','served','cancelled')),
  local_id      TEXT,
  synced        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 11. BILLS / PAYMENTS
-- ─────────────────────────────────────────────
CREATE TABLE bills (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES orders(id) ON DELETE CASCADE,
  bill_number   TEXT NOT NULL,
  subtotal      NUMERIC(10,2) DEFAULT 0,
  service_charge NUMERIC(10,2) DEFAULT 0,
  tax           NUMERIC(10,2) DEFAULT 0,
  discount      NUMERIC(10,2) DEFAULT 0,
  total         NUMERIC(10,2) DEFAULT 0,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash','card','mobile','split')),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','refunded')),
  paid_at       TIMESTAMPTZ,
  cashier_id    UUID REFERENCES staff(id) ON DELETE SET NULL,
  notes         TEXT,
  local_id      TEXT,
  synced        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 12. INVENTORY
-- ─────────────────────────────────────────────
CREATE TABLE inventory_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  category      TEXT DEFAULT 'general',
  unit          TEXT DEFAULT 'kg',             -- kg | g | L | ml | pcs
  quantity      NUMERIC(10,3) DEFAULT 0,
  min_quantity  NUMERIC(10,3) DEFAULT 0,       -- alert threshold
  cost_per_unit NUMERIC(10,2) DEFAULT 0,
  supplier      TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE inventory_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  item_id       UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
  type          TEXT CHECK (type IN ('in','out','adjustment')),
  quantity      NUMERIC(10,3),
  reason        TEXT,
  staff_id      UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 13. OFFLINE SYNC QUEUE
-- (used by local IndexedDB — same structure for reference)
-- ─────────────────────────────────────────────
CREATE TABLE sync_queue (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  table_name    TEXT NOT NULL,
  operation     TEXT CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  record_id     TEXT NOT NULL,
  payload       JSONB,
  synced        BOOLEAN DEFAULT false,
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY — tenants can only see their data
-- ─────────────────────────────────────────────
ALTER TABLE tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff                ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms                ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables    ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills                ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue           ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's tenant_id
CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM staff WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Apply RLS policies to all tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['staff','rooms','restaurant_tables','menu_categories',
    'menu_items','customers','reservations','orders','order_items',
    'bills','inventory_items','inventory_log','sync_queue']
  LOOP
    EXECUTE format('
      CREATE POLICY "%s_tenant_policy" ON %s
      USING (tenant_id = get_tenant_id())
      WITH CHECK (tenant_id = get_tenant_id());
    ', tbl, tbl);
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────
-- REALTIME — enable for live KDS + order updates
-- ─────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE restaurant_tables;

-- ─────────────────────────────────────────────
-- AUTO ORDER NUMBER GENERATOR
-- ─────────────────────────────────────────────
CREATE SEQUENCE order_number_seq START 1000;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := '#' || nextval('order_number_seq');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_before_insert
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- ─────────────────────────────────────────────
-- SEED: Demo tenant + staff
-- ─────────────────────────────────────────────
INSERT INTO tenants (name, slug, currency, service_charge, tax_rate, plan)
VALUES ('The Grand Palace', 'grandpalace', 'LKR', 10, 8, 'pro');

-- (staff inserted after Auth users are created via Supabase Auth)

-- ─────────────────────────────────────────────
-- 14. MENU MODIFIER GROUPS
-- ─────────────────────────────────────────────
CREATE TABLE modifier_groups (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                  -- e.g. "Spice Level", "Size", "Add-ons"
  required      BOOLEAN DEFAULT false,          -- must select before ordering
  multi_select  BOOLEAN DEFAULT false,          -- can pick multiple
  min_select    INT DEFAULT 0,
  max_select    INT DEFAULT 1,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE modifiers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  group_id      UUID REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                  -- e.g. "Extra Hot", "Large", "Cheese"
  price_delta   NUMERIC(8,2) DEFAULT 0,         -- +/- price adjustment
  is_default    BOOLEAN DEFAULT false,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Link modifier groups to menu items
CREATE TABLE menu_item_modifier_groups (
  menu_item_id  UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  group_id      UUID REFERENCES modifier_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (menu_item_id, group_id)
);

-- Selected modifiers per order item
CREATE TABLE order_item_modifiers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id UUID REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_id   UUID REFERENCES modifiers(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,                  -- snapshot
  price_delta   NUMERIC(8,2) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 15. VOID & REFUNDS
-- ─────────────────────────────────────────────
CREATE TABLE voids (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,  -- null = full order void
  bill_id       UUID REFERENCES bills(id) ON DELETE SET NULL,
  type          TEXT CHECK (type IN ('item_void','order_void','refund')),
  reason        TEXT NOT NULL,
  amount        NUMERIC(10,2) DEFAULT 0,        -- refund amount
  approved_by   UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 16. CASH DRAWER / SHIFTS
-- ─────────────────────────────────────────────
CREATE TABLE cash_shifts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id      UUID REFERENCES staff(id) ON DELETE SET NULL,
  opened_at     TIMESTAMPTZ DEFAULT now(),
  closed_at     TIMESTAMPTZ,
  opening_float NUMERIC(10,2) DEFAULT 0,
  closing_cash  NUMERIC(10,2),
  expected_cash NUMERIC(10,2),
  variance      NUMERIC(10,2),
  notes         TEXT,
  status        TEXT DEFAULT 'open' CHECK (status IN ('open','closed'))
);

CREATE TABLE cash_movements (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  shift_id      UUID REFERENCES cash_shifts(id) ON DELETE CASCADE,
  type          TEXT CHECK (type IN ('in','out','sale','refund')),
  amount        NUMERIC(10,2) NOT NULL,
  reason        TEXT,
  staff_id      UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 17. SPLIT BILLS
-- ─────────────────────────────────────────────
CREATE TABLE split_bills (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  bill_id       UUID REFERENCES bills(id) ON DELETE CASCADE,
  split_index   INT NOT NULL,                   -- 1,2,3...
  amount        NUMERIC(10,2) NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  paid          BOOLEAN DEFAULT false,
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- RLS for new tables
ALTER TABLE modifier_groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifiers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_modifier_groups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_modifiers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE voids                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_shifts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_bills                ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['modifier_groups','modifiers','order_item_modifiers','voids','cash_shifts','cash_movements','split_bills']
  LOOP
    EXECUTE format('
      CREATE POLICY "%s_tenant_policy" ON %s
      USING (tenant_id = get_tenant_id())
      WITH CHECK (tenant_id = get_tenant_id());
    ', tbl, tbl);
  END LOOP;
END;
$$;

-- menu_item_modifier_groups has no tenant_id — use join-based policy
CREATE POLICY "mimgs_policy" ON menu_item_modifier_groups
  USING (menu_item_id IN (
    SELECT id FROM menu_items WHERE tenant_id = get_tenant_id()
  ));
