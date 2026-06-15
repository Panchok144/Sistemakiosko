const db = require('../db/conexion');

/**
 * Registra un evento en la tabla de auditoría.
 * @param {Object} params
 * @param {string} params.tipo_evento - 'LOGIN', 'STOCK_INGRESO', 'VENTA', etc.
 * @param {string} params.descripcion - Detalle legible.
 * @param {number} params.usuario_id - ID del usuario (opcional).
 * @param {number} params.comercio_id - ID del comercio (por defecto 1).
 */
async function registrarAuditoria({ tipo_evento, descripcion, usuario_id = null, comercio_id = 1 }) {
  try {
    await db.query(
      'INSERT INTO auditoria (tipo_evento, descripcion, usuario_id, comercio_id) VALUES ($1, $2, $3, $4)',
      [tipo_evento, descripcion, usuario_id, comercio_id]
    );
  } catch (error) {
    console.error('Error al registrar auditoria:', error);
  }
}

module.exports = { registrarAuditoria };
