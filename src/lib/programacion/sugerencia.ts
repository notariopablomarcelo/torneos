import type { ProgramacionPartido } from '$lib/types/armado';
import type { TorneoCancha } from '$lib/types/programacion';
import {
	DESCANSO_MIN_BRACKET,
	DESCANSO_MIN_ZONA,
	DURACION_PARTIDO_MIN,
	horaAMinutos,
	horaFinAMinutos,
	minutosAHora,
	validarProgramacion,
	type PartidoProgramado
} from './algoritmo';

// =============================================================================
// Algoritmo greedy de sugerencia automatica de programacion.
//
// Estrategia:
// 1. Generar TODOS los slots posibles (cancha × fecha × hora cada 15 min) que
//    permitan calzar un partido de 90 min dentro del rango disponible.
// 2. Ordenar slots cronologicamente (fecha asc, hora asc, cancha asc).
// 3. Ordenar partidos sin programar por prioridad: primero los de zona,
//    despues los del bracket por ronda creciente (preliminar → cuartos →
//    semis → final). Asi llenamos primero lo que ya esta definido y dejamos
//    abiertos los slots para los partidos del bracket que se juegan despues.
// 4. Para cada partido, recorrer la lista de slots y tomar el primero que
//    valide (sin choque de cancha, dentro de la disponibilidad).
// 5. Marcar ese slot como ocupado para no proponerlo de nuevo.
//
// La validacion reutiliza `validarProgramacionCancha` del algoritmo manual,
// asi el comportamiento "sin conflictos" coincide entre los dos flujos.
//
// V2 (futuro): suma validacion de PAREJAS — una misma pareja no puede tener
// dos partidos solapados ni demasiado cerca (75 min zona / 90 min bracket).
// Para eso hay que resolver las refs simbolicas a inscripciones reales, lo
// cual implica pasar la tabla de posiciones por zona. No esta en v1.
// =============================================================================

export const STEP_SLOT_MIN = 15;

export type PartidoParaSugerir = {
	id: string;
	categoriaId: string;
	// true = partido de zona; false = bracket.
	esZona: boolean;
	// Solo bracket: numero de ronda (1=preliminar/primera, 2, 3...). Para
	// zonas se ignora. Si no esta seteado, se trata como 0 (juega primero).
	ronda?: number;
	// Numero del partido dentro de su contexto (zona o bracket). Lo usamos
	// para garantizar orden cronologico: P1 de una zona se intenta antes
	// que P2, y dentro de cuartos del bracket P5 antes que P6.
	numeroEnZona: number;
	// Solo zonas: letra de la zona ('A', 'B', ...). Permite desempatar
	// cuando varias zonas tienen el mismo `numeroEnZona`. Asi el orden de
	// proceso es A1, B1, C1... A2, B2, C2... — intercalado, no apilado.
	letraZona?: string;
	// Inscripciones (parejas) que juegan. Si las refs eran simbolicas
	// (GanadorPartido, etc.) este array queda vacio; en ese caso la
	// validacion de pareja se relaja para este partido — el descanso vs
	// partidos padre se cubre via `partidosPadre`.
	parejas: string[];
	// IDs de partidos padre (referenciados via Ganador/Perdedor). El
	// validador chequea dependencia temporal: este partido no puede empezar
	// hasta `descanso` min despues del fin de cada padre programado.
	partidosPadre?: string[];
};

export type Asignacion = {
	partidoId: string;
	programacion: ProgramacionPartido;
};

export type ResultadoSugerencia = {
	asignaciones: Asignacion[];
	sinProgramar: string[]; // ids de los partidos para los que no se encontro slot
};

type SlotPropuesto = ProgramacionPartido;

// =============================================================================
// Helpers
// =============================================================================

// Precalcula todos los slots posibles ordenados cronologicamente. Cada slot
// representa el INICIO de un partido de duracion fija. El desempate entre
// slots con misma fecha+hora respeta el ORDEN DE LAS CANCHAS RECIBIDAS — asi
// el caller decide la prioridad (Cancha 1, Cancha 2, ... en orden natural)
// pre-ordenando la lista antes de llamar a esta funcion.
function calcularSlots(canchas: TorneoCancha[]): SlotPropuesto[] {
	const ordenCancha = new Map(canchas.map((c, i) => [c.canchaId, i]));
	const slots: SlotPropuesto[] = [];
	for (const cancha of canchas) {
		for (const disp of cancha.disponibilidad) {
			const desde = horaAMinutos(disp.desde);
			const hasta = horaFinAMinutos(disp.hasta);
			for (
				let m = desde;
				m + DURACION_PARTIDO_MIN <= hasta;
				m += STEP_SLOT_MIN
			) {
				slots.push({
					fecha: disp.fecha,
					hora: minutosAHora(m),
					canchaId: cancha.canchaId
				});
			}
		}
	}
	slots.sort((a, b) => {
		if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
		if (a.hora !== b.hora) return a.hora.localeCompare(b.hora);
		return (
			(ordenCancha.get(a.canchaId) ?? 0) - (ordenCancha.get(b.canchaId) ?? 0)
		);
	});
	return slots;
}

