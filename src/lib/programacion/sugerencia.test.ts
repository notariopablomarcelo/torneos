import { describe, expect, it } from 'vitest';
import { sugerirProgramacion, STEP_SLOT_MIN, type PartidoParaSugerir } from './sugerencia';
import type { TorneoCancha } from '$lib/types/programacion';
import type { PartidoProgramado } from './algoritmo';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cancha(
	canchaId: string,
	disponibilidad: { fecha: string; desde: string; hasta: string }[]
): TorneoCancha {
	return {
		id: `tc-${canchaId}`,
		torneoId: 't',
		canchaId,
		sedeId: 's',
		disponibilidad,
		creadoEn: '2026-01-01T00:00:00.000Z'
	};
}

let _seqNum = 0;
function zona(id: string, parejas: string[] = [], numeroEnZona?: number): PartidoParaSugerir {
	_seqNum += 1;
	return {
		id,
		categoriaId: 'c1',
		esZona: true,
		numeroEnZona: numeroEnZona ?? _seqNum,
		parejas
	};
}

function bracket(
	id: string,
	ronda: number,
	parejas: string[] = [],
	numeroEnZona?: number
): PartidoParaSugerir {
	_seqNum += 1;
	return {
		id,
		categoriaId: 'c1',
		esZona: false,
		ronda,
		numeroEnZona: numeroEnZona ?? _seqNum,
		parejas
	};
}

// ===========================================================================
// Casos basicos
// ===========================================================================

