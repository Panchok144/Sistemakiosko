-- ============================================================
-- MIGRACIÓN INCREMENTAL — Aplica solo los cambios nuevos
-- Ejecutar en la consola SQL de Neon
-- Es segura para re-ejecución (usa IF NOT EXISTS / IF EXISTS)
-- ============================================================

-- 1. Columna estado en ventas (ticket, pendiente CAE, aprobada, error AFIP)
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'interna'
    CHECK (estado IN ('interna', 'pendiente_cae', 'aprobada', 'error_afip'));

-- 2. Número de comprobante reservado antes de llamar a AFIP
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS nro_comprobante INTEGER;

-- 3. Constraint que impide stock negativo en productos
ALTER TABLE productos ADD CONSTRAINT IF NOT EXISTS ck_stock_positivo CHECK (stock >= 0);

-- 4. Índice en ventas.fecha para acelerar reportes por período
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha DESC);

-- 5. Tabla de secuencias para reserva atómica de número de comprobante AFIP
--    (evita race conditions cuando múltiples terminales facturan en simultáneo)
CREATE TABLE IF NOT EXISTS secuencias_facturacion (
    id SERIAL PRIMARY KEY,
    comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    punto_venta INTEGER NOT NULL DEFAULT 1,
    tipo_comprobante_afip INTEGER NOT NULL,  -- 1=Factura A, 6=Factura B
    ultimo_numero INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_secuencia_pv_tipo UNIQUE (comercio_id, punto_venta, tipo_comprobante_afip)
);

-- 6. Secuencias iniciales para el comercio principal (id=1)
INSERT INTO secuencias_facturacion (comercio_id, punto_venta, tipo_comprobante_afip, ultimo_numero)
VALUES
    (1, 1, 1, 0),  -- Factura A
    (1, 1, 6, 0)   -- Factura B
ON CONFLICT (comercio_id, punto_venta, tipo_comprobante_afip) DO NOTHING;
