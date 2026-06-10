import { z } from 'zod';

// Jugador como entidad global (top-level collection). Se reusa entre torneos:
// en cada inscripcion se busca y se referencia por id. Datos minimos en v1;
// email, documento, club se suman como opcionales cuando hagan falta.

export const jugadorInputSchema = z.object({
	nombreCompleto: z.string().trim().min(1, 'El nombre es requerido').max(100),
	// Telefono opcional. String vacio se normaliza a null antes de validar.
	telefono: z
		.string()
		.trim()
		.min(1, 'Teléfono inválido')
		.max(30, 'Máximo 30 caracteres')
		.nullable()
});

export type JugadorInput = z.infer<typeof jugadorInputSchema>;

export type Jugador = JugadorInput & {
	id: string;
	creadoEn: string;
};
