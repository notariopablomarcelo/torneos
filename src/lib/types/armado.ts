import { z } from 'zod';

// Config del armado de zonas. Vive como prop opcional en Categoria: null = no
// armada todavia. Cuando se arma, se guarda este snapshot para saber con que
// se hizo (algoritmo, tamano preferido, etc.) y para mostrarlo en la UI.

export const algoritmoSchema = z.enum(['snake', 'random']);
export type Algoritmo = z.infer<typeof algoritmoSchema>;

export const modalidadZona4Schema = z.enum(['todosContraTodos', 'dobleOportunidad']);
export type ModalidadZona4 = z.infer<typeof modalidadZona4Schema>;

export const tamanoZonaSchema = z.union([z.literal(3), z.literal(4)]);
export type TamanoZona = z.infer<typeof tamanoZonaSchema>;

// Cuantas parejas clasifican por zona. 3 solo es valido para zonas de 4
// (en zona de 3 no tiene sentido = serian todos). El servicio capea al
// maximo posible segun el tamano cuando persiste el campo en cada zona.
export const clasificanSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Clasifican = z.infer<typeof clasificanSchema>;

export const armadoConfigSchema = z.object({
	algoritmo: algoritmoSchema,
	tamanoPreferido: tamanoZonaSchema,
	modalidadZona4: modalidadZona4Schema,
	clasificanPorZona: clasificanSchema,
	armadoEn: z.string()
});
export type ArmadoConfig = z.infer<typeof armadoConfigSchema>;

// Referencia a una "pareja" (=inscripcion) en un partido. Para partidos de
// zona puede ser:
// - directa por id de inscripcion (round-robin completo o cruces iniciales
//   de doble oportunidad);
// - simbolica: "ganador/perdedor del partido N de esta zona" (para los
//   partidos derivados de la doble oportunidad).
// Cuando agreguemos bracket, sumamos un caso 'Posicional' tipo "1° de zona A".
export type ParejaRef =
	| { tipo: 'Inscripcion'; inscripcionId: string }
	| { tipo: 'GanadorPartido'; numeroEnZona: number }
	| { tipo: 'PerdedorPartido'; numeroEnZona: number };

// Estado de una zona armada. La modalidad y clasifican se guardan en la
// propia zona (no solo en la config macro de la categoria) porque despues
// permitimos re-armar UNA zona individual con distintos parametros (caso de
// la pareja que llega tarde y la zona pasa de 3 a 4 con DO).
export type Zona = {
	id: string;
	categoriaId: string;
	letra: string;
	tamano: TamanoZona;
	modalidad: ModalidadZona4 | 'todosContraTodos'; // zonas de 3 siempre RR
	clasifican: Clasifican;
	inscripcionIds: string[];
	creadoEn: string;
};

export type FasePartido = 'Zona' | 'Octavos' | 'Cuartos' | 'Semis' | 'Final';

export type EstadoPartido = 'Pendiente' | 'Programado' | 'Jugado';

// Motivo del resultado:
// - normal: se jugo el partido completo.
// - WO (walkover): una pareja no se presento; la otra gana sin jugar.
// - abandono: la pareja perdedora abandono durante el partido.
export const motivoResultadoSchema = z.enum(['normal', 'WO', 'abandono']);
export type MotivoResultado = z.infer<typeof motivoResultadoSchema>;

// Set con games ganados por cada pareja. Tiebreak opcional cuando hubo
// (set 6-6 se resuelve con tiebreak; el ganador del tie se anota 7 games).
export const setResultadoSchema = z.object({
	p1: z.number().int().min(0).max(99),
	p2: z.number().int().min(0).max(99),
	tiebreakP1: z.number().int().min(0).optional(),
	tiebreakP2: z.number().int().min(0).optional()
});
export type SetResultado = z.infer<typeof setResultadoSchema>;

export const resultadoPartidoSchema = z.object({
	sets: z.array(setResultadoSchema),
	ganadorEs: z.union([z.literal(1), z.literal(2)]),
	motivo: motivoResultadoSchema
});
export type ResultadoPartido = z.infer<typeof resultadoPartidoSchema>;

export type Partido = {
	id: string;
	categoriaId: string;
	zonaId: string | null; // null = bracket
	fase: FasePartido;
	numeroEnZona: number; // posicion del partido dentro de la zona
	pareja1Ref: ParejaRef;
	pareja2Ref: ParejaRef;
	resultado: ResultadoPartido | null;
	estado: EstadoPartido;
	creadoEn: string;
};

// "Plantilla" de zona armada, antes de persistirla (sin id/creadoEn). El
// algoritmo devuelve este shape; el servicio le pone los ids y la guarda.
export type ZonaArmada = {
	letra: string;
	tamano: TamanoZona;
	inscripcionIds: string[]; // en orden de "posicion interna" (1°, 2°, ...)
};

// "Plantilla" de partido generado, antes de persistirlo (sin id/zonaId/
// categoriaId/creadoEn). El servicio los completa.
export type PartidoPlantilla = {
	numeroEnZona: number;
	pareja1Ref: ParejaRef;
	pareja2Ref: ParejaRef;
};
