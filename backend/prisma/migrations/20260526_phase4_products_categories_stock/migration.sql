-- ─────────────────────────────────────────────────────────────
-- Phase 4 — Products, Categories, Stock
-- All primary keys and foreign-key columns use UUID to match the
-- UUID type used in Phase 2 (users, organizations) and Phase 3
-- (venues, events, suppliers, pickup_points).
-- Running TEXT → UUID FKs would fail at db:migrate on PostgreSQL.
-- ─────────────────────────────────────────────────────────────

-- Enums
CREATE TYPE "category_status" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "product_status" AS ENUM ('ACTIVE', 'INACTIVE', 'OUT_OF_STOCK', 'ARCHIVED');

-- ─── categories ───────────────────────────────────────────────
CREATE TABLE "categories" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id" UUID NOT NULL,
    "name"        TEXT NOT NULL,
    "sort_order"  INTEGER NOT NULL DEFAULT 0,
    "status"      "category_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "categories"
    ADD CONSTRAINT "categories_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── products ─────────────────────────────────────────────────
CREATE TABLE "products" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id"     UUID NOT NULL,
    "category_id"     UUID NOT NULL,
    "name"            TEXT NOT NULL,
    "description"     TEXT,
    "price"           INTEGER NOT NULL,        -- cents, never float
    "image_url"       TEXT,
    "status"          "product_status" NOT NULL DEFAULT 'ACTIVE',
    "available_from"  TIMESTAMP(3),
    "available_until" TIMESTAMP(3),
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "products_price_non_negative" CHECK ("price" >= 0)
);

ALTER TABLE "products"
    ADD CONSTRAINT "products_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "products"
    ADD CONSTRAINT "products_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── stock ────────────────────────────────────────────────────
CREATE TABLE "stock" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id"      UUID NOT NULL,
    "supplier_id"     UUID NOT NULL,
    "pickup_point_id" UUID,
    "quantity"        INTEGER NOT NULL DEFAULT 0,
    "is_available"    BOOLEAN NOT NULL DEFAULT true,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_quantity_non_negative" CHECK ("quantity" >= 0)
);

ALTER TABLE "stock"
    ADD CONSTRAINT "stock_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock"
    ADD CONSTRAINT "stock_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock"
    ADD CONSTRAINT "stock_pickup_point_id_fkey"
    FOREIGN KEY ("pickup_point_id") REFERENCES "pickup_points"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique indexes for stock:
--   One global entry (no pickup point) per product
--   One per-pickup-point entry per product
CREATE UNIQUE INDEX "stock_product_global_key"
    ON "stock" ("product_id")
    WHERE "pickup_point_id" IS NULL;

CREATE UNIQUE INDEX "stock_product_pickup_key"
    ON "stock" ("product_id", "pickup_point_id")
    WHERE "pickup_point_id" IS NOT NULL;
