import { describe, expect, it } from 'vitest';
import {
	calcularTablaPosiciones,
	estadoZona,
	ganadorDePartido,
	ganadorInferido,
	perdedorDePartido,
	resolverParejaRef
} from './resultados';
import type { Partido, ResultadoPartido, Zona } from '$lib/types/armado';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function zona(letra: string, ids: string[], tamano: 3 | 4 = 3): Zona {
	return {
		id: `zona-${letra}`,
		categoriaId: 'cat-X',
		letra,
		tamano,
		modalidad: 'todosContraTodos',
		clasifican: 2,
		inscripcionIds: ids,
		creadoEn: '2026-01-01T00:00:00.000Z'
	};
}

let _seq = 0;
function partido(
	zonaId: string,
	numeroEnZona: number,
	pareja1: string | { tipo: 'GanadorPartido' | 'PerdedorPartido'; numeroEnZona: number },
	pareja2: string | { tipo: 'GanadorPartido' | 'PerdedorPartido'; numeroEnZona: number },
	resultado: ResultadoPartido | null = null
): Partido {
	_seq += 1;
	const ref = (x: typeof pareja1) =>
		typeof x === 'string'
			? ({ tipo: 'Inscripcion' as const, inscripcionId: x })
			: x;
	return {
		id: `p-${_seq}`,
		categoriaId: 'cat-X',
		zonaId,
		fase: 'Zona',
		numeroEnZona,
		pareja1Ref: ref(pareja1),
		pareja2Ref: ref(pareja2),
		resultado,
		estado: resultado ? 'Jugado' : 'Pendiente',
		creadoEn: '2026-01-01T00:00:00.000Z'
	};
}

function resultado(
	sets: Array<[number, number]>,
	ganadorEs: 1 | 2,
	motivo: 'normal' | 'WO' | 'abandono' = 'normal'
): ResultadoPartido {
	return {
		sets: sets.map(([p1, p2]) => ({ p1, p2 })),
		ganadorEs,
		motivo
	};
}

// ===========================================================================
// resolverParejaRef
// ===========================================================================

describe('resolverParejaRef', () => {
	it('ref directa devuelve el id', () => {
		const r = resolverParejaRef({ tipo: 'Inscripcion', inscripcionId: 'A' }, []);
		expect(r).toBe('A');
	});

	it('GanadorPartido sin resultado devuelve null', () => {
		const p1 = partido('Z', 1, 'A', 'B');
		const r = resolverParejaRef({ tipo: 'GanadorPartido', numeroEnZona: 1 }, [p1]);
		expect(r).toBeNull();
	});

	it('GanadorPartido con resultado resuelve al ganador', () => {
		const p1 = partido('Z', 1, 'A', 'B', resultado([[6, 2], [6, 3]], 1));
		const r = resolverParejaRef({ tipo: 'GanadorPartido', numeroEnZona: 1 }, [p1]);
		expect(r).toBe('A');
	});

	it('PerdedorPartido con resultado resuelve al perdedor', () => {
		const p1 = partido('Z', 1, 'A', 'B', resultado([[6, 2], [6, 3]], 1));
		const r = resolverParejaRef({ tipo: 'PerdedorPartido', numeroEnZona: 1 }, [p1]);
		expect(r).toBe('B');
	});

	it('refs anidadas (ganador de partido cuyo ref es a su vez simbolico)', () => {
		// Esto no ocurre en zona pero verificamos la recursion.
		const p1 = partido('Z', 1, 'A', 'B', resultado([[6, 2]], 1));
		const p2 = partido(
			'Z',
			2,
			{ tipo: 'GanadorPartido', numeroEnZona: 1 },
			'C',
			resultado([[6, 4]], 1)
		);
		const r = resolverParejaRef({ tipo: 'GanadorPartido', numeroEnZona: 2 }, [p1, p2]);
		expect(r).toBe('A');
	});
});

// ===========================================================================
// ganadorDePartido / perdedorDePartido
// ===========================================================================

