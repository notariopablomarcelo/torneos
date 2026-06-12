import type { ProgramacionPartido } from '$lib/types/armado';
import type { TorneoCancha } from '$lib/types/programacion';

// =============================================================================
// Algoritmo de validacion FAP para la programacion de partidos.
//
// V1: validacion de CANCHA solamente.
// - No-choque: la cancha no puede tener dos partidos solapados.
// - Disponibilidad: el horario debe caer dentro del rango disponible para
//   esa cancha en esa fecha.
//
// V2 (Fase 4): validacion de PAREJAS — una misma pareja no puede tener dos
// partidos solapados ni partidos demasiado juntos (75min zona / 90min bracket
// segun FAP).
//
// La duracion estimada de un partido es FIJA en 90 minutos. Cuando hagamos
// configurable, se pasa como parametro.
// =============================================================================

export const DURACION_PARTIDO_MIN = 90;
// Reglamento FAP padel: descanso minimo entre dos partidos de la misma
// pareja. En fase de zona son 75 min, en bracket eliminatorio son 90 min.
export const DESCANSO_MIN_ZONA = 75;
export const DESCANSO_MIN_BRACKET = 90;

export type Conflicto =
	| {
			tipo: 'choqueCancha';
			otroPartidoId: string;
			otroPartidoLabel: string;
			otraHora: string; // HH:mm de inicio del otro partido
	  }
	| {
			tipo: 'choquePareja';
			otroPartidoId: string;
			otroPartidoLabel: string;
			otraHora: string; // HH:mm de inicio del otro partido
			descansoRequerido: number; // minutos de descanso mínimo FAP
	  }
	| {
			tipo: 'fueraDeDisponibilidad';
			// Rangos disponibles para esa fecha — texto humano. Ej. "09:00–22:00"
			// para un rango unico, "09:00–12:00, 16:00–22:00" para multiples.
			rangosDisponibles: string;
	  }
	| { tipo: 'sinDisponibilidadEseDia' }
	| { tipo: 'canchaNoEnTorneo' }
	| {
			// El horario propuesto cae dentro de un bloqueo declarado por algun
			// jugador de las parejas que JUGARIAN este partido. Si el partido
			// tiene refs simbolicas (Ganador P1...), se reportan los bloqueos
			// de TODAS las parejas potenciales (pesimismo simetrico al
			// descanso).
			tipo: 'bloqueoJugador';
			parejaId: string;
			jugadorId: string;
			bloqueoDesde: string;
			bloqueoHasta: string;
	  }
	| {
			// El partido depende de otro partido (es "Ganador del Px" o
			// "Perdedor del Px"). `padreFinHora` es null cuando el padre
			// aun NO esta programado: en ese caso no se conoce el inicio
			// minimo del hijo y por eso no se puede asignar todavia.
			tipo: 'dependenciaTemporal';
			partidoPadreId: string;
			padreFinHora: string | null; // HH:mm o null si el padre no esta programado
			descansoRequerido: number;
	  };

// =============================================================================
// Helpers de tiempo en minutos desde 00:00
// =============================================================================

export function horaAMinutos(hhmm: string): number {
	const [h, m] = hhmm.split(':').map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
}

// Igual que `horaAMinutos`, pero tratando '00:00' como 24:00 (=1440). Pensado
// para el campo `hasta` de un rango de disponibilidad: '00:00' significa
// "cierre a medianoche", no "cierra antes de empezar". Usar SOLO para horas
// de fin de rango — para horas de inicio de partido (`programacion.hora`) o
// para el `desde` de un rango siempre usar `horaAMinutos`.
export function horaFinAMinutos(hhmm: string): number {
	if (hhmm === '00:00') return 24 * 60;
	return horaAMinutos(hhmm);
}

