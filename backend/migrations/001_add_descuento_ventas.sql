-- ==========================================================
-- MIGRACIÓN 1: Agregar columna descuento a la tabla ventas
-- Ejecutar en la consola SQL de Neon / PostgreSQL
-- ==========================================================
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento NUMERIC(10,2) DEFAULT 0;