describe('ganador/perdedor DePartido', () => {
	it('partido pendiente devuelve null', () => {
		const p = partido('Z', 1, 'A', 'B');
		expect(ganadorDePartido(p, [p])).toBeNull();
		expect(perdedorDePartido(p, [p])).toBeNull();
	});

	it('partido jugado devuelve ganador y perdedor', () => {
		const p = partido('Z', 1, 'A', 'B', resultado([[6, 2]], 1));
		expect(ganadorDePartido(p, [p])).toBe('A');
		expect(perdedorDePartido(p, [p])).toBe('B');
	});

	it('cuando gana la 2 invierte ganador y perdedor', () => {
		const p = partido('Z', 1, 'A', 'B', resultado([[2, 6]], 2));
		expect(ganadorDePartido(p, [p])).toBe('B');
		expect(perdedorDePartido(p, [p])).toBe('A');
	});
});

// ===========================================================================
// calcularTablaPosiciones — zona de 3 RR
// ===========================================================================

describe('calcularTablaPosiciones · zona 3 RR', () => {
	it('zona sin resultados: todos 0, orden interno', () => {
		const z = zona('A', ['A', 'B', 'C']);
		const tabla = calcularTablaPosiciones(z, []);
		expect(tabla.map((f) => f.inscripcionId)).toEqual(['A', 'B', 'C']);
		expect(tabla.every((f) => f.pj === 0 && f.pg === 0)).toBe(true);
	});

	it('un solo partido jugado: ganador y perdedor cuentan, tercero sigue en 0', () => {
		const z = zona('A', ['A', 'B', 'C']);
		const p1 = partido(z.id, 1, 'A', 'B', resultado([[6, 2], [6, 3]], 1));
		const tabla = calcularTablaPosiciones(z, [p1]);
		const filaA = tabla.find((f) => f.inscripcionId === 'A')!;
		const filaB = tabla.find((f) => f.inscripcionId === 'B')!;
		const filaC = tabla.find((f) => f.inscripcionId === 'C')!;
		expect(filaA.pg).toBe(1);
		expect(filaA.pp).toBe(0);
		expect(filaA.sf).toBe(2);
		expect(filaA.sc).toBe(0);
		expect(filaA.gf).toBe(12);
		expect(filaA.gc).toBe(5);
		expect(filaB.pg).toBe(0);
		expect(filaB.pp).toBe(1);
		expect(filaB.sf).toBe(0);
		expect(filaB.sc).toBe(2);
		expect(filaC.pj).toBe(0);
	});

	it('zona completa: A gana ambos, B gana a C — orden A, B, C', () => {
		const z = zona('A', ['A', 'B', 'C']);
		const p1 = partido(z.id, 1, 'A', 'B', resultado([[6, 2], [6, 3]], 1));
		const p2 = partido(z.id, 2, 'A', 'C', resultado([[6, 1], [6, 0]], 1));
		const p3 = partido(z.id, 3, 'B', 'C', resultado([[6, 4], [6, 4]], 1));
		const tabla = calcularTablaPosiciones(z, [p1, p2, p3]);
		expect(tabla.map((f) => f.inscripcionId)).toEqual(['A', 'B', 'C']);
		expect(tabla[0].pg).toBe(2);
		expect(tabla[1].pg).toBe(1);
		expect(tabla[2].pg).toBe(0);
	});

	it('empate en PG se desempata por diferencia de sets', () => {
		// A gana a B 2-0; B gana a C 2-0; C gana a A 2-1.
		// PG: todos 1. Sets: A=3-2, B=2-2, C=2-3.
		// difSets: A=+1, B=0, C=-1.
		const z = zona('A', ['A', 'B', 'C']);
		const p1 = partido(z.id, 1, 'A', 'B', resultado([[6, 2], [6, 3]], 1));
		const p2 = partido(z.id, 2, 'A', 'C', resultado([[6, 1], [2, 6], [3, 6]], 2));
		const p3 = partido(z.id, 3, 'B', 'C', resultado([[6, 4], [6, 4]], 1));
		const tabla = calcularTablaPosiciones(z, [p1, p2, p3]);
		expect(tabla[0].inscripcionId).toBe('A');
		expect(tabla[1].inscripcionId).toBe('B');
		expect(tabla[2].inscripcionId).toBe('C');
	});

	it('empate en PG y sets, desempata por diferencia de games', () => {
		// Construido para que todos terminen 1-1 en PG y 2-2 en sets, y solo
		// difGames decida.
		const z = zona('A', ['A', 'B', 'C']);
		const p1 = partido(z.id, 1, 'A', 'B', resultado([[6, 0], [0, 6], [6, 0]], 1));
		const p2 = partido(z.id, 2, 'B', 'C', resultado([[6, 0], [0, 6], [6, 0]], 1));
		const p3 = partido(z.id, 3, 'C', 'A', resultado([[6, 0], [0, 6], [6, 0]], 1));
		const tabla = calcularTablaPosiciones(z, [p1, p2, p3]);
		// Todos PG=1, difSets=0. difGames=0 todos.
		// Cae al desempate por posicionInicial.
		expect(tabla.map((f) => f.inscripcionId)).toEqual(['A', 'B', 'C']);
	});
});