export function minutosAHora(min: number): string {
	const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
	const h = Math.floor(m / 60);
	const mm = m % 60;
	return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Dos rangos [a, a+dur) y [b, b+dur) se solapan si a < b+dur y b < a+dur.
function seSolapan(
	a: number,
	durA: number,
	b: number,
	durB: number
): boolean {
	return a < b + durB && b < a + durA;
}

// =============================================================================
// Validacion
// =============================================================================

export type PartidoProgramado = {
	id: string;
	programacion: ProgramacionPartido;
	label: string; // texto humano para identificar el otro partido en el conflicto
	// Inscripciones (parejas) que juegan este partido. Solo se conocen cuando
	// las refs son directas (Inscripcion); para refs simbolicas pendientes
	// queda vacio y por eso no chocan. Las usamos para detectar conflictos
	// de pareja: una misma pareja no puede estar en dos lugares al mismo
	// tiempo.
	parejas?: string[];
};

export type OpcionesValidacion = {
	duracion?: number;
	descansoEntreParejas?: number;
	// Bloqueos horarios indexados por parejaId (inscripcionId). Cada bloqueo
	// representa un rango en el que un jugador especifico de esa pareja NO
	// puede jugar. Cuando se valida un partido contra `partidoParejas`, se
	// chequea que el horario propuesto no caiga DENTRO de ningun bloqueo de
	// las parejas que JUGARIAN ese partido. Pesimismo simetrico al descanso:
	// si la ref es simbolica (Ganador P1), las parejas que se pasen aca son
	// TODAS las potenciales — basta con que UNA tenga el horario bloqueado
	// para invalidar el slot.
	bloqueosPorPareja?: Record<
		string,
		{ jugadorId: string; fecha: string; desde: string; hasta: string }[]
	>;
	// IDs de los partidos padre directos (cuyo resultado alimenta a este
	// partido via Ganador/Perdedor). El validador chequea que el horario
	// propuesto sea al menos `descansoEntreParejas` min DESPUES del fin de
	// cada padre programado en el mismo dia. Esto reemplaza el pesimismo
	// recursivo de parejas en el bracket: en vez de "P12 puede compartir
	// pareja con todo el subarbol", modelamos "P12 NO puede empezar hasta
	// `descanso` min despues de P5 y P6".
	partidosPadre?: string[];
};

export function validarProgramacion(
	propuesta: ProgramacionPartido,
	partidoId: string,
	partidoParejas: string[],
	partidosProgramados: PartidoProgramado[],
	canchaTorneo: TorneoCancha | null,
	opciones: OpcionesValidacion = {}
): Conflicto[] {
	const duracion = opciones.duracion ?? DURACION_PARTIDO_MIN;
	const descansoParejas = opciones.descansoEntreParejas ?? DESCANSO_MIN_ZONA;
	const bloqueosPorPareja = opciones.bloqueosPorPareja ?? {};
	const partidosPadre = opciones.partidosPadre ?? [];
	const conflictos: Conflicto[] = [];

	// Dependencia temporal: si este partido tiene padres (es "Ganador del Px"
	// o "Perdedor del Px"), debe empezar al menos `descanso` min DESPUES del
	// fin de cada padre programado. Si el padre todavia NO esta programado,
	// no podemos asignar el hijo: tambien lo reportamos como conflicto para
	// que el greedy salte este slot.
	if (partidosPadre.length > 0) {
		const inicio = horaAMinutos(propuesta.hora);
		for (const padreId of partidosPadre) {
			const padre = partidosProgramados.find((o) => o.id === padreId);
			if (!padre) {
				// Padre sin programar: el hijo no puede asignarse a NINGUN
				// horario hasta que el padre tenga uno. Conflict en cualquier
				// slot — el caller decide si esperar / forzar.
				conflictos.push({
					tipo: 'dependenciaTemporal',
					partidoPadreId: padreId,
					padreFinHora: null,
					descansoRequerido: descansoParejas
				});
				continue;
			}
			if (padre.programacion.fecha > propuesta.fecha) {
				// Padre en fecha POSTERIOR al hijo: claramente invalido.
				conflictos.push({
					tipo: 'dependenciaTemporal',
					partidoPadreId: padreId,
					padreFinHora: null,
					descansoRequerido: descansoParejas
				});
				continue;
			}
			if (padre.programacion.fecha < propuesta.fecha) {
				// Padre en dia anterior: el hijo siempre arranca despues
				// del cierre del dia. Asumimos descanso satisfecho.
				continue;
			}
			// Misma fecha: chequeo de horario.
			const padreInicio = horaAMinutos(padre.programacion.hora);
			const padreFin = padreInicio + duracion;
			if (padreFin + descansoParejas > inicio) {
				conflictos.push({
					tipo: 'dependenciaTemporal',
					partidoPadreId: padreId,
					padreFinHora: minutosAHora(padreFin),
					descansoRequerido: descansoParejas
				});
			}
		}
	}

	if (!canchaTorneo || canchaTorneo.canchaId !== propuesta.canchaId) {
		conflictos.push({ tipo: 'canchaNoEnTorneo' });
		// Si la cancha no esta en el torneo, los demas checks de cancha
		// (disponibilidad / choque de cancha) son irrelevantes. PERO los de
		// pareja sí siguen aplicando — la pareja puede chocar consigo misma en
		// otra cancha. Saltamos canchas y continuamos.
	} else {
		const rangosDelDia = canchaTorneo.disponibilidad.filter(
			(r) => r.fecha === propuesta.fecha
		);
		if (rangosDelDia.length === 0) {
			conflictos.push({ tipo: 'sinDisponibilidadEseDia' });
		} else {
			const inicio = horaAMinutos(propuesta.hora);
			const fin = inicio + duracion;
			// El partido debe caer ENTERO dentro de alguno de los rangos
			// disponibles. Si la cancha tiene horario partido (ej. 09:00-12:00
			// y 16:00-22:00), la propuesta debe entrar en uno de los dos.
			const cae = rangosDelDia.some(
				(r) => inicio >= horaAMinutos(r.desde) && fin <= horaFinAMinutos(r.hasta)
			);
			if (!cae) {
				const rangosTxt = rangosDelDia
					.map((r) => `${r.desde}–${r.hasta}`)
					.join(', ');
				conflictos.push({
					tipo: 'fueraDeDisponibilidad',
					rangosDisponibles: rangosTxt
				});
			}
		}

		// Choque de cancha: misma cancha, mismo dia, horario solapado.
		const inicio = horaAMinutos(propuesta.hora);
		for (const otro of partidosProgramados) {
			if (otro.id === partidoId) continue;
			if (otro.programacion.canchaId !== propuesta.canchaId) continue;
			if (otro.programacion.fecha !== propuesta.fecha) continue;
			const otroInicio = horaAMinutos(otro.programacion.hora);
			if (seSolapan(inicio, duracion, otroInicio, duracion)) {
				conflictos.push({
					tipo: 'choqueCancha',
					otroPartidoId: otro.id,
					otroPartidoLabel: otro.label,
					otraHora: otro.programacion.hora
				});
			}
		}
	}

	// Choque de pareja: dos partidos de la misma pareja que estan demasiado
	// cerca en el tiempo (mismo dia, en cualquier cancha). El descanso minimo
	// se suma a la duracion efectiva: dos partidos no pueden estar a menos de
	// (90 + descanso) minutos de distancia entre sus inicios.
	// Bloqueos horarios de jugadores: para cada pareja que puede jugar el
	// partido, revisar si alguno de sus jugadores tiene un bloqueo que
	// SOLAPA con el horario propuesto. Pesimismo: basta con UN solapamiento
	// para invalidar.
	if (partidoParejas.length > 0) {
		const inicio = horaAMinutos(propuesta.hora);
		const fin = inicio + duracion;
		for (const parejaId of partidoParejas) {
			const bloqueos = bloqueosPorPareja[parejaId] ?? [];
			for (const b of bloqueos) {
				if (b.fecha !== propuesta.fecha) continue;
				const bDesde = horaAMinutos(b.desde);
				const bHasta = horaFinAMinutos(b.hasta);
				// Solape de intervalos [inicio, fin) y [bDesde, bHasta).
				if (inicio < bHasta && bDesde < fin) {
					conflictos.push({
						tipo: 'bloqueoJugador',
						parejaId,
						jugadorId: b.jugadorId,
						bloqueoDesde: b.desde,
						bloqueoHasta: b.hasta
					});
				}
			}
		}
	}

	if (partidoParejas.length > 0) {
		const inicio = horaAMinutos(propuesta.hora);
		const parejasSet = new Set(partidoParejas);
		// Duracion efectiva = partido + descanso. Si seSolapan con esta
		// duracion devuelve true → no hay tiempo suficiente entre partidos.
		const durEfectiva = duracion + descansoParejas;
		for (const otro of partidosProgramados) {
			if (otro.id === partidoId) continue;
			if (otro.programacion.fecha !== propuesta.fecha) continue;
			const otrasParejas = otro.parejas ?? [];
			const tieneEnComun = otrasParejas.some((id) => parejasSet.has(id));
			if (!tieneEnComun) continue;
			const otroInicio = horaAMinutos(otro.programacion.hora);
			if (seSolapan(inicio, durEfectiva, otroInicio, durEfectiva)) {
				conflictos.push({
					tipo: 'choquePareja',
					otroPartidoId: otro.id,
					otroPartidoLabel: otro.label,
					otraHora: otro.programacion.hora,
					descansoRequerido: descansoParejas
				});
			}
		}
	}

	return conflictos;
}

// Wrapper de compat para el codigo que solo valida cancha (sin parejas).
// Equivale a llamar `validarProgramacion` con `partidoParejas=[]`.
export function validarProgramacionCancha(
	propuesta: ProgramacionPartido,
	partidoId: string,
	partidosProgramados: PartidoProgramado[],
	canchaTorneo: TorneoCancha | null,
	duracion: number = DURACION_PARTIDO_MIN
): Conflicto[] {
	return validarProgramacion(
		propuesta,
		partidoId,
		[],
		partidosProgramados,
		canchaTorneo,
		{ duracion }
	);
}

// Util para UI: traduce los conflictos en mensajes legibles.
export function mensajeConflicto(c: Conflicto): string {
	switch (c.tipo) {
		case 'choqueCancha':
			return `La cancha ya tiene otro partido a las ${c.otraHora}: ${c.otroPartidoLabel}`;
		case 'choquePareja':
			return `Una pareja juega ${c.otroPartidoLabel} a las ${c.otraHora}. Faltaría descanso mínimo (${c.descansoRequerido} min entre partidos de la misma pareja).`;
		case 'fueraDeDisponibilidad':
			return `El horario cae fuera de la disponibilidad de la cancha (${c.rangosDisponibles}).`;
		case 'sinDisponibilidadEseDia':
			return 'La cancha no tiene disponibilidad cargada para ese día.';
		case 'canchaNoEnTorneo':
			return 'La cancha seleccionada no está asignada al torneo.';
		case 'bloqueoJugador':
			return `Un jugador no puede jugar en ese horario (bloqueo ${c.bloqueoDesde}–${c.bloqueoHasta}).`;
		case 'dependenciaTemporal':
			if (c.padreFinHora === null) {
				return 'Este partido depende de otro que todavía no está programado. Programá primero el partido del que depende.';
			}
			return `Este partido depende de otro que termina a las ${c.padreFinHora}. Faltaría descanso mínimo (${c.descansoRequerido} min).`;
	}
}

// Helper: extrae las inscripciones (parejas) de un partido para validar
// choques. Solo devuelve las refs directas a Inscripcion; las simbolicas
// (GanadorPartido, PerdedorPartido, PosicionZona) se dejan fuera porque
// dependen de partidos previos. Por eso esta validacion es mas estricta
// en zonas RR (donde todo es directo) que en bracket o zonas DO derivadas.
//
// Para validar respetando el descanso minimo en partidos con refs simbolicas
// (donde una pareja TODAVIA no se sabe pero VA a ser una de varias),
// preferi usar `parejasPotencialesDePartido` (mas abajo).
export function inscripcionesDePartido(p: {
	pareja1Ref: { tipo: string; inscripcionId?: string };
	pareja2Ref: { tipo: string; inscripcionId?: string };
}): string[] {
	const out: string[] = [];
	if (p.pareja1Ref.tipo === 'Inscripcion' && p.pareja1Ref.inscripcionId) {
		out.push(p.pareja1Ref.inscripcionId);
	}
	if (p.pareja2Ref.tipo === 'Inscripcion' && p.pareja2Ref.inscripcionId) {
		out.push(p.pareja2Ref.inscripcionId);
	}
	return out;
}

// =============================================================================
// Parejas y dependencias (modelo unificado)
// =============================================================================
//
// El validador necesita dos cosas para programar un partido:
//
// 1) `parejasPotencialesDePartido`: inscripciones CONCRETAS que juegan el
//    partido. Solo resuelve `Inscripcion` directas; refs simbolicas
//    (PosicionZona, Ganador, Perdedor) NO se resuelven. Esto evita los
//    falsos positivos: dos partidos del bracket que apuntan a la misma
//    zona NUNCA comparten pareja real (1° de A y 2° de A son personas
//    distintas), pero la resolucion pesimista los hacia chocar.
//
// 2) `partidosAncestrosDirectos`: IDs de partidos cuyo resultado alimenta
//    a este. Modela la dependencia temporal:
//    - `Ganador/Perdedor del Px` → P_x es padre.
//    - `PosicionZona(L,p)` → TODOS los partidos de la zona L son padres
//      (el clasificado se conoce al terminar la ultima ronda de la zona).
//
// El validador chequea: cada padre programado debe terminar al menos
// `descanso` minutos antes del inicio del hijo; cada padre SIN programar
// genera conflicto (el hijo no puede asignarse hasta saber su horario).

type ParejaRefMin =
	| { tipo: 'Inscripcion'; inscripcionId: string }
	| { tipo: 'GanadorPartido'; numeroEnZona: number }
	| { tipo: 'PerdedorPartido'; numeroEnZona: number }
	| { tipo: 'PosicionZona'; letraZona: string; posicion: 1 | 2 | 3 };

export function parejasPotencialesDePartido(p: {
	pareja1Ref: ParejaRefMin;
	pareja2Ref: ParejaRefMin;
}): string[] {
	function resolver(ref: ParejaRefMin): string[] {
		if (ref.tipo === 'Inscripcion') return [ref.inscripcionId];
		// PosicionZona, Ganador, Perdedor → dependencias temporales en
		// `partidosAncestrosDirectos`, NO parejas concretas.
		return [];
	}
	const out = [...resolver(p.pareja1Ref), ...resolver(p.pareja2Ref)];
	return Array.from(new Set(out));
}

// IDs de los partidos cuyo resultado alimenta a este partido (padres).
//
// - `Ganador/Perdedor del Px` → partido con `numeroEnZona = x` en el mismo
//   contexto (bracket o zona) es padre directo.
// - `PosicionZona(L,p)`:
//   * Zona RR (3 o 4 todos contra todos): todas las posiciones dependen
//     de TODOS los partidos de la zona — la tabla acumulada cambia con
//     cada partido.
//   * Zona DO de 4: las posiciones 1° y 2° dependen SOLO de P3 (el
//     partido de ganadores). La posicion 3° depende SOLO de P4 (el
//     partido de perdedores). Los demas partidos quedan cubiertos
//     transitivamente por la dependencia que P3/P4 tienen con ellos.
//
// Cuando alguno de estos padres no esta programado, el hijo tampoco puede
// asignarse — el validador lo bloquea.
export function partidosAncestrosDirectos(
	p: {
		pareja1Ref: ParejaRefMin;
		pareja2Ref: ParejaRefMin;
		zonaId: string | null;
	},
	todosPartidos: {
		id: string;
		numeroEnZona: number;
		zonaId: string | null;
	}[],
	zonas: {
		id: string;
		letra: string;
		tamano: 3 | 4;
		modalidad: 'todosContraTodos' | 'dobleOportunidad';
	}[]
): string[] {
	const ctxMismo = todosPartidos.filter((pp) => pp.zonaId === p.zonaId);
	const out: string[] = [];
	function buscar(ref: ParejaRefMin): void {
		if (
			ref.tipo === 'GanadorPartido' ||
			ref.tipo === 'PerdedorPartido'
		) {
			const padre = ctxMismo.find(
				(pp) => pp.numeroEnZona === ref.numeroEnZona
			);
			if (padre) out.push(padre.id);
		} else if (ref.tipo === 'PosicionZona') {
			const zona = zonas.find((z) => z.letra === ref.letraZona);
			if (!zona) return;
			const partidosZona = todosPartidos.filter(
				(pp) => pp.zonaId === zona.id
			);
			// Zona DO de 4: las posiciones se definen en partidos especificos.
			if (zona.tamano === 4 && zona.modalidad === 'dobleOportunidad') {
				// 1° y 2° → P3 (ganadores). 3° → P4 (perdedores).
				const numPadre = ref.posicion === 3 ? 4 : 3;
				const padre = partidosZona.find(
					(pp) => pp.numeroEnZona === numPadre
				);
				if (padre) out.push(padre.id);
				return;
			}
			// RR (zona de 3 o de 4 todos contra todos): todas las posiciones
			// dependen de todos los partidos (la tabla cambia con cada uno).
			for (const pp of partidosZona) out.push(pp.id);
		}
	}
	buscar(p.pareja1Ref);
	buscar(p.pareja2Ref);
	return Array.from(new Set(out));
}
