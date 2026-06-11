import {
	GENEROS_CATEGORIA,
	NIVELES_CATEGORIA,
	type CategoriaInput,
	type TorneoInput
} from '$lib/types/torneo';
import type { Jugador, JugadorInput } from '$lib/types/jugador';
import type { InscripcionInput } from '$lib/types/inscripcion';
import type { ResultadoPartido, SetResultado } from '$lib/types/armado';

// Factories de datos ficticios para el boton "Test" de los formularios.
// Cada llamada devuelve datos nuevos (sin determinismo). A medida que sumemos
// entidades nuevas (Jugador, Pareja, Sede, etc.), sumamos aca su factory para
// que el patron quede en un solo lugar.

const TIPOS_TORNEO = [
	'Open',
	'Master',
	'Torneo',
	'Copa',
	'Aniversario',
	'Apertura',
	'Clausura',
	'Cup'
];
const ESTACIONES = ['Verano', 'Otoño', 'Invierno', 'Primavera'];
const CIUDADES = [
	'Asunción',
	'Buenos Aires',
	'Córdoba',
	'Mendoza',
	'Rosario',
	'Montevideo',
	'Santiago',
	'Lima',
	'San Lorenzo',
	'Encarnación',
	'Posadas'
];

function pick<T>(arr: readonly T[]): T {
	return arr[Math.floor(Math.random() * arr.length)] as T;
}

function isoDate(d: Date): string {
	const año = d.getFullYear();
	const mes = String(d.getMonth() + 1).padStart(2, '0');
	const dia = String(d.getDate()).padStart(2, '0');
	return `${año}-${mes}-${dia}`;
}

export function generarTorneoInput(): TorneoInput {
	const tipo = pick(TIPOS_TORNEO);
	const estacion = pick(ESTACIONES);
	const ciudad = pick(CIUDADES);
	const año = new Date().getFullYear() + (Math.random() < 0.4 ? 0 : 1);
	const nombre = `${tipo} de ${estacion} ${ciudad} ${año}`;

	// Fecha aleatoria dentro de los proximos 180 dias. Duracion fija de 3 dias
	// (formato FAP estandar para un torneo de fin de semana extendido). Las
	// fechas son inclusivas, asi que para 3 dias sumamos 2 (no 3) al inicio.
	const DURACION_DIAS = 3;
	const desde = new Date();
	desde.setDate(desde.getDate() + 7 + Math.floor(Math.random() * 173));
	const hasta = new Date(desde);
	hasta.setDate(hasta.getDate() + DURACION_DIAS - 1);

	return {
		nombre,
		fechaInicio: isoDate(desde),
		fechaFin: isoDate(hasta)
	};
}

export function generarCategoriaInput(): CategoriaInput {
	return {
		nivel: pick(NIVELES_CATEGORIA),
		genero: pick(GENEROS_CATEGORIA),
		cupos: pick([null, 16, 24, 32, 48] as const),
		// Default padel (2 = pareja). Mantenemos fijo en el factory porque la
		// app arranca enfocada en padel; cuando soportemos otros deportes el
		// factory puede variar.
		cantidadJugadores: 2
	};
}

const NOMBRES = [
	'Carlos',
	'Juan',
	'Diego',
	'Martín',
	'Pablo',
	'Fernando',
	'Ricardo',
	'Roberto',
	'Sebastián',
	'Alejandro',
	'Federico',
	'Gonzalo',
	'María',
	'Ana',
	'Laura',
	'Sofía',
	'Lucía',
	'Carla',
	'Florencia',
	'Verónica',
	'Camila',
	'Romina'
];

const APELLIDOS = [
	'González',
	'Rodríguez',
	'Pereira',
	'Martínez',
	'López',
	'García',
	'Fernández',
	'Sánchez',
	'Ramírez',
	'Torres',
	'Benítez',
	'Acosta',
	'Vega',
	'Cáceres',
	'Ramos',
	'Gómez',
	'Ortiz',
	'Romero'
];

