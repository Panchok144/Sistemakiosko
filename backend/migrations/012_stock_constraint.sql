-- ============================================================
-- Migracion 012: Constraint stock no negativo en productos
-- Previene que ventas o actualizaciones dejen stock < 0 en DB
-- ============================================================

-- Primero corregir registros existentes con stock negativo (si los hay)
UPDATE productos SET stock = 0 WHERE stock < 0;

-- Agregar constraint CHECK
ALTER TABLE productos
  ADD CONSTRAINT chk_stock_no_negativo CHECK (stock >= 0);
