/**
 * frontend/src/utils/offlineQueue.js — M6
 * ─────────────────────────────────────────────────────────────────────────────
 * Cola offline de ventas para soporte Offline-First en el POS.
 *
 * Cambios M6:
 *  - Almacenamiento: IndexedDB (db kiosko_offline, store ventas)
 *    Mayor capacidad (~50MB), sin riesgo de cuota de localStorage.
 *  - Idempotency-Key: generado automáticamente como UUID v4 si el payload
 *    no lo incluye, garantizando unicidad de cada venta offline.
 *  - API pública compatible: las firmas de función no cambian.
 *
 * API:
 *   guardarVentaOffline(datosVenta)        → Promise<string>  (key generado)
 *   obtenerVentasOffline()                 → Promise<Array>
 *   eliminarVentaOffline(idempotency_key)  → Promise<void>
 *   limpiarVentasOffline()                 → Promise<void>
 *   sincronizarVentasPendientes(apiClient) → Promise<{sincronizadas}>
 */

import toast from 'react-hot-toast';

const DB_NAME    = 'kiosko_offline';
const STORE_NAME = 'ventas';
const DB_VERSION = 1;

// ── UUID v4 simple (sin dependencia) ─────────────────────────────────────────
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> (c === 'x' ? 0 : 2);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── IndexedDB helper ──────────────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'idempotency_key' });
        store.createIndex('creado_offline_at', 'creado_offline_at', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function withStore(mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req   = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

async function contarVentasOffline() {
  try { return await withStore('readonly', s => s.count()); } catch { return 0; }
}

function notificarCambio(count) {
  window.dispatchEvent(new CustomEvent('kiosko:offline_queue_updated', { detail: { count } }));
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Obtiene todas las ventas pendientes en cola.
 * @returns {Promise<Array>}
 */
export async function obtenerVentasOffline() {
  try {
    return await withStore('readonly', s => s.getAll());
  } catch (e) {
    console.error('[offlineQueue] Error leyendo cola offline:', e);
    return [];
  }
}

/**
 * Guarda una venta en la cola offline.
 * Si datosVenta no incluye idempotency_key, se genera automáticamente.
 * @param {Object} datosVenta
 * @returns {Promise<string>} El Idempotency-Key usado
 */
export async function guardarVentaOffline(datosVenta) {
  try {
    const key = datosVenta.idempotency_key || uuidv4();
    const item = {
      idempotency_key: key,
      ...datosVenta,
      creado_offline_at: new Date().toISOString(),
    };
    await withStore('readwrite', s => s.put(item));
    const count = await contarVentasOffline();
    notificarCambio(count);
    return key;
  } catch (e) {
    console.error('[offlineQueue] Error guardando en cola offline:', e);
    return null;
  }
}

/**
 * Elimina una venta de la cola por su Idempotency-Key.
 * @param {string} idempotencyKey
 */
export async function eliminarVentaOffline(idempotencyKey) {
  try {
    await withStore('readwrite', s => s.delete(idempotencyKey));
    const count = await contarVentasOffline();
    notificarCambio(count);
  } catch (e) {
    console.error('[offlineQueue] Error eliminando de cola offline:', e);
  }
}

/**
 * Limpia toda la cola offline.
 */
export async function limpiarVentasOffline() {
  try {
    await withStore('readwrite', s => s.clear());
    notificarCambio(0);
  } catch (e) {
    console.error('[offlineQueue] Error limpiando cola offline:', e);
  }
}

/**
 * Sincroniza todas las ventas pendientes con el servidor.
 * Elimina de la cola solo las que el servidor confirmó (idempotente).
 * @param {import('axios').AxiosInstance} apiClient
 */
export async function sincronizarVentasPendientes(apiClient) {
  const cola = await obtenerVentasOffline();
  if (!cola || cola.length === 0) return { sincronizadas: 0 };

  try {
    const res = await apiClient.post('/api/ventas/sync', { ventas: cola });
    const { resultados = [], sincronizadas = 0 } = res.data;

    // Eliminar ventas que el servidor confirmó como sincronizadas o idempotentes
    for (const r of resultados) {
      if (r.estado === 'sincronizada' || r.estado === 'idempotente') {
        await eliminarVentaOffline(r.idempotency_key);
      }
    }

    if (sincronizadas > 0) {
      toast.success(`⚡ Sincronización exitosa: ${sincronizadas} venta(s) guardada(s) en el servidor.`, {
        duration: 4000,
        id: 'sync-success-toast',
      });
    }

    return res.data;
  } catch (err) {
    console.warn('[offlineQueue] Error al sincronizar:', err.response?.data || err.message);
    if (err.response?.status === 403) {
      toast.error('No se pueden sincronizar las ventas: la caja está cerrada.', { id: 'sync-no-caja' });
    }
    throw err;
  }
}
