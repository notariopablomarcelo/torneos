import {
	collectionGroup,
	db,
	deleteDoc,
	doc,
	getDocs,
	onSnapshot,
	query,
	updateDoc,
	where,
	writeBatch
} from '$lib/db';
import {
	categoriasCol,
	inscripcionesCol,
	partidoDoc,
	partidosCol,
	torneoCanchaDoc,
	torneoCanchasCol,
	zonasCol
} from './firestore';
import type {
	RangoHorario,
	TorneoCancha,
	TorneoCanchaInput
} from '$lib/types/programacion';
import { RANGO_DEFAULT } from '$lib/types/programacion';
import type { Cancha } from '$lib/types/sede';
import type { Partido, ProgramacionPartido, Zona } from '$lib/types/armado';
import type { Inscripcion } from '$lib/types/inscripcion';
import { rangoFechasInclusivo } from '$lib/dates';

// =============================================================================
// Canchas globales (collectionGroup)
// =============================================================================

// Trae TODAS las canchas de TODAS las sedes en una sola query. Util para el
// selector cuando agregamos canchas al torneo: no tenemos que hacer un
// listado de sedes + N requests para sus canchas.
//
// Filtramos por path: `collectionGroup('canchas')` matchea cualquier
// subcoleccion llamada 'canchas' — eso incluye torneos/{tid}/canchas/
// (TorneoCancha, sin campo `nombre`). Nos quedamos solo con las que viven
// bajo `sedes/`.
export function suscribirTodasLasCanchas(
	callback: (canchas: Cancha[]) => void
): () => void {
	const q = query(collectionGroup(db(), 'canchas'));
	return onSnapshot(q, (snap) => {
		callback(
			snap.docs
				// Solo Canchas reales (viven bajo `sedes/`). Excluye
				// TorneoCancha que vive bajo `torneos/`. Funciona en
				// firebase (ref.path = "sedes/abc/canchas/xyz") y en local
				// (la misma convencion de path completo).
				.filter((d) => d.ref.path.startsWith('sedes/'))
				.map((d) => ({
					id: d.id,
					...(d.data() as Omit<Cancha, 'id'>)
				}))
		);
	});
}

// =============================================================================
// TorneoCancha
// =============================================================================

export function suscribirCanchasDelTorneo(
	torneoId: string,
	callback: (canchas: TorneoCancha[]) => void
): () => void {
	const q = query(torneoCanchasCol(torneoId));
	return onSnapshot(q, (snap) => {
		callback(
			snap.docs.map((d) => ({
				id: d.id,
				...d.data()
			}))
		);
	});
}

// Aplica cambios al set de canchas asociadas al torneo. Recibe la lista de
// canchaIds que el torneo deberia tener; agrega las que faltan y borra las
// sobrantes. Atomico en un solo writeBatch.
//
// Disponibilidad por default: el rango RANGO_DEFAULT aplicado a cada dia
// del torneo. El admin ajusta despues por cancha / por dia.
export async function aplicarSeleccionCanchas(
	torneoId: string,
	fechaInicio: string,
	fechaFin: string,
	existentes: TorneoCancha[],
	deseadas: { canchaId: string; sedeId: string }[]
): Promise<void> {
	const setExistentes = new Map(existentes.map((tc) => [tc.canchaId, tc]));
	const setDeseadas = new Set(deseadas.map((d) => d.canchaId));

	const batch = writeBatch(db());
	const now = new Date().toISOString();
	const fechas = rangoFechasInclusivo(fechaInicio, fechaFin);
	const disponibilidadDefault: RangoHorario[] = fechas.map((f) => ({
		fecha: f,
		desde: RANGO_DEFAULT.desde,
		hasta: RANGO_DEFAULT.hasta
	}));

	// Agregar las nuevas.
	for (const d of deseadas) {
		if (setExistentes.has(d.canchaId)) continue;
		const ref = doc(torneoCanchasCol(torneoId));
		const payload: Omit<TorneoCancha, 'id'> = {
			torneoId,
			canchaId: d.canchaId,
			sedeId: d.sedeId,
			disponibilidad: disponibilidadDefault,
			creadoEn: now
		};
		batch.set(ref, payload);
	}

	// Borrar las que ya no estan.
	for (const tc of existentes) {
		if (setDeseadas.has(tc.canchaId)) continue;
		batch.delete(torneoCanchaDoc(torneoId, tc.id));
	}

	await batch.commit();
}

