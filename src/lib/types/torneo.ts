import { z } from 'zod';

// Esquemas de validacion + tipos del dominio. Los esquemas "input" son los
// datos que entran por formulario; los tipos completos suman id y creadoEn
// (los pone el sistema, no el usuario).

// Torneo: sin campo estado por ahora. Cuando definamos las acciones de
// "abrir / cerrar inscripciones" por categoria podra derivarse a partir
// del estado agregado de sus categorias, o reintroducirse como flag propio.

export const torneoInputSchema = z
	.object({
		nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
		fechaInicio: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
		fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD')
	})
	.refine((d) => d.fechaFin >= d.fechaInicio, {
		message: 'La fecha fin no puede ser anterior al inicio',
		path: ['fechaFin']
	});

export type TorneoInput = z.infer<typeof torneoInputSchema>;

export type Torneo = TorneoInput & {
	id: string;
	creadoEn: string;
};

// Niveles competitivos de la categoria, de 1ra (mas alta) a 9na.
export const nivelCategoriaSchema = z.enum([
	'1ra',
	'2da',
	'3ra',
	'4ta',
	'5ta',
	'6ta',
	'7ma',
	'8va',
	'9na'
]);
export type NivelCategoria = z.infer<typeof nivelCategoriaSchema>;
export const NIVELES_CATEGORIA: NivelCategoria[] = [
	'1ra',
	'2da',
	'3ra',
	'4ta',
	'5ta',
	'6ta',
	'7ma',
	'8va',
	'9na'
];

export const generoCategoriaSchema = z.enum(['Caballeros', 'Damas', 'Mixto']);
export type GeneroCategoria = z.infer<typeof generoCategoriaSchema>;
export const GENEROS_CATEGORIA: GeneroCategoria[] = ['Caballeros', 'Damas', 'Mixto'];

export const categoriaInputSchema = z.object({
	nivel: nivelCategoriaSchema,
	genero: generoCategoriaSchema,
	cupos: z.number().int().positive().nullable()
});

export type CategoriaInput = z.infer<typeof categoriaInputSchema>;

export type Categoria = CategoriaInput & {
	id: string;
	torneoId: string;
	creadoEn: string;
};

// Nombre derivado a partir de nivel + genero. Se usa en todas las vistas
// para no tener "${nivel} ${genero}" repartido por la UI.
export function nombreCategoria(c: {
	nivel: NivelCategoria;
	genero: GeneroCategoria;
}): string {
	return `${c.nivel} ${c.genero}`;
}
