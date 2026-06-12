import { z } from 'zod';

// Sede = lugar fisico donde se juega. Globales: una sede se puede usar en
// varios torneos. Tiene N canchas (subcoleccion). En v1 dejamos opcional
// la direccion y los datos auxiliares; cuando los necesitemos sumamos
// horarios de apertura, telefono, ubicacion en mapa, etc.

export const sedeInputSchema = z.object({
	nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
	direccion: z.string().trim().max(200).nullable()
});

export type SedeInput = z.infer<typeof sedeInputSchema>;

export type Sede = SedeInput & {
	id: string;
	creadoEn: string;
};

// Cancha = sub-recurso de una sede. La identifica un nombre corto que el
// admin elige libremente ("Cancha 1", "Central", "Vidrio Este"). No tiene
// campos especificos de padel — si manana sumamos otro deporte, sumamos un
// `tipo` o un `superficie`.

export const canchaInputSchema = z.object({
	nombre: z.string().trim().min(1, 'El nombre es requerido').max(60)
});

export type CanchaInput = z.infer<typeof canchaInputSchema>;

export type Cancha = CanchaInput & {
	id: string;
	sedeId: string;
	creadoEn: string;
};
