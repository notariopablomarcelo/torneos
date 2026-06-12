import { armarBracket, type FaseBracket } from '$lib/bracket/algoritmo';
import { armarZonas as armarZonasAlgoritmo } from '$lib/zonas/algoritmo';
import type { ParejaRef } from '$lib/types/armado';

// =============================================================================
// Preview de la estructura de una categoria a partir de cupos + estructura
// preferida. No requiere inscripciones reales: usa "Pos 1", "Pos 2", etc.
// para las parejas, y refs simbolicas en zonas DO y en el bracket.
//
// Util para que el admin vea la forma del torneo antes de cargar parejas y
// armar las zonas. Cuando la categoria queda armada con datos reales, este
// preview deja de tener sentido y la UI lo oculta.
// =============================================================================

export type PartidoZonaPreview = {
	numero: number;
	label: string;
};

export type ZonaPreview = {
	letra: string;
	tamano: 3 | 4;
	partidos: PartidoZonaPreview[];
};

export type PartidoBracketPreview = {
	numero: number;
	ronda: number;
	fase: FaseBracket;
	// Codigo corto secuencial dentro de la fase: "16-1", "8-3", "4-2", "S1",
	// o "" (final no lleva codigo, hay solo un partido). Las refs simbolicas
	// en `label` apuntan a este mismo codigo.
	codigo: string;
	label: string;
};

export type EstructuraPreview = {
	cantidadZonas: number;
	tamano: 3 | 4;
	modalidad: 'todosContraTodos' | 'dobleOportunidad';
	clasifican: 1 | 2 | 3;
	zonas: ZonaPreview[];
	bracket: PartidoBracketPreview[];
};

// Partidos "tipicos" de una zona segun tamano y modalidad. Devuelve labels
// en formato humano usando posiciones internas (Pos 1..4) y refs simbolicas
// en zonas de 4 con doble oportunidad.
export function partidosZonaPreview(
	tamano: 3 | 4,
	modalidad: 'todosContraTodos' | 'dobleOportunidad'
): PartidoZonaPreview[] {
	if (tamano === 3) {
		return [
			{ numero: 1, label: 'Pos 1 vs Pos 2' },
			{ numero: 2, label: 'Pos 1 vs Pos 3' },
			{ numero: 3, label: 'Pos 2 vs Pos 3' }
		];
	}
	if (modalidad === 'todosContraTodos') {
		return [
			{ numero: 1, label: 'Pos 1 vs Pos 2' },
			{ numero: 2, label: 'Pos 1 vs Pos 3' },
			{ numero: 3, label: 'Pos 1 vs Pos 4' },
			{ numero: 4, label: 'Pos 2 vs Pos 3' },
			{ numero: 5, label: 'Pos 2 vs Pos 4' },
			{ numero: 6, label: 'Pos 3 vs Pos 4' }
		];
	}
	// Doble oportunidad: cruces iniciales 1v4, 2v3, luego ganador/perdedor.
	return [
		{ numero: 1, label: 'Pos 1 vs Pos 4' },
		{ numero: 2, label: 'Pos 2 vs Pos 3' },
		{ numero: 3, label: 'Ganador P1 vs Ganador P2' },
		{ numero: 4, label: 'Perdedor P1 vs Perdedor P2' }
	];
}

// Formato corto para una ParejaRef simbolica del bracket. Necesita el mapa
// numeroEnZona → codigo (O1, C2, S1...) precalculado por el caller para
// resolver `GanadorPartido` y `PerdedorPartido` al codigo del partido
// referenciado.
function labelRef(
	ref: ParejaRef,
	codigosPorNumero: Map<number, string>
): string {
	switch (ref.tipo) {
		case 'PosicionZona':
			return `${ref.posicion}° de Zona ${ref.letraZona}`;
		case 'GanadorPartido':
		case 'PerdedorPartido': {
			const cod = codigosPorNumero.get(ref.numeroEnZona) ?? `P${ref.numeroEnZona}`;
			const verbo = ref.tipo === 'GanadorPartido' ? 'Ganador' : 'Perdedor';
			return `${verbo} ${cod}`;
		}
		case 'Inscripcion':
			// No deberia ocurrir en preview, pero por completitud.
			return '?';
	}
}

// Preview con SEMBRADO ya simulado: usa el mismo algoritmo snake que el
// armado real para repartir parejas genericas ("Pareja 01", "Pareja 02"...)
// en las zonas. Util para mostrar "asi se va a ver cuando armes con
// inscripciones reales" — la estructura es identica, solo cambian los
// nombres reales por placeholders.

