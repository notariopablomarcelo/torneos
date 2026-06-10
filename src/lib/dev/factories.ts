import {
	GENEROS_CATEGORIA,
	NIVELES_CATEGORIA,
	type CategoriaInput,
	type TorneoInput
} from '$lib/types/torneo';
import type { JugadorInput } from '$lib/types/jugador';

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
		cupos: pick([null, 16, 24, 32, 48] as const)
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
