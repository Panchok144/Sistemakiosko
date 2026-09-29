-- ============================================================
-- Migración 013: metodo_pago en movimientos_caja y ventas
-- Problema: el campo metodo_pago no existía en movimientos_caja,
-- por lo que el arqueo de caja incluía ingresos de tarjeta/QR que
-- nunca pasan físicamente por la caja de efectivo.
-- Además, se amplía el check de ventas para soportar todos los medios.
-- ============================================================
-- Idempotente: usa IF NOT EXISTS / DO NOTHING / ADD COLUMN IF NOT EXISTS

-- 1. Agregar columna metodo_pago a movimientos_caja
ALTER TABLE movimientos_caja
  ADD COLUMN IF NOT EXISTS metodo_pago TEXT DEFAULT 'efectivo';

-- 2. Constraint en movimientos_caja con valores permitidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'movimientos_caja_metodo_pago_check'
  ) THEN
    ALTER TABLE movimientos_caja
      ADD CONSTRAINT movimientos_caja_metodo_pago_check
      CHECK (metodo_pago IN (
        'efectivo', 'tarjeta', 'tarjeta_debito', 'tarjeta_credito',
        'transferencia', 'qr', 'cuenta_corriente', 'otro'
      ));
  END IF;
END $$;

-- 3. Ampliar constraint de metodo_pago en tabla ventas
DO $$
BEGIN
  ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_metodo_pago_check;
  ALTER TABLE ventas
    ADD CONSTRAINT ventas_metodo_pago_check
    CHECK (metodo_pago IN (
      'efectivo', 'tarjeta', 'tarjeta_debito', 'tarjeta_credito',
      'transferencia', 'qr', 'cuenta_corriente', 'otro'
    ));
END $$;

-- 4. Índice para acelerar SUM por método en el arqueo de caja
CREATE INDEX IF NOT EXISTS idx_mov_caja_metodo
  ON movimientos_caja (id_caja, tipo, metodo_pago);