export async function actualizarDisponibilidad(
	torneoId: string,
	id: string,
	disponibilidad: RangoHorario[]
): Promise<void> {
	await updateDoc(torneoCanchaDoc(torneoId, id), { disponibilidad });
}

export async function quitarCanchaDelTorneo(
	torneoId: string,
	id: string
): Promise<void> {
	await deleteDoc(torneoCanchaDoc(torneoId, id));
}

// Util: cuenta canchas del torneo de forma one-shot (para mostrar en el
// resumen sin suscribirse). Si el caller ya tiene suscripcion no la necesita.
export async function contarCanchasDelTorneo(
	torneoId: string
): Promise<number> {
	const snap = await getDocs(torneoCanchasCol(torneoId));
	return snap.size;
}

// =============================================================================
// Capacidad
// =============================================================================

// Suma de minutos disponibles en un rango HH:mm – HH:mm. '00:00' como `hasta`
// se trata como medianoche (24:00 = 1440 min).
function minutosDeRango(desde: string, hasta: string): number {
	const [hD, mD] = desde.split(':').map(Number);
	const min1 = (hD ?? 0) * 60 + (mD ?? 0);
	const min2 =
		hasta === '00:00'
			? 24 * 60
			: (Number(hasta.split(':')[0]) ?? 0) * 60 +
				(Number(hasta.split(':')[1]) ?? 0);
	return Math.max(0, min2 - min1);
}

// Capacidad total del torneo: suma de minutos disponibles en TODAS las canchas
// (todos los rangos de todas las fechas). Devuelve minutos totales + partidos
// estimados (a `duracionPartidoMin` cada uno).
export function calcularCapacidad(
	canchas: { disponibilidad: { desde: string; hasta: string }[] }[],
	duracionPartidoMin = 90
): { totalMinutos: number; horas: number; partidos: number } {
	let totalMinutos = 0;
	for (const cancha of canchas) {
		for (const rango of cancha.disponibilidad) {
			totalMinutos += minutosDeRango(rango.desde, rango.hasta);
		}
	}
	return {
		totalMinutos,
		horas: totalMinutos / 60,
		partidos: Math.floor(totalMinutos / duracionPartidoMin)
	};
}

// Cuenta partidos para una categoria DADA una estructura concreta (tamano +
// modalidad + clasifican). Es el calculo "puntual" cuando la categoria ya
// definio su estructura.
export function partidosCategoriaPuntual(
	cupos: number,
	tamano: 3 | 4,
	modalidad: 'todosContraTodos' | 'dobleOportunidad',
	clasifican: 1 | 2 | 3
): number {
	if (cupos < 3) return 0;
	const zonas = Math.ceil(cupos / tamano);
	// Partidos por zona segun tamano y modalidad.
	// - Zona de 3 RR: 3 partidos (C(3,2)).
	// - Zona de 4 RR: 6 partidos (C(4,2)).
	// - Zona de 4 DO: 4 partidos.
	let partidosPorZona: number;
	if (tamano === 3) partidosPorZona = 3;
	else if (modalidad === 'todosContraTodos') partidosPorZona = 6;
	else partidosPorZona = 4;
	const partidosZonas = zonas * partidosPorZona;
	const clasificados = Math.min(zonas * clasifican, cupos);
	const bracket = Math.max(0, clasificados - 1);
	return partidosZonas + bracket;
}

