import { describe, expect, it } from 'vitest';
import {
	armarBracket,
	armarBracketDesdeSlots,
	esPotenciaDe2,
	listarClasificados,
	sembrarSnake,
	siguientePotenciaDe2,
	slotsDeBracket
} from './algoritmo';
import type { Clasifican, ParejaRef } from '$lib/types/armado';

// ---------------------------------------------------------------------------
// Helpers basicos
// ---------------------------------------------------------------------------

describe('esPotenciaDe2', () => {
	it('reconoce 2, 4, 8, 16, 32, 64', () => {
		[2, 4, 8, 16, 32, 64].forEach((n) => expect(esPotenciaDe2(n)).toBe(true));
	});
	it('rechaza no-potencias', () => {
		[0, 1, 3, 5, 6, 7, 9, 12, 24].forEach((n) =>
			expect(esPotenciaDe2(n)).toBe(false)
		);
	});
});

describe('siguientePotenciaDe2', () => {
	it('devuelve la siguiente potencia >= N', () => {
		expect(siguientePotenciaDe2(2)).toBe(2);
		expect(siguientePotenciaDe2(3)).toBe(4);
		expect(siguientePotenciaDe2(4)).toBe(4);
		expect(siguientePotenciaDe2(5)).toBe(8);
		expect(siguientePotenciaDe2(8)).toBe(8);
		expect(siguientePotenciaDe2(9)).toBe(16);
		expect(siguientePotenciaDe2(12)).toBe(16);
		expect(siguientePotenciaDe2(16)).toBe(16);
		expect(siguientePotenciaDe2(17)).toBe(32);
		expect(siguientePotenciaDe2(24)).toBe(32);
	});
});

// ---------------------------------------------------------------------------
// Sembrado snake
// ---------------------------------------------------------------------------

