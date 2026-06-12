// Tipos compartidos entre las implementaciones del adapter (local y
// firebase). Los servicios consumen solo estos tipos y las funciones
// exportadas desde `./index.ts` — nunca firebase/firestore directo.

export type CollectionRef = {
	readonly __kind: 'collection';
	readonly path: string; // ej. "torneos/abc/categorias"
};

export type DocRef = {
	readonly __kind: 'doc';
	// Path COMPLETO del documento (ej. "sedes/abc/canchas/xyz").
	// Compatible con `DocumentReference.path` de firebase, asi los
	// services pueden inspeccionarlo igual en ambos backends.
	readonly path: string;
	readonly id: string;
};

export type WhereConstraint = {
	readonly __kind: 'where';
	readonly field: string;
	readonly op: '=='; // unico operador usado en el codebase
	readonly value: unknown;
};

export type OrderByConstraint = {
	readonly __kind: 'orderBy';
	readonly field: string;
	readonly dir: 'asc' | 'desc';
};

export type Constraint = WhereConstraint | OrderByConstraint;

export type Query = {
	readonly __kind: 'query';
	readonly path: string; // path de la coleccion (o collectionGroup)
	readonly isCollectionGroup: boolean;
	readonly constraints: readonly Constraint[];
};

// Snapshot APIs minimas (compatibles con DocumentSnapshot/QuerySnapshot de
// Firestore en los puntos que el codebase usa).

export type DocumentSnapshot = {
	readonly id: string;
	readonly ref: DocRef;
	exists(): boolean;
	// Retorno `any` (no `Record<string, unknown>`) para que el caller
	// pueda hacer destructuring directo `{ ...d.data() }` contra los
	// tipos del dominio sin casts. Es la convencion que sigue Firestore.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	data(): any;
};

export type QuerySnapshot = {
	readonly size: number;
	readonly docs: DocumentSnapshot[];
};

// Batch atomico. Cada metodo retorna `this` para chain-style.
export type WriteBatch = {
	set(ref: DocRef, data: Record<string, unknown>): WriteBatch;
	update(ref: DocRef, data: Record<string, unknown>): WriteBatch;
	delete(ref: DocRef): WriteBatch;
	commit(): Promise<void>;
};

// Unsubscribe handler que retorna onSnapshot.
export type Unsubscribe = () => void;

// Doc data plana (lo que se almacena).
export type DocData = Record<string, unknown> & { id: string };

// Aliases con el nombre que usa firebase/firestore. El parametro generico
// se acepta pero ignora — sirve solo para que firestore.ts compile sin
// cambios (casts del tipo `as CollectionReference<TorneoDoc>`).
export type CollectionReference<_T = unknown> = CollectionRef;
export type DocumentReference<_T = unknown> = DocRef;
