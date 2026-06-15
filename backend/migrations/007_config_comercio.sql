-- ==========================================================
-- MIGRACIÓN 7: Configuración del Comercio y campos fiscales
-- Ejecutar en la consola SQL de Neon / PostgreSQL
-- ==========================================================

BEGIN;

-- ── Datos tributarios del comercio ───────────────────────────────────────────
ALTER TABLE comercios ADD COLUMN IF NOT EXISTS razon_social    VARCHAR(200);
ALTER TABLE comercios ADD COLUMN IF NOT EXISTS cuit            VARCHAR(20);
ALTER TABLE comercios ADD COLUMN IF NOT EXISTS domicilio       TEXT;
ALTER TABLE comercios ADD COLUMN IF NOT EXISTS condicion_fiscal VARCHAR(40) DEFAULT 'responsable_inscripto';
ALTER TABLE comercios ADD COLUMN IF NOT EXISTS punto_venta     INTEGER DEFAULT 1;
ALTER TABLE comercios ADD COLUMN IF NOT EXISTS email           VARCHAR(120);
ALTER TABLE comercios ADD COLUMN IF NOT EXISTS telefono        VARCHAR(30);
ALTER TABLE comercios ADD COLUMN IF NOT EXISTS logo_url        TEXT;
ALTER TABLE comercios ADD COLUMN IF NOT EXISTS leyenda_ticket  TEXT DEFAULT '¡Gracias por su compra!';

-- ── Tabla de configuración clave/valor por comercio ──────────────────────────
CREATE TABLE IF NOT EXISTS configuracion (
  id           SERIAL PRIMARY KEY,
  comercio_id  INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  clave        VARCHAR(80) NOT NULL,
  valor        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_config_comercio_clave UNIQUE (comercio_id, clave)
);
CREATE INDEX IF NOT EXISTS idx_config_comercio ON configuracion(comercio_id);

-- Valor inicial: monto mínimo para identificar al cliente (ARCA vigente)
INSERT INTO configuracion (comercio_id, clave, valor)
VALUES (1, 'monto_minimo_identificar', '500000')
ON CONFLICT (comercio_id, clave) DO NOTHING;

-- Límite de variación de precio que dispara alerta (en %)
INSERT INTO configuracion (comercio_id, clave, valor)
VALUES (1, 'limite_variacion_precio_pct', '30')
ON CONFLICT (comercio_id, clave) DO NOTHING;

-- ── Campos extendidos en PRODUCTOS ───────────────────────────────────────────
ALTER TABLE productos ADD COLUMN IF NOT EXISTS iva_porcentaje          NUMERIC(5,2) DEFAULT 21;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo_proveedor_externo TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_lista2            NUMERIC(12,2);  -- Mayorista
ALTER TABLE productos ADD COLUMN IF NOT EXISTS fecha_actualizacion_costo TIMESTAMPTZ;

-- ── Campos extendidos en CLIENTES ────────────────────────────────────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cuit              VARCHAR(20);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS condicion_fiscal  VARCHAR(40) DEFAULT 'consumidor_final';
  -- consumidor_final | responsable_inscripto | monotributista | exento
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tiene_cuenta_corriente BOOLEAN DEFAULT FALSE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS bloqueado         BOOLEAN DEFAULT FALSE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tipo_negocio      VARCHAR(60);
  -- Kiosco | Maxikiosco | Drugstore | Supermercado | Otro

-- ── Campos extendidos en PROVEEDORES ─────────────────────────────────────────
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS cuit           VARCHAR(20);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS condicion_fiscal VARCHAR(40);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS domicilio      TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS codigo_fiscal  VARCHAR(40);

-- ── Campos fiscales en VENTAS ─────────────────────────────────────────────────
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS subtotal_neto   NUMERIC(12,2);  -- base sin IVA
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS iva_discriminado NUMERIC(12,2); -- IVA total
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cliente_nombre   VARCHAR(200);  -- snapshot al momento
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cliente_documento VARCHAR(30);  -- snapshot

-- ── Campos en PRESUPUESTOS ────────────────────────────────────────────────────
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS validez_dias    INTEGER DEFAULT 30;
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS condicion_pago  VARCHAR(120);

COMMIT;