export type ZonaPreviewSembrada = {
	letra: string;
	tamano: 3 | 4;
	parejas: string[]; // ej. ["Pareja 01", "Pareja 04", ...]
	partidos: PartidoZonaPreview[];
};

export function generarZonasSembradas(
	cupos: number,
	tamano: 3 | 4,
	modalidad: 'todosContraTodos' | 'dobleOportunidad'
): ZonaPreviewSembrada[] {
	if (cupos < 3) return [];
	const ids = Array.from(
		{ length: cupos },
		(_, i) => `Pareja ${String(i + 1).padStart(2, '0')}`
	);
	let zonasArmadas: { letra: string; tamano: 3 | 4; inscripcionIds: string[] }[];
	try {
		zonasArmadas = armarZonasAlgoritmo(ids, 'snake', tamano);
	} catch {
		// armarZonas rechaza algunos casos (ej. N=5). En esos casos no hay
		// preview valido — devolvemos vacio y el caller renderea el motivo.
		return [];
	}
	const partidosTipo = partidosZonaPreview(tamano, modalidad);
	return zonasArmadas.map((z) => ({
		letra: z.letra,
		tamano: z.tamano,
		parejas: z.inscripcionIds,
		partidos: partidosTipo
	}));
}

// Genera la estructura completa: zonas + bracket. El bracket reusa el
// algoritmo real (`armarBracket`) pasando zonas ficticias con la letra y el
// clasifican configurados.
export function generarPreviewEstructura(
	cupos: number,
	tamano: 3 | 4,
	modalidad: 'todosContraTodos' | 'dobleOportunidad',
	clasifican: 1 | 2 | 3
): EstructuraPreview | null {
	if (cupos < 3) return null;
	const cantZonas = Math.ceil(cupos / tamano);
	const partidosTipo = partidosZonaPreview(tamano, modalidad);

	const zonas: ZonaPreview[] = [];
	for (let i = 0; i < cantZonas; i += 1) {
		const letra = String.fromCharCode(65 + i);
		zonas.push({ letra, tamano, partidos: partidosTipo });
	}

	let bracket: PartidoBracketPreview[] = [];
	const zonasFicticias = zonas.map((z) => ({ letra: z.letra, clasifican }));
	try {
		const armado = armarBracket(zonasFicticias);
		// Generamos codigos cortos enumerando 1..N DENTRO de cada fase, en
		// orden de aparicion. Asi siempre arrancan en 1 y no quedan huecos
		// (bracket con byes saltea posiciones del cuadro). La final no lleva
		// codigo — hay solo un partido.
		//
		// Formato: "16-N" / "8-N" / "4-N" para fases nombradas con numeros,
		// "S1"/"S2" para semis, "" para final.
		const codigosPorNumero = new Map<number, string>();
		const contadorPorFase = new Map<string, number>();
		const ordenados = [...armado.partidos].sort((a, b) => {
			if (a.ronda !== b.ronda) return a.ronda - b.ronda;
			return a.numeroEnZona - b.numeroEnZona;
		});
		for (const p of ordenados) {
			if (p.fase === 'Final') {
				codigosPorNumero.set(p.numeroEnZona, '');
				continue;
			}
			const n = (contadorPorFase.get(p.fase) ?? 0) + 1;
			contadorPorFase.set(p.fase, n);
			let prefijo: string;
			switch (p.fase) {
				case '32vos':
					prefijo = '32-';
					break;
				case '16vos':
					prefijo = '16-';
					break;
				case '8vos':
					prefijo = '8-';
					break;
				case '4tos':
					prefijo = '4-';
					break;
				case 'Semis':
					prefijo = 'S';
					break;
			}
			codigosPorNumero.set(p.numeroEnZona, `${prefijo}${n}`);
		}

		bracket = armado.partidos.map((p) => ({
			numero: p.numeroEnZona,
			ronda: p.ronda,
			fase: p.fase,
			codigo: codigosPorNumero.get(p.numeroEnZona) ?? '',
			label: `${labelRef(p.pareja1Ref, codigosPorNumero)} vs ${labelRef(p.pareja2Ref, codigosPorNumero)}`
		}));
	} catch {
		// N < 2 (solo cuando cupos < 2, que ya filtramos). Bracket vacio.
	}

	return {
		cantidadZonas: cantZonas,
		tamano,
		modalidad,
		clasifican,
		zonas,
		bracket
	};
}
