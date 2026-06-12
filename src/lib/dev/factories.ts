import {
	GENEROS_CATEGORIA,
	NIVELES_CATEGORIA,
	type CategoriaInput,
	type TorneoInput
} from '$lib/types/torneo';
import type { Jugador, JugadorInput } from '$lib/types/jugador';
import type { InscripcionInput } from '$lib/types/inscripcion';
import type { ResultadoPartido, SetResultado } from '$lib/types/armado';
import type { CanchaInput, SedeInput } from '$lib/types/sede';

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

// Pares fijos de nombre + apellido. Cada par es unico, asi se evitan
// duplicados al generar jugadores random. La factory pide al caller que
// pase los `nombreCompleto` ya existentes para excluirlos del sorteo.
const NOMBRES_COMPLETOS: { firstName: string; lastName: string }[] = [
	{ firstName: 'Juan', lastName: 'Gonzalez' },
	{ firstName: 'Maria', lastName: 'Rodriguez' },
	{ firstName: 'Carlos', lastName: 'Lopez' },
	{ firstName: 'Ana', lastName: 'Martinez' },
	{ firstName: 'Luis', lastName: 'Fernandez' },
	{ firstName: 'Laura', lastName: 'Perez' },
	{ firstName: 'Jorge', lastName: 'Gomez' },
	{ firstName: 'Sofia', lastName: 'Diaz' },
	{ firstName: 'Miguel', lastName: 'Sanchez' },
	{ firstName: 'Valeria', lastName: 'Romero' },
	{ firstName: 'Diego', lastName: 'Torres' },
	{ firstName: 'Camila', lastName: 'Ruiz' },
	{ firstName: 'Andres', lastName: 'Vargas' },
	{ firstName: 'Daniela', lastName: 'Castro' },
	{ firstName: 'Fernando', lastName: 'Morales' },
	{ firstName: 'Paula', lastName: 'Ortiz' },
	{ firstName: 'Ricardo', lastName: 'Silva' },
	{ firstName: 'Gabriela', lastName: 'Rojas' },
	{ firstName: 'Martin', lastName: 'Herrera' },
	{ firstName: 'Natalia', lastName: 'Mendoza' },
	{ firstName: 'Alejandro', lastName: 'Jimenez' },
	{ firstName: 'Carolina', lastName: 'Navarro' },
	{ firstName: 'Eduardo', lastName: 'Flores' },
	{ firstName: 'Lucia', lastName: 'Aguilar' },
	{ firstName: 'Roberto', lastName: 'Medina' },
	{ firstName: 'Florencia', lastName: 'Delgado' },
	{ firstName: 'Sergio', lastName: 'Vega' },
	{ firstName: 'Julieta', lastName: 'Ibarra' },
	{ firstName: 'Hector', lastName: 'Campos' },
	{ firstName: 'Elena', lastName: 'Fuentes' },
	{ firstName: 'Raul', lastName: 'Guerrero' },
	{ firstName: 'Patricia', lastName: 'Cabrera' },
	{ firstName: 'Oscar', lastName: 'Ramirez' },
	{ firstName: 'Veronica', lastName: 'Molina' },
	{ firstName: 'Alberto', lastName: 'Acosta' },
	{ firstName: 'Monica', lastName: 'Benitez' },
	{ firstName: 'Ruben', lastName: 'Paredes' },
	{ firstName: 'Cecilia', lastName: 'Cardozo' },
	{ firstName: 'Guillermo', lastName: 'Ayala' },
	{ firstName: 'Lorena', lastName: 'Coronel' },
	{ firstName: 'Nicolas', lastName: 'Caballero' },
	{ firstName: 'Andrea', lastName: 'Valdez' },
	{ firstName: 'Cristian', lastName: 'Escobar' },
	{ firstName: 'Mariana', lastName: 'Salinas' },
	{ firstName: 'Sebastian', lastName: 'Meza' },
	{ firstName: 'Victoria', lastName: 'Franco' },
	{ firstName: 'Emiliano', lastName: 'Alvarez' },
	{ firstName: 'Noelia', lastName: 'Godoy' },
	{ firstName: 'Matias', lastName: 'Maidana' },
	{ firstName: 'Rocio', lastName: 'Villalba' },
	{ firstName: 'Kevin', lastName: 'Arce' },
	{ firstName: 'Tatiana', lastName: 'Leiva' },
	{ firstName: 'Bruno', lastName: 'Nuñez' },
	{ firstName: 'Melisa', lastName: 'Baez' },
	{ firstName: 'Joaquin', lastName: 'Caceres' },
	{ firstName: 'Agustina', lastName: 'Ferreira' },
	{ firstName: 'Facundo', lastName: 'Cantero' },
	{ firstName: 'Antonella', lastName: 'Insfran' },
	{ firstName: 'Tomas', lastName: 'Espinola' },
	{ firstName: 'Micaela', lastName: 'Velazquez' },
	{ firstName: 'Maximiliano', lastName: 'Peralta' },
	{ firstName: 'Bianca', lastName: 'Almiron' },
	{ firstName: 'Leonardo', lastName: 'Zarate' },
	{ firstName: 'Ariana', lastName: 'Galeano' },
	{ firstName: 'Franco', lastName: 'Figueredo' },
	{ firstName: 'Milagros', lastName: 'Sosa' },
	{ firstName: 'Gabriel', lastName: 'Prieto' },
	{ firstName: 'Karen', lastName: 'Centurion' },
	{ firstName: 'Adrian', lastName: 'Duarte' },
	{ firstName: 'Jimena', lastName: 'Recalde' },
	{ firstName: 'Esteban', lastName: 'Torales' },
	{ firstName: 'Marisol', lastName: 'Riveros' },
	{ firstName: 'Pablo', lastName: 'Bareiro' },
	{ firstName: 'Silvana', lastName: 'Jara' },
	{ firstName: 'Mauricio', lastName: 'Ledesma' },
	{ firstName: 'Yamila', lastName: 'Melgarejo' },
	{ firstName: 'Federico', lastName: 'Riquelme' },
	{ firstName: 'Nadia', lastName: 'Ovelar' },
	{ firstName: 'Benjamin', lastName: 'Valiente' },
	{ firstName: 'Aldana', lastName: 'Marecos' },
	{ firstName: 'Rodrigo', lastName: 'Brizuela' },
	{ firstName: 'Carla', lastName: 'Sanabria' },
	{ firstName: 'Ezequiel', lastName: 'Chamorro' },
	{ firstName: 'Daiana', lastName: 'Mongelos' },
	{ firstName: 'Jonathan', lastName: 'Cuevas' },
	{ firstName: 'Pamela', lastName: 'Gimenez' },
	{ firstName: 'Alan', lastName: 'Aranda' },
	{ firstName: 'Fiorella', lastName: 'Paniagua' },
	{ firstName: 'Ivan', lastName: 'Villagra' },
	{ firstName: 'Daniel', lastName: 'Portillo' },
	{ firstName: 'Jessica', lastName: 'Mieres' },
	{ firstName: 'Marcos', lastName: 'Colman' },
	{ firstName: 'Erika', lastName: 'Ortellado' },
	{ firstName: 'Gustavo', lastName: 'Candia' },
	{ firstName: 'Lourdes', lastName: 'Avalos' },
	{ firstName: 'Christian', lastName: 'Benegas' },
	{ firstName: 'Cinthia', lastName: 'Villamayor' }
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

const SEDES_NOMBRES = [
	'Club de Pádel Central',
	'Padel House',
	'Pádel Club Norte',
	'Sport Center',
	'Pádel Plaza',
	'Racquet Club',
	'Pádel Arena',
	'Pádel Open',
	'Pádel y Más'
];
const SEDES_CALLES = [
	'Av. Libertador',
	'Av. del Sol',
	'Calle 9 de Julio',
	'Av. San Martín',
	'Calle Belgrano',
	'Av. Mitre',
	'Calle Sarmiento'
];

export function generarSedeInput(): SedeInput {
	const nombre = pick(SEDES_NOMBRES);
	const conDireccion = Math.random() < 0.75;
	const direccion = conDireccion
		? `${pick(SEDES_CALLES)} ${Math.floor(100 + Math.random() * 4900)}`
		: null;
	return { nombre, direccion };
}

export function generarCanchaInput(): CanchaInput {
	// 60% "Cancha N", 30% nombres propios, 10% letra.
	const r = Math.random();
	let nombre: string;
	if (r < 0.6) {
		nombre = `Cancha ${Math.floor(1 + Math.random() * 8)}`;
	} else if (r < 0.9) {
		nombre = pick(['Central', 'Vidrio Este', 'Vidrio Oeste', 'Norte', 'Sur', 'Premium']);
	} else {
		nombre = String.fromCharCode(65 + Math.floor(Math.random() * 6));
	}
	return { nombre };
}

// Si se pasa `excluirCompletos`, evita repetir nombres completos ya tomados.
// Cuando todos los pares de la lista se usaron, vuelve a permitir cualquiera
// (caso raro: la lista tiene casi 100 pares y rara vez se llega al limite).
export function generarJugadorInput(
	excluirCompletos?: Set<string>
): JugadorInput {
	const disponibles =
		excluirCompletos && excluirCompletos.size < NOMBRES_COMPLETOS.length
			? NOMBRES_COMPLETOS.filter(
					(n) => !excluirCompletos.has(`${n.firstName} ${n.lastName}`)
				)
			: NOMBRES_COMPLETOS;
	const persona = pick(disponibles);
	const nombre = persona.firstName;
	const apellido = persona.lastName;
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
