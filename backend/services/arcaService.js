'use strict';

const db = require('../db/conexion');
const { registrarAuditoria } = require('./auditoriaService');
const { solicitarCAESoap } = require('./arcaSoap');

/**
 * Función wrapper para generar CAE usando el cliente SOAP aislado.
 * @param {Object} datosFactura
 */
async function generarCAE(datosFactura) {
  return await solicitarCAESoap(datosFactura);
}

/**
 * Procesa la autorización CAE de una venta en segundo plano.
 * Si tiene éxito, actualiza estado a 'aprobada'.
 * Si falla, incrementa reintentos; al alcanzar maxReintentos pasa a 'error_afip'.
 *
 * @param {number} idVenta
 * @param {number} maxReintentos
 */
async function procesarVentaCAE(idVenta, maxReintentos = 3) {
  try {
    const ventaRes = await db.query(
      `SELECT v.*, u.nombre_usuario, c.nombre AS comercio_nombre
       FROM ventas v
       LEFT JOIN usuarios u ON v.id_usuario = u.id
       LEFT JOIN comercios c ON v.comercio_id = c.id
       WHERE v.id = $1`,
      [idVenta]
    );

    if (ventaRes.rowCount === 0) {
      console.warn(`[arcaService] Venta #${idVenta} no encontrada para procesar CAE.`);
      return;
    }

    const venta = ventaRes.rows[0];

    // Si ya está aprobada, no hacer nada
    if (venta.estado === 'aprobada') {
      return { status: 'aprobada', cae: venta.cae };
    }

    const prodsRes = await db.query(
      `SELECT dv.*, p.nombre, p.codigo_barras
       FROM detalle_ventas dv
       LEFT JOIN productos p ON dv.id_producto = p.id
       WHERE dv.id_venta = $1`,
      [idVenta]
    );

    const datosFactura = {
      tipo_comprobante: venta.tipo_comprobante,
      nro_comprobante: venta.nro_comprobante,
      punto_venta: venta.punto_venta || 1,
      total: Number(venta.total),
      cliente: {
        nombre: venta.cliente_nombre || 'Consumidor Final',
        documento: venta.cliente_documento || '00000000',
      },
      productos: prodsRes.rows,
      metodo_pago: venta.metodo_pago,
      id_usuario: venta.id_usuario,
    };

    try {
      const resultadoArca = await solicitarCAESoap(datosFactura);

      await db.query(
        `UPDATE ventas
         SET cae = $1, cae_vencimiento = $2, estado = 'aprobada', error_afip_detalle = NULL
         WHERE id = $3`,
        [resultadoArca.cae, resultadoArca.cae_vencimiento, idVenta]
      );

      await registrarAuditoria({
        tipo_evento: 'CAE_APROBADO',
        descripcion: `CAE ${resultadoArca.cae} obtenido con éxito para venta #${idVenta} (${venta.tipo_comprobante})`,
        usuario_id: venta.id_usuario,
        comercio_id: venta.comercio_id,
      });

      return {
        status: 'aprobada',
        cae: resultadoArca.cae,
        cae_vencimiento: resultadoArca.cae_vencimiento,
      };
    } catch (errArca) {
      const reintentosActuales = (venta.reintentos_cae || 0) + 1;
      const nuevoEstado = reintentosActuales >= maxReintentos ? 'error_afip' : 'pendiente_cae';

      await db.query(
        `UPDATE ventas
         SET estado = $1, error_afip_detalle = $2, reintentos_cae = $3
         WHERE id = $4`,
        [nuevoEstado, errArca.message, reintentosActuales, idVenta]
      );

      await registrarAuditoria({
        tipo_evento: nuevoEstado === 'error_afip' ? 'ALERTA_AFIP_FALLO' : 'REINTENTO_CAE',
        descripcion: `Fallo al obtener CAE para venta #${idVenta} (Intento ${reintentosActuales}/${maxReintentos}): ${errArca.message}`,
        usuario_id: venta.id_usuario,
        comercio_id: venta.comercio_id,
      });

      return {
        status: nuevoEstado,
        error: errArca.message,
        reintentos: reintentosActuales,
      };
    }
  } catch (error) {
    console.error(`[arcaService] Error procesando CAE para venta #${idVenta}:`, error);
    throw error;
  }
}

module.exports = {
  generarCAE,
  procesarVentaCAE,
};