// Estimacion de partidos para una categoria a partir de sus cupos. Devuelve
// un RANGO {min, max} porque la cantidad depende de la estructura que se
// elija al armar.
//
// Si la categoria tiene estructura preferida definida (tamano, modalidad,
// clasifican), el rango se ESTRECHA a ese valor (min == max). Si solo se
// define alguno de los tres, el rango se reduce parcialmente.
//
// Cuando no hay nada definido:
// - MEJOR CASO: zonas de 4 con DO + clasifica 1.
// - PEOR CASO: zonas de 3 con RR + clasifican 2.
//
// Si los cupos son null o < 3, devuelve {0, 0}.
export function estimarRangoPartidosCategoria(c: {
	cupos: number | null;
	tamanoPreferido?: 3 | 4 | null;
	modalidadZona4?: 'todosContraTodos' | 'dobleOportunidad' | null;
	clasificanPorZona?: 1 | 2 | 3 | null;
	estructuraPersonalizada?:
		| {
				cantidad: number;
				tamano: 3 | 4;
				modalidad?: 'todosContraTodos' | 'dobleOportunidad' | null;
				clasifican: 1 | 2 | 3;
		  }[]
		| null;
}): { min: number; max: number } {
	if (c.cupos === null || c.cupos < 3) return { min: 0, max: 0 };
	const N = c.cupos;

	// Si hay estructura personalizada, suma de partidos por grupo. Valor
	// puntual (min === max) — la config ya esta totalmente definida.
	if (c.estructuraPersonalizada && c.estructuraPersonalizada.length > 0) {
		let partidosZonas = 0;
		let clasificados = 0;
		for (const g of c.estructuraPersonalizada) {
			const modalidad =
				g.tamano === 4
					? (g.modalidad ?? 'todosContraTodos')
					: 'todosContraTodos';
			const porZona =
				g.tamano === 3
					? 3
					: modalidad === 'todosContraTodos'
						? 6
						: 4;
			partidosZonas += g.cantidad * porZona;
			clasificados += g.cantidad * g.clasifican;
		}
		const v = partidosZonas + Math.max(0, clasificados - 1);
		return { min: v, max: v };
	}

	// Si hay estructura COMPLETA, el rango es puntual.
	if (c.tamanoPreferido && c.clasificanPorZona) {
		const modalidad =
			c.tamanoPreferido === 4
				? (c.modalidadZona4 ?? 'todosContraTodos') // default conservador
				: 'todosContraTodos';
		const v = partidosCategoriaPuntual(
			N,
			c.tamanoPreferido,
			modalidad,
			c.clasificanPorZona
		);
		return { min: v, max: v };
	}

	// Si hay estructura parcial, restringimos solo lo que corresponde.
	const tamanosPosibles: (3 | 4)[] = c.tamanoPreferido
		? [c.tamanoPreferido]
		: [3, 4];
	const clasifPosibles: (1 | 2 | 3)[] = c.clasificanPorZona
		? [c.clasificanPorZona]
		: [1, 2, 3];

	let min = Infinity;
	let max = -Infinity;
	for (const tamano of tamanosPosibles) {
		const modalidades: ('todosContraTodos' | 'dobleOportunidad')[] =
			tamano === 4
				? c.modalidadZona4
					? [c.modalidadZona4]
					: ['todosContraTodos', 'dobleOportunidad']
				: ['todosContraTodos'];
		for (const modalidad of modalidades) {
			for (const clasif of clasifPosibles) {
				// Clasifican = 3 solo aplica si tamano = 4.
				if (clasif === 3 && tamano === 3) continue;
				const v = partidosCategoriaPuntual(N, tamano, modalidad, clasif);
				if (v < min) min = v;
				if (v > max) max = v;
			}
		}
	}
	if (!Number.isFinite(min)) min = 0;
	if (!Number.isFinite(max)) max = 0;
	return { min, max };
}

