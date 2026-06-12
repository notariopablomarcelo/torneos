import type { Clasifican, ParejaRef, PartidoPlantilla } from '$lib/types/armado';

// =============================================================================
// Sembrado snake del bracket eliminatorio
// =============================================================================
//
// Reglas:
// 1. Clasificados se ordenan por "cabeza de serie" (seeds): primero todos los
//    1° por orden de zona (A, B, ...), despues todos los 2°, despues 3°.
// 2. Si la cantidad TOTAL no es potencia de 2, el cuadro se eleva a la
//    SIGUIENTE potencia de 2 (4, 8, 16, 32...) y se otorgan byes a los
//    mejores seeds (los 1°). En la 1ra ronda, los 1° pasan directo a la
//    siguiente; los 2° y 3° juegan entre ellos.
// 3. Si la cantidad ya es potencia de 2 (4, 8, 16), todos juegan la 1ra ronda
//    sin byes.
//
// Sembrado estandar "tennis seeding":
//   seeds(2) = [1, 2]
//   seeds(N) = entrelazar(seeds(N/2), reverse(map(s => N+1-s, seeds(N/2))))
//   N=4:  [1, 4, 2, 3]
//   N=8:  [1, 8, 4, 5, 2, 7, 3, 6]
//   N=16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]
//
// Los partidos de 1ra ronda salen tomando pares consecutivos del array. Si
// alguno de los dos seeds del par es > N (seed "imaginario"), no se crea
// partido: el seed real pasa directo (bye).

// =============================================================================
// API publica
// =============================================================================

export type ClasificadoSeed = {
	letraZona: string;
	posicion: 1 | 2 | 3;
	seedNumero: number;
};

export type BracketArmado = {
	// Cantidad real de parejas que entran al cuadro (= cantidad de clasificados).
	cantidadParejas: number;
	// Tamaño del cuadro (potencia de 2 >= cantidadParejas).
	cantidadParejasCuadro: number;
	// Cuantos byes hay (cuadro - parejas). Cero si N es potencia de 2.
	cantidadByes: number;
	// Partidos en orden temporal (primera ronda primero, luego siguientes).
	partidos: PartidoBracketPlantilla[];
};

export type FaseBracket = '32vos' | '16vos' | '8vos' | '4tos' | 'Semis' | 'Final';

export type PartidoBracketPlantilla = PartidoPlantilla & {
	ronda: number;
	posicionEnRonda: number;
	fase: FaseBracket;
};

// Construye la lista de clasificados a partir de zonas + clasifican.
// `zonas` debe venir ordenado por letra.
export function listarClasificados(
	zonas: { letra: string; clasifican: Clasifican }[]
): ClasificadoSeed[] {
	const seeds: ClasificadoSeed[] = [];
	for (let pos: 1 | 2 | 3 = 1; pos <= 3; pos = (pos + 1) as 1 | 2 | 3) {
		for (const z of zonas) {
			if (pos <= z.clasifican) {
				seeds.push({
					letraZona: z.letra,
					posicion: pos,
					seedNumero: seeds.length + 1
				});
			}
		}
		if (pos === 3) break;
	}
	return seeds;
}

// =============================================================================
// Helpers
// =============================================================================

function sembrarSnake(n: number): number[] {
	if (n === 1) return [1];
	let seeds = [1, 2];
	let actual = 2;
	while (actual < n) {
		const siguiente = actual * 2;
		const nuevo: number[] = [];
		for (const s of seeds) {
			nuevo.push(s);
			nuevo.push(siguiente + 1 - s);
		}
		seeds = nuevo;
		actual = siguiente;
	}
	return seeds;
}

function esPotenciaDe2(n: number): boolean {
	return n >= 2 && (n & (n - 1)) === 0;
}

function siguientePotenciaDe2(n: number): number {
	if (n <= 1) return 1;
	let p = 1;
	while (p < n) p *= 2;
	return p;
}

