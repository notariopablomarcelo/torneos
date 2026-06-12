import { describe, expect, it } from 'vitest';
import {
	DURACION_PARTIDO_MIN,
	horaAMinutos,
	horaFinAMinutos,
	inscripcionesDePartido,
	mensajeConflicto,
	minutosAHora,
	validarProgramacion,
	validarProgramacionCancha,
	type PartidoProgramado
} from './algoritmo';
import type { ProgramacionPartido } from '$lib/types/armado';
import type { TorneoCancha } from '$lib/types/programacion';

// ---------------------------------------------------------------------------
// Helpers para los tests
// ---------------------------------------------------------------------------

function canchaTorneo(
	canchaId: string,
	disponibilidad: { fecha: string; desde: string; hasta: string }[]
): TorneoCancha {
	return {
		id: 'tc-1',
		torneoId: 't',
		canchaId,
		sedeId: 's',
		disponibilidad,
		creadoEn: '2026-01-01T00:00:00.000Z'
	};
}

function programado(
	id: string,
	canchaId: string,
	fecha: string,
	hora: string
): PartidoProgramado {
	return {
		id,
		programacion: { canchaId, fecha, hora },
		label: `Partido ${id}`
	};
}

// ===========================================================================
// horaAMinutos / minutosAHora
// ===========================================================================

describe('horaAMinutos', () => {
	it('convierte HH:mm a minutos', () => {
		expect(horaAMinutos('00:00')).toBe(0);
		expect(horaAMinutos('09:30')).toBe(570);
		expect(horaAMinutos('22:45')).toBe(22 * 60 + 45);
	});
});

describe('horaFinAMinutos', () => {
	it("trata '00:00' como medianoche (24:00 = 1440 min)", () => {
		expect(horaFinAMinutos('00:00')).toBe(1440);
	});
	it('coincide con horaAMinutos para otros valores', () => {
		expect(horaFinAMinutos('22:00')).toBe(22 * 60);
		expect(horaFinAMinutos('08:30')).toBe(8 * 60 + 30);
	});
});

describe('validarProgramacionCancha · medianoche (hasta=00:00)', () => {
	it("acepta un partido a las 22:30 cuando el rango cierra a 00:00", () => {
		const tc = canchaTorneo('c1', [
			{ fecha: '2026-01-01', desde: '08:00', hasta: '00:00' }
		]);
		const errores = validarProgramacionCancha(
			{ fecha: '2026-01-01', hora: '22:30', canchaId: 'c1' },
			'p1',
			[],
			tc
		);
		expect(errores).toEqual([]);
	});

	it("rechaza un partido a las 23:00 cuando el rango cierra a 00:00 (no entran 90 min)", () => {
		const tc = canchaTorneo('c1', [
			{ fecha: '2026-01-01', desde: '08:00', hasta: '00:00' }
		]);
		const errores = validarProgramacionCancha(
			{ fecha: '2026-01-01', hora: '23:00', canchaId: 'c1' },
			'p1',
			[],
			tc
		);
		expect(errores).toEqual([
			{ tipo: 'fueraDeDisponibilidad', rangosDisponibles: '08:00–00:00' }
		]);
	});
});

describe('minutosAHora', () => {
	it('convierte minutos a HH:mm', () => {
		expect(minutosAHora(0)).toBe('00:00');
		expect(minutosAHora(570)).toBe('09:30');
		expect(minutosAHora(22 * 60 + 45)).toBe('22:45');
	});
});

// ===========================================================================
// validarProgramacionCancha
// ===========================================================================

