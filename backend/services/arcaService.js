const fs = require('fs');
const path = require('path');
const https = require('https');

const ARCA_URL = process.env.ARCA_URL || 'https://homologacion.arca.gob.ar/wsfex';
const CERT_PATH = process.env.ARCA_CERT_PATH || path.join(__dirname, '..', 'certs', 'arca.crt');
const KEY_PATH = process.env.ARCA_KEY_PATH || path.join(__dirname, '..', 'certs', 'arca.key');
const PASSPHRASE = process.env.ARCA_PASSPHRASE || '';
const USE_MOCK = process.env.ARCA_USE_MOCK === 'true';

/**
 * Genera un CAE en ARCA/AFIP.
 *
 * IMPORTANTE — Flujo correcto (ACID):
 *   1. La transacci\u00f3n de BD reserva el n\u00famero de comprobante en `secuencias_facturacion`
 *      usando SELECT ... FOR UPDATE (row-level lock de Postgres).
 *   2. Se hace INSERT en `ventas` con estado='pendiente_cae' y el nro_comprobante reservado.
 *   3. Reci\u00e9n entonces se llama a esta funci\u00f3n con ese n\u00famero ya fijo.
 *   4. Si AFIP responde OK → UPDATE ventas SET cae=..., estado='aprobada'.
 *   5. Si AFIP falla → UPDATE ventas SET estado='error_afip' (la venta local persiste).
 *
 * @param {object} datosFactura - Datos de la factura incluyendo `nro_comprobante` (reservado en BD)
 */
function generarCAE(datosFactura) {
    if (USE_MOCK) {
        return Promise.resolve({
            cae: `MOCK-CAE-${Date.now()}`,
            cae_vencimiento: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
            mensaje: 'Modo homologación MOCK activado. No se realizó conexión real a ARCA.'
        });
    }

    if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
        return Promise.reject(new Error(`Faltan certificados ARCA. Debes configurar ARCA_CERT_PATH y ARCA_KEY_PATH en .env.`));
    }

    // Aquí deberías construir la solicitud SOAP/XML requerida por ARCA y firmarla.
    // El siguiente bloque es un ejemplo de cómo enviar una petición HTTPS con certificados.
    const payload = JSON.stringify({
        tipo_comprobante: datosFactura.tipo_comprobante,
        total: datosFactura.total,
        cliente: datosFactura.cliente || { nombre: 'Final', documento: '00000000' },
        productos: datosFactura.productos,
        metodo_pago: datosFactura.metodo_pago,
        usuario_id: datosFactura.id_usuario
    });

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        },
        cert: fs.readFileSync(CERT_PATH),
        key: fs.readFileSync(KEY_PATH),
        passphrase: PASSPHRASE,
        rejectUnauthorized: false
    };

    return new Promise((resolve, reject) => {
        const request = https.request(ARCA_URL, options, (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });
            response.on('end', () => {
                try {
                    const resultado = JSON.parse(data);
                    if (resultado.cae) {
                        resolve({
                            cae: resultado.cae,
                            cae_vencimiento: resultado.cae_vencimiento || resultado.vencimiento,
                            mensaje: 'CAE obtenido correctamente desde ARCA.'
                        });
                    } else {
                        reject(new Error(resultado.error || 'No se recibió CAE de ARCA')); 
                    }
                } catch (error) {
                    reject(new Error(`Error al interpretar la respuesta de ARCA: ${error.message}`));
                }
            });
        });

        request.on('error', (error) => {
            reject(new Error(`Error en la conexión con ARCA: ${error.message}`));
        });

        request.write(payload);
        request.end();
    });
}

module.exports = {
    generarCAE
};