// Nombre de la fase segun cuantos partidos REALES + bye hay en la ronda
// (= cuantos slots del cuadro entran a esa ronda).
//
// - 64 slots → 32vos (primera ronda de cuadros muy grandes, no soportado en UI)
// - 32 slots → 16vos
// - 16 slots → 8vos (a.k.a. Octavos)
// - 8 slots  → 4tos (a.k.a. Cuartos)
// - 4 slots  → Semis
// - 2 slots  → Final
//
// El mapeo es importante: cuando hay byes, la 1ra ronda PARTIDOS REALES
// puede ser de 16vos aunque algunos pasen directo a 8vos.
function faseDeRonda(slotsEnRonda: number): FaseBracket {
	if (slotsEnRonda >= 64) return '32vos';
	if (slotsEnRonda === 32) return '16vos';
	if (slotsEnRonda === 16) return '8vos';
	if (slotsEnRonda === 8) return '4tos';
	if (slotsEnRonda === 4) return 'Semis';
	return 'Final';
}

// =============================================================================
// armarBracket
// =============================================================================

export function armarBracket(
	zonas: { letra: string; clasifican: Clasifican }[]
): BracketArmado {
	const seeds = listarClasificados(zonas);
	const N = seeds.length;
	if (N < 2) {
		throw new Error('Se necesitan al menos 2 clasificados para armar el bracket.');
	}

	// Cuadro = siguiente potencia de 2 >= N. Sembrado snake sobre `cuadro`
	// slots. Los seeds 1..N son reales (PosicionZona); seeds N+1..cuadro son
	// "byes" (slot vacio).
	const cuadro = siguientePotenciaDe2(N);
	const ordenSnake = sembrarSnake(cuadro);
	const slotRefs: (ParejaRef | null)[] = ordenSnake.map((seedNum) => {
		if (seedNum > N) return null;
		const s = seeds[seedNum - 1]!;
		return { tipo: 'PosicionZona', letraZona: s.letraZona, posicion: s.posicion };
	});

	return construirPartidosDesdeSlots(slotRefs);
}

// Variante de `armarBracket` que recibe directamente el mapping slot→ref
// (en lugar de derivarlo de zonas via snake). Util para "editor de cruces":
// el organizador asigna manualmente que ref va a cada slot del cuadro
// (incluyendo slots vacios = byes a su discrecion), y este helper construye
// el bracket completo desde esa asignacion.
//
// `slotRefs.length` debe ser potencia de 2 (= cantidadParejasCuadro). Las
// posiciones impares y pares del array se aparean para R1; slots vacios
// generan bye; ambos vacios en un par propaga vacio a R2+ (la cancha queda
// sin partido).
export function armarBracketDesdeSlots(
	slotRefs: (ParejaRef | null)[]
): BracketArmado {
	if (!esPotenciaDe2(slotRefs.length)) {
		throw new Error('La cantidad de slots debe ser potencia de 2.');
	}
	const cantParejas = slotRefs.filter((r) => r !== null).length;
	if (cantParejas < 2) {
		throw new Error('Se necesitan al menos 2 parejas en el cuadro.');
	}
	return construirPartidosDesdeSlots(slotRefs);
}

