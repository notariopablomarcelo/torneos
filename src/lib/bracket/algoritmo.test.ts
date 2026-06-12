import { describe, expect, it } from 'vitest';
import {
	armarBracket,
	esPotenciaDe2,
	listarClasificados,
	sembrarSnake,
	siguientePotenciaDe2
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
