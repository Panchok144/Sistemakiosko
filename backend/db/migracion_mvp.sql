-- ============================================================
-- MIGRACIÓN MVP — Funcionalidades comerciales clave
-- Segura para re-ejecución (usa IF NOT EXISTS / IF EXISTS)
-- Ejecutar en la consola SQL de Neon o PostgreSQL
-- ============================================================

BEGIN;

-- ── 1. Stock mínimo, máximo y punto de reposición por producto ─────────────
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_minimo INTEGER DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_maximo INTEGER;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS punto_reposicion INTEGER;

-- ── 2. Historial de cambios de precio ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS historial_precios (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
    comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    precio_anterior NUMERIC(12,2),
    precio_nuevo NUMERIC(12,2),
    costo_anterior NUMERIC(12,2),
    costo_nuevo NUMERIC(12,2),
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    motivo TEXT,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_historial_precios_producto ON historial_precios(producto_id);
CREATE INDEX IF NOT EXISTS idx_historial_precios_comercio ON historial_precios(comercio_id);

-- ── 3. Licencias y planes de suscripción ─────────────────────────────────
CREATE TABLE IF NOT EXISTS licencias (
    id SERIAL PRIMARY KEY,
    comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    plan TEXT NOT NULL DEFAULT 'demo'
        CHECK (plan IN ('demo', 'basico', 'profesional', 'enterprise')),
    fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_fin TIMESTAMPTZ,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    max_productos INTEGER DEFAULT 50,
    max_usuarios INTEGER DEFAULT 1,
    max_sucursales INTEGER DEFAULT 1,
    clave_activacion TEXT,
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_licencia_clave UNIQUE (clave_activacion)
);
CREATE INDEX IF NOT EXISTS idx_licencias_comercio ON licencias(comercio_id);

-- ── 4. Licencia inicial para el comercio principal ─────────────────────────
-- Solo inserta si no existe licencia activa para el comercio 1
INSERT INTO licencias (comercio_id, plan, activa, max_productos, max_usuarios, max_sucursales, fecha_fin, notas)
SELECT 1, 'profesional', TRUE, 99999, 99, 10, NOW() + INTERVAL '3650 days', 'Licencia inicial del sistema'
WHERE NOT EXISTS (SELECT 1 FROM licencias WHERE comercio_id = 1);

-- ── 5. Notificaciones del sistema ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificaciones (
    id SERIAL PRIMARY KEY,
    comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL, -- 'stock_critico', 'caja_abierta', 'licencia_por_vencer', etc.
    titulo TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    leida BOOLEAN NOT NULL DEFAULT FALSE,
    accion_url TEXT, -- Ruta del frontend para navegar al hacer click
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notificaciones_comercio ON notificaciones(comercio_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_leida ON notificaciones(leida);

-- ── 6. Índices adicionales de performance ─────────────────────────────────
-- Para el reporte de clasificación ABC
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_producto ON detalle_ventas(id_producto);
-- Para reportes de stock bajo
CREATE INDEX IF NOT EXISTS idx_productos_stock ON productos(stock);

COMMIT;