// Genera una inscripcion ficticia tomando N jugadores al azar de los que
// estan disponibles (los que no estan ya inscriptos). Devuelve null si no
// hay suficientes. El ranking se autoasigna al siguiente entero libre.
export function generarInscripcionInput(
	jugadoresDisponibles: Jugador[],
	cantidadJugadores: number,
	rankingsExistentes: number[]
): InscripcionInput | null {
	if (jugadoresDisponibles.length < cantidadJugadores) return null;
	const mezclados = [...jugadoresDisponibles].sort(() => Math.random() - 0.5);
	const jugadores = mezclados.slice(0, cantidadJugadores).map((j) => j.id);
	const maxRanking = rankingsExistentes.length > 0 ? Math.max(...rankingsExistentes) : 0;
	return {
		jugadores,
		ranking: maxRanking + 1
	};
}

// Genera un set "realista" donde el ganador siempre lleva 6 (o 7 si hubo
// tiebreak). El perdedor lleva 0-5 normalmente, 6 si fue tiebreak.
function generarSet(ganador: 1 | 2): SetResultado {
	const conTiebreak = Math.random() < 0.15;
	if (conTiebreak) {
		const tbGanador = 7;
		const tbPerdedor = Math.floor(Math.random() * 6); // 0-5
		if (ganador === 1) {
			return { p1: 7, p2: 6, tiebreakP1: tbGanador, tiebreakP2: tbPerdedor };
		}
		return { p1: 6, p2: 7, tiebreakP1: tbPerdedor, tiebreakP2: tbGanador };
	}
	const gamesPerdedor = Math.floor(Math.random() * 5); // 0-4
	if (ganador === 1) return { p1: 6, p2: gamesPerdedor };
	return { p1: gamesPerdedor, p2: 6 };
}

// Genera un resultado de partido al mejor de 3. ~60% 2-0 / 40% 2-1, ganador
// 1 o 2 al azar. Siempre con motivo "normal" — W.O. y abandono los marca
// el usuario manual.
export function generarResultadoPartido(): ResultadoPartido {
	const ganadorEs: 1 | 2 = Math.random() < 0.5 ? 1 : 2;
	const dosACero = Math.random() < 0.6;
	const sets: SetResultado[] = [];
	if (dosACero) {
		sets.push(generarSet(ganadorEs));
		sets.push(generarSet(ganadorEs));
	} else {
		const perdedor: 1 | 2 = ganadorEs === 1 ? 2 : 1;
		const orden: (1 | 2)[] = [ganadorEs, perdedor, ganadorEs];
		if (Math.random() < 0.5) {
			[orden[0], orden[1]] = [orden[1] as 1 | 2, orden[0] as 1 | 2];
		}
		for (const g of orden) sets.push(generarSet(g));
	}
	return {
		sets,
		ganadorEs,
		motivo: 'normal'
	};
}

export function generarJugadorInput(): JugadorInput {
	const nombre = pick(NOMBRES);
	const apellido = pick(APELLIDOS);
	// Telefono: ~70% de chance que tenga. Mezclamos Argentina (+54) y Paraguay
	// (+595) para cubrir los dos paises del dominio. Cuando no tiene, null.
	let telefono: string | null = null;
	if (Math.random() < 0.7) {
		const esArgentina = Math.random() < 0.5;
		if (esArgentina) {
			const area = Math.floor(11 + Math.random() * 388);
			const num = Math.floor(1000000 + Math.random() * 9000000);
			telefono = `+54 ${area}${num}`;
		} else {
			const area = Math.floor(10 + Math.random() * 90);
			const num = Math.floor(100000 + Math.random() * 900000);
			telefono = `+595 9${area}${num}`;
		}
	}
	return {
		nombreCompleto: `${nombre} ${apellido}`,
		telefono
	};
}
