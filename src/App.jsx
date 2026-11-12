import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { CATEGORIAS_DEFECTO } from './seedData'
import { 
  Plus, Users, DollarSign, PieChart as PieChartIcon, 
  LogOut, Car, ShoppingCart, GraduationCap, Utensils, 
  BookOpen, Pizza, Home, HeartPulse, Calendar, TrendingUp, Building2 
} from 'lucide-react'

const ICON_MAP = {
  ShoppingCart, GraduationCap, Utensils, BookOpen, 
  Pizza, Car, Home, HeartPulse, Building2
}

export default function App() {
  const [miembro, setMiembro] = useState(() => JSON.parse(localStorage.getItem('usuario_familia') || 'null'))
  const [grupo, setGrupo] = useState(() => JSON.parse(localStorage.getItem('grupo_familia') || 'null'))

  const [nombreUsuario, setNombreUsuario] = useState('')
  const [nombreGrupo, setNombreGrupo] = useState('')
  const [codigoGrupo, setCodigoGrupo] = useState('')
  const [modoCrear, setModoCrear] = useState(true)

  const [gastos, setGastos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [integrantes, setIntegrantes] = useState([])
  const [tab, setTab] = useState('resumen')

  const [tasaBcv, setTasaBcv] = useState(null)

  const mesActualStr = new Date().toISOString().slice(0, 7)
  const [mesSeleccionado, setMesSeleccionado] = useState(mesActualStr)

  const [modalGasto, setModalGasto] = useState(false)
  const [monto, setMonto] = useState('')
  const [montoBsInput, setMontoBsInput] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoriaId, setCategoriaId] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const codigoUrl = params.get('codigo')
    if (codigoUrl && !grupo) {
      setCodigoGrupo(codigoUrl.toUpperCase())
      setModoCrear(false)
    }
    obtenerTasaBCV()
  }, [])

  useEffect(() => {
    if (grupo?.id) {
      cargarTodo()

      const canal = supabase
        .channel('cambios-grupo')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transacciones' }, () => cargarGastos())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, () => cargarIntegrantes())
        .subscribe()

      return () => { supabase.removeChannel(canal) }
    }
  }, [grupo?.id])

  async function obtenerTasaBCV() {
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial')
      const data = await res.json()
      if (data && data.promedio) {
        setTasaBcv(Number(data.promedio))
      }
    } catch (error) {
      console.error('Error al obtener tasa BCV:', error)
    }
  }

  function formatearBs(montoUsd) {
    if (!tasaBcv) return '---'
    const totalBs = Number(montoUsd) * tasaBcv
    return totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  async function cargarTodo() {
    await Promise.all([cargarGastos(), cargarCategorias(), cargarIntegrantes()])
  }

  async function cargarGastos() {
    const { data } = await supabase
      .from('transacciones')
      .select('*, perfiles(nombre), categorias(nombre, color, icono)')
      .eq('grupo_id', grupo.id)
      .order('fecha', { ascending: false })
    if (data) setGastos(data)
  }

  async function cargarCategorias() {
    const { data } = await supabase.from('categorias').select('*').eq('grupo_id', grupo.id)
    if (data) setCategorias(data)
  }

  async function cargarIntegrantes() {
    const { data } = await supabase.from('perfiles').select('*').eq('grupo_id', grupo.id)
    if (data) setIntegrantes(data)
  }

  async function manejarIngreso(e) {
    e.preventDefault()
    if (!nombreUsuario.trim()) return

    if (modoCrear) {
      const codigoGenerado = Math.random().toString(36).substring(2, 8).toUpperCase()
      const { data: nuevoGrupo } = await supabase
        .from('grupos')
        .insert([{ nombre: nombreGrupo, codigo_invitacion: codigoGenerado }])
        .select()
        .single()

      if (nuevoGrupo) {
        const cats = CATEGORIAS_DEFECTO.map(c => ({ ...c, grupo_id: nuevoGrupo.id }))
        await supabase.from('categorias').insert(cats)

        const { data: nuevoPerfil } = await supabase
          .from('perfiles')
          .insert([{ nombre: nombreUsuario, grupo_id: nuevoGrupo.id }])
          .select()
          .single()

        guardarSesion(nuevoPerfil, nuevoGrupo)
      }
    } else {
      const { data: grupoExistente } = await supabase
        .from('grupos')
        .select('*')
        .eq('codigo_invitacion', codigoGrupo.toUpperCase())
        .single()

      if (grupoExistente) {
        const { data: nuevoPerfil } = await supabase
          .from('perfiles')
          .insert([{ nombre: nombreUsuario, grupo_id: grupoExistente.id }])
          .select()
          .single()

        guardarSesion(nuevoPerfil, grupoExistente)
      } else {
        alert('Código de grupo no encontrado')
      }
    }
  }

  function guardarSesion(u, g) {
    setMiembro(u)
    setGrupo(g)
    localStorage.setItem('usuario_familia', JSON.stringify(u))
    localStorage.setItem('grupo_familia', JSON.stringify(g))
  }

  function cerrarSesion() {
    localStorage.clear()
    setMiembro(null)
    setGrupo(null)
    window.history.replaceState({}, document.title, window.location.pathname)
  }

  function manejarCambioUsd(val) {
    setMonto(val)
    if (val && tasaBcv) {
      setMontoBsInput((parseFloat(val) * tasaBcv).toFixed(2))
    } else {
      setMontoBsInput('')
    }
  }

  function manejarCambioBs(val) {
    setMontoBsInput(val)
    if (val && tasaBcv) {
      setMonto((parseFloat(val) / tasaBcv).toFixed(2))
    } else {
      setMonto('')
    }
  }

  async function guardarGasto(e) {
    e.preventDefault()
    if (!monto || !categoriaId) return

    await supabase.from('transacciones').insert([{
      monto: parseFloat(monto),
      descripcion,
      categoria_id: categoriaId,
      pagado_por: miembro.id,
      grupo_id: grupo.id,
      fecha: new Date().toISOString().split('T')[0]
    }])

    setMonto('')
    setMontoBsInput('')
    setDescripcion('')
    setModalGasto(false)
    cargarGastos()
  }

  async function eliminarIntegrante(idPerfil, nombrePerfil) {
    const confirmar = window.confirm(`¿Estás seguro de eliminar a "${nombrePerfil}" del grupo?`)
    if (!confirmar) return

    const { error } = await supabase
      .from('perfiles')
      .delete()
      .eq('id', idPerfil)

    if (error) {
      alert('Error al eliminar integrante: ' + error.message)
    } else {
      cargarIntegrantes()
    }
  }

  const gastosMesSeleccionado = gastos.filter(g => g.fecha && g.fecha.startsWith(mesSeleccionado))
  const totalGeneral = gastosMesSeleccionado.reduce((sum, g) => sum + Number(g.monto), 0)

  // Cálculo del gasto individual por cada integrante
  const gastosPorIntegrante = integrantes.map(int => {
    const transaccionesInt = gastosMesSeleccionado.filter(g => g.pagado_por === int.id)
    const gastado = transaccionesInt.reduce((sum, g) => sum + Number(g.monto), 0)
    const porcentaje = totalGeneral > 0 ? (gastado / totalGeneral) * 100 : 0
    return { ...int, gastado, cantidad: transaccionesInt.length, porcentaje }
  })

  function obtenerUltimosTresMeses() {
    const meses = []
    const fechaBase = new Date()
    for (let i = 0; i < 3; i++) {
      const anio = fechaBase.getFullYear()
      const mes = String(fechaBase.getMonth() + 1).padStart(2, '0')
      meses.push(`${anio}-${mes}`)
      fechaBase.setMonth(fechaBase.getMonth() - 1)
    }
    return meses
  }

  const ultimos3Meses = obtenerUltimosTresMeses()
  const enlaceInvitacion = `${window.location.origin}?codigo=${grupo?.codigo_invitacion || ''}`

  if (!grupo || !miembro) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-800 flex items-center justify-center p-4">
        <div className="bg-white p-7 rounded-3xl w-full max-w-md border border-slate-200/80 shadow-sm">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">Gastos Familiares ☁️</h1>
            <p className="text-slate-400 text-xs mt-1">Sincronización en la nube en tiempo real</p>
          </div>

          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6">
            <button 
              onClick={() => setModoCrear(true)} 
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${modoCrear ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>
              Crear Grupo
            </button>
            <button 
              onClick={() => setModoCrear(false)} 
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${!modoCrear ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>
              Unirme a Grupo
            </button>
          </div>

          <form onSubmit={manejarIngreso} className="space-y-4">
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1">Tu Nombre</label>
              <input 
                required 
                value={nombreUsuario} 
                onChange={e => setNombreUsuario(e.target.value)}
                placeholder="Ej: Papá, Mamá, Carlos..." 
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-300 transition"
              />
            </div>

            {modoCrear ? (
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Nombre del Grupo Familiar</label>
                <input 
                  required 
                  value={nombreGrupo} 
                  onChange={e => setNombreGrupo(e.target.value)}
                  placeholder="Ej: Familia Pérez" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-300 transition"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Código de Invitación</label>
                <input 
                  required 
                  value={codigoGrupo} 
                  onChange={e => setCodigoGrupo(e.target.value)}
                  placeholder="Ej: X7K2P9" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 font-mono tracking-widest text-center uppercase focus:outline-none focus:bg-white focus:border-indigo-300 transition"
                />
              </div>
            )}

            <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-3.5 rounded-2xl shadow-sm transition">
              {modoCrear ? 'Crear Grupo Familiar' : 'Ingresar al Grupo'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-24 max-w-md mx-auto relative border-x border-slate-200/60 shadow-sm">
      {/* Header */}
      <header className="p-4 bg-white/90 backdrop-blur border-b border-slate-200/60 sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h2 className="font-bold text-base text-slate-800">{grupo.nombre}</h2>
          <button 
            onClick={() => {
              navigator.clipboard.writeText(enlaceInvitacion)
              alert('¡Enlace de invitación copiado al portapapeles!')
            }}
            className="text-[11px] text-indigo-600 font-mono hover:underline block text-left">
            Copiar Enlace Mágico 🔗
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="bg-emerald-50 border border-emerald-200/70 px-3 py-1.5 rounded-xl text-right">
            <span className="text-[9px] font-bold text-emerald-600 uppercase block leading-none">Tasa BCV</span>
            <span className="text-xs font-extrabold text-emerald-800">
              {tasaBcv ? `Bs. ${tasaBcv.toFixed(2)}` : 'Cargando...'}
            </span>
          </div>
          <button onClick={cerrarSesion} className="p-2 text-slate-400 hover:text-rose-500 transition" title="Salir">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Selector de Mes Global */}
      <div className="bg-white px-4 py-2.5 border-b border-slate-200/60 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
          <Calendar size={14} /> Mes activo:
        </span>
        <input 
          type="month" 
          value={mesSeleccionado} 
          onChange={e => setMesSeleccionado(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-300"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200/60 bg-white">
        <button onClick={() => setTab('resumen')} className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition ${tab === 'resumen' ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400'}`}>
          <PieChartIcon size={16} /> Categorías
        </button>
        <button onClick={() => setTab('integrantes')} className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition ${tab === 'integrantes' ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400'}`}>
          <Users size={16} /> Integrantes
        </button>
        <button onClick={() => setTab('historial')} className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition ${tab === 'historial' ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400'}`}>
          <DollarSign size={16} /> Historial
        </button>
      </div>

      {/* Cuerpo */}
      <div className="p-4 space-y-4">
        {/* Total General Card */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/70 shadow-sm">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Gasto Total Familiar ({mesSeleccionado})</p>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-3xl font-extrabold text-slate-800">${totalGeneral.toFixed(2)}</h3>
            <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg">
              Bs. {formatearBs(totalGeneral)}
            </span>
          </div>
          
          {/* Etiquetas rápidas de miembros conectados */}
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
            {integrantes.map(int => (
              <span 
                key={int.id} 
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${
                  int.id === miembro.id 
                    ? 'bg-slate-800 text-white' 
                    : 'bg-slate-100 text-slate-600'
                }`}>
                {int.nombre} {int.id === miembro.id && '(Tú)'}
              </span>
            ))}
          </div>
        </div>

        {tab === 'resumen' && (
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-bold text-slate-400 tracking-wider uppercase px-1">Distribución por Categoría</h4>
            {categorias.map(cat => {
              const totalCat = gastosMesSeleccionado
                .filter(g => g.categoria_id === cat.id)
                .reduce((s, g) => s + Number(g.monto), 0)
              const pct = totalGeneral > 0 ? (totalCat / totalGeneral) * 100 : 0
              const IconComponent = ICON_MAP[cat.icono] || ShoppingCart

              return (
                <div key={cat.id} className="bg-white p-3.5 rounded-2xl border border-slate-200/60 shadow-sm space-y-2.5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl flex items-center justify-center text-slate-700" style={{ backgroundColor: cat.color }}>
                        <IconComponent size={18} />
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-slate-700 block">{cat.nombre}</span>
                        <span className="text-[11px] text-slate-400 font-medium">{pct.toFixed(1)}% del total</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-800 block">${totalCat.toFixed(2)}</span>
                      <span className="text-[11px] text-emerald-600 font-semibold block">Bs. {formatearBs(totalCat)}</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="h-full transition-all duration-500 rounded-full" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'integrantes' && (
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-bold text-slate-400 tracking-wider uppercase px-1">Gasto Total por Familiar ({mesSeleccionado})</h4>
            {gastosPorIntegrante.map(int => (
              <div key={int.id} className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm space-y-2.5">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-slate-800">{int.nombre}</p>
                      <button 
                        onClick={() => eliminarIntegrante(int.id, int.nombre)}
                        className="text-slate-300 hover:text-rose-500 transition p-1"
                        title="Eliminar integrante">
                        ✕
                      </button>
                    </div>
                    <p className="text-xs text-slate-400">{int.cantidad} registro(s) • {int.porcentaje.toFixed(1)}% del total</p>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-800 text-base font-extrabold block">${int.gastado.toFixed(2)}</span>
                    <span className="text-[11px] text-emerald-600 font-semibold block">Bs. {formatearBs(int.gastado)}</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-800 transition-all duration-500 rounded-full" style={{ width: `${int.porcentaje}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'historial' && (
          <div className="space-y-4">
            {/* Resumen de los últimos 3 meses */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm space-y-3">
              <h4 className="text-[11px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                <TrendingUp size={14} /> Resumen de los Últimos 3 Meses
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                {ultimos3Meses.map(m => {
                  const totalMes = gastos
                    .filter(g => g.fecha && g.fecha.startsWith(m))
                    .reduce((s, g) => s + Number(g.monto), 0)
                  return (
                    <div key={m} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">{m}</span>
                      <span className="text-xs font-bold text-slate-800 mt-0.5 block">${totalMes.toFixed(2)}</span>
                      <span className="text-[9px] text-emerald-600 font-medium block">Bs. {formatearBs(totalMes)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2.5">
              <h4 className="text-[11px] font-bold text-slate-400 tracking-wider uppercase px-1">
                Transacciones de {mesSeleccionado}
              </h4>
              {gastosMesSeleccionado.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6 bg-white rounded-2xl border border-slate-200/60">No hay gastos registrados en este mes.</p>
              ) : (
                gastosMesSeleccionado.map(g => (
                  <div key={g.id} className="bg-white p-3.5 rounded-2xl border border-slate-200/60 shadow-sm flex justify-between items-center">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-slate-800">{g.descripcion || g.categorias?.nombre || 'Gasto'}</p>
                      <p className="text-[11px] text-slate-400">{g.perfiles?.nombre} • {g.fecha}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-sm text-slate-800 block">${Number(g.monto).toFixed(2)}</span>
                      <span className="text-[11px] text-emerald-600 font-medium block">Bs. {formatearBs(g.monto)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Botón Flotante */}
      <button 
        onClick={() => setModalGasto(true)} 
        className="sticky bottom-6 left-[calc(100%-4rem)] bg-slate-800 hover:bg-slate-900 text-white p-4 rounded-full shadow-lg transition-transform active:scale-95 flex items-center justify-center z-20 ml-auto">
        <Plus size={24} />
      </button>

      {/* Modal */}
      {modalGasto && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-30 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white border border-slate-200/80 w-full max-w-md rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base text-slate-800">Reportar Gasto</h3>
              <button onClick={() => setModalGasto(false)} className="text-slate-400 text-xs hover:text-slate-600">Cancelar</button>
            </div>

            <form onSubmit={guardarGasto} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Monto en Dólares ($)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    required 
                    autoFocus
                    value={monto} 
                    onChange={e => manejarCambioUsd(e.target.value)}
                    placeholder="0.00" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-3 text-lg font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-300 transition"
                  />
                </div>
                <div>
                  <label className="text-xs text-emerald-600 font-medium block mb-1">Monto en Bolívares (Bs.)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={montoBsInput} 
                    onChange={e => manejarCambioBs(e.target.value)}
                    placeholder="0.00" 
                    disabled={!tasaBcv}
                    className="w-full bg-emerald-50/50 border border-emerald-200/80 rounded-2xl px-3.5 py-3 text-lg font-bold text-emerald-800 focus:outline-none focus:bg-white focus:border-emerald-400 transition"
                  />
                </div>
              </div>

              {tasaBcv && (
                <p className="text-[11px] text-slate-400 text-center bg-slate-50 py-1.5 rounded-xl">
                  Conversión automática a tasa BCV: <strong className="text-slate-600">Bs. {tasaBcv.toFixed(2)}</strong>
                </p>
              )}

              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Categoría</label>
                <select 
                  required 
                  value={categoriaId} 
                  onChange={e => setCategoriaId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-300 transition">
                  <option value="">Selecciona una categoría...</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Observación (Opcional)</label>
                <input 
                  value={descripcion} 
                  onChange={e => setDescripcion(e.target.value)}
                  placeholder="Ej: Compra de frutas o pago de cantina" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-300 transition"
                />
              </div>

              <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-3.5 rounded-2xl shadow-sm transition">
                Guardar Gasto
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}