// ===========================================================================
// calcularTablaPosiciones · zona 4 RR
// ===========================================================================

describe('calcularTablaPosiciones · zona 4 RR', () => {
	it('zona completa con un dominador claro', () => {
		const z = zona('A', ['A', 'B', 'C', 'D'], 4);
		// A gana a todos. Entre B, C, D: B>C, C>D, B>D.
		const partidos = [
			partido(z.id, 1, 'A', 'B', resultado([[6, 2], [6, 3]], 1)),
			partido(z.id, 2, 'A', 'C', resultado([[6, 1], [6, 0]], 1)),
			partido(z.id, 3, 'A', 'D', resultado([[6, 0], [6, 0]], 1)),
			partido(z.id, 4, 'B', 'C', resultado([[6, 4], [6, 4]], 1)),
			partido(z.id, 5, 'B', 'D', resultado([[6, 3], [6, 3]], 1)),
			partido(z.id, 6, 'C', 'D', resultado([[6, 4], [6, 4]], 1))
		];
		const tabla = calcularTablaPosiciones(z, partidos);
		expect(tabla.map((f) => f.inscripcionId)).toEqual(['A', 'B', 'C', 'D']);
		expect(tabla[0].pg).toBe(3);
		expect(tabla[3].pg).toBe(0);
	});
});

// ===========================================================================
// calcularTablaPosiciones · zona 4 DO con refs simbolicas
// ===========================================================================

describe('calcularTablaPosiciones · zona 4 DO', () => {
	it('partidos 3 y 4 con refs simbolicas se computan tras resolver', () => {
		const z = zona('A', ['A', 'B', 'C', 'D'], 4);
		// Cruces iniciales 1v4 y 2v3.
		const p1 = partido(z.id, 1, 'A', 'D', resultado([[6, 0], [6, 0]], 1)); // A gana
		const p2 = partido(z.id, 2, 'B', 'C', resultado([[6, 4], [6, 4]], 1)); // B gana
		// Ganadores: A vs B.
		const p3 = partido(
			z.id,
			3,
			{ tipo: 'GanadorPartido', numeroEnZona: 1 }, // A
			{ tipo: 'GanadorPartido', numeroEnZona: 2 }, // B
			resultado([[6, 3], [6, 2]], 1) // A gana
		);
		// Perdedores: D vs C.
		const p4 = partido(
			z.id,
			4,
			{ tipo: 'PerdedorPartido', numeroEnZona: 1 }, // D
			{ tipo: 'PerdedorPartido', numeroEnZona: 2 }, // C
			resultado([[6, 2], [6, 2]], 2) // C gana
		);
		const tabla = calcularTablaPosiciones(z, [p1, p2, p3, p4]);
		// A: gano 2 (p1 y p3).
		// B: gano 1 (p2).
		// C: gano 1 (p4).
		// D: gano 0.
		expect(tabla[0].inscripcionId).toBe('A');
		expect(tabla[0].pg).toBe(2);
		// Despues B y C empatan en PG=1, desempate por dif sets / games / posicionInicial.
		expect(tabla[3].inscripcionId).toBe('D');
	});
});

