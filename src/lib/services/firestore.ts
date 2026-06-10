import {
	collection,
	doc,
	type CollectionReference,
	type DocumentReference
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { Categoria, Torneo } from '$lib/types/torneo';
import type { Jugador } from '$lib/types/jugador';
import type { Inscripcion } from '$lib/types/inscripcion';
import type { Partido, Zona } from '$lib/types/armado';

// Referencias tipadas a las colecciones y documentos. Las paginas y servicios
// arman queries sobre estas helpers, en lugar de repetir el path como string.
// El cast a CollectionReference<Omit<T, 'id'>> le dice a Firestore que shape
// esperar al leer; el id se inyecta a mano desde snap.id.

type TorneoDoc = Omit<Torneo, 'id'>;
type CategoriaDoc = Omit<Categoria, 'id'>;
type JugadorDoc = Omit<Jugador, 'id'>;
type InscripcionDoc = Omit<Inscripcion, 'id'>;
type ZonaDoc = Omit<Zona, 'id'>;
type PartidoDoc = Omit<Partido, 'id'>;

export const torneosCol = (): CollectionReference<TorneoDoc> =>
	collection(db(), 'torneos') as CollectionReference<TorneoDoc>;

export const torneoDoc = (id: string): DocumentReference<TorneoDoc> =>
	doc(db(), 'torneos', id) as DocumentReference<TorneoDoc>;

export const categoriasCol = (torneoId: string): CollectionReference<CategoriaDoc> =>
	collection(db(), 'torneos', torneoId, 'categorias') as CollectionReference<CategoriaDoc>;

export const categoriaDoc = (
	torneoId: string,
	id: string
): DocumentReference<CategoriaDoc> =>
	doc(db(), 'torneos', torneoId, 'categorias', id) as DocumentReference<CategoriaDoc>;

export const jugadoresCol = (): CollectionReference<JugadorDoc> =>
	collection(db(), 'jugadores') as CollectionReference<JugadorDoc>;

export const jugadorDoc = (id: string): DocumentReference<JugadorDoc> =>
	doc(db(), 'jugadores', id) as DocumentReference<JugadorDoc>;

export const inscripcionesCol = (
	torneoId: string,
	categoriaId: string
): CollectionReference<InscripcionDoc> =>
	collection(
		db(),
		'torneos',
		torneoId,
		'categorias',
		categoriaId,
		'inscripciones'
	) as CollectionReference<InscripcionDoc>;

export const inscripcionDoc = (
	torneoId: string,
	categoriaId: string,
	id: string
): DocumentReference<InscripcionDoc> =>
	doc(
		db(),
		'torneos',
		torneoId,
		'categorias',
		categoriaId,
		'inscripciones',
		id
	) as DocumentReference<InscripcionDoc>;

export const zonasCol = (
	torneoId: string,
	categoriaId: string
): CollectionReference<ZonaDoc> =>
	collection(
		db(),
		'torneos',
		torneoId,
		'categorias',
		categoriaId,
		'zonas'
	) as CollectionReference<ZonaDoc>;

export const zonaDoc = (
	torneoId: string,
	categoriaId: string,
	id: string
): DocumentReference<ZonaDoc> =>
	doc(
		db(),
		'torneos',
		torneoId,
		'categorias',
		categoriaId,
		'zonas',
		id
	) as DocumentReference<ZonaDoc>;

export const partidosCol = (
	torneoId: string,
	categoriaId: string
): CollectionReference<PartidoDoc> =>
	collection(
		db(),
		'torneos',
		torneoId,
		'categorias',
		categoriaId,
		'partidos'
	) as CollectionReference<PartidoDoc>;

export const partidoDoc = (
	torneoId: string,
	categoriaId: string,
	id: string
): DocumentReference<PartidoDoc> =>
	doc(
		db(),
		'torneos',
		torneoId,
		'categorias',
		categoriaId,
		'partidos',
		id
	) as DocumentReference<PartidoDoc>;
