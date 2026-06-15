import { useState, useEffect } from 'react'
import apiClient from './apiClient.js'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import Swal from 'sweetalert2'

import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './components/Dashboard.jsx';

import Login from './components/Login.jsx'
import Ventas from './components/Ventas.jsx'
import Inventario from './components/Inventario.jsx'
import Historial from './components/Historial.jsx'
import Proveedores from './components/Proveedores.jsx'
import Caja from './components/Caja.jsx'
import Clientes from './components/Clientes.jsx'
import Remitos from './components/Remitos.jsx'
import Recibos from './components/Recibos.jsx'

// Nuevos componentes comerciales
import Devoluciones from './components/Devoluciones.jsx'
import CuentaCorriente from './components/CuentaCorriente.jsx'
import ListasPrecios from './components/ListasPrecios.jsx'
import Presupuestos from './components/Presupuestos.jsx'
import OrdenesCompra from './components/OrdenesCompra.jsx'
import Reportes from './components/Reportes.jsx'
import Configuracion from './components/Configuracion.jsx'
import Gastos from './components/Gastos.jsx'
import FacturasCompra from './components/FacturasCompra.jsx'
import Licencias from './components/Licencias.jsx'

import { AuthProvider, useAuth } from './context/AuthContext.jsx'

// Mapeo de nombres de módulo a rutas
const MODULE_ROUTES = {
  'Ventas': '/ventas', 'Inventario': '/inventario', 'Clientes': '/clientes',
  'Proveedores': '/proveedores', 'Presupuestos': '/presupuestos', 'Devoluciones': '/devoluciones',
  'FacturasCompra': '/facturas-compra', 'Recibos': '/recibos', 'Remitos': '/remitos',
  'Configuracion': '/configuracion',
};

function DashboardWrapper(props) {
  const navigate = useNavigate();
  return <Dashboard {...props} onNavigate={(mod) => navigate(MODULE_ROUTES[mod] || '/')} />;
}