describe('sugerirProgramacion · basicos', () => {
	it('1 cancha, dia 09:00-22:00, 4 partidos: asigna a 09:00, 10:30, 12:00, 13:30', () => {
		const canchas = [cancha('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }])];
		const partidos = [zona('p1'), zona('p2'), zona('p3'), zona('p4')];
		const r = sugerirProgramacion({
			partidosSinProgramar: partidos,
			partidosYaProgramados: [],
			canchasTorneo: canchas
		});
		expect(r.sinProgramar).toEqual([]);
		expect(r.asignaciones.map((a) => a.programacion.hora)).toEqual([
			'09:00',
			'10:30',
			'12:00',
			'13:30'
		]);
		expect(r.asignaciones.every((a) => a.programacion.fecha === '2026-09-18')).toBe(true);
		expect(r.asignaciones.every((a) => a.programacion.canchaId === 'c1')).toBe(true);
	});

	it('2 canchas, 2 partidos: paraleliza a misma hora', () => {
		const canchas = [
			cancha('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }]),
			cancha('c2', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }])
		];
		const r = sugerirProgramacion({
			partidosSinProgramar: [zona('p1'), zona('p2')],
			partidosYaProgramados: [],
			canchasTorneo: canchas
		});
		expect(r.sinProgramar).toEqual([]);
		expect(r.asignaciones).toHaveLength(2);
		// Mismo horario, distintas canchas.
		expect(r.asignaciones[0]?.programacion.hora).toBe('09:00');
		expect(r.asignaciones[1]?.programacion.hora).toBe('09:00');
		const canchasUsadas = r.asignaciones.map((a) => a.programacion.canchaId).sort();
		expect(canchasUsadas).toEqual(['c1', 'c2']);
	});

	it('cancha con disponibilidad muy chica (un solo slot) + 2 partidos: 1 asignado, 1 sin programar', () => {
		// Solo entran 90 min exactos.
		const canchas = [cancha('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '10:30' }])];
		const r = sugerirProgramacion({
			partidosSinProgramar: [zona('p1'), zona('p2')],
			partidosYaProgramados: [],
			canchasTorneo: canchas
		});
		expect(r.asignaciones).toHaveLength(1);
		expect(r.asignaciones[0]?.programacion.hora).toBe('09:00');
		expect(r.sinProgramar).toEqual(['p2']);
	});

	it('sin canchas: todos sin programar', () => {
		const r = sugerirProgramacion({
			partidosSinProgramar: [zona('p1'), zona('p2')],
			partidosYaProgramados: [],
			canchasTorneo: []
		});
		expect(r.asignaciones).toEqual([]);
		expect(r.sinProgramar).toEqual(['p1', 'p2']);
	});

	it('sin partidos: resultado vacio', () => {
		const canchas = [cancha('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }])];
		const r = sugerirProgramacion({
			partidosSinProgramar: [],
			partidosYaProgramados: [],
			canchasTorneo: canchas
		});
		expect(r.asignaciones).toEqual([]);
		expect(r.sinProgramar).toEqual([]);
	});
});

// ===========================================================================
// Respeto de partidos ya programados
// ===========================================================================

describe('sugerirProgramacion · respeta lo ya programado', () => {
	it('un partido ya programado a las 10:30 deja libre el slot 09:00', () => {
		// pX ocupa 10:30-12:00. El slot 09:00 (que termina a 10:30) no solapa.
		const canchas = [cancha('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }])];
		const yaProgramado: PartidoProgramado[] = [
			{
				id: 'pX',
				programacion: { fecha: '2026-09-18', hora: '10:30', canchaId: 'c1' },
				label: 'pX'
			}
		];
		const r = sugerirProgramacion({
			partidosSinProgramar: [zona('p1')],
			partidosYaProgramados: yaProgramado,
			canchasTorneo: canchas
		});
		expect(r.asignaciones).toHaveLength(1);
		expect(r.asignaciones[0]?.programacion.hora).toBe('09:00');
	});

	it('un partido programado a las 10:00 obliga a que el siguiente arranque a 11:30', () => {
		// pX ocupa 10:00-11:30. p1 no entra a 09:00 (termina 10:30 = solapa con
		// pX que arranca a 10:00). El primer slot valido es 11:30.
		const canchas = [cancha('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }])];
		const r = sugerirProgramacion({
			partidosSinProgramar: [zona('p1'), zona('p2')],
			partidosYaProgramados: [
				{
					id: 'pX',
					programacion: { fecha: '2026-09-18', hora: '10:00', canchaId: 'c1' },
					label: 'pX'
				}
			],
			canchasTorneo: canchas
		});
		const horas = r.asignaciones.map((a) => a.programacion.hora).sort();
		expect(horas).toEqual(['11:30', '13:00']);
	});
});

// ===========================================================================
// Orden por prioridad: zonas primero, despues bracket por ronda
// ===========================================================================

describe('sugerirProgramacion · prioriza zonas y rondas tempranas', () => {
	it('partidos de zona se programan ANTES que los del bracket', () => {
		const canchas = [cancha('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '13:30' }])];
		// Solo entran 3 partidos (09:00, 10:30, 12:00).
		// Lista de entrada con bracket primero, zona despues — el algoritmo
		// debe reordenar.
		const partidos = [
			bracket('pBr1', 3),
			bracket('pBr2', 2),
			zona('pZ1'),
			zona('pZ2')
		];
		const r = sugerirProgramacion({
			partidosSinProgramar: partidos,
			partidosYaProgramados: [],
			canchasTorneo: canchas
		});
		// Las zonas (Z1, Z2) van primero por prioridad. Despues bracket por
		// ronda ascendente. Cabe uno mas (el de ronda 2).
		expect(r.asignaciones.map((a) => a.partidoId)).toEqual(['pZ1', 'pZ2', 'pBr2']);
		expect(r.sinProgramar).toEqual(['pBr1']);
	});

	it('dentro de bracket, ronda menor va primero', () => {
		const canchas = [cancha('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '12:00' }])];
		// Caben 2 partidos. Tengo 3 de bracket con rondas distintas.
		const partidos = [bracket('pR3', 3), bracket('pR1', 1), bracket('pR2', 2)];
		const r = sugerirProgramacion({
			partidosSinProgramar: partidos,
			partidosYaProgramados: [],
			canchasTorneo: canchas
		});
		// R1 va primero, despues R2. R3 no entra.
		expect(r.asignaciones.map((a) => a.partidoId)).toEqual(['pR1', 'pR2']);
		expect(r.sinProgramar).toEqual(['pR3']);
	});
});

// ===========================================================================
// Multi-dia
// ===========================================================================

describe('sugerirProgramacion · multi-dia', () => {
	it('llena dia 1 primero antes de pasar al dia 2', () => {
		const canchas = [
			cancha('c1', [
				{ fecha: '2026-09-18', desde: '09:00', hasta: '12:00' }, // 2 slots
				{ fecha: '2026-09-19', desde: '09:00', hasta: '22:00' }
			])
		];
		const r = sugerirProgramacion({
			partidosSinProgramar: [zona('p1'), zona('p2'), zona('p3')],
			partidosYaProgramados: [],
			canchasTorneo: canchas
		});
		const fechas = r.asignaciones.map((a) => a.programacion.fecha);
		// Los primeros 2 caen en dia 18, el 3ro pasa al 19.
		expect(fechas).toEqual(['2026-09-18', '2026-09-18', '2026-09-19']);
	});
});

// ===========================================================================
// Detalles del slot
// ===========================================================================

describe('sugerirProgramacion · choque de parejas', () => {
	it('una misma pareja en dos partidos NO se programa solapada (otra cancha)', () => {
		// Zona RR de 3: parejas A,B,C. Partidos: P1=AB, P2=AC, P3=BC.
		// 2 canchas, 1 dia, mucho horario.
		const canchas = [
			cancha('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }]),
			cancha('c2', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }])
		];
		const partidos = [
			zona('P1', ['A', 'B']),
			zona('P2', ['A', 'C']),
			zona('P3', ['B', 'C'])
		];
		const r = sugerirProgramacion({
			partidosSinProgramar: partidos,
			partidosYaProgramados: [],
			canchasTorneo: canchas
		});
		expect(r.sinProgramar).toEqual([]);
		// Para cada par de partidos que comparten pareja, NO deben estar
		// solapados.
		const asigPorId = new Map(
			r.asignaciones.map((a) => [a.partidoId, a.programacion])
		);
		const parejasPorId: Record<string, string[]> = {
			P1: ['A', 'B'],
			P2: ['A', 'C'],
			P3: ['B', 'C']
		};
		const ids = ['P1', 'P2', 'P3'];
		for (let i = 0; i < ids.length; i++) {
			for (let j = i + 1; j < ids.length; j++) {
				const a = asigPorId.get(ids[i]!)!;
				const b = asigPorId.get(ids[j]!)!;
				const comparten = parejasPorId[ids[i]!]!.some((id) =>
					parejasPorId[ids[j]!]!.includes(id)
				);
				if (!comparten || a.fecha !== b.fecha) continue;
				const [hA, mA] = a.hora.split(':').map(Number);
				const [hB, mB] = b.hora.split(':').map(Number);
				const minA = (hA ?? 0) * 60 + (mA ?? 0);
				const minB = (hB ?? 0) * 60 + (mB ?? 0);
				// Asumimos duracion 90.
				const solapan = minA < minB + 90 && minB < minA + 90;
				expect(solapan).toBe(false);
			}
		}
	});
});

describe('sugerirProgramacion · granularidad', () => {
	it('el step de slots es de 15 minutos', () => {
		// Disponibilidad arranca a las 09:00. Bloqueamos 09:00-10:30. El siguiente
		// slot valido para empezar es 10:30 (no 11:00) porque salta cada 15 min.
		const canchas = [cancha('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }])];
		const r = sugerirProgramacion({
			partidosSinProgramar: [zona('p1')],
			partidosYaProgramados: [
				{
					id: 'pX',
					programacion: { fecha: '2026-09-18', hora: '09:00', canchaId: 'c1' },
					label: 'pX'
				}
			],
			canchasTorneo: canchas
		});
		expect(r.asignaciones[0]?.programacion.hora).toBe('10:30');
	});

	it('STEP_SLOT_MIN es 15 (constante exportada)', () => {
		expect(STEP_SLOT_MIN).toBe(15);
	});
});

describe('sugerirProgramacion · dependencia padre→hijo en bracket', () => {
	it('semifinal no puede ir antes de cuartos (mismo dia)', () => {
		_seqNum = 0;
		// Cancha grande para que haya muchos slots disponibles.
		const canchas = [
			cancha('c1', [
				{ fecha: '2026-09-18', desde: '08:00', hasta: '20:00' }
			])
		];
		// Cuartos: P1, P2. Semi: P3 = Ganador P1 vs Ganador P2.
		const partidos: PartidoParaSugerir[] = [
			{ id: 'p1', categoriaId: 'c', esZona: false, ronda: 1, numeroEnZona: 1, parejas: [] },
			{ id: 'p2', categoriaId: 'c', esZona: false, ronda: 1, numeroEnZona: 2, parejas: [] },
			{
				id: 'p3',
				categoriaId: 'c',
				esZona: false,
				ronda: 2,
				numeroEnZona: 3,
				parejas: [],
				partidosPadre: ['p1', 'p2']
			}
		];
		const r = sugerirProgramacion({
			partidosSinProgramar: partidos,
			partidosYaProgramados: [],
			canchasTorneo: canchas
		});
		// P1 y P2 deberian asignarse temprano. P3 debe ir DESPUES de
		// ambos + 90 min descanso.
		const p1 = r.asignaciones.find((a) => a.partidoId === 'p1');
		const p2 = r.asignaciones.find((a) => a.partidoId === 'p2');
		const p3 = r.asignaciones.find((a) => a.partidoId === 'p3');
		expect(p1).toBeDefined();
		expect(p2).toBeDefined();
		expect(p3).toBeDefined();
		// P3 fin minimo = max(P1.fin, P2.fin) + 90.
		function aMin(h: string): number {
			const [hh, mm] = h.split(':').map(Number);
			return hh! * 60 + mm!;
		}
		const finP1 = aMin(p1!.programacion.hora) + 90;
		const finP2 = aMin(p2!.programacion.hora) + 90;
		const inicioP3 = aMin(p3!.programacion.hora);
		expect(inicioP3).toBeGreaterThanOrEqual(Math.max(finP1, finP2) + 90);
	});

	it('final no se asigna antes de que las semis tengan horario', () => {
		_seqNum = 0;
		const canchas = [
			cancha('c1', [
				{ fecha: '2026-09-18', desde: '08:00', hasta: '20:00' }
			]),
			cancha('c2', [
				{ fecha: '2026-09-18', desde: '08:00', hasta: '20:00' }
			])
		];
		// Final P3 depende de S1, S2. NO incluimos S1, S2 en sinProgramar
		// ni en yaProgramados → final debe quedar en sinProgramar (no en
		// algun slot temprano sin respetar dependencia).
		const partidos: PartidoParaSugerir[] = [
			{
				id: 'final',
				categoriaId: 'c',
				esZona: false,
				ronda: 5,
				numeroEnZona: 17,
				parejas: [],
				partidosPadre: ['s1', 's2']
			}
		];
		const r = sugerirProgramacion({
			partidosSinProgramar: partidos,
			partidosYaProgramados: [],
			canchasTorneo: canchas
		});
		expect(r.asignaciones).toHaveLength(0);
		expect(r.sinProgramar).toEqual(['final']);
	});

	it('hijo dia 2 con padres dia 1 se asigna desde el inicio del dia 2', () => {
		// Padres dia 1 a las 18:00 (finalizan 19:30). El dia 2 empieza
		// 08:00, claramente despues del cierre del dia 1 → el descanso
		// esta sobradamente cubierto.
		_seqNum = 0;
		const canchas = [
			cancha('c1', [
				{ fecha: '2026-09-18', desde: '08:00', hasta: '20:00' },
				{ fecha: '2026-09-19', desde: '08:00', hasta: '20:00' }
			])
		];
		const ya: PartidoProgramado[] = [
			{
				id: 's1',
				programacion: { fecha: '2026-09-18', hora: '18:00', canchaId: 'c1' },
				label: 'S1',
				parejas: []
			},
			{
				id: 's2',
				programacion: { fecha: '2026-09-18', hora: '18:00', canchaId: 'c1' },
				label: 'S2',
				parejas: []
			}
		];
		const partidos: PartidoParaSugerir[] = [
			{
				id: 'final',
				categoriaId: 'c',
				esZona: false,
				ronda: 5,
				numeroEnZona: 17,
				parejas: [],
				partidosPadre: ['s1', 's2']
			}
		];
		const r = sugerirProgramacion({
			partidosSinProgramar: partidos,
			partidosYaProgramados: ya,
			canchasTorneo: canchas
		});
		const f = r.asignaciones.find((a) => a.partidoId === 'final');
		expect(f).toBeDefined();
		expect(f!.programacion.fecha).toBe('2026-09-19');
	});

	it('hijo en dia anterior al padre es rechazado', () => {
		_seqNum = 0;
		const canchas = [
			cancha('c1', [
				{ fecha: '2026-09-18', desde: '08:00', hasta: '20:00' },
				{ fecha: '2026-09-19', desde: '08:00', hasta: '20:00' }
			])
		];
		const ya: PartidoProgramado[] = [
			{
				id: 's1',
				programacion: { fecha: '2026-09-19', hora: '10:00', canchaId: 'c1' },
				label: 'S1',
				parejas: []
			},
			{
				id: 's2',
				programacion: { fecha: '2026-09-19', hora: '10:00', canchaId: 'c1' },
				label: 'S2',
				parejas: []
			}
		];
		const partidos: PartidoParaSugerir[] = [
			{
				id: 'final',
				categoriaId: 'c',
				esZona: false,
				ronda: 5,
				numeroEnZona: 17,
				parejas: [],
				partidosPadre: ['s1', 's2']
			}
		];
		const r = sugerirProgramacion({
			partidosSinProgramar: partidos,
			partidosYaProgramados: ya,
			canchasTorneo: canchas
		});
		// Final no puede ir el dia 18 (antes que padres) ni el 19 antes
		// de las 11:30 + 90 = 13:00.
		const f = r.asignaciones.find((a) => a.partidoId === 'final');
		expect(f).toBeDefined();
		expect(f!.programacion.fecha).toBe('2026-09-19');
		function aMin(h: string): number {
			const [hh, mm] = h.split(':').map(Number);
			return hh! * 60 + mm!;
		}
		expect(aMin(f!.programacion.hora)).toBeGreaterThanOrEqual(13 * 60);
	});
});
