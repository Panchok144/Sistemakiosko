/**
 * frontend/src/utils/offlineQueue.js
 * Cola local de ventas para soporte Offline-First en el POS
 */

import toast from 'react-hot-toast';

const QUEUE_KEY = 'kiosko_offline_ventas';

export function obtenerVentasOffline() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error leyendo cola offline:', e);
    return [];
  }
}

export function guardarVentaOffline(datosVenta, idempotencyKey) {
  try {
    const cola = obtenerVentasOffline();
    const item = {
      idempotency_key: idempotencyKey,
      ...datosVenta,
      creado_offline_at: new Date().toISOString(),
    };
    cola.push(item);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(cola));
    window.dispatchEvent(new CustomEvent('kiosko:offline_queue_updated', { detail: { count: cola.length } }));
    return true;
  } catch (e) {
    console.error('Error guardando en cola offline:', e);
    return false;
  }
}

export function eliminarVentaOffline(idempotencyKey) {
  try {
    let cola = obtenerVentasOffline();
    cola = cola.filter((v) => (v.idempotency_key || v.idempotencyKey) !== idempotencyKey);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(cola));
    window.dispatchEvent(new CustomEvent('kiosko:offline_queue_updated', { detail: { count: cola.length } }));
  } catch (e) {
    console.error('Error eliminando de cola offline:', e);
  }
}

export function limpiarVentasOffline() {
  try {
    localStorage.removeItem(QUEUE_KEY);
    window.dispatchEvent(new CustomEvent('kiosko:offline_queue_updated', { detail: { count: 0 } }));
  } catch (e) {}
}

export async function sincronizarVentasPendientes(apiClient) {
  const cola = obtenerVentasOffline();
  if (!cola || cola.length === 0) return { sincronizadas: 0 };

  try {
    const res = await apiClient.post('/api/ventas/sync', { ventas: cola });
    const { resultados = [], sincronizadas = 0 } = res.data;

    // Eliminar de la cola aquellas ventas que se sincronizaron o ya existían (idempotentes)
    for (const r of resultados) {
      if (r.estado === 'sincronizada' || r.estado === 'idempotente') {
        eliminarVentaOffline(r.idempotency_key);
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
    console.warn('Error al sincronizar ventas offline:', err.response?.data || err.message);
    if (err.response?.status === 403) {
      toast.error('No se pueden sincronizar las ventas: la caja está cerrada.', { id: 'sync-no-caja' });
    }
    throw err;
  }
}