function AppContent() {
  const { user, token, authReady, isAuthenticated, isSubscriptionActive, logout, updateUser } = useAuth()

  const [productos, setProductos] = useState([])
  const [codigoBarras, setCodigoBarras] = useState('')
  const [nombre, setNombre] = useState('')
  const [precioVenta, setPrecioVenta] = useState('')
  const [costo, setCosto] = useState('')
  const [stock, setStock] = useState('')
  const [codigoSecundario, setCodigoSecundario] = useState('')
  const [codigoProveedor, setCodigoProveedor] = useState('')
  const [rubro, setRubro] = useState('')
  const [marca, setMarca] = useState('')
  const [proveedorId, setProveedorId] = useState('')

  const [carrito, setCarrito] = useState([])
  const [isProcessingSale, setIsProcessingSale] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [historial, setHistorial] = useState([])

  const [ventaSeleccionada, setVentaSeleccionada] = useState(null)
  const [detalles, setDetalles] = useState([])
  const [tipoComprobante, setTipoComprobante] = useState('interno')
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteDocumento, setClienteDocumento] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [descuento, setDescuento] = useState('0')

  const [clientes, setClientes] = useState([])
  const [remitos, setRemitos] = useState([])
  const [recibos, setRecibos] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [rubrosLista, setRubrosLista] = useState([])
  const [provNombre, setProvNombre] = useState('')
  const [provTelefono, setProvTelefono] = useState('')
  const [provEmail, setProvEmail] = useState('')
  const [provDescripcion, setProvDescripcion] = useState('')
  const [provCuit, setProvCuit] = useState('')
  const [provDireccion, setProvDireccion] = useState('')

  const [modalStock, setModalStock] = useState(null)
  const [cantidadStock, setCantidadStock] = useState('')

  const [modalAumento, setModalAumento] = useState(false)
  const [porcentajeAumento, setPorcentajeAumento] = useState('')
  const [mostrarPanelSuscripcion, setMostrarPanelSuscripcion] = useState(false)
  const [suscripcionActiva, setSuscripcionActiva] = useState(true)
  const [suscripcionHasta, setSuscripcionHasta] = useState('')

  const isAdmin = user?.rol?.toLowerCase() === 'administrador'
  const isOwner = user?.rol?.toLowerCase() === 'dueno'
  const isEmployee = user?.rol?.toLowerCase() === 'empleado'
  const canManageCatalog = isAdmin || isOwner || user?.rol === 'superadmin'
  const canViewFinancials = isAdmin || isOwner || user?.rol === 'superadmin'
  const [datosComercio, setDatosComercio] = useState({})

  const productosFiltrados = productos.filter((p) =>
    p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo_barras?.toString().includes(busqueda)
  )

  const totalRecaudado = historial.reduce((acc, venta) => acc + parseFloat(venta.total || 0), 0)

  useEffect(() => {
    if (!authReady || !token) return

    let ignore = false

    apiClient.get('/api/usuarios/me')
      .then(({ data }) => {
        if (ignore || !data?.usuario) return

        updateUser((currentUser) => ({
          ...(currentUser || {}),
          ...data.usuario,
          nombre: data.usuario.nombre || data.usuario.nombre_usuario || currentUser?.nombre || currentUser?.nombre_usuario,
          suscripcion_activa: data.usuario.suscripcion_activa ?? currentUser?.suscripcion_activa ?? true,
        }))
      })
      .catch((error) => {
        if (!ignore && error.response?.status === 403) {
          updateUser((currentUser) => currentUser ? { ...currentUser, suscripcion_activa: false } : currentUser)
        }
      })

    return () => {
      ignore = true
    }
  }, [authReady, token, updateUser])

  useEffect(() => {
    if (!user) return
    cargarProductos()
    cargarHistorial()
    cargarProveedores()
    cargarClientes()
    cargarRemitos()
    cargarRecibos()
    cargarRubros()
    // Cargar datos del comercio para el ticket fiscal
    apiClient.get('/api/configuracion/comercio').then(({ data }) => {
      setDatosComercio(data || {})
    }).catch(() => {})
  }, [user])

  useEffect(() => {
    if (!user) return
    setSuscripcionActiva(user.suscripcion_activa !== false && user.suscripcion_activa !== 0)
    setSuscripcionHasta(formatearFecha(user.suscripcion_hasta))
  }, [user])

  const cargarProductos = () => {
    apiClient.get(`/api/productos`).then((res) => setProductos(res.data))
      .catch((error) => {
        console.error('Error al cargar productos:', error)
      })
  }

  const cargarHistorial = () => {
    apiClient.get(`/api/ventas`).then((res) => setHistorial(res.data))
      .catch((error) => {
        console.error('Error al cargar historial:', error)
      })
  }

  const cargarClientes = () => {
    apiClient.get(`/api/clientes`).then((res) => setClientes(Array.isArray(res.data) ? res.data : []))
      .catch(err => console.error(err))
  }

  const cargarRemitos = () => {
    apiClient.get(`/api/remitos`).then((res) => setRemitos(Array.isArray(res.data) ? res.data : []))
      .catch(err => console.error(err))
  }

  const cargarRecibos = () => {
    apiClient.get(`/api/recibos`).then((res) => setRecibos(Array.isArray(res.data) ? res.data : []))
      .catch(err => console.error(err))
  }

  const manejarEnvioCliente = (datos, cb) => {
    apiClient.post('/api/clientes', datos)
      .then(() => {
        Swal.fire('Éxito', 'Cliente guardado', 'success')
        cargarClientes()
        if (cb) cb()
      })
      .catch(err => Swal.fire('Error', err.response?.data?.error || err.message, 'error'))
  }

  const eliminarCliente = (id) => {
    Swal.fire({
      title: '¿Eliminar cliente?',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (!result.isConfirmed) return;
      apiClient.delete(`/api/clientes/${id}`)
        .then(() => cargarClientes())
        .catch(err => Swal.fire('Error', err.response?.data?.error || err.message, 'error'));
    });
  };

  const editarCliente = (id, datosActualizados) => {
    apiClient.put(`/api/clientes/${id}`, datosActualizados)
      .then(() => {
        Swal.fire('Éxito', 'Cliente actualizado', 'success')
        cargarClientes()
      })
      .catch(err => Swal.fire('Error', err.response?.data?.error || err.message, 'error'))
  }

  const crearRemito = (datos, cb) => {
    apiClient.post('/api/remitos', datos)
      .then(() => {
        Swal.fire('Éxito', 'Remito generado', 'success')
        cargarRemitos()
        cargarProductos()
        if (cb) cb()
      })
      .catch(err => Swal.fire('Error', err.response?.data?.error || err.message, 'error'))
  }

  const crearRecibo = (datos, cb) => {
    apiClient.post('/api/recibos', datos)
      .then(() => {
        Swal.fire('Éxito', 'Recibo generado', 'success')
        cargarRecibos()
        if (cb) cb()
      })
      .catch(err => Swal.fire('Error', err.response?.data?.error || err.message, 'error'))
  }

  const cargarProveedores = () => {
    apiClient.get('/api/proveedores')
      .then(({ data }) => setProveedores(data))
      .catch(error => {
        console.error('Error al cargar proveedores:', error)
      })
  }

  const cargarRubros = () => {
    apiClient.get(`/api/rubros`)
      .then((res) => setRubrosLista(res.data))
      .catch((error) => console.error('Error al cargar rubros:', error))
  }

  const formatearFecha = (valor) => {
    if (!valor) return ''
    const texto = String(valor)
    const soloFecha = texto.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (soloFecha) return `${soloFecha[1]}-${soloFecha[2]}-${soloFecha[3]}`
    const fecha = new Date(texto)
    if (Number.isNaN(fecha.getTime())) return ''
    return fecha.toISOString().slice(0, 10)
  }

  const manejarEnvio = (e) => {
    e.preventDefault()
    const nuevoProducto = {
      codigo_barras: codigoBarras,
      nombre,
      precio_venta: parseFloat(precioVenta),
      costo: parseFloat(costo),
      stock: parseInt(stock, 10),
      codigo_secundario: codigoSecundario,
      codigo_proveedor: codigoProveedor,
      rubro,
      marca,
      proveedor_id: proveedorId || null,
    }

    apiClient.post('/api/productos', nuevoProducto)
      .then(() => {
        Swal.fire('✅Producto guardado exitosamente!', '', 'success')
        setCodigoBarras('')
        setNombre('')
        setPrecioVenta('')
        setCosto('')
        setStock('')
        setCodigoSecundario('')
        setCodigoProveedor('')
        setRubro('')
        setMarca('')
        setProveedorId('')
        cargarProductos()
      })
      .catch(error => {
        Swal.fire('❌Error', error.response?.data?.error || 'No se pudo guardar el producto', 'error')
      })
  }

  const manejarEnvioProveedor = (e) => {
    e.preventDefault()
    const nuevoProveedor = {
      nombre: provNombre,
      telefono: provTelefono,
      email: provEmail,
      descripcion: provDescripcion,
      cuit: provCuit,
      direccion: provDireccion
    }

    apiClient.post('/api/proveedores', nuevoProveedor)
      .then(() => {
        Swal.fire('✅Proveedor guardado exitosamente!', '', 'success')
        setProvNombre('')
        setProvTelefono('')
        setProvEmail('')
        setProvDescripcion('')
        setProvCuit('')
        setProvDireccion('')
        cargarProveedores()
      })
      .catch(error => {
        Swal.fire('❌Error', 'No se pudo guardar el proveedor', 'error')
      })
  }

  const eliminarProveedor = (id) => {
    Swal.fire({
      title: '¿Eliminar proveedor?',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (!result.isConfirmed) return;
      apiClient.delete(`/api/proveedores/${id}`)
        .then(() => { Swal.fire('Listo', 'Proveedor eliminado', 'success'); cargarProveedores(); })
        .catch(err => Swal.fire('Error', err.response?.data?.error || err.message, 'error'));
    });
  };

  const editarProveedor = (id, datosActualizados) => {
    apiClient.put(`/api/proveedores/${id}`, datosActualizados)
      .then(() => {
        Swal.fire('Éxito', 'Proveedor actualizado', 'success')
        cargarProveedores()
      })
      .catch(err => Swal.fire('Error', err.response?.data?.error || err.message, 'error'))
  }

  const abrirAgregarStock = (producto) => {
    setModalStock(producto)
  }

  const confirmarAgregarStock = () => {
    if (!modalStock) return
    const cantidad = parseInt(cantidadStock, 10)
    if (isNaN(cantidad) || cantidad <= 0) {
      Swal.fire('❌Error', 'Por favor ingrese una cantidad válida', 'error')
      return
    }

    apiClient.put(`/api/productos/${modalStock.id}/stock`, { cantidad_agregada: cantidad })
      .then(() => {
        Swal.fire('✅Stock actualizado correctamente!', '', 'success')
        setModalStock(null)
        setCantidadStock('')
        cargarProductos()
      })
      .catch(error => {
        Swal.fire('❌Error', 'No se pudo actualizar el stock', 'error')
      })
  }

  const eliminarProducto = (id) => {
    Swal.fire({
      title: '¿Eliminar producto?',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (!result.isConfirmed) return;
      apiClient.delete(`/api/productos/${id}`)
        .then(() => { Swal.fire('Listo', 'Producto eliminado', 'success'); cargarProductos(); })
        .catch(err => Swal.fire('Error', err.response?.data?.error || err.message, 'error'));
    });
  };

  const editarProducto = (id, datosActualizados) => {
    apiClient.put(`/api/productos/${id}`, datosActualizados)
      .then(() => {
        Swal.fire('Éxito', 'Producto actualizado', 'success')
        cargarProductos()
      })
      .catch(err => Swal.fire('Error', err.response?.data?.error || err.message, 'error'))
  }

  const confirmarAumentoMasivo = () => {
    const porc = parseFloat(porcentajeAumento)
    if (isNaN(porc)) {
      Swal.fire('❌Error', 'Ingrese un porcentaje válido', 'error')
      return
    }

    apiClient.put('/api/productos/aumento-masivo', { porcentaje: porc })
      .then(({ data }) => {
        Swal.fire('✅Aumento Aplicado', data.mensaje, 'success')
        setModalAumento(false)
        setPorcentajeAumento('')
        cargarProductos()
      })
      .catch(error => {
        Swal.fire('❌Error', error.response?.data?.error || 'No se pudo aplicar el aumento', 'error')
      })
  }

  const agregarAlCarrito = (producto) => {
    if (producto.stock <= 0) {
      Swal.fire('❌Sin stock', 'Este producto no tiene stock disponible.', 'warning')
      return
    }

    const existe = carrito.find((item) => item.id === producto.id)
    if (existe) {
      if (existe.cantidad >= producto.stock) {
        Swal.fire('❌Sin stock adicional', 'No puedes agregar más unidades.', 'warning')
        return
      }
      setCarrito(carrito.map((item) => item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item))
      return
    }

    setCarrito([...carrito, { ...producto, cantidad: 1 }])
  }

  const eliminarDelCarrito = (id) => {
    setCarrito(carrito.filter((item) => item.id !== id))
  }

  const finalizarVenta = () => {
    if (isProcessingSale) return;
    setIsProcessingSale(true);

    if (carrito.length === 0) {
      setIsProcessingSale(false);
      return Swal.fire('❌Carrito Vacío', 'No podés cobrar una venta sin productos.', 'warning')
    }

    if (metodoPago === 'cuenta_corriente' && !clienteId) {
      setIsProcessingSale(false);
      return Swal.fire('❌Cliente requerido', 'Debes seleccionar un cliente para cobrar en Cuenta Corriente.', 'warning');
    }

    if (['factura_a', 'factura_b'].includes(tipoComprobante)) {
      if (!clienteNombre || !clienteDocumento) {
        setIsProcessingSale(false);
        return Swal.fire('❌Faltan datos', 'Para emitir una factura necesitas nombre y documento del cliente.', 'warning')
      }
    }

    const subtotal = carrito.reduce((acc, item) => acc + (item.precio_venta || 0) * item.cantidad, 0)
    const descNum = parseFloat(descuento) || 0
    const totalVenta = Math.max(0, subtotal - descNum)

    const datosVenta = {
      id_usuario: user.id,
      total: totalVenta,
      descuento: descNum,
      productos: carrito,
      tipo_comprobante: tipoComprobante,
      metodo_pago: metodoPago,
      cliente_id: clienteId || null,
      cliente: ['factura_a', 'factura_b'].includes(tipoComprobante) ? {
        id: clienteId || null,
        nombre: clienteNombre,
        documento: clienteDocumento,
      } : null,
    }

    apiClient.post('/api/ventas', datosVenta)
      .then(({ data }) => {
        Swal.fire({
          title: '✅ Venta Confirmada!',
          html: `${data.mensaje || 'Operación exitosa'}<br /><strong>Comprobante:</strong> ${data.tipo_comprobante}`,
          icon: 'success',
          timer: 2500,
          showConfirmButton: false,
        })

        // Generar e imprimir ticket automáticamente al finalizar la venta
        generarEImprimirTicketPDF({
          idVenta: data.id_venta,
          nroComprobante: data.nro_comprobante,
          puntoVenta: datosComercio?.punto_venta || 1,
          fecha: new Date().toLocaleString(),
          vendedor: user?.nombre_usuario || user?.nombre || 'Vendedor',
          productos: carrito.map(item => ({
            cantidad: item.cantidad,
            nombre: item.nombre,
            precio_unitario: item.precio_venta || 0,
            iva_porcentaje: item.iva_porcentaje || 21,
          })),
          total: totalVenta,
          tipoComprobante: tipoComprobante,
          cae: data.cae || null,
          caeVencimiento: data.cae_vencimiento || null,
          datosComercio: datosComercio,
        })

        setCarrito([])
        setDescuento('0')
        setIsProcessingSale(false)
        setTipoComprobante('interno')
        setMetodoPago('efectivo')
        setClienteNombre('')
        setClienteDocumento('')
        setClienteId('')
        cargarProductos()
        cargarHistorial()
        cargarClientes()
      })
      .catch((error) => {
        setIsProcessingSale(false)
        console.error('Error al procesar venta:', error)
        Swal.fire('❌Error', error.response?.data?.error || error.message || 'Hubo un problema al procesar la venta.', 'error')
      })
  }

  const verDetalleVenta = (idVenta) => {
    apiClient.get(`/api/ventas/${idVenta}/productos`)
      .then(({ data }) => {
        setDetalles(data)
        setVentaSeleccionada(idVenta)
      })
      .catch(error => {
        Swal.fire('❌Error', 'No se pudo cargar el detalle de la venta', 'error')
      })
  }

  const generarEImprimirTicketPDF = ({ idVenta, nroComprobante, puntoVenta, fecha, vendedor, productos, total, tipoComprobante, cae, caeVencimiento, datosComercio }) => {
    if (!productos || productos.length === 0) return

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 200] })
    const CENTER = 40

    // ─── CABECERA FISCAL ──────────────────────────────────────────────────────
    const comercio = datosComercio || {}
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text(comercio.razon_social || comercio.nombre || 'KIOSKO PRO', CENTER, 10, { align: 'center' })

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    if (comercio.domicilio) doc.text(comercio.domicilio, CENTER, 14, { align: 'center' })
    if (comercio.cuit) doc.text(`CUIT: ${comercio.cuit}`, CENTER, 18, { align: 'center' })
    if (comercio.condicion_fiscal) doc.text(`IVA: ${comercio.condicion_fiscal}`, CENTER, 22, { align: 'center' })

    // ─── TIPO DE COMPROBANTE ──────────────────────────────────────────────────
    const tipoLabel = {
      'interno': 'Comprobante Interno',
      'factura_b': 'FACTURA B',
      'factura_a': 'FACTURA A',
      'nota_credito_b': 'NOTA DE CRÉDITO B',
      'nota_credito_a': 'NOTA DE CRÉDITO A',
    }[tipoComprobante] || tipoComprobante.toUpperCase()

    let y = 26
    doc.line(5, y, 75, y); y += 4
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(tipoLabel, CENTER, y, { align: 'center' })
    y += 4

    // Punto de venta y N° comprobante
    if (puntoVenta || nroComprobante) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      const pvStr = puntoVenta ? String(puntoVenta).padStart(4, '0') : '0001'
      const nroStr = nroComprobante ? String(nroComprobante).padStart(8, '0') : String(idVenta || '').padStart(8, '0')
      doc.text(`Pto. Vta: ${pvStr}  Comp. N°: ${nroStr}`, CENTER, y, { align: 'center' })
      y += 4
    }

    doc.line(5, y, 75, y); y += 4
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`Fecha: ${fecha}`, 5, y)
    doc.text(`Vendedor: ${vendedor}`, 5, y + 4)
    y += 10
    doc.line(5, y, 75, y); y += 4

    // ─── ÍTEMS ────────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold')
    doc.text('Cant | Producto', 5, y)
    doc.text('Subtotal', 75, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    y += 5

    let subtotalNeto = 0
    const ivaAcumulado = {} // { '21': monto, '10.5': monto, ... }

    productos.forEach((item) => {
      if (y > 185) { doc.addPage([80, 200]); y = 10 }
      const pUnit = parseFloat(item.precio_unitario ?? item.precio_venta ?? 0)
      const cant = item.cantidad || 1
      const subtotalItem = cant * pUnit
      const ivaPorc = parseFloat(item.iva_porcentaje ?? 21)
      const neto = subtotalItem / (1 + ivaPorc / 100)
      const ivaItem = subtotalItem - neto
      subtotalNeto += neto
      if (!ivaAcumulado[ivaPorc]) ivaAcumulado[ivaPorc] = 0
      ivaAcumulado[ivaPorc] += ivaItem

      const nombreLinea = item.nombre.length > 28 ? item.nombre.substring(0, 25) + '...' : item.nombre
      doc.text(`${cant}x ${nombreLinea}`, 5, y)
      doc.text(`$${subtotalItem.toFixed(2)}`, 75, y, { align: 'right' })
      y += 5
    })

    // ─── TOTALES CON IVA DISCRIMINADO ─────────────────────────────────────────
    doc.line(5, y, 75, y); y += 4
    doc.setFont('helvetica', 'normal')

    // Subtotal neto
    doc.text(`Subtotal Neto:`, 5, y)
    doc.text(`$${subtotalNeto.toFixed(2)}`, 75, y, { align: 'right' })
    y += 4

    // IVA por alícuota
    Object.entries(ivaAcumulado).forEach(([porc, monto]) => {
      if (monto > 0) {
        doc.text(`IVA ${porc}%:`, 5, y)
        doc.text(`$${monto.toFixed(2)}`, 75, y, { align: 'right' })
        y += 4
      }
    })

    doc.line(5, y, 75, y); y += 4
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('TOTAL:', 5, y)
    doc.text(`$${parseFloat(total || 0).toFixed(2)}`, 75, y, { align: 'right' })
    y += 8

    // ─── CAE / QR ─────────────────────────────────────────────────────────────
    if (cae) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text(`CAE: ${cae}`, 5, y); y += 4
      if (caeVencimiento) { doc.text(`Vencimiento CAE: ${caeVencimiento}`, 5, y); y += 4 }
    }

    // ─── PIE ──────────────────────────────────────────────────────────────────
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    const leyenda = comercio.leyenda_ticket || '¡Gracias por su compra!'
    doc.text(leyenda, CENTER, y, { align: 'center' })

    doc.autoPrint()
    const blobUrl = doc.output('bloburl')
    window.open(blobUrl, '_blank')
  }

  const imprimirBoletaPDF = () => {
    if (!ventaSeleccionada || detalles.length === 0) return
    const datosMaster = historial.find((h) => h.id === ventaSeleccionada)
    const fechaStr = datosMaster ? new Date(datosMaster.fecha).toLocaleString() : new Date().toLocaleString()
    const vendedorStr = datosMaster ? datosMaster.vendedor : 'Desconocido'

    generarEImprimirTicketPDF({
      idVenta: ventaSeleccionada,
      fecha: fechaStr,
      vendedor: vendedorStr,
      productos: detalles,
      total: datosMaster ? datosMaster.total : 0,
      tipoComprobante: datosMaster?.tipo_comprobante || 'interno',
    })
  }

  // BUG#7 FIX — fondo oscuro para evitar flash blanco en modo dark
  if (!authReady) {
    return (
      <div
        className="flex min-h-screen items-center justify-center font-sans"
        style={{ background: '#09080f', color: '#a78bfa' }}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="h-10 w-10 rounded-full border-4 animate-spin"
            style={{ borderColor: 'rgba(124,58,237,0.20)', borderTopColor: '#7c3aed' }}
          />
          <p className="text-sm font-semibold" style={{ color: 'rgba(167,139,250,0.70)' }}>
            Cargando KioskoPro...
          </p>
        </div>
      </div>
    )
  }

  // BUG#2 FIX — Login debe estar dentro del BrowserRouter para que
  // cualquier hook de react-router (useNavigate, etc.) funcione correctamente.
  // Lo ponemos dentro del mismo return con BrowserRouter en la raíz.
  if (!isAuthenticated || !user) {
    return (
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    )
  }

  if (!isSubscriptionActive) {
    return (
      <BrowserRouter>
        <div
          className="flex min-h-screen items-center justify-center px-6 text-center font-sans"
          style={{ background: '#09080f' }}
        >
          <div
            className="max-w-md rounded-3xl p-10 text-center"
            style={{ background: 'rgba(22,11,46,0.90)', border: '1px solid rgba(239,68,68,0.25)', boxShadow: '0 24px 60px rgba(0,0,0,0.50)' }}
          >
            <div
              className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl text-2xl"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)' }}
            >
              🔒
            </div>
            <h1 className="text-2xl font-black text-white mb-3">Suscripción Vencida</h1>
            <p className="text-sm leading-6" style={{ color: 'rgba(248,113,113,0.75)' }}>
              Contactá a soporte para reactivar el acceso al sistema.
            </p>
          </div>
        </div>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardWrapper historial={historial} productos={productos} clientes={clientes} />} />
          <Route path="/ventas" element={
            <Ventas
              busqueda={busqueda}
              setBusqueda={setBusqueda}
              productosFiltrados={productosFiltrados}
              carrito={carrito}
              setCarrito={setCarrito}
              agregarAlCarrito={agregarAlCarrito}
              eliminarDelCarrito={eliminarDelCarrito}
              finalizarVenta={finalizarVenta}
              tipoComprobante={tipoComprobante}
              setTipoComprobante={setTipoComprobante}
              metodoPago={metodoPago}
              setMetodoPago={setMetodoPago}
              clienteNombre={clienteNombre}
              setClienteNombre={setClienteNombre}
              clienteDocumento={clienteDocumento}
              setClienteDocumento={setClienteDocumento}
              clienteId={clienteId}
              setClienteId={setClienteId}
              descuento={descuento}
              setDescuento={setDescuento}
              isProcessingSale={isProcessingSale}
              clientes={clientes}
            />
          } />
          <Route path="/inventario" element={
            <Inventario
              productos={productos}
              canManageCatalog={canManageCatalog}
              codigoBarras={codigoBarras}
              setCodigoBarras={setCodigoBarras}
              nombre={nombre}
              setNombre={setNombre}
              precioVenta={precioVenta}
              setPrecioVenta={setPrecioVenta}
              costo={costo}
              setCosto={setCosto}
              stock={stock}
              setStock={setStock}
              codigoSecundario={codigoSecundario}
              setCodigoSecundario={setCodigoSecundario}
              codigoProveedor={codigoProveedor}
              setCodigoProveedor={setCodigoProveedor}
              rubro={rubro}
              setRubro={setRubro}
              marca={marca}
              setMarca={setMarca}
              proveedorId={proveedorId}
              setProveedorId={setProveedorId}
              proveedores={proveedores}
              rubrosLista={rubrosLista}
              cargarRubros={cargarRubros}
              cargarProductos={cargarProductos}
              manejarEnvio={manejarEnvio}
              eliminarProducto={eliminarProducto}
              editarProducto={editarProducto}
              abrirAgregarStock={abrirAgregarStock}
              abrirAumentoMasivo={() => setModalAumento(true)}
            />
          } />
          <Route path="/caja" element={<Caja historial={historial} isOwner={isOwner} usuario={user} />} />
          <Route path="/cuenta-corriente" element={<CuentaCorriente />} />
          <Route path="/devoluciones" element={<Devoluciones />} />
          <Route path="/listas-precios" element={<ListasPrecios productos={productos} />} />
          <Route path="/presupuestos" element={<Presupuestos productos={productos} clientes={clientes} />} />
          <Route path="/ordenes-compra" element={<OrdenesCompra proveedores={proveedores} productos={productos} />} />
          <Route path="/clientes" element={<Clientes clientes={clientes} canManageCatalog={canManageCatalog} manejarEnvioCliente={manejarEnvioCliente} eliminarCliente={eliminarCliente} editarCliente={editarCliente} cargarClientes={cargarClientes} />} />
          <Route path="/proveedores" element={<Proveedores proveedores={proveedores} canManageCatalog={canManageCatalog} provNombre={provNombre} setProvNombre={setProvNombre} provTelefono={provTelefono} setProvTelefono={setProvTelefono} provEmail={provEmail} setProvEmail={setProvEmail} provDescripcion={provDescripcion} setProvDescripcion={setProvDescripcion} provCuit={provCuit} setProvCuit={setProvCuit} provDireccion={provDireccion} setProvDireccion={setProvDireccion} manejarEnvioProveedor={manejarEnvioProveedor} eliminarProveedor={eliminarProveedor} editarProveedor={editarProveedor} />} />
          <Route path="/historial" element={<Historial historial={historial} canViewFinancials={canViewFinancials} totalRecaudado={totalRecaudado} verDetalleVenta={verDetalleVenta} />} />
          <Route path="/remitos" element={<Remitos remitos={remitos} productos={productos} proveedores={proveedores} crearRemito={crearRemito} />} />
          <Route path="/recibos" element={<Recibos recibos={recibos} proveedores={proveedores} crearRecibo={crearRecibo} />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/configuracion" element={<Configuracion canManageCatalog={canManageCatalog} />} />
          <Route path="/gastos" element={<Gastos />} />
          <Route path="/facturas-compra" element={<FacturasCompra productos={productos} proveedores={proveedores} />} />
          <Route path="/licencias" element={<Licencias />} />
          <Route path="*" element={<Navigate to="/" replace />} />

        </Route>
      </Routes>

      {/* Modal Ticket Venta */}
      {ventaSeleccionada && (() => {
        const datosMaster = historial.find((h) => h.id === ventaSeleccionada)
        const fechaStr = datosMaster ? new Date(datosMaster.fecha).toLocaleString() : ''
        const totalTicket = datosMaster ? parseFloat(datosMaster.total).toFixed(2) : '0.00'

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(9,8,15,0.80)', backdropFilter: 'blur(8px)' }}>
            <div className="w-full max-w-2xl rounded-[2rem] bg-white p-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
              <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-5">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Ticket de Venta #{ventaSeleccionada}</h2>
                  <p className="text-sm text-slate-500 mt-1">{fechaStr}</p>
                </div>
                <button type="button" onClick={() => setVentaSeleccionada(null)} className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
                  &times;
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--surface-border)' }}>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr style={{ background: 'rgba(124,58,237,0.06)', borderBottom: '1px solid var(--surface-border)' }}>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Producto</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Cant.</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">P. Unitario</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalles.map((d, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{d.nombre}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{d.cantidad}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">${parseFloat(d.precio_unitario).toFixed(2)}</td>
                        <td className="px-4 py-3 font-bold" style={{ color: '#a78bfa' }}>${(d.cantidad * d.precio_unitario).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot style={{ borderTop: '2px solid var(--surface-border)', background: 'rgba(124,58,237,0.04)' }}>
                    <tr>
                      <td colSpan="3" className="px-4 py-3 text-right text-sm font-bold text-slate-600 dark:text-slate-400">TOTAL</td>
                      <td className="px-4 py-3 text-base font-black" style={{ color: '#7c3aed' }}>${totalTicket}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setVentaSeleccionada(null)}
                  className="rounded-2xl px-6 py-3 text-sm font-semibold transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--surface-border)', color: 'inherit' }}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={imprimirBoletaPDF}
                  className="rounded-2xl px-6 py-3 text-sm font-bold text-white shadow-lg transition-all active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 20px rgba(124,58,237,0.35)' }}
                >
                  Imprimir Ticket
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal Agregar Stock */}
      {modalStock && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(9,8,15,0.80)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="w-full max-w-md rounded-3xl p-8 shadow-2xl animate-slide-up"
            style={{ background: 'var(--surface-card)', border: '1px solid rgba(124,58,237,0.25)' }}
          >
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">Agregar Stock</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Unidades a ingresar a <strong style={{ color: '#a78bfa' }}>{modalStock.nombre}</strong></p>
            </div>
            <input
              type="number"
              placeholder="Ej: 50"
              value={cantidadStock}
              onChange={(e) => setCantidadStock(e.target.value)}
              className="w-full rounded-2xl px-5 py-4 text-xl text-center font-bold outline-none mb-6 transition-all"
              style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)', color: 'inherit' }}
              min="1"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setModalStock(null); setCantidadStock('') }}
                className="w-full rounded-2xl px-5 py-3 text-sm font-semibold transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: 'inherit' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarAgregarStock}
                className="w-full rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-lg transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #059669, #047857)', boxShadow: '0 4px 16px rgba(5,150,105,0.30)' }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Aumento Masivo */}
      {modalAumento && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(9,8,15,0.80)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="w-full max-w-md rounded-3xl p-8 shadow-2xl animate-slide-up"
            style={{ background: 'var(--surface-card)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">Aumento Masivo de Precios</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Porcentaje a aumentar en todos los productos.</p>
            </div>
            <input
              type="number"
              step="0.1"
              placeholder="Ej: 10"
              value={porcentajeAumento}
              onChange={(e) => setPorcentajeAumento(e.target.value)}
              className="w-full rounded-2xl px-5 py-4 text-xl text-center font-bold outline-none mb-6 transition-all"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setModalAumento(false); setPorcentajeAumento('') }}
                className="w-full rounded-2xl px-5 py-3 text-sm font-semibold transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: 'inherit' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarAumentoMasivo}
                className="w-full rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-lg transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', boxShadow: '0 4px 16px rgba(220,38,38,0.30)' }}
              >
                Aplicar Aumento
              </button>
            </div>
          </div>
        </div>
      )}
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
