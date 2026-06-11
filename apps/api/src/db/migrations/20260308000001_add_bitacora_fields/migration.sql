-- ============================================================
-- CopyTrader Pro — Migración: Bitácora de Trading
-- Generada: 2026-03-08
-- Cómo aplicar: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Signal: agregar número secuencial de envío por usuario
ALTER TABLE "Signal" ADD COLUMN IF NOT EXISTS "seqNumber" INTEGER;

-- Order: campos para Bitácora de Trading
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "groupId"    TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "source"     TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "timeframe"  TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "exitPrice"  DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "winLoss"    TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "closedAt"   TIMESTAMP(3);

-- FK: Order.groupId → CopyGroup.id (opcional)
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CopyGroup"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
