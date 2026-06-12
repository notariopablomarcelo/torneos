import { z } from 'zod';
import { horaAMinutos, horaFinAMinutos } from '$lib/programacion/algoritmo';

// Asociacion de una cancha a un torneo. Vive en torneos/{tid}/canchas/{tcid}.
// Denormalizamos sedeId (no solo el canchaId) porque al renderizar la
// pantalla necesitamos saber a que sede pertenece sin tener que hacer un
// lookup adicional.
//
// La `disponibilidad` es una lista de rangos horarios por fecha. Un mismo
// dia puede tener varios rangos (por ejemplo si la cancha esta partida en
// dos turnos), aunque en v1 la UI solo permite un rango por dia.

export const rangoHorarioSchema = z
	.object({
		fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
		desde: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm'),
		hasta: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm')
	})
	// `hasta` = '00:00' representa cierre a medianoche (= 24:00). Convertimos
	// ambos extremos a minutos antes de comparar para que el caso pase.
	.refine((d) => horaAMinutos(d.desde) < horaFinAMinutos(d.hasta), {
		message: 'El horario "hasta" debe ser posterior al "desde"',
		path: ['hasta']
	});

export type RangoHorario = z.infer<typeof rangoHorarioSchema>;

export const torneoCanchaInputSchema = z.object({
	canchaId: z.string().min(1),
	sedeId: z.string().min(1),
	disponibilidad: z.array(rangoHorarioSchema)
});

export type TorneoCanchaInput = z.infer<typeof torneoCanchaInputSchema>;

export type TorneoCancha = TorneoCanchaInput & {
	id: string;
	torneoId: string;
	creadoEn: string;
};

// Default cuando se suma una cancha al torneo: un rango amplio por dia
// (08:00 a medianoche). '00:00' en el campo `hasta` se trata como 24:00 —
// permite que entren partidos que arrancan hasta las 22:30 (=24:00 al fin).
// El admin lo ajusta despues por dia / por cancha si el club cierra antes.
export const RANGO_DEFAULT = {
	desde: '08:00',
	hasta: '00:00'
};