// Helper interno: dado un array de N=2^k slots con refs (o null para bye),
// construye todos los partidos del bracket en orden temporal (R1, R2, ...).
//
// Por cada par consecutivo de slots:
//   - ambos refs no-null → partido en R1 (ambos refs como pareja1/pareja2);
//     el slot R2 que sigue es `GanadorPartido` del nuevo partido.
//   - solo uno no-null → no hay partido R1; el slot R2 hereda esa ref tal cual
//     (bye = la pareja sube directo).
//   - ambos null → no hay partido R1 y el slot R2 queda null (se propaga).
//
// Cada ronda subsecuente repite el mismo emparejamiento sobre las refs
// salientes hasta llegar a 1 sola (la Final).
function construirPartidosDesdeSlots(
	slotRefs: (ParejaRef | null)[]
): BracketArmado {
	const cuadro = slotRefs.length;
	const partidos: PartidoBracketPlantilla[] = [];
	let numeroGlobal = 0;
	let entrantes: (ParejaRef | null)[] = slotRefs;
	let nroRonda = 1;

	while (entrantes.length > 1) {
		const cantSlots = entrantes.length;
		const saliente: (ParejaRef | null)[] = [];
		for (let i = 0; i < cantSlots; i += 2) {
			const a = entrantes[i] ?? null;
			const b = entrantes[i + 1] ?? null;
			if (a && b) {
				numeroGlobal += 1;
				partidos.push({
					numeroEnZona: numeroGlobal,
					ronda: nroRonda,
					posicionEnRonda: i / 2 + 1,
					fase: faseDeRonda(cantSlots),
					pareja1Ref: a,
					pareja2Ref: b
				});
				saliente.push({ tipo: 'GanadorPartido', numeroEnZona: numeroGlobal });
			} else if (a) {
				saliente.push(a);
			} else if (b) {
				saliente.push(b);
			} else {
				saliente.push(null);
			}
		}
		entrantes = saliente;
		nroRonda += 1;
	}

	const cantidadParejas = slotRefs.filter((r) => r !== null).length;
	return {
		cantidadParejas,
		cantidadParejasCuadro: cuadro,
		cantidadByes: cuadro - cantidadParejas,
		partidos
	};
}

// Inverso de `construirPartidosDesdeSlots`: dado un bracket ya armado
// (lista de partidos), reconstruye el mapping de slots del cuadro → ref.
// Util para el editor de cruces: arranca con el snake actual y permite
// editar desde ahi (sin re-derivar desde cero).
//
// Algoritmo:
//   - R1: cada partido en posicionEnRonda K → ocupa slots 2K-1 y 2K
//     (sus pareja1Ref y pareja2Ref van directo a esos slots).
//   - R2+: si una ref es PosicionZona, significa que el slot R1 que le
//     toca estaba vacio (bye). Asignamos esa ref al "primer slot R1 del
//     range" correspondiente.
//
// Range de un partido en ronda R, posicionEnRonda K:
//   slots [(K-1)*2^R + 1, K*2^R]. pareja1Ref → primera mitad del range,
//   pareja2Ref → segunda mitad. Para una PosicionZona en pareja1, asignamos
//   al primer slot de la primera mitad; para pareja2, al primero de la
//   segunda mitad.
export function slotsDeBracket(
	partidos: PartidoBracketPlantilla[]
): (ParejaRef | null)[] {
	if (partidos.length === 0) return [];
	const rondas = new Map<number, PartidoBracketPlantilla[]>();
	for (const p of partidos) {
		const arr = rondas.get(p.ronda) ?? [];
		arr.push(p);
		rondas.set(p.ronda, arr);
	}
	const ordRondas = Array.from(rondas.keys()).sort((a, b) => a - b);
	const cuadro = Math.pow(2, ordRondas.length);
	const slotRefs: (ParejaRef | null)[] = new Array(cuadro).fill(null);

	// R1 (si existe — puede no haber si el cuadro es 2 y solo hay Final).
	const partidosR1 = rondas.get(1) ?? [];
	for (const p of partidosR1) {
		const slotA = (p.posicionEnRonda - 1) * 2;
		slotRefs[slotA] = p.pareja1Ref;
		slotRefs[slotA + 1] = p.pareja2Ref;
	}

	// R2+: rellenar slots vacios desde refs PosicionZona que aparecen como
	// pareja1/pareja2 (esas son byes que no se vieron en R1).
	for (const rondaNum of ordRondas) {
		if (rondaNum === 1) continue;
		const partidosR = rondas.get(rondaNum)!;
		const rangeSize = Math.pow(2, rondaNum);
		const mitad = rangeSize / 2;
		for (const p of partidosR) {
			const inicioRange = (p.posicionEnRonda - 1) * rangeSize;
			if (p.pareja1Ref.tipo === 'PosicionZona') {
				slotRefs[inicioRange] = p.pareja1Ref;
			}
			if (p.pareja2Ref.tipo === 'PosicionZona') {
				slotRefs[inicioRange + mitad] = p.pareja2Ref;
			}
		}
	}

	return slotRefs;
}

export { sembrarSnake, esPotenciaDe2, siguientePotenciaDe2 };
