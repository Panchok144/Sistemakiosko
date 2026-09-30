import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Search, Package, ShoppingBag, Phone, MapPin, Mail, Tag } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

// ─────────────────────────────────────────────────────────────────────────────
//  CatalogoPublico — Vista pública del catálogo de un comercio
//  Ruta: /c/:slug  (sin autenticación requerida)
// ─────────────────────────────────────────────────────────────────────────────
export default function CatalogoPublico() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [rubroFiltro, setRubroFiltro] = useState('');

  useEffect(() => {
    const fetchCatalogo = async () => {
      try {
        const res = await fetch(`/api/catalogo/${slug}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Error ${res.status}`);
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchCatalogo();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-slate-600 font-medium">Cargando catálogo...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rose-50 to-slate-100 p-4">
        <div className="max-w-md text-center">
          <div className="mb-4 text-6xl">🔒</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Catálogo no disponible</h1>
          <p className="text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  const { comercio, productos = [] } = data;
  const rubros = [...new Set(productos.map(p => p.rubro).filter(Boolean))].sort();

  const filtrados = productos.filter(p => {
    const matchBusq = !busqueda ||
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.rubro && p.rubro.toLowerCase().includes(busqueda.toLowerCase())) ||
      (p.codigo_barras && p.codigo_barras.includes(busqueda));
    const matchRubro = !rubroFiltro || p.rubro === rubroFiltro;
    return matchBusq && matchRubro;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30">
      {/* Hero / Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
                <ShoppingBag size={24} />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900">{comercio.nombre}</h1>
                {comercio.leyenda && (
                  <p className="text-xs text-slate-500">{comercio.leyenda}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              {comercio.telefono && (
                <span className="flex items-center gap-1"><Phone size={12} /> {comercio.telefono}</span>
              )}
              {comercio.domicilio && (
                <span className="flex items-center gap-1"><MapPin size={12} /> {comercio.domicilio}</span>
              )}
              {comercio.email && (
                <span className="flex items-center gap-1"><Mail size={12} /> {comercio.email}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Barra de búsqueda + filtro rubro */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="catalogo-busqueda"
              type="text"
              placeholder="Buscar productos..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <select
            value={rubroFiltro}
            onChange={e => setRubroFiltro(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm outline-none focus:border-indigo-500"
          >
            <option value="">Todos los rubros</option>
            {rubros.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Estadísticas */}
        <div className="mb-4 text-sm text-slate-500">
          {filtrados.length} producto{filtrados.length !== 1 ? 's' : ''} disponible{filtrados.length !== 1 ? 's' : ''}
          {rubroFiltro && <span> en <strong className="text-indigo-600">{rubroFiltro}</strong></span>}
        </div>

        {/* Grid de productos */}
        {filtrados.length === 0 ? (
          <div className="py-20 text-center">
            <Package size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500">No se encontraron productos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtrados.map(producto => (
              <article
                key={producto.id}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-200"
              >
                {/* Imagen placeholder o real */}
                <div className="mb-3 flex h-28 items-center justify-center rounded-xl bg-gradient-to-br from-slate-50 to-indigo-50 overflow-hidden">
                  {producto.imagen_url ? (
                    <img
                      src={producto.imagen_url}
                      alt={producto.nombre}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Package size={36} className="text-slate-300" />
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-1 flex-col">
                  <p className="text-xs font-bold text-indigo-600 mb-0.5 line-clamp-1">
                    {producto.rubro || 'Sin rubro'}
                  </p>
                  <h3 className="flex-1 text-sm font-bold text-slate-900 leading-tight mb-2 line-clamp-2">
                    {producto.nombre}
                  </h3>
                  {producto.marca && (
                    <p className="text-xs text-slate-400 mb-1">{producto.marca}</p>
                  )}
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-lg font-black text-emerald-600">
                      {formatCurrency(producto.precio_venta)}
                    </span>
                    {producto.codigo_barras && (
                      <span className="flex items-center gap-0.5 text-xs text-slate-400">
                        <Tag size={10} /> {producto.codigo_barras.slice(-6)}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
          Catálogo digital generado con <span className="font-bold text-indigo-500">KIOSKOPRO</span> · Los precios pueden variar sin previo aviso.
        </footer>
      </div>
    </div>
  );
}
