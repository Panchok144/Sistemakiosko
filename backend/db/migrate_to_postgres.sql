-- FASE 1: MIGRACIÓN A POSTGRESQL
-- Ejecutar en la nueva base de datos PostgreSQL para crear el esquema multi-tenant.

BEGIN;

-- Tabla de tenants / comercios
CREATE TABLE IF NOT EXISTS comercios (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    suscripcion_activa BOOLEAN NOT NULL DEFAULT TRUE,
    activo_hasta TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Data inicial del tenant principal
INSERT INTO comercios (id, nombre, activo, suscripcion_activa)
VALUES (1, 'Comercio Principal', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nombre_usuario TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('empleado', 'dueno', 'administrador')),
    suscripcion_activa BOOLEAN NOT NULL DEFAULT TRUE,
    suscripcion_hasta TIMESTAMPTZ,
    comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Productos
CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    codigo_barras TEXT NOT NULL,
    nombre TEXT NOT NULL,
    precio_venta NUMERIC(12,2) NOT NULL,
    costo NUMERIC(12,2) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- El código de barras es único POR COMERCIO (multi-tenant)
    CONSTRAINT uq_producto_barras_comercio UNIQUE (codigo_barras, comercio_id),
    -- El stock nunca puede ser negativo: si una venta intenta llevarlo a negativo,
    -- PostgreSQL rechaza el UPDATE y el try/catch de ventas.js captura el error.
    CONSTRAINT ck_stock_positivo CHECK (stock >= 0)
);


-- Proveedores
CREATE TABLE IF NOT EXISTS proveedores (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    telefono TEXT,
    email TEXT,
    descripcion TEXT,
    comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ventas
CREATE TABLE IF NOT EXISTS ventas (
    id SERIAL PRIMARY KEY,
    id_usuario INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total NUMERIC(12,2) NOT NULL,
    metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'transferencia')) DEFAULT 'efectivo',
    tipo_comprobante TEXT NOT NULL CHECK (tipo_comprobante IN ('interno', 'factura_a', 'factura_b')) DEFAULT 'interno',
    -- Estado del comprobante: 'interna' = ticket sin CAE, 'pendiente_cae' = en proceso,
    -- 'aprobada' = CAE obtenido OK, 'error_afip' = AFIP rechazó (para reintentar)
    estado TEXT NOT NULL CHECK (estado IN ('interna', 'pendiente_cae', 'aprobada', 'error_afip')) DEFAULT 'interna',
    nro_comprobante INTEGER,   -- Número reservado atómicamente antes de llamar a AFIP
    cae TEXT,
    cae_vencimiento TIMESTAMPTZ,
    comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Detalle de ventas
CREATE TABLE IF NOT EXISTS detalle_ventas (
    id SERIAL PRIMARY KEY,
    id_venta INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    id_producto INTEGER REFERENCES productos(id) ON DELETE SET NULL,
    cantidad INTEGER NOT NULL,
    precio_unitario NUMERIC(12,2) NOT NULL,
    comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE
);

