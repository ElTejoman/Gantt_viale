// Fechas como "número de día" UTC (días desde 1970-01-01): aritmética simple y sin husos horarios.

export const DIA_MS = 86400000;
export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export const ESTADOS = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  bloqueada: 'Bloqueada',
  terminada: 'Terminada',
};

export const TIPOS = {
  tarea: 'Tarea con plazo',
  continua: 'Continua',
  recurrente: 'Mensual · fin de mes',
};

export const aDia = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DIA_MS);
};
export const deDia = (n) => new Date(n * DIA_MS);
export const hoy = () => {
  const t = new Date();
  return Math.round(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) / DIA_MS);
};
export const diaSemana = (n) => (((n + 4) % 7) + 7) % 7; // 0 = domingo
export const inicioMes = (n) => {
  const d = deDia(n);
  return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DIA_MS);
};
export const sumarMeses = (n, k) => {
  const d = deDia(n);
  return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1) / DIA_MS);
};
export const inicioAnio = (n) => Math.round(Date.UTC(deDia(n).getUTCFullYear(), 0, 1) / DIA_MS);

export function fmt(n, conAnio = false) {
  const d = deDia(n);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}${conAnio ? ' ' + d.getUTCFullYear() : ''}`;
}

export function fmtRango(a, b) {
  const da = deDia(a), db = deDia(b);
  const mismoAnio = da.getUTCFullYear() === db.getUTCFullYear();
  return `${fmt(a, !mismoAnio)} – ${fmt(b, true)}`;
}

export function diasHabiles(a, b) {
  let c = 0;
  for (let d = a; d <= b; d++) {
    const w = diaSemana(d);
    if (w !== 0 && w !== 6) c++;
  }
  return c;
}

function finesDeMes(a, b) {
  const out = [];
  for (let m = inicioMes(a); ; m = sumarMeses(m, 1)) {
    const ultimo = sumarMeses(m, 1) - 1;
    if (ultimo > b) break;
    if (ultimo >= a) out.push(ultimo);
  }
  return out;
}

// Diferencia entre el fin real y el fin de la línea base (plan original), en días calendario.
export function textoDesvio(t) {
  if (!t.plan) return '';
  const d = Math.abs(t.desvio);
  const dias = `${d} ${d === 1 ? 'día' : 'días'}`;
  if (t.desvio === 0) return 'Según lo planificado';
  if (t.estado === 'terminada') return `Terminó ${dias} ${t.desvio < 0 ? 'antes' : 'después'} de lo planificado`;
  return `Fin ${t.desvio < 0 ? 'adelantado' : 'corrido'} ${dias} respecto al plan`;
}

export const normalizarTexto = (s) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function avanceDe(t, estado) {
  if (typeof t.avance === 'number') return t.avance;
  if (t.checklist?.length) return Math.round((100 * t.checklist.filter((c) => c.hecho).length) / t.checklist.length);
  if (t.conteo?.total) return Math.round((100 * t.conteo.hecho) / t.conteo.total);
  return estado === 'terminada' ? 100 : 0;
}

function promedioPonderado(tareas) {
  const conPlazo = tareas.filter((t) => t.tipo === 'tarea');
  if (!conPlazo.length) return null;
  let peso = 0, suma = 0;
  for (const t of conPlazo) {
    const w = Math.max(1, t.habiles);
    peso += w;
    suma += w * t.avance;
  }
  return Math.round(suma / peso);
}

// Actividad leída de los logs de los proyectos (commits y bitácoras): total y últimos 3.
function actividadDe(a) {
  if (!a?.total) return null;
  return { ...a, ultimos: (a.ultimos || []).map((u) => ({ ...u, dia: aDia(u.fecha) })) };
}

export function normalizar(raw, diaHoy) {
  const porId = new Map();
  const todas = [];
  const proyectos = raw.proyectos.map((p) => {
    const tareas = p.tareas.map((t) => {
      const estado = t.estado || 'pendiente';
      const tipo = t.tipo || 'tarea';
      const inicio = aDia(t.inicio);
      const fin = aDia(t.fin);
      const avance = avanceDe(t, estado);
      const conPlazo = tipo === 'tarea';
      const atrasada = conPlazo && estado !== 'terminada' && fin < diaHoy;
      const plan = t.plan ? { inicio: aDia(t.plan.inicio), fin: aDia(t.plan.fin) } : null;
      const tarea = {
        ...t,
        plan,
        desvio: plan ? fin - plan.fin : 0,
        estado,
        tipo,
        inicio,
        fin,
        avance,
        habiles: diasHabiles(inicio, fin),
        atrasada,
        diasAtraso: atrasada ? diaHoy - fin : 0,
        proxima: conPlazo && estado !== 'terminada' && fin >= diaHoy && fin <= diaHoy + 7,
        marcas: tipo === 'recurrente' ? finesDeMes(inicio, fin) : [],
        actualizaciones: [...(t.actualizaciones || [])]
          .map((a) => ({ ...a, dia: aDia(a.fecha) }))
          .sort((x, y) => y.dia - x.dia),
        proyectoId: p.id,
        proyectoNombre: p.nombre,
        actividad: actividadDe(raw.actividad?.tareas?.[t.id]),
      };
      porId.set(t.id, tarea);
      todas.push(tarea);
      return tarea;
    });
    return {
      id: p.id,
      nombre: p.nombre,
      colapsado: !!p.colapsado,
      actividad: raw.actividad?.proyectos?.[p.id] || null,
      tareas,
      inicio: Math.min(...tareas.map((t) => t.inicio)),
      fin: Math.max(...tareas.map((t) => t.fin)),
      avance: promedioPonderado(tareas),
    };
  });

  for (const t of todas) t.dependeDe = (t.depende || []).map((id) => porId.get(id)).filter(Boolean);

  return {
    titulo: raw.titulo || 'Seguimiento de tareas',
    actualizado: raw.actualizado ? aDia(raw.actualizado) : diaHoy,
    hoy: diaHoy,
    proyectos,
    tareas: todas,
    porId,
    min: Math.min(...proyectos.map((p) => p.inicio)),
    max: Math.max(...proyectos.map((p) => p.fin)),
    actividadHasta: raw.actividad?.hasta ? aDia(raw.actividad.hasta) : null,
    avanceGlobal: promedioPonderado(todas),
    conPlazo: todas.filter((t) => t.tipo === 'tarea').length,
  };
}

export const FILTROS = {
  todas: { etiqueta: 'Todas', prueba: () => true },
  en_curso: { etiqueta: 'En curso', icono: 'en_curso', prueba: (t) => t.estado === 'en_curso' },
  pendiente: { etiqueta: 'Pendientes', icono: 'pendiente', prueba: (t) => t.estado === 'pendiente' },
  bloqueada: { etiqueta: 'Bloqueadas', icono: 'bloqueada', prueba: (t) => t.estado === 'bloqueada' },
  atrasada: { etiqueta: 'Atrasadas', icono: 'atrasada', prueba: (t) => t.atrasada },
  proxima: { etiqueta: 'Vencen en 7 días', icono: 'reloj', prueba: (t) => t.proxima },
  terminada: { etiqueta: 'Terminadas', icono: 'terminada', prueba: (t) => t.estado === 'terminada' },
};

export function contar(tareas) {
  const out = {};
  for (const [k, f] of Object.entries(FILTROS)) out[k] = tareas.filter(f.prueba).length;
  return out;
}

export function construirFilas(proyectos, { filtro, consulta, colapsados }) {
  const q = normalizarTexto(consulta.trim());
  const prueba = FILTROS[filtro].prueba;
  const filas = [];
  for (const p of proyectos) {
    const visibles = p.tareas.filter(
      (t) => prueba(t) && (!q || normalizarTexto(`${t.nombre} ${t.detalle || ''} ${p.nombre} ${t.id}`).includes(q)),
    );
    if (!visibles.length) continue;
    const colapsado = colapsados.has(p.id);
    filas.push({ tipo: 'grupo', proyecto: p, visibles: visibles.length, colapsado });
    if (!colapsado) for (const t of visibles) filas.push({ tipo: 'tarea', tarea: t, proyecto: p });
  }
  return filas;
}