describe('sembrarSnake', () => {
	it('N=2 → [1, 2]', () => {
		expect(sembrarSnake(2)).toEqual([1, 2]);
	});
	it('N=4 → [1, 4, 2, 3]', () => {
		expect(sembrarSnake(4)).toEqual([1, 4, 2, 3]);
	});
	it('N=8 → [1, 8, 4, 5, 2, 7, 3, 6]', () => {
		expect(sembrarSnake(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
	});
	it('N=16 los seeds 1 y 2 quedan en mitades opuestas del cuadro', () => {
		const orden = sembrarSnake(16);
		const idx1 = orden.indexOf(1);
		const idx2 = orden.indexOf(2);
		expect(idx1 < 8).toBe(true);
		expect(idx2 >= 8).toBe(true);
	});
	it('N=16 el cruce inicial del seed 1 es contra el peor seed (16)', () => {
		const orden = sembrarSnake(16);
		expect(orden[0]).toBe(1);
		expect(orden[1]).toBe(16);
	});
});

// ---------------------------------------------------------------------------
// Listado de clasificados
// ---------------------------------------------------------------------------

describe('listarClasificados', () => {
	it('2 zonas clasifican 2: 1°A 1°B 2°A 2°B', () => {
		const seeds = listarClasificados([
			{ letra: 'A', clasifican: 2 },
			{ letra: 'B', clasifican: 2 }
		]);
		expect(seeds.map((s) => `${s.posicion}°${s.letraZona}`)).toEqual([
			'1°A',
			'1°B',
			'2°A',
			'2°B'
		]);
	});

	it('4 zonas clasifican 3: 1°s, 2°s, 3°s', () => {
		const seeds = listarClasificados(
			[
				{ letra: 'A', clasifican: 3 },
				{ letra: 'B', clasifican: 3 },
				{ letra: 'C', clasifican: 3 },
				{ letra: 'D', clasifican: 3 }
			] satisfies { letra: string; clasifican: Clasifican }[]
		);
		expect(seeds.length).toBe(12);
		expect(seeds.slice(0, 4).every((s) => s.posicion === 1)).toBe(true);
		expect(seeds.slice(4, 8).every((s) => s.posicion === 2)).toBe(true);
		expect(seeds.slice(8, 12).every((s) => s.posicion === 3)).toBe(true);
	});

	it('mix de clasifican', () => {
		const seeds = listarClasificados([
			{ letra: 'A', clasifican: 2 },
			{ letra: 'B', clasifican: 3 },
			{ letra: 'C', clasifican: 1 }
		]);
		expect(seeds.length).toBe(6);
		expect(seeds.map((s) => `${s.posicion}°${s.letraZona}`)).toEqual([
			'1°A',
			'1°B',
			'1°C',
			'2°A',
			'2°B',
			'3°B'
		]);
	});
});

// ---------------------------------------------------------------------------
// Bracket potencia de 2 (sin byes)
// ---------------------------------------------------------------------------

describe('armarBracket · potencia de 2 (sin byes)', () => {
	it('N=4 (2 zonas × 2): 2 semis + 1 final', () => {
		const b = armarBracket([
			{ letra: 'A', clasifican: 2 },
			{ letra: 'B', clasifican: 2 }
		]);
		expect(b.cantidadParejas).toBe(4);
		expect(b.cantidadParejasCuadro).toBe(4);
		expect(b.cantidadByes).toBe(0);
		expect(b.partidos.length).toBe(3);

		const semis = b.partidos.filter((p) => p.fase === 'Semis');
		const final = b.partidos.filter((p) => p.fase === 'Final');
		expect(semis.length).toBe(2);
		expect(final.length).toBe(1);

		// Cruces: 1°A vs 2°B y 1°B vs 2°A.
		const cruces = semis.map((p) => {
			const a = p.pareja1Ref;
			const bb = p.pareja2Ref;
			if (a.tipo !== 'PosicionZona' || bb.tipo !== 'PosicionZona')
				throw new Error('expected PosicionZona refs');
			return `${a.posicion}°${a.letraZona} vs ${bb.posicion}°${bb.letraZona}`;
		});
		expect(cruces).toContain('1°A vs 2°B');
		expect(cruces).toContain('1°B vs 2°A');
	});

	it('N=8 (4 zonas × 2): 4 cuartos + 2 semis + 1 final', () => {
		const b = armarBracket([
			{ letra: 'A', clasifican: 2 },
			{ letra: 'B', clasifican: 2 },
			{ letra: 'C', clasifican: 2 },
			{ letra: 'D', clasifican: 2 }
		]);
		expect(b.cantidadParejas).toBe(8);
		expect(b.cantidadParejasCuadro).toBe(8);
		expect(b.cantidadByes).toBe(0);
		expect(b.partidos.length).toBe(7);

		const cuartos = b.partidos.filter((p) => p.fase === '4tos');
		expect(cuartos.length).toBe(4);

		// Las 4 cabezas estan repartidas en distintos cuartos.
		const cabezas = cuartos.map((p) => {
			const refs = [p.pareja1Ref, p.pareja2Ref];
			const c = refs.find((r) => r.tipo === 'PosicionZona' && r.posicion === 1);
			return c?.tipo === 'PosicionZona' ? c.letraZona : null;
		});
		expect(cabezas.filter((x): x is string => x !== null).sort()).toEqual([
			'A',
			'B',
			'C',
			'D'
		]);
	});

	it('N=16 (8 zonas × 2): 8 octavos + 4 cuartos + 2 semis + 1 final', () => {
		const zonas = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((l) => ({
			letra: l,
			clasifican: 2 as Clasifican
		}));
		const b = armarBracket(zonas);
		expect(b.cantidadParejas).toBe(16);
		expect(b.cantidadParejasCuadro).toBe(16);
		expect(b.cantidadByes).toBe(0);
		expect(b.partidos.length).toBe(15);

		const octavos = b.partidos.filter((p) => p.fase === '8vos');
		expect(octavos.length).toBe(8);

		// 1°A juega contra un 2° en el primer octavo.
		const primero = octavos[0]!;
		expect(primero.pareja1Ref).toEqual({
			tipo: 'PosicionZona',
			letraZona: 'A',
			posicion: 1
		});
		expect(primero.pareja2Ref.tipo).toBe('PosicionZona');
		if (primero.pareja2Ref.tipo === 'PosicionZona') {
			expect(primero.pareja2Ref.posicion).toBe(2);
		}
	});
});

// ---------------------------------------------------------------------------
// Bracket NO potencia de 2 (con byes)
// ---------------------------------------------------------------------------

describe('armarBracket · con byes', () => {
	it('N=12 (4 zonas × 3): cuadro 16, 4 byes — los 1° pasan directos', () => {
		const b = armarBracket([
			{ letra: 'A', clasifican: 3 },
			{ letra: 'B', clasifican: 3 },
			{ letra: 'C', clasifican: 3 },
			{ letra: 'D', clasifican: 3 }
		]);
		expect(b.cantidadParejas).toBe(12);
		expect(b.cantidadParejasCuadro).toBe(16);
		expect(b.cantidadByes).toBe(4);
		// 1ra ronda real: 4 partidos. Cuartos: 4. Semis: 2. Final: 1. Total: 11.
		expect(b.partidos.length).toBe(11);

		const ronda1 = b.partidos.filter((p) => p.ronda === 1);
		expect(ronda1.length).toBe(4);

		// En la ronda 1 NINGUN 1° debe jugar (todos tienen bye).
		for (const p of ronda1) {
			for (const ref of [p.pareja1Ref, p.pareja2Ref]) {
				expect(ref.tipo).toBe('PosicionZona');
				if (ref.tipo === 'PosicionZona') {
					expect(ref.posicion).not.toBe(1);
				}
			}
		}

		// En la ronda 2 (cuartos): cada partido tiene un 1° directo y un
		// "Ganador de ronda 1".
		const ronda2 = b.partidos.filter((p) => p.ronda === 2);
		expect(ronda2.length).toBe(4);
		for (const p of ronda2) {
			const refs = [p.pareja1Ref, p.pareja2Ref];
			const tieneCabeza = refs.some(
				(r) => r.tipo === 'PosicionZona' && r.posicion === 1
			);
			const tieneGanador = refs.some((r) => r.tipo === 'GanadorPartido');
			expect(tieneCabeza).toBe(true);
			expect(tieneGanador).toBe(true);
		}
	});

	it('N=24 (8 zonas × 3): cuadro 32, 8 byes', () => {
		const zonas = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((l) => ({
			letra: l,
			clasifican: 3 as Clasifican
		}));
		const b = armarBracket(zonas);
		expect(b.cantidadParejas).toBe(24);
		expect(b.cantidadParejasCuadro).toBe(32);
		expect(b.cantidadByes).toBe(8);
		// 1ra ronda: 8 partidos reales. Octavos: 8. Cuartos: 4. Semis: 2. Final: 1.
		// Total: 23.
		expect(b.partidos.length).toBe(23);

		const ronda1 = b.partidos.filter((p) => p.ronda === 1);
		expect(ronda1.length).toBe(8);

		// Ningun 1° en ronda 1.
		for (const p of ronda1) {
			for (const ref of [p.pareja1Ref, p.pareja2Ref]) {
				if (ref.tipo === 'PosicionZona') {
					expect(ref.posicion).not.toBe(1);
				}
			}
		}
	});

	it('N=6 (3 zonas × 2): cuadro 8, 2 byes — solo los 2 mejores cabezas tienen bye', () => {
		const b = armarBracket([
			{ letra: 'A', clasifican: 2 },
			{ letra: 'B', clasifican: 2 },
			{ letra: 'C', clasifican: 2 }
		]);
		expect(b.cantidadParejas).toBe(6);
		expect(b.cantidadParejasCuadro).toBe(8);
		expect(b.cantidadByes).toBe(2);
		// 1ra ronda: 2 partidos reales (los demas son byes).
		// Ronda 2 (cuartos virtuales): 4 ganadores → 2 partidos en SEMIS.
		// Final: 1. Total: 2 + 2 + 1 = 5.
		expect(b.partidos.length).toBe(5);

		const ronda1 = b.partidos.filter((p) => p.ronda === 1);
		expect(ronda1.length).toBe(2);
		// Caso especial: solo hay 2 byes pero hay 3 cabezas (1°A, 1°B, 1°C).
		// Por sembrado snake, los byes van a las 2 mejores cabezas (1°A y 1°B).
		// 1°C juega la ronda 1 — es la mecanica natural del sembrado cuando
		// hay menos byes que cabezas. No es ideal pero es consistente.
		const cabezasEnRonda1 = ronda1
			.flatMap((p) => [p.pareja1Ref, p.pareja2Ref])
			.filter(
				(r): r is { tipo: 'PosicionZona'; letraZona: string; posicion: 1 | 2 | 3 } =>
					r.tipo === 'PosicionZona' && r.posicion === 1
			)
			.map((r) => r.letraZona);
		expect(cabezasEnRonda1).not.toContain('A');
		expect(cabezasEnRonda1).not.toContain('B');
	});

	it('mix N=10 (2 zonas × 3 + 2 zonas × 2): cuadro 16, 6 byes', () => {
		const b = armarBracket([
			{ letra: 'A', clasifican: 3 },
			{ letra: 'B', clasifican: 2 },
			{ letra: 'C', clasifican: 3 },
			{ letra: 'D', clasifican: 2 }
		]);
		expect(b.cantidadParejas).toBe(10);
		expect(b.cantidadParejasCuadro).toBe(16);
		expect(b.cantidadByes).toBe(6);
	});
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('armarBracket · edge cases', () => {
	it('N=1 lanza error', () => {
		expect(() => armarBracket([{ letra: 'A', clasifican: 1 }])).toThrow();
	});

	it('N=2 (1 zona × 2) genera una sola final', () => {
		const b = armarBracket([{ letra: 'A', clasifican: 2 }]);
		expect(b.cantidadParejas).toBe(2);
		expect(b.cantidadParejasCuadro).toBe(2);
		expect(b.cantidadByes).toBe(0);
		expect(b.partidos.length).toBe(1);
		expect(b.partidos[0]?.fase).toBe('Final');
	});

	it('N=3 (1 zona × 3) genera 1 prelim + final', () => {
		const b = armarBracket([{ letra: 'A', clasifican: 3 }]);
		expect(b.cantidadParejas).toBe(3);
		expect(b.cantidadParejasCuadro).toBe(4);
		expect(b.cantidadByes).toBe(1);
		// 1 partido en ronda 1 (2° vs 3°), 1 final.
		expect(b.partidos.length).toBe(2);
		// El 1°A no juega la ronda 1.
		const ronda1 = b.partidos.filter((p) => p.ronda === 1);
		expect(ronda1.length).toBe(1);
		for (const ref of [ronda1[0]!.pareja1Ref, ronda1[0]!.pareja2Ref]) {
			if (ref.tipo === 'PosicionZona') {
				expect(ref.posicion).not.toBe(1);
			}
		}
	});

	it('numeros secuenciales empezando en 1', () => {
		const b = armarBracket([
			{ letra: 'A', clasifican: 2 },
			{ letra: 'B', clasifican: 2 },
			{ letra: 'C', clasifican: 2 },
			{ letra: 'D', clasifican: 2 }
		]);
		const numeros = b.partidos.map((p) => p.numeroEnZona).sort((a, c) => a - c);
		expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	it('1°A y 1°B NUNCA se cruzan antes de la final con N=8', () => {
		const b = armarBracket([
			{ letra: 'A', clasifican: 2 },
			{ letra: 'B', clasifican: 2 },
			{ letra: 'C', clasifican: 2 },
			{ letra: 'D', clasifican: 2 }
		]);
		const partidoTieneCabeza = new Map<number, Set<string>>();

		function resolverCabezas(ref: ParejaRef): Set<string> {
			if (ref.tipo === 'PosicionZona') {
				if (ref.posicion === 1 && (ref.letraZona === 'A' || ref.letraZona === 'B')) {
					return new Set([`1°${ref.letraZona}`]);
				}
				return new Set();
			}
			if (ref.tipo === 'GanadorPartido') {
				return partidoTieneCabeza.get(ref.numeroEnZona) ?? new Set();
			}
			return new Set();
		}

		for (const p of b.partidos) {
			const c1 = resolverCabezas(p.pareja1Ref);
			const c2 = resolverCabezas(p.pareja2Ref);
			partidoTieneCabeza.set(p.numeroEnZona, new Set([...c1, ...c2]));

			if (p.fase !== 'Final') {
				const tieneA = c1.has('1°A') || c2.has('1°A');
				const tieneB = c1.has('1°B') || c2.has('1°B');
				expect(tieneA && tieneB).toBe(false);
			}
		}
	});
});

// ---------------------------------------------------------------------------
// armarBracketDesdeSlots + slotsDeBracket (editor de cruces custom)
// ---------------------------------------------------------------------------

describe('slotsDeBracket + armarBracketDesdeSlots · round trip', () => {
	function refPosicionZona(letraZona: string, posicion: 1 | 2 | 3): ParejaRef {
		return { tipo: 'PosicionZona', letraZona, posicion };
	}

	it('N=4 sin byes: round trip preserva bracket exacto', () => {
		const original = armarBracket([
			{ letra: 'A', clasifican: 2 },
			{ letra: 'B', clasifican: 2 }
		]);
		const slots = slotsDeBracket(original.partidos);
		const reconstruido = armarBracketDesdeSlots(slots);
		expect(reconstruido.cantidadParejas).toBe(original.cantidadParejas);
		expect(reconstruido.cantidadParejasCuadro).toBe(original.cantidadParejasCuadro);
		expect(reconstruido.partidos.length).toBe(original.partidos.length);
		for (let i = 0; i < original.partidos.length; i++) {
			const a = original.partidos[i]!;
			const b = reconstruido.partidos[i]!;
			expect(b.fase).toBe(a.fase);
			expect(b.ronda).toBe(a.ronda);
			expect(b.posicionEnRonda).toBe(a.posicionEnRonda);
			expect(b.pareja1Ref).toEqual(a.pareja1Ref);
			expect(b.pareja2Ref).toEqual(a.pareja2Ref);
		}
	});

	it('N=5 con byes: round trip preserva bracket exacto', () => {
		const original = armarBracket([
			{ letra: 'A', clasifican: 2 },
			{ letra: 'B', clasifican: 1 },
			{ letra: 'C', clasifican: 1 },
			{ letra: 'D', clasifican: 1 }
		]);
		const slots = slotsDeBracket(original.partidos);
		expect(slots.length).toBe(8);
		// 5 refs reales + 3 byes.
		expect(slots.filter((r) => r !== null).length).toBe(5);
		expect(slots.filter((r) => r === null).length).toBe(3);

		const reconstruido = armarBracketDesdeSlots(slots);
		expect(reconstruido.partidos.length).toBe(original.partidos.length);
		for (let i = 0; i < original.partidos.length; i++) {
			const a = original.partidos[i]!;
			const b = reconstruido.partidos[i]!;
			expect(b.pareja1Ref).toEqual(a.pareja1Ref);
			expect(b.pareja2Ref).toEqual(a.pareja2Ref);
			expect(b.ronda).toBe(a.ronda);
			expect(b.posicionEnRonda).toBe(a.posicionEnRonda);
		}
	});

	it('N=10 con byes: round trip preserva bracket exacto', () => {
		const original = armarBracket([
			{ letra: 'A', clasifican: 3 },
			{ letra: 'B', clasifican: 2 },
			{ letra: 'C', clasifican: 3 },
			{ letra: 'D', clasifican: 2 }
		]);
		const slots = slotsDeBracket(original.partidos);
		expect(slots.length).toBe(16);
		expect(slots.filter((r) => r !== null).length).toBe(10);
		const reconstruido = armarBracketDesdeSlots(slots);
		expect(reconstruido.partidos.length).toBe(original.partidos.length);
	});
});

describe('armarBracketDesdeSlots · uso directo', () => {
	function refPos(letra: string, pos: 1 | 2 | 3): ParejaRef {
		return { tipo: 'PosicionZona', letraZona: letra, posicion: pos };
	}

	it('cuadro de 4 sin byes', () => {
		const b = armarBracketDesdeSlots([
			refPos('A', 1),
			refPos('B', 2),
			refPos('A', 2),
			refPos('B', 1)
		]);
		expect(b.cantidadParejas).toBe(4);
		expect(b.cantidadParejasCuadro).toBe(4);
		expect(b.cantidadByes).toBe(0);
		expect(b.partidos.length).toBe(3); // 2 R1 + 1 Final
	});

	it('cuadro de 8 con 3 byes: solo se genera 1 partido R1', () => {
		const b = armarBracketDesdeSlots([
			refPos('A', 1),
			null,
			refPos('B', 1),
			refPos('C', 1),
			refPos('A', 2),
			null,
			refPos('D', 1),
			null
		]);
		expect(b.cantidadParejas).toBe(5);
		expect(b.cantidadByes).toBe(3);
		const r1 = b.partidos.filter((p) => p.ronda === 1);
		expect(r1.length).toBe(1);
		// El partido R1 es entre B1 y C1 (los slots 2,3).
		expect(r1[0]!.pareja1Ref).toEqual(refPos('B', 1));
		expect(r1[0]!.pareja2Ref).toEqual(refPos('C', 1));
	});

	it('cantidad de slots no potencia de 2 → throw', () => {
		expect(() =>
			armarBracketDesdeSlots([refPos('A', 1), refPos('B', 1), refPos('C', 1)])
		).toThrow();
	});

	it('menos de 2 parejas en el cuadro → throw', () => {
		expect(() =>
			armarBracketDesdeSlots([refPos('A', 1), null])
		).toThrow();
	});

	it('par null-null en R1 propaga vacio: el que sube de la otra mitad va directo', () => {
		// Cuadro de 4. Par (0,1) = 2 byes. Par (2,3) = 2 refs reales (P1 R1).
		// R2 (Final): R2.0 = null (de par sin nadie), R2.1 = GanadorP1.
		// → P2 (Final) NO se crea normal: solo Ganador P1 avanza solo.
		const b = armarBracketDesdeSlots([
			null,
			null,
			refPos('A', 1),
			refPos('B', 1)
		]);
		expect(b.cantidadParejas).toBe(2);
		expect(b.cantidadByes).toBe(2);
		// Solo P1 (R1) — la final no se crea porque un slot esta vacio.
		expect(b.partidos.length).toBe(1);
		expect(b.partidos[0]!.ronda).toBe(1);
	});

	it('swap manual: mover 1°A a otra mitad del cuadro', () => {
		// Cuadro de 8 estandar con 5 seeds (snake [1,8,4,5,2,7,3,6]).
		// slots originales: [1A, null, 4=A2, 5=B2, 2=B1, null, 3=C1, null]
		// donde refs son PosicionZona.
		const sA1 = refPos('A', 1);
		const sB1 = refPos('B', 1);
		const sA2 = refPos('A', 2);
		const sB2 = refPos('B', 2);
		const sC1 = refPos('C', 1);

		const slotsOriginal = armarBracketDesdeSlots([
			sA1,
			null,
			sA2,
			sB2,
			sB1,
			null,
			sC1,
			null
		]);
		expect(slotsOriginal.partidos.length).toBe(4); // 1 R1 + 2 R2 + 1 Final

		// Swap slot 0 (1°A) con slot 4 (1°B) → 1°A pasa a la mitad de abajo.
		const editado = armarBracketDesdeSlots([
			sB1,
			null,
			sA2,
			sB2,
			sA1,
			null,
			sC1,
			null
		]);
		expect(editado.cantidadParejas).toBe(5);
		// Misma estructura de cuadro pero cabezas en otra rama.
		expect(editado.partidos.length).toBe(4);

		// Verifico que en R2 el cruce cambio: ahora 1°A se enfrenta con
		// 3°C (estaba 1°B), y 1°B se enfrenta con Ganador R1 (estaba 1°A).
		const r2 = editado.partidos.filter((p) => p.ronda === 2);
		expect(r2.length).toBe(2);
		const labels = r2.map((p) => [p.pareja1Ref, p.pareja2Ref]);
		const tiene1AvC1 = labels.some(
			([a, b]) =>
				(JSON.stringify(a) === JSON.stringify(sA1) && JSON.stringify(b) === JSON.stringify(sC1)) ||
				(JSON.stringify(b) === JSON.stringify(sA1) && JSON.stringify(a) === JSON.stringify(sC1))
		);
		expect(tiene1AvC1).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Play-ins: cuadro expandido con rondas extras antes del cuadro natural
// ---------------------------------------------------------------------------

describe('armarBracketDesdeSlots · play-ins (cuadro expandido)', () => {
	function refPos(letra: string, pos: 1 | 2 | 3): ParejaRef {
		return { tipo: 'PosicionZona', letraZona: letra, posicion: pos };
	}

	it('8 parejas en cuadro de 16 con 1 play-in → fases Play-in 1 / 4tos / Semis / Final', () => {
		// Caso del usuario: 8 parejas reales pero cuadro expandido a 16.
		// A1 tiene doble bye (R1 + R2). D1 y A2 juegan el play-in. D2 espera
		// en R2 (4tos) al ganador del play-in. B1, C2, C1, B2 distribuidos
		// en slots alternados → cada uno sube por bye R1 y se enfrenta en R2.
		const b = armarBracketDesdeSlots([
			refPos('A', 1), // slot 0: A1 (doble bye)
			null,           // slot 1: vacio par-de-A1
			null,           // slot 2: par-vacio
			null,           // slot 3: par-vacio
			refPos('D', 1), // slot 4: D1
			refPos('A', 2), // slot 5: A2 → play-in D1 vs A2
			refPos('D', 2), // slot 6: D2 (espera en R2)
			null,           // slot 7: vacio par-de-D2
			refPos('B', 1), // slot 8: B1 (bye R1)
			null,           // slot 9
			refPos('C', 2), // slot 10: C2 (bye R1) → R2 = B1 vs C2
			null,           // slot 11
			refPos('C', 1), // slot 12: C1 (bye R1)
			null,           // slot 13
			refPos('B', 2), // slot 14: B2 (bye R1) → R2 = C1 vs B2
			null            // slot 15
		]);
		expect(b.cantidadParejas).toBe(8);
		expect(b.cantidadParejasCuadro).toBe(16);

		// Rondas presentes (deduplicadas).
		const fases = new Set(b.partidos.map((p) => p.fase));
		expect(fases.has('Play-in 1')).toBe(true);
		expect(fases.has('4tos')).toBe(true);
		expect(fases.has('Semis')).toBe(true);
		expect(fases.has('Final')).toBe(true);
		expect(fases.has('8vos')).toBe(false); // R1 ya no es 8vos — es play-in.

		// R1 tiene un solo partido (el play-in) — el resto son byes.
		const r1 = b.partidos.filter((p) => p.ronda === 1);
		expect(r1.length).toBe(1);
		expect(r1[0]!.fase).toBe('Play-in 1');

		// R2 tiene 3 partidos (4tos reales: D2 vs G(play-in), B1 vs C2, C1 vs B2).
		const r2 = b.partidos.filter((p) => p.ronda === 2);
		expect(r2.length).toBe(3);
		expect(r2.every((p) => p.fase === '4tos')).toBe(true);

		// R3 = Semis. A1 entra directo (doble bye).
		const r3 = b.partidos.filter((p) => p.ronda === 3);
		expect(r3.length).toBe(2);
		expect(r3.every((p) => p.fase === 'Semis')).toBe(true);

		// R4 = Final.
		const r4 = b.partidos.filter((p) => p.ronda === 4);
		expect(r4.length).toBe(1);
		expect(r4[0]!.fase).toBe('Final');
	});

	it('8 parejas en cuadro de 32 con 2 play-ins → Play-in 2 / Play-in 1 / 4tos / Semis / Final', () => {
		// Cuadro de 32 con solo 8 parejas reales (caso teorico de 2 rondas extras).
		// Las 8 parejas van todas a R3 (que es 4tos natural). En R1 y R2 hay
		// solo play-ins / byes propagados.
		const slots: (ParejaRef | null)[] = new Array(32).fill(null);
		// Distribuyo 8 parejas estilo simetrico para validar fases.
		slots[0] = refPos('A', 1);
		slots[4] = refPos('B', 1);
		slots[8] = refPos('C', 1);
		slots[12] = refPos('D', 1);
		slots[16] = refPos('A', 2);
		slots[20] = refPos('B', 2);
		slots[24] = refPos('C', 2);
		slots[28] = refPos('D', 2);
		const b = armarBracketDesdeSlots(slots);
		expect(b.cantidadParejasCuadro).toBe(32);

		const fases = new Set(b.partidos.map((p) => p.fase));
		// No hay partidos reales en R1 ni R2 (cada par tiene 1 ref + 1 null →
		// la ref sube directo) pero hay partidos en 4tos cuando finalmente
		// dos refs se emparejan.
		expect(fases.has('4tos')).toBe(true);
		expect(fases.has('Semis')).toBe(true);
		expect(fases.has('Final')).toBe(true);
	});

	it('cuadro natural (sin expandir): fases estandar sin play-ins', () => {
		// 8 parejas en cuadro de 8 → no hay play-ins, fases estandar.
		const b = armarBracketDesdeSlots([
			refPos('A', 1),
			refPos('B', 1),
			refPos('A', 2),
			refPos('B', 2),
			refPos('A', 3),
			refPos('C', 1),
			refPos('B', 3),
			refPos('C', 2)
		]);
		const fases = b.partidos.map((p) => p.fase);
		expect(fases).not.toContain('Play-in 1');
		expect(fases).not.toContain('Play-in 2');
		expect(fases.filter((f) => f === '4tos').length).toBe(4);
		expect(fases.filter((f) => f === 'Semis').length).toBe(2);
		expect(fases.filter((f) => f === 'Final').length).toBe(1);
	});

	it('armarBracket (snake clasico) sigue produciendo fases estandar', () => {
		// El path snake no toca el cuadro expandido — verificamos que no
		// se cuelan Play-ins por error.
		const b = armarBracket([
			{ letra: 'A', clasifican: 2 },
			{ letra: 'B', clasifican: 2 },
			{ letra: 'C', clasifican: 2 },
			{ letra: 'D', clasifican: 2 }
		]);
		expect(b.cantidadParejas).toBe(8);
		expect(b.cantidadParejasCuadro).toBe(8);
		const fases = b.partidos.map((p) => p.fase);
		expect(fases).not.toContain('Play-in 1');
		expect(fases.filter((f) => f === '4tos').length).toBe(4);
	});
});
