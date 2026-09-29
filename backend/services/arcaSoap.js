'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ARCA_URL = process.env.ARCA_URL || 'https://homologacion.arca.gob.ar/wsfex';
const CERT_PATH = process.env.ARCA_CERT_PATH || path.join(__dirname, '..', 'certs', 'arca.crt');
const KEY_PATH = process.env.ARCA_KEY_PATH || path.join(__dirname, '..', 'certs', 'arca.key');
const PASSPHRASE = process.env.ARCA_PASSPHRASE || '';
const USE_MOCK = process.env.ARCA_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';
const TIMEOUT_MS = 5000; // Timeout estricto de 5 segundos

/**
 * Realiza la llamada SOAP/HTTPS a ARCA/AFIP con timeout estricto de 5s.
 * @param {Object} datosFactura
 * @returns {Promise<{ cae: string, cae_vencimiento: string, mensaje: string }>}
 */
function solicitarCAESoap(datosFactura) {
  if (USE_MOCK) {
    if (process.env.ARCA_SIMULAR_ERROR === 'true' || datosFactura?._simular_error_afip) {
      return new Promise((_, reject) => {
        setTimeout(() => {
          const errMsg = typeof datosFactura?._simular_error_afip === 'string'
            ? datosFactura._simular_error_afip
            : 'Error en servicio ARCA/AFIP (simulado): tiempo de espera o servicio no disponible';
          reject(new Error(errMsg));
        }, 50);
      });
    }

    return new Promise((resolve) => {
      // Simula respuesta rápida en mock
      setTimeout(() => {
        resolve({
          cae: `CAE-${Math.floor(10000000000000 + Math.random() * 90000000000000)}`,
          cae_vencimiento: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          mensaje: 'CAE generado correctamente en modo homologación simulada.'
        });
      }, 100);
    });
  }

  if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
    return Promise.reject(
      new Error('Faltan certificados ARCA. Configure ARCA_CERT_PATH y ARCA_KEY_PATH en el archivo .env.')
    );
  }

  const payload = JSON.stringify({
    tipo_comprobante: datosFactura.tipo_comprobante,
    nro_comprobante: datosFactura.nro_comprobante,
    punto_venta: datosFactura.punto_venta || 1,
    total: datosFactura.total,
    cliente: datosFactura.cliente || { nombre: 'Consumidor Final', documento: '00000000' },
    productos: datosFactura.productos,
    metodo_pago: datosFactura.metodo_pago,
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
    rejectUnauthorized: false,
    timeout: TIMEOUT_MS,
  };

  return new Promise((resolve, reject) => {
    let timer = null;

    const req = https.request(ARCA_URL, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (timer) clearTimeout(timer);
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
        } catch (e) {
          reject(new Error(`Error al interpretar la respuesta de ARCA: ${e.message}`));
        }
      });
    });

    // Timeout estricto de 5 segundos
    timer = setTimeout(() => {
      req.destroy();
      const timeoutErr = new Error(`Tiempo de espera agotado (${TIMEOUT_MS}ms) al comunicarse con ARCA/AFIP.`);
      timeoutErr.code = 'ETIMEDOUT';
      reject(timeoutErr);
    }, TIMEOUT_MS);

    req.on('timeout', () => {
      req.destroy();
      const timeoutErr = new Error(`Timeout de conexión con ARCA/AFIP (${TIMEOUT_MS}ms).`);
      timeoutErr.code = 'ETIMEDOUT';
      reject(timeoutErr);
    });

    req.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`Error en la conexión con ARCA/AFIP: ${err.message}`));
    });

    req.write(payload);
    req.end();
  });
}

module.exports = {
  solicitarCAESoap,
  TIMEOUT_MS,
};