// Demanda total estimada del torneo (rango). Suma de las estimaciones por
// categoria. Muy util para contrastar con la capacidad calculada
// (`calcularCapacidad`): si la capacidad supera el `max` siempre alcanza;
// si esta entre `min` y `max` depende de la estructura final.
export function estimarRangoDemandaTorneo(
	categorias: {
		cupos: number | null;
		tamanoPreferido?: 3 | 4 | null;
		modalidadZona4?: 'todosContraTodos' | 'dobleOportunidad' | null;
		clasificanPorZona?: 1 | 2 | 3 | null;
		estructuraPersonalizada?:
			| {
					cantidad: number;
					tamano: 3 | 4;
					modalidad?: 'todosContraTodos' | 'dobleOportunidad' | null;
					clasifican: 1 | 2 | 3;
			  }[]
			| null;
	}[]
): { min: number; max: number } {
	return categorias.reduce(
		(acc, c) => {
			const r = estimarRangoPartidosCategoria(c);
			return { min: acc.min + r.min, max: acc.max + r.max };
		},
		{ min: 0, max: 0 }
	);
}

// =============================================================================
// Programacion de partidos (fecha/hora/cancha)
// =============================================================================

export async function actualizarProgramacionPartido(
	torneoId: string,
	categoriaId: string,
	partidoId: string,
	programacion: ProgramacionPartido
): Promise<void> {
	await updateDoc(partidoDoc(torneoId, categoriaId, partidoId), { programacion });
}

export async function quitarProgramacionPartido(
	torneoId: string,
	categoriaId: string,
	partidoId: string
): Promise<void> {
	await updateDoc(partidoDoc(torneoId, categoriaId, partidoId), {
		programacion: null
	});
}

// Aplica un batch de asignaciones sugeridas + limpieza opcional. El caller
// pasa la lista con suficiente info para reconstruir el path (categoriaId
// por partido). En un solo writeBatch atomico. Firestore acepta hasta 500
// ops por batch; en torneos normales (~50 partidos) sobramos.
//
// `aLimpiar`: ids de partidos a los que hay que ponerles programacion=null
// (caso de "reasignar todo" cuando un partido que tenia slot ya no tiene
// uno disponible bajo la nueva distribucion).
export async function aplicarAsignacionesSugeridas(
	torneoId: string,
	asignaciones: {
		partidoId: string;
		categoriaId: string;
		programacion: ProgramacionPartido;
	}[],
	aLimpiar: { partidoId: string; categoriaId: string }[] = []
): Promise<void> {
	if (asignaciones.length === 0 && aLimpiar.length === 0) return;
	const batch = writeBatch(db());
	for (const a of asignaciones) {
		batch.update(partidoDoc(torneoId, a.categoriaId, a.partidoId), {
			programacion: a.programacion
		});
	}
	for (const l of aLimpiar) {
		batch.update(partidoDoc(torneoId, l.categoriaId, l.partidoId), {
			programacion: null
		});
	}
	await batch.commit();
}

// Suscribe a TODAS las inscripciones del torneo (cross-categoria) componiendo
// suscripciones por categoria. Patron identico a suscribirPartidosDelTorneo /
// suscribirZonasDelTorneo. La pantalla de programacion lo necesita para
// resolver los nombres de las parejas en cada partido programado.
export function suscribirInscripcionesDelTorneo(
	torneoId: string,
	callback: (inscripciones: Inscripcion[]) => void
): () => void {
	const porCategoria = new Map<string, Inscripcion[]>();
	const unsubsPorCategoria = new Map<string, () => void>();

	function emit() {
		const todas: Inscripcion[] = [];
		for (const arr of porCategoria.values()) todas.push(...arr);
		callback(todas);
	}

	const qCats = query(categoriasCol(torneoId));
	const unsubCats = onSnapshot(qCats, (snap) => {
		const cidsActuales = new Set<string>();
		for (const d of snap.docs) {
			cidsActuales.add(d.id);
			if (!unsubsPorCategoria.has(d.id)) {
				const cid = d.id;
				const unsub = onSnapshot(inscripcionesCol(torneoId, cid), (snapI) => {
					porCategoria.set(
						cid,
						snapI.docs.map((di) => ({ id: di.id, ...di.data() }))
					);
					emit();
				});
				unsubsPorCategoria.set(cid, unsub);
			}
		}
		for (const [cid, unsub] of unsubsPorCategoria.entries()) {
			if (!cidsActuales.has(cid)) {
				unsub();
				unsubsPorCategoria.delete(cid);
				porCategoria.delete(cid);
			}
		}
		emit();
	});

	return () => {
		unsubCats();
		for (const unsub of unsubsPorCategoria.values()) unsub();
		unsubsPorCategoria.clear();
		porCategoria.clear();
	};
}

