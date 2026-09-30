-- ============================================================
-- Migracion 019: Schema Drift Fix (N3)
-- Redefine CHECKs obsoletos para que sean coherentes con el codigo real.
-- Agrega rol 'superadmin', metodos_pago faltantes ('qr', 'cuenta_corriente',
-- 'tarjeta_debito', 'tarjeta_credito', 'otro') y aliases de columna.
-- Idempotente: usa DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.
-- ============================================================

BEGIN;

-- ── 1. usuarios.rol: agregar 'superadmin', 'encargado', 'supervisor' ─────────
-- Primero eliminamos el constraint viejo (si existe) y lo recreamos
ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN (
    'empleado', 'dueno', 'administrador',
    'superadmin', 'encargado', 'supervisor', 'cajero'
  ));

-- ── 2. ventas.metodo_pago: ampliar a todos los valores usados ────────────────
ALTER TABLE ventas
  DROP CONSTRAINT IF EXISTS ventas_metodo_pago_check;

ALTER TABLE ventas
  ADD CONSTRAINT ventas_metodo_pago_check
  CHECK (metodo_pago IN (
    'efectivo', 'tarjeta', 'tarjeta_debito', 'tarjeta_credito',
    'transferencia', 'qr', 'cuenta_corriente', 'otro'
  ));

-- ── 3. ventas.estado: asegurar que incluye todos los estados del flujo ───────
ALTER TABLE ventas
  DROP CONSTRAINT IF EXISTS ventas_estado_check;

ALTER TABLE ventas
  ADD CONSTRAINT ventas_estado_check
  CHECK (estado IN ('interna', 'pendiente_cae', 'aprobada', 'error_afip'));

-- ── 4. ventas.tipo_comprobante: agregar 'ticket', 'nota_credito', etc. ───────
ALTER TABLE ventas
  DROP CONSTRAINT IF EXISTS ventas_tipo_comprobante_check;

ALTER TABLE ventas
  ADD CONSTRAINT ventas_tipo_comprobante_check
  CHECK (tipo_comprobante IN (
    'interno', 'factura_a', 'factura_b', 'ticket', 'nota_credito', 'nota_debito'
  ));

-- ── 5. movimientos_caja.metodo_pago: columna que puede no existir aun ────────
ALTER TABLE movimientos_caja
  ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(40);

-- ── 6. detalle_ventas.costo_unitario: pre-requisito para M1 ─────────────────
-- Se agrega aqui para que el schema este completo desde instalacion cero.
-- La migracion 020 (M1) lo poblara con datos historicos si fuera necesario.
ALTER TABLE detalle_ventas
  ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(12,2);

-- Indice para acelerar consulta de margenes
CREATE INDEX IF NOT EXISTS idx_dv_costo_unitario
  ON detalle_ventas (id_venta)
  WHERE costo_unitario IS NOT NULL;

-- ── 7. productos: columnas usadas en rotacion/sugerencia ────────────────────
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS punto_reposicion INTEGER DEFAULT 0;

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

-- ── 8. Indice sargable en ventas.fecha (ya puede existir, idempotente) ───────
CREATE INDEX IF NOT EXISTS idx_ventas_fecha_comercio
  ON ventas (comercio_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_ventas_estado
  ON ventas (comercio_id, estado);

COMMIT;