function ordenarPartidosPorPrioridad(
	partidos: PartidoParaSugerir[]
): PartidoParaSugerir[] {
	return [...partidos].sort((a, b) => {
		// 1. Zona antes que bracket.
		const aZona = a.esZona ? 0 : 1;
		const bZona = b.esZona ? 0 : 1;
		if (aZona !== bZona) return aZona - bZona;
		// 2. Para bracket, ronda menor primero.
		if (!a.esZona) {
			const dR = (a.ronda ?? 0) - (b.ronda ?? 0);
			if (dR !== 0) return dR;
		}
		// 3. Numero de partido ascendente — A1 antes que A2, garantiza
		//    que la pareja juegue su P1 antes que su P2.
		if (a.numeroEnZona !== b.numeroEnZona) {
			return a.numeroEnZona - b.numeroEnZona;
		}
		// 4. Desempate por letra de zona ascendente — entre A1, B1, C1...
		//    procesamos A1 primero, despues B1, etc. (intercalado por
		//    zona en lugar de apilar toda A antes de B).
		const aLetra = a.letraZona ?? '';
		const bLetra = b.letraZona ?? '';
		return aLetra.localeCompare(bLetra);
	});
}

// =============================================================================
// Algoritmo principal
// =============================================================================

export function sugerirProgramacion(input: {
	partidosSinProgramar: PartidoParaSugerir[];
	partidosYaProgramados: PartidoProgramado[];
	canchasTorneo: TorneoCancha[];
	// Bloqueos horarios indexados por inscripcionId (pareja). Si una pareja
	// no tiene bloqueos, omitir su entrada. El algoritmo los pasa al
	// validador para descartar slots invalidos.
	bloqueosPorPareja?: Record<
		string,
		{ jugadorId: string; fecha: string; desde: string; hasta: string }[]
	>;
}): ResultadoSugerencia {
	const {
		partidosSinProgramar,
		partidosYaProgramados,
		canchasTorneo,
		bloqueosPorPareja
	} = input;

	const slots = calcularSlots(canchasTorneo);
	const orden = ordenarPartidosPorPrioridad(partidosSinProgramar);
	const canchasPorId = new Map(canchasTorneo.map((tc) => [tc.canchaId, tc]));

	const asignaciones: Asignacion[] = [];
	const sinProgramar: string[] = [];

	// Estado mutable de partidos ocupados — sumamos las asignaciones nuevas
	// para que las proximas iteraciones las consideren como choques.
	const ocupados: PartidoProgramado[] = [...partidosYaProgramados];

	// PASADA 1 (partido-first): para cada partido en orden de prioridad,
	// buscamos el primer slot que valide. Es el greedy original — cubre la
	// mayoria de los casos.
	for (const p of orden) {
		let asignado = false;
		// FAP: 75 min de descanso entre partidos de zona, 90 min en bracket.
		const descanso = p.esZona ? DESCANSO_MIN_ZONA : DESCANSO_MIN_BRACKET;
		for (const slot of slots) {
			const tc = canchasPorId.get(slot.canchaId);
			if (!tc) continue;
			const conflictos = validarProgramacion(
				slot,
				p.id,
				p.parejas,
				ocupados,
				tc,
				{
					descansoEntreParejas: descanso,
					bloqueosPorPareja,
					partidosPadre: p.partidosPadre
				}
			);
			if (conflictos.length === 0) {
				asignaciones.push({ partidoId: p.id, programacion: slot });
				ocupados.push({
					id: p.id,
					programacion: slot,
					label: p.id,
					parejas: p.parejas
				});
				asignado = true;
				break;
			}
		}
		if (!asignado) sinProgramar.push(p.id);
	}

	// PASADA 2 (slot-first, "rellenar huecos"): para cada slot libre
	// cronologico, probamos todos los partidos pendientes. Esta inversion
	// del bucle puede colocar partidos que la primera pasada descarto: por
	// ejemplo, cuando un partido NO encontraba slot al momento de
	// procesarlo pero queda un hueco "tardio" que SI lo acepta — o cuando
	// la priorizacion linear salteo una combinacion.
	//
	// Iteramos hasta que una pasada completa no agregue ninguna asignacion
	// (`cambios = false`). Cada asignacion nueva puede habilitar otras
	// (porque cambia el set de ocupados), de ahi el while.
	let cambios = true;
	while (cambios && sinProgramar.length > 0) {
		cambios = false;
		for (const slot of slots) {
			// Slot ya ocupado en esa cancha+fecha+hora?
			const yaOcupado = ocupados.some(
				(o) =>
					o.programacion.canchaId === slot.canchaId &&
					o.programacion.fecha === slot.fecha &&
					o.programacion.hora === slot.hora
			);
			if (yaOcupado) continue;

			for (let i = 0; i < sinProgramar.length; i += 1) {
				const pid = sinProgramar[i]!;
				const p = orden.find((pp) => pp.id === pid);
				if (!p) continue;
				const tc = canchasPorId.get(slot.canchaId);
				if (!tc) continue;
				const descanso = p.esZona
					? DESCANSO_MIN_ZONA
					: DESCANSO_MIN_BRACKET;
				const conflictos = validarProgramacion(
					slot,
					p.id,
					p.parejas,
					ocupados,
					tc,
					{
						descansoEntreParejas: descanso,
						bloqueosPorPareja,
						partidosPadre: p.partidosPadre
					}
				);
				if (conflictos.length === 0) {
					asignaciones.push({ partidoId: p.id, programacion: slot });
					ocupados.push({
						id: p.id,
						programacion: slot,
						label: p.id,
						parejas: p.parejas
					});
					sinProgramar.splice(i, 1);
					cambios = true;
					break; // siguiente slot
				}
			}
		}
	}

	return { asignaciones, sinProgramar };
}