-- Cajas
CREATE TABLE IF NOT EXISTS cajas (
    id SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    fecha_apertura TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_cierre TIMESTAMPTZ,
    monto_inicial NUMERIC(12,2) NOT NULL,
    monto_final NUMERIC(12,2),
    estado TEXT NOT NULL CHECK (estado IN ('abierta', 'cerrada')) DEFAULT 'abierta',
    comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Movimientos de caja
CREATE TABLE IF NOT EXISTS movimientos_caja (
    id SERIAL PRIMARY KEY,
    id_caja INTEGER NOT NULL REFERENCES cajas(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
    monto NUMERIC(12,2) NOT NULL,
    descripcion TEXT NOT NULL,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE
);

-- Migraciones para bases de datos ya existentes (se ejecutan sin error si las columnas ya existen)
ALTER TABLE IF EXISTS usuarios ADD COLUMN IF NOT EXISTS comercio_id INTEGER NOT NULL DEFAULT 1 REFERENCES comercios(id) ON DELETE RESTRICT;
ALTER TABLE IF EXISTS productos ADD COLUMN IF NOT EXISTS comercio_id INTEGER NOT NULL DEFAULT 1 REFERENCES comercios(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS proveedores ADD COLUMN IF NOT EXISTS comercio_id INTEGER NOT NULL DEFAULT 1 REFERENCES comercios(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS ventas ADD COLUMN IF NOT EXISTS comercio_id INTEGER NOT NULL DEFAULT 1 REFERENCES comercios(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS ventas ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'interna';
ALTER TABLE IF EXISTS ventas ADD COLUMN IF NOT EXISTS nro_comprobante INTEGER;
ALTER TABLE IF EXISTS detalle_ventas ADD COLUMN IF NOT EXISTS comercio_id INTEGER NOT NULL DEFAULT 1 REFERENCES comercios(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS cajas ADD COLUMN IF NOT EXISTS comercio_id INTEGER NOT NULL DEFAULT 1 REFERENCES comercios(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS cajas ADD COLUMN IF NOT EXISTS monto_teorico NUMERIC(12,2);
ALTER TABLE IF EXISTS cajas ADD COLUMN IF NOT EXISTS diferencia NUMERIC(12,2);
ALTER TABLE IF EXISTS movimientos_caja ADD COLUMN IF NOT EXISTS comercio_id INTEGER NOT NULL DEFAULT 1 REFERENCES comercios(id) ON DELETE CASCADE;
-- Agregar constraint de stock positivo si no existe (seguro para re-ejecución)
ALTER TABLE IF EXISTS productos ADD CONSTRAINT IF NOT EXISTS ck_stock_positivo CHECK (stock >= 0);

-- Índices recomendados para performance multi-tenant
CREATE INDEX IF NOT EXISTS idx_usuarios_comercio_id ON usuarios(comercio_id);
CREATE INDEX IF NOT EXISTS idx_productos_comercio_id ON productos(comercio_id);
CREATE INDEX IF NOT EXISTS idx_proveedores_comercio_id ON proveedores(comercio_id);
CREATE INDEX IF NOT EXISTS idx_ventas_comercio_id ON ventas(comercio_id);
-- Índice en fecha para acelerar reportes y filtros por período
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_comercio_id ON detalle_ventas(comercio_id);
CREATE INDEX IF NOT EXISTS idx_cajas_comercio_id ON cajas(comercio_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_comercio_id ON movimientos_caja(comercio_id);

-- Tabla de secuencias de facturación para reserva atómica de números de comprobante.
-- Uso: SELECT ... FOR UPDATE dentro de la transacción de venta para evitar race conditions
-- cuando múltiples terminales facturan simultáneamente.
CREATE TABLE IF NOT EXISTS secuencias_facturacion (
    id SERIAL PRIMARY KEY,
    comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    punto_venta INTEGER NOT NULL DEFAULT 1,
    -- Tipo de comprobante AFIP: 1=Factura A, 6=Factura B (códigos del WS de ARCA)
    tipo_comprobante_afip INTEGER NOT NULL,
    ultimo_numero INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_secuencia_pv_tipo UNIQUE (comercio_id, punto_venta, tipo_comprobante_afip)
);

-- Secuencias iniciales para Factura A (tipo 1) y Factura B (tipo 6) del comercio principal
INSERT INTO secuencias_facturacion (comercio_id, punto_venta, tipo_comprobante_afip, ultimo_numero)
VALUES
    (1, 1, 1, 0),  -- Factura A
    (1, 1, 6, 0)   -- Factura B
ON CONFLICT (comercio_id, punto_venta, tipo_comprobante_afip) DO NOTHING;

COMMIT;

-- Insertar el admin inicial para el tenant principal.
-- Contraseña: cocadelitro
INSERT INTO usuarios (nombre_usuario, password, rol, suscripcion_activa, comercio_id)
VALUES ('fran', '$2b$10$Z.vW96KWRPDfitgUzq9.3.uWXYtBjzqeevTBG143zVmzlIFW.kirC', 'administrador', TRUE, 1)
ON CONFLICT (nombre_usuario) DO UPDATE SET password = EXCLUDED.password, rol = EXCLUDED.rol, suscripcion_activa = EXCLUDED.suscripcion_activa, comercio_id = EXCLUDED.comercio_id;