// Suscribe a TODAS las zonas del torneo (cross-categoria), igual patron
// que suscribirPartidosDelTorneo. Util para la pantalla de programacion
// donde necesitamos mapear zonaId → letra sin tener que armar lookups
// nesteados.
export function suscribirZonasDelTorneo(
	torneoId: string,
	callback: (zonas: Zona[]) => void
): () => void {
	const porCategoria = new Map<string, Zona[]>();
	const unsubsPorCategoria = new Map<string, () => void>();

	function emit() {
		const todas: Zona[] = [];
		for (const arr of porCategoria.values()) todas.push(...arr);
		callback(todas);
	}

	const qCats = query(categoriasCol(torneoId));
	const unsubCats = onSnapshot(qCats, (snap) => {
		const cidsActuales = new Set<string>();
		for (const d of snap.docs) {
			cidsActuales.add(d.id);
			if (!unsubsPorCategoria.has(d.id)) {
				const cid = d.id;
				const unsub = onSnapshot(zonasCol(torneoId, cid), (snapZ) => {
					porCategoria.set(
						cid,
						snapZ.docs.map((dz) => ({ id: dz.id, ...dz.data() }))
					);
					emit();
				});
				unsubsPorCategoria.set(cid, unsub);
			}
		}
		for (const [cid, unsub] of unsubsPorCategoria.entries()) {
			if (!cidsActuales.has(cid)) {
				unsub();
				unsubsPorCategoria.delete(cid);
				porCategoria.delete(cid);
			}
		}
		emit();
	});

	return () => {
		unsubCats();
		for (const unsub of unsubsPorCategoria.values()) unsub();
		unsubsPorCategoria.clear();
		porCategoria.clear();
	};
}

// Suscribe a TODOS los partidos del torneo (cross-categoria) componiendo
// suscripciones por categoria. Devuelve una funcion de cleanup que desuscribe
// todo. El callback recibe el array compuesto cada vez que algo cambia.
export function suscribirPartidosDelTorneo(
	torneoId: string,
	callback: (partidos: Partido[]) => void
): () => void {
	const porCategoria = new Map<string, Partido[]>();
	const unsubsPorCategoria = new Map<string, () => void>();

	function emit() {
		const todos: Partido[] = [];
		for (const arr of porCategoria.values()) todos.push(...arr);
		callback(todos);
	}

	const qCats = query(categoriasCol(torneoId));
	const unsubCats = onSnapshot(qCats, (snap) => {
		const cidsActuales = new Set<string>();
		for (const d of snap.docs) {
			cidsActuales.add(d.id);
			if (!unsubsPorCategoria.has(d.id)) {
				const cid = d.id;
				const unsub = onSnapshot(partidosCol(torneoId, cid), (snapP) => {
					porCategoria.set(
						cid,
						snapP.docs.map((dp) => ({ id: dp.id, ...dp.data() }))
					);
					emit();
				});
				unsubsPorCategoria.set(cid, unsub);
			}
		}
		// Limpiar las que ya no existen.
		for (const [cid, unsub] of unsubsPorCategoria.entries()) {
			if (!cidsActuales.has(cid)) {
				unsub();
				unsubsPorCategoria.delete(cid);
				porCategoria.delete(cid);
			}
		}
		emit();
	});

	return () => {
		unsubCats();
		for (const unsub of unsubsPorCategoria.values()) unsub();
		unsubsPorCategoria.clear();
		porCategoria.clear();
	};
}
