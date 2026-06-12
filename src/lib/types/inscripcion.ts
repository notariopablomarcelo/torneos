import { z } from 'zod';
import type { Jugador } from './jugador';
import { rangoHorarioSchema } from './programacion';

// Bloqueo horario: un rango en el que un jugador especifico NO puede jugar.
// Reusa el shape de rango horario de canchas (fecha + desde + hasta, con
// '00:00' = medianoche). La pareja "no puede" si CUALQUIERA de sus jugadores
// tiene un bloqueo que se solapa con el horario propuesto.
export const bloqueoJugadorSchema = z
	.object({
		jugadorId: z.string().min(1)
	})
	.and(rangoHorarioSchema);

export type BloqueoJugador = z.infer<typeof bloqueoJugadorSchema>;

// Inscripcion = unidad competitiva (pareja, jugador, equipo) dentro de una
// categoria. Atada a un torneo + categoria. jugadores es un array de
// jugadorId; el tamano lo manda la categoria.cantidadJugadores. ranking se
// usa despues para el snake draft.

export const inscripcionInputSchema = z.object({
	jugadores: z
		.array(z.string().min(1))
		.min(1, 'Falta agregar jugadores'),
	// Ranking opcional. Cuando esta presente debe ser entero >= 1. El snake
	// draft (cuando exista) solo considera las inscripciones con ranking;
	// las sin ranking se podran ordenar despues o quedan fuera del armado.
	ranking: z.number().int().min(1).nullable(),
	// Bloqueos horarios por jugador (opcional). Se carga en el form despues
	// de que el organizador definio rangos en canchas. Cada entrada
	// referencia uno de los jugadores de la inscripcion + el rango en el
	// que no puede jugar. La disponibilidad efectiva de la pareja es la
	// interseccion (= lo que pueden todos sus jugadores). undefined/ausente
	// se trata como [] al consumir.
	bloqueosJugadores: z.array(bloqueoJugadorSchema).optional()
});

export type InscripcionInput = z.infer<typeof inscripcionInputSchema>;

export type Inscripcion = InscripcionInput & {
	id: string;
	torneoId: string;
	categoriaId: string;
	creadoEn: string;
};

// Array de nombres de los jugadores de la inscripcion, en el mismo orden
// que vienen en jugadores[]. Huerfanos quedan como "(?)". Para el render del
// listado que muestra uno por linea.
export function nombresJugadores(
	insc: Pick<Inscripcion, 'jugadores'>,
	porId: Map<string, Jugador>
): string[] {
	return insc.jugadores.map((id) => porId.get(id)?.nombreCompleto ?? '(?)');
}

// Compone el nombre visible de la inscripcion en una sola linea (para
// confirms, titulos, aria-labels). Si TODOS son huerfanos, devuelve un
// fallback con el ranking para no mostrar "(?) / (?)".
export function nombreInscripcion(
	insc: Pick<Inscripcion, 'jugadores' | 'ranking'>,
	porId: Map<string, Jugador>
): string {
	const nombres = nombresJugadores(insc, porId);
	if (nombres.length > 0 && nombres.every((n) => n === '(?)')) {
		const tag = insc.ranking !== null ? `#${insc.ranking}` : 'sin ranking';
		return `Inscripción ${tag}`;
	}
	return nombres.join(' / ');
}
