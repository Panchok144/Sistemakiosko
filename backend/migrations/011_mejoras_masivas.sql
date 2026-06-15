-- ==========================================================
-- MIGRACIÓN 11: Mejoras Masivas del Sistema
-- Ejecutar en la consola SQL de Neon / PostgreSQL
-- ==========================================================

BEGIN;

-- ── PRODUCTOS: margen de ganancia ────────────────────────────────────────────
ALTER TABLE productos ADD COLUMN IF NOT EXISTS margen_ganancia NUMERIC(5,2) DEFAULT 0;

-- ── PRODUCTOS: código de proveedor externo (alias más claro) ─────────────────
-- Ya existe codigo_proveedor_externo desde migración 007, verificar
ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo_proveedor_externo TEXT;

-- ── CLIENTES: domicilio y código fiscal ──────────────────────────────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS domicilio TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS codigo_fiscal VARCHAR(40);

-- ── PROVEEDORES: completar campos fiscales ───────────────────────────────────
-- Ya existen cuit, condicion_fiscal, domicilio, codigo_fiscal desde migración 007
-- Confirmar:
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS cuit VARCHAR(20);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS condicion_fiscal VARCHAR(40);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS domicilio TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS codigo_fiscal VARCHAR(40);

-- ── FACTURA COMPRA ITEMS: tipo de ítem (producto vs gasto) ───────────────────
ALTER TABLE facturas_compra_items ADD COLUMN IF NOT EXISTS tipo_item VARCHAR(20) DEFAULT 'producto'
  CHECK (tipo_item IN ('producto', 'gasto', 'servicio'));

-- ── VENTAS: campos fiscales y CAE ────────────────────────────────────────────
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cae VARCHAR(30);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cae_vencimiento DATE;
-- nro_comprobante ya debería existir; si no:
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS nro_comprobante BIGINT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS punto_venta INTEGER DEFAULT 1;

-- ── PRESUPUESTOS: condición de pago ya existe en BD desde migración 007 ──────
-- validez_dias y condicion_pago ya existen, solo confirmar:
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS validez_dias INTEGER DEFAULT 30;
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS condicion_pago VARCHAR(120);

-- ── USUARIOS: permitir rol superadmin ────────────────────────────────────────
-- El rol se maneja como VARCHAR, no necesita ALTER TABLE, solo cambio de código

-- ── NOTAS CRÉDITO/DÉBITO: campo intereses para notas de débito ──────────────
ALTER TABLE notas_credito_debito ADD COLUMN IF NOT EXISTS porcentaje_interes NUMERIC(5,2) DEFAULT 0;

COMMIT;