describe('validarProgramacionCancha · cancha y disponibilidad', () => {
	it('cancha valida + horario dentro del rango → sin conflictos', () => {
		const tc = canchaTorneo('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }]);
		const propuesta: ProgramacionPartido = {
			fecha: '2026-09-18',
			hora: '10:00',
			canchaId: 'c1'
		};
		expect(validarProgramacionCancha(propuesta, 'pX', [], tc)).toEqual([]);
	});

	it('cancha distinta a la del TorneoCancha → canchaNoEnTorneo', () => {
		const tc = canchaTorneo('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }]);
		const propuesta: ProgramacionPartido = {
			fecha: '2026-09-18',
			hora: '10:00',
			canchaId: 'cZ' // otra cancha
		};
		const errores = validarProgramacionCancha(propuesta, 'pX', [], tc);
		expect(errores).toEqual([{ tipo: 'canchaNoEnTorneo' }]);
	});

	it('canchaTorneo null → canchaNoEnTorneo', () => {
		const propuesta: ProgramacionPartido = {
			fecha: '2026-09-18',
			hora: '10:00',
			canchaId: 'c1'
		};
		const errores = validarProgramacionCancha(propuesta, 'pX', [], null);
		expect(errores).toEqual([{ tipo: 'canchaNoEnTorneo' }]);
	});

	it('fecha sin disponibilidad → sinDisponibilidadEseDia', () => {
		const tc = canchaTorneo('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }]);
		const propuesta: ProgramacionPartido = {
			fecha: '2026-09-19', // dia no listado
			hora: '10:00',
			canchaId: 'c1'
		};
		const errores = validarProgramacionCancha(propuesta, 'pX', [], tc);
		expect(errores).toEqual([{ tipo: 'sinDisponibilidadEseDia' }]);
	});

	it('partido empieza antes de la apertura → fueraDeDisponibilidad', () => {
		const tc = canchaTorneo('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }]);
		const propuesta: ProgramacionPartido = {
			fecha: '2026-09-18',
			hora: '08:30',
			canchaId: 'c1'
		};
		const errores = validarProgramacionCancha(propuesta, 'pX', [], tc);
		expect(errores).toEqual([
			{ tipo: 'fueraDeDisponibilidad', rangosDisponibles: '09:00–22:00' }
		]);
	});

	it('partido que termina despues del cierre → fueraDeDisponibilidad', () => {
		const tc = canchaTorneo('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }]);
		// 21:00 + 90 = 22:30, sobrepasa 22:00.
		const propuesta: ProgramacionPartido = {
			fecha: '2026-09-18',
			hora: '21:00',
			canchaId: 'c1'
		};
		const errores = validarProgramacionCancha(propuesta, 'pX', [], tc);
		expect(errores[0]?.tipo).toBe('fueraDeDisponibilidad');
	});

	it('justo al borde del cierre (20:30) → OK porque 20:30+90=22:00 == hasta', () => {
		const tc = canchaTorneo('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }]);
		const propuesta: ProgramacionPartido = {
			fecha: '2026-09-18',
			hora: '20:30',
			canchaId: 'c1'
		};
		expect(validarProgramacionCancha(propuesta, 'pX', [], tc)).toEqual([]);
	});
});

describe('validarProgramacionCancha · choques con otros partidos', () => {
	const tc = canchaTorneo('c1', [{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }]);

	it('mismo dia, misma cancha, mismo horario → choque', () => {
		const otros = [programado('pA', 'c1', '2026-09-18', '10:00')];
		const propuesta: ProgramacionPartido = {
			fecha: '2026-09-18',
			hora: '10:00',
			canchaId: 'c1'
		};
		const errores = validarProgramacionCancha(propuesta, 'pX', otros, tc);
		expect(errores).toHaveLength(1);
		expect(errores[0]?.tipo).toBe('choqueCancha');
	});

	it('mismo dia, misma cancha, horario solapado parcialmente → choque', () => {
		// pA 10:00, dura 90 → ocupa hasta 11:30.
		// Propuesta 10:45 → solapa.
		const otros = [programado('pA', 'c1', '2026-09-18', '10:00')];
		const propuesta: ProgramacionPartido = {
			fecha: '2026-09-18',
			hora: '10:45',
			canchaId: 'c1'
		};
		const errores = validarProgramacionCancha(propuesta, 'pX', otros, tc);
		expect(errores[0]?.tipo).toBe('choqueCancha');
	});

	it('mismo dia, misma cancha, justo despues del partido anterior → OK', () => {
		// pA 10:00 + 90 = 11:30. Propuesta 11:30 → no solapa.
		const otros = [programado('pA', 'c1', '2026-09-18', '10:00')];
		const propuesta: ProgramacionPartido = {
			fecha: '2026-09-18',
			hora: '11:30',
			canchaId: 'c1'
		};
		expect(validarProgramacionCancha(propuesta, 'pX', otros, tc)).toEqual([]);
	});

	it('mismo dia, otra cancha → OK', () => {
		const otros = [programado('pA', 'c2', '2026-09-18', '10:00')];
		const propuesta: ProgramacionPartido = {
			fecha: '2026-09-18',
			hora: '10:00',
			canchaId: 'c1'
		};
		expect(validarProgramacionCancha(propuesta, 'pX', otros, tc)).toEqual([]);
	});

	it('mismo horario y cancha pero otro dia → OK', () => {
		const tc2 = canchaTorneo('c1', [
			{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' },
			{ fecha: '2026-09-19', desde: '09:00', hasta: '22:00' }
		]);
		const otros = [programado('pA', 'c1', '2026-09-18', '10:00')];
		const propuesta: ProgramacionPartido = {
			fecha: '2026-09-19',
			hora: '10:00',
			canchaId: 'c1'
		};
		expect(validarProgramacionCancha(propuesta, 'pX', otros, tc2)).toEqual([]);
	});

	it('el mismo partido en la lista no choca consigo mismo (re-programacion)', () => {
		const otros = [programado('pX', 'c1', '2026-09-18', '10:00')];
		const propuesta: ProgramacionPartido = {
			fecha: '2026-09-18',
			hora: '10:00',
			canchaId: 'c1'
		};
		expect(validarProgramacionCancha(propuesta, 'pX', otros, tc)).toEqual([]);
	});

	it('multiples choques posibles → reporta todos', () => {
		// pA 10:00 → 11:30, pB 10:45 → 12:15. Propuesta 11:00 → solapa con ambos.
		const otros = [
			programado('pA', 'c1', '2026-09-18', '10:00'),
			programado('pB', 'c1', '2026-09-18', '10:45')
		];
		const propuesta: ProgramacionPartido = {
			fecha: '2026-09-18',
			hora: '11:00',
			canchaId: 'c1'
		};
		const errores = validarProgramacionCancha(propuesta, 'pX', otros, tc);
		expect(errores).toHaveLength(2);
		expect(errores.every((e) => e.tipo === 'choqueCancha')).toBe(true);
	});
});

describe('mensajeConflicto', () => {
	it('devuelve mensajes humanos para cada tipo', () => {
		expect(
			mensajeConflicto({
				tipo: 'choqueCancha',
				otroPartidoId: 'p1',
				otroPartidoLabel: 'X',
				otraHora: '10:00'
			})
		).toContain('X');
		expect(
			mensajeConflicto({
				tipo: 'choquePareja',
				otroPartidoId: 'p1',
				otroPartidoLabel: 'Y',
				otraHora: '12:00',
				descansoRequerido: 75
			})
		).toContain('Y');
		expect(
			mensajeConflicto({ tipo: 'fueraDeDisponibilidad', rangosDisponibles: '09:00–22:00' })
		).toContain('09:00');
		expect(mensajeConflicto({ tipo: 'sinDisponibilidadEseDia' })).toContain(
			'disponibilidad'
		);
		expect(mensajeConflicto({ tipo: 'canchaNoEnTorneo' })).toContain('cancha');
	});
});

describe('DURACION_PARTIDO_MIN', () => {
	it('es 90 por convencion FAP padel al mejor de 3', () => {
		expect(DURACION_PARTIDO_MIN).toBe(90);
	});
});

// ===========================================================================
// validarProgramacion (con parejas)
// ===========================================================================

function programadoConParejas(
	id: string,
	canchaId: string,
	fecha: string,
	hora: string,
	parejas: string[]
): PartidoProgramado {
	return {
		id,
		programacion: { canchaId, fecha, hora },
		label: `Partido ${id}`,
		parejas
	};
}

describe('validarProgramacion · choque de parejas', () => {
	const tc = canchaTorneo('c1', [
		{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }
	]);
	const tc2 = canchaTorneo('c2', [
		{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' }
	]);

	it('misma pareja, otro horario solapado, OTRA cancha → choquePareja', () => {
		// pX (parejas [A,B]) a las 09:00 en c1.
		// Propuesta para pY (parejas [A,C]) a las 10:00 en c2.
		// Solapan 09:00-10:30 con 10:00-11:30 = solapamiento.
		const otros = [programadoConParejas('pX', 'c1', '2026-09-18', '09:00', ['A', 'B'])];
		const errores = validarProgramacion(
			{ fecha: '2026-09-18', hora: '10:00', canchaId: 'c2' },
			'pY',
			['A', 'C'],
			otros,
			tc2
		);
		expect(errores.some((e) => e.tipo === 'choquePareja')).toBe(true);
	});

	it('parejas distintas, mismo horario, otra cancha → OK', () => {
		const otros = [programadoConParejas('pX', 'c1', '2026-09-18', '09:00', ['A', 'B'])];
		const errores = validarProgramacion(
			{ fecha: '2026-09-18', hora: '09:00', canchaId: 'c2' },
			'pY',
			['C', 'D'],
			otros,
			tc2
		);
		expect(errores).toEqual([]);
	});

	it('misma pareja, descanso menor a 75 min → choquePareja', () => {
		// pX 09:00-10:30. Propuesta pY 10:30-12:00 → no solapan EN cancha pero
		// la pareja A no descansa nada. Por FAP zona debe haber 75 min entre
		// partidos de la misma pareja.
		const otros = [programadoConParejas('pX', 'c1', '2026-09-18', '09:00', ['A', 'B'])];
		const errores = validarProgramacion(
			{ fecha: '2026-09-18', hora: '10:30', canchaId: 'c2' },
			'pY',
			['A', 'C'],
			otros,
			tc2
		);
		expect(errores.some((e) => e.tipo === 'choquePareja')).toBe(true);
	});

	it('misma pareja, descanso de 75 min exacto entre partidos → OK', () => {
		// pX 09:00-10:30, descanso 75 → pY puede empezar a las 11:45.
		const otros = [programadoConParejas('pX', 'c1', '2026-09-18', '09:00', ['A', 'B'])];
		const errores = validarProgramacion(
			{ fecha: '2026-09-18', hora: '11:45', canchaId: 'c2' },
			'pY',
			['A', 'C'],
			otros,
			tc2
		);
		expect(errores).toEqual([]);
	});

	it('descansoEntreParejas=0 desactiva el descanso minimo', () => {
		// Misma situacion pero con descanso=0: 10:30 vuelve a ser valido.
		const otros = [programadoConParejas('pX', 'c1', '2026-09-18', '09:00', ['A', 'B'])];
		const errores = validarProgramacion(
			{ fecha: '2026-09-18', hora: '10:30', canchaId: 'c2' },
			'pY',
			['A', 'C'],
			otros,
			tc2,
			{ descansoEntreParejas: 0 }
		);
		expect(errores).toEqual([]);
	});

	it('descanso 90 min (bracket) → 11:45 ya no alcanza, hay que 12:00', () => {
		const otros = [programadoConParejas('pX', 'c1', '2026-09-18', '09:00', ['A', 'B'])];
		// 11:45 vs 09:00 = 165 min de diff; 90 + 90 = 180 min necesarios.
		const errA = validarProgramacion(
			{ fecha: '2026-09-18', hora: '11:45', canchaId: 'c2' },
			'pY',
			['A', 'C'],
			otros,
			tc2,
			{ descansoEntreParejas: 90 }
		);
		expect(errA.some((e) => e.tipo === 'choquePareja')).toBe(true);
		// 12:00 vs 09:00 = 180 min de diff = exacto 90+90. OK.
		const errB = validarProgramacion(
			{ fecha: '2026-09-18', hora: '12:00', canchaId: 'c2' },
			'pY',
			['A', 'C'],
			otros,
			tc2,
			{ descansoEntreParejas: 90 }
		);
		expect(errB).toEqual([]);
	});

	it('misma pareja, mismo dia, distinta fecha → OK', () => {
		const tcMulti = canchaTorneo('c1', [
			{ fecha: '2026-09-18', desde: '09:00', hasta: '22:00' },
			{ fecha: '2026-09-19', desde: '09:00', hasta: '22:00' }
		]);
		const otros = [programadoConParejas('pX', 'c1', '2026-09-18', '09:00', ['A', 'B'])];
		const errores = validarProgramacion(
			{ fecha: '2026-09-19', hora: '09:00', canchaId: 'c1' },
			'pY',
			['A', 'C'],
			otros,
			tcMulti
		);
		expect(errores).toEqual([]);
	});

	it('partido sin parejas (refs simbolicas) NO genera choque de pareja', () => {
		// Esto cubre los partidos de bracket con refs simbolicas: no podemos
		// validar parejas hasta que la zona termine, asi que el algoritmo es
		// permisivo en ese caso.
		const otros = [programadoConParejas('pX', 'c1', '2026-09-18', '09:00', ['A', 'B'])];
		const errores = validarProgramacion(
			{ fecha: '2026-09-18', hora: '09:00', canchaId: 'c2' },
			'pY',
			[],
			otros,
			tc2
		);
		expect(errores).toEqual([]);
	});

	it('reporta choque de cancha Y choque de pareja simultaneamente', () => {
		// Mismo dia, misma cancha, mismo horario, mismas parejas → ambos
		// tipos de conflicto.
		const otros = [programadoConParejas('pX', 'c1', '2026-09-18', '09:00', ['A', 'B'])];
		const errores = validarProgramacion(
			{ fecha: '2026-09-18', hora: '09:00', canchaId: 'c1' },
			'pY',
			['A', 'C'],
			otros,
			tc
		);
		expect(errores.some((e) => e.tipo === 'choqueCancha')).toBe(true);
		expect(errores.some((e) => e.tipo === 'choquePareja')).toBe(true);
	});
});

describe('inscripcionesDePartido', () => {
	it('extrae solo refs directas (Inscripcion)', () => {
		expect(
			inscripcionesDePartido({
				pareja1Ref: { tipo: 'Inscripcion', inscripcionId: 'A' },
				pareja2Ref: { tipo: 'Inscripcion', inscripcionId: 'B' }
			})
		).toEqual(['A', 'B']);
	});

	it('omite refs simbolicas (GanadorPartido / PosicionZona)', () => {
		expect(
			inscripcionesDePartido({
				pareja1Ref: { tipo: 'GanadorPartido' },
				pareja2Ref: { tipo: 'Inscripcion', inscripcionId: 'B' }
			})
		).toEqual(['B']);
		expect(
			inscripcionesDePartido({
				pareja1Ref: { tipo: 'PosicionZona' },
				pareja2Ref: { tipo: 'PerdedorPartido' }
			})
		).toEqual([]);
	});
});