// ===========================================================================
// W.O. y abandono
// ===========================================================================

describe('W.O. y abandono', () => {
	it('W.O. cuenta PG/PP sin afectar sets/games', () => {
		const z = zona('A', ['A', 'B', 'C']);
		const p1 = partido(z.id, 1, 'A', 'B', resultado([], 1, 'WO'));
		const tabla = calcularTablaPosiciones(z, [p1]);
		const filaA = tabla.find((f) => f.inscripcionId === 'A')!;
		const filaB = tabla.find((f) => f.inscripcionId === 'B')!;
		expect(filaA.pg).toBe(1);
		expect(filaA.sf).toBe(0);
		expect(filaA.gf).toBe(0);
		expect(filaB.pp).toBe(1);
		expect(filaB.sc).toBe(0);
	});

	it('abandono se cuenta como partido normal (sets jugados antes del abandono cuentan)', () => {
		const z = zona('A', ['A', 'B', 'C']);
		const p1 = partido(z.id, 1, 'A', 'B', resultado([[6, 2], [3, 3]], 1, 'abandono'));
		const tabla = calcularTablaPosiciones(z, [p1]);
		const filaA = tabla.find((f) => f.inscripcionId === 'A')!;
		expect(filaA.pg).toBe(1);
		expect(filaA.sf).toBe(1); // solo el primer set termino con ganador
		expect(filaA.gf).toBe(9);
	});
});

// ===========================================================================
// estadoZona
// ===========================================================================

describe('estadoZona', () => {
	it('zona sin partidos: Pendiente', () => {
		const z = zona('A', ['A', 'B', 'C']);
		expect(estadoZona(z, [])).toBe('Pendiente');
	});

	it('zona con partidos sin resultados: Pendiente', () => {
		const z = zona('A', ['A', 'B', 'C']);
		const p1 = partido(z.id, 1, 'A', 'B');
		expect(estadoZona(z, [p1])).toBe('Pendiente');
	});

	it('zona con algunos partidos jugados: EnCurso', () => {
		const z = zona('A', ['A', 'B', 'C']);
		const p1 = partido(z.id, 1, 'A', 'B', resultado([[6, 2]], 1));
		const p2 = partido(z.id, 2, 'A', 'C');
		expect(estadoZona(z, [p1, p2])).toBe('EnCurso');
	});

	it('zona con todos los partidos jugados: Finalizada', () => {
		const z = zona('A', ['A', 'B', 'C']);
		const partidos = [
			partido(z.id, 1, 'A', 'B', resultado([[6, 2]], 1)),
			partido(z.id, 2, 'A', 'C', resultado([[6, 2]], 1)),
			partido(z.id, 3, 'B', 'C', resultado([[6, 2]], 1))
		];
		expect(estadoZona(z, partidos)).toBe('Finalizada');
	});

	it('ignora partidos de otra zona', () => {
		const z = zona('A', ['A', 'B']);
		const otroZona = partido('zona-B', 1, 'X', 'Y', resultado([[6, 2]], 1));
		expect(estadoZona(z, [otroZona])).toBe('Pendiente');
	});
});

// ===========================================================================
// ganadorInferido
// ===========================================================================

describe('ganadorInferido', () => {
	it('pareja 1 gana al mejor de 3', () => {
		expect(ganadorInferido([{ p1: 6, p2: 2 }, { p1: 6, p2: 3 }])).toBe(1);
	});

	it('pareja 2 gana al mejor de 3', () => {
		expect(ganadorInferido([{ p1: 6, p2: 4 }, { p1: 3, p2: 6 }, { p1: 4, p2: 6 }])).toBe(2);
	});

	it('empate de sets retorna null (no se puede inferir)', () => {
		expect(ganadorInferido([{ p1: 6, p2: 4 }, { p1: 3, p2: 6 }])).toBeNull();
	});

	it('sin sets retorna null', () => {
		expect(ganadorInferido([])).toBeNull();
	});
});
