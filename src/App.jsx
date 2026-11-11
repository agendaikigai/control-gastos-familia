import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { CATEGORIAS_DEFECTO } from './seedData'
import { 
  Plus, Users, DollarSign, PieChart as PieChartIcon, 
  ArrowRightLeft, LogOut, Car, ShoppingCart, 
  GraduationCap, Utensils, BookOpen, Pizza, Home, HeartPulse, Calendar, TrendingUp 
} from 'lucide-react'

const ICON_MAP = {
  ShoppingCart, GraduationCap, Utensils, BookOpen, 
  Pizza, Car, Home, HeartPulse
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

  // Mes seleccionado para filtrar (Formato YYYY-MM). Por defecto el mes actual.
  const mesActualStr = new Date().toISOString().slice(0, 7)
  const [mesSeleccionado, setMesSeleccionado] = useState(mesActualStr)

  const [modalGasto, setModalGasto] = useState(false)
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoriaId, setCategoriaId] = useState('')

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
    setDescripcion('')
    setModalGasto(false)
    cargarGastos()
  }

  // Filtrar gastos del mes seleccionado actualmente en la vista principal
  const gastosMesSeleccionado = gastos.filter(g => g.fecha && g.fecha.startsWith(mesSeleccionado))

  const totalGeneral = gastosMesSeleccionado.reduce((sum, g) => sum + Number(g.monto), 0)
  const cuotaPorPersona = integrantes.length ? totalGeneral / integrantes.length : 0

  const balances = integrantes.map(int => {
    const pagado = gastosMesSeleccionado
      .filter(g => g.pagado_por === int.id)
      .reduce((sum, g) => sum + Number(g.monto), 0)
    return { ...int, pagado, balance: pagado - cuotaPorPersona }
  })

  // Obtener los últimos 3 meses para el resumen comparativo
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

  // Pantalla de Ingreso / Login
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
                placeholder="Ej: Papa, Mama, Carlos..." 
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

  // Interfaz Principal
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-24 max-w-md mx-auto relative border-x border-slate-200/60 shadow-sm">
      {/* Header */}
      <header className="p-4 bg-white/90 backdrop-blur border-b border-slate-200/60 sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h2 className="font-bold text-base text-slate-800">{grupo.nombre}</h2>
          <p className="text-xs text-indigo-500 font-mono">Código: {grupo.codigo_invitacion}</p>
        </div>
        <button onClick={cerrarSesion} className="p-2 text-slate-400 hover:text-rose-500 transition">
          <LogOut size={18} />
        </button>
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
        <button onClick={() => setTab('deudas')} className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition ${tab === 'deudas' ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400'}`}>
          <ArrowRightLeft size={16} /> Saldos
        </button>
        <button onClick={() => setTab('historial')} className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition ${tab === 'historial' ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400'}`}>
          <DollarSign size={16} /> Historial
        </button>
      </div>

      {/* Cuerpo */}
      <div className="p-4 space-y-4">
        {/* Total General Card */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/70 shadow-sm">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Gasto Total ({mesSeleccionado})</p>
          <h3 className="text-3xl font-extrabold mt-1 text-slate-800">${totalGeneral.toFixed(2)}</h3>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <Users size={14} className="text-slate-400" /> {integrantes.length} miembro(s) • Cuota limpia: ${cuotaPorPersona.toFixed(2)} c/u
          </p>
        </div>

        {tab === 'resumen' && (
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-bold text-slate-400 tracking-wider uppercase px-1">Distribución del Mes</h4>
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
                      <span className="text-sm font-semibold text-slate-700">{cat.nombre}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-800 block">${totalCat.toFixed(2)}</span>
                      <span className="text-[11px] text-slate-400 font-medium">{pct.toFixed(1)}%</span>
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

        {tab === 'deudas' && (
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-bold text-slate-400 tracking-wider uppercase px-1">Saldos del Mes en Curso</h4>
            {balances.map(b => (
              <div key={b.id} className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm flex justify-between items-center">
                <div>
                  <p className="font-semibold text-sm text-slate-800">{b.nombre}</p>
                  <p className="text-xs text-slate-400">Aportó: ${b.pagado.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  {b.balance >= 0 ? (
                    <span className="text-emerald-600 text-sm font-bold block">+${b.balance.toFixed(2)} <span className="text-[10px] block font-normal text-slate-400">A favor</span></span>
                  ) : (
                    <span className="text-rose-500 text-sm font-bold block">-${Math.abs(b.balance).toFixed(2)} <span className="text-[10px] block font-normal text-slate-400">Debe</span></span>
                  )}
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
                    <span className="font-bold text-sm text-slate-800">${Number(g.monto).toFixed(2)}</span>
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
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Monto ($)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  required 
                  autoFocus
                  value={monto} 
                  onChange={e => setMonto(e.target.value)}
                  placeholder="0.00" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xl font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-300 transition"
                />
              </div>

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