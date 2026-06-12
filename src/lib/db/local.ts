// Implementacion local del adapter: cliente que llama al endpoint
// /api/db. Replica la API de firebase/firestore que el codebase usa.
//
// onSnapshot esta implementado con polling cada 2s. Suficiente para
// dev local single-user; si despues hace falta latencia menor, se
// puede cambiar a SSE sin tocar los servicios.

import type {
	CollectionRef,
	Constraint,
	DocData,
	DocRef,
	DocumentSnapshot,
	OrderByConstraint,
	Query,
	QuerySnapshot,
	Unsubscribe,
	WhereConstraint,
	WriteBatch
} from './types';

const POLL_MS = 2000;
const API = '/api/db';

// =============================================================================
// Refs (constructores)
// =============================================================================

// Acepta dos formas para alinearse con firebase/firestore:
//   collection(db, 'torneos')                      -> top-level
//   collection(parentDoc, 'categorias')            -> subcoleccion
// Ignoramos `db` (no hay instancia en local) y solo nos importa el path.
export function collection(
	parent: unknown,
	...segments: string[]
): CollectionRef {
	let basePath = '';
	if (isDocRef(parent)) {
		basePath = `${parent.path}/${parent.id}`;
	}
	const path = [basePath, ...segments].filter(Boolean).join('/');
	return { __kind: 'collection', path };
}

// doc(col)                  -> id auto, ref vacio (para crear despues con id)
// doc(col, id)              -> ref a un doc especifico
// doc(db, 'col/id/col/id')  -> equivalente, parsea path
//
// Devuelve DocRef.path como path COMPLETO (con id), igual que firebase.
export function doc(parent: unknown, ...segments: string[]): DocRef {
	if (isCollectionRef(parent)) {
		const id = segments[0] ?? randomId();
		return { __kind: 'doc', path: `${parent.path}/${id}`, id };
	}
	if (isDocRef(parent)) {
		// doc(parentDoc, 'subcol', 'id', ...) — armamos colPath padre + segments
		const all = [parent.path, ...segments];
		const id = all[all.length - 1]!;
		const path = all.join('/');
		return { __kind: 'doc', path, id };
	}
	// doc(db, ...segments) — segments es path plano alternando col/id
	if (segments.length < 2) {
		throw new Error('doc(db, path) requiere al menos col/id');
	}
	const id = segments[segments.length - 1]!;
	return { __kind: 'doc', path: segments.join('/'), id };
}

// Path solo de la coleccion padre (sin el id del doc). Util para el
// storage que necesita la coleccion donde vive el doc.
function colPathOf(ref: DocRef): string {
	return ref.path.split('/').slice(0, -1).join('/');
}

export function query(
	col: CollectionRef | Query,
	...constraints: Constraint[]
): Query {
	const base: Query =
		col.__kind === 'query'
			? col
			: {
					__kind: 'query',
					path: col.path,
					isCollectionGroup: false,
					constraints: []
				};
	return {
		__kind: 'query',
		path: base.path,
		isCollectionGroup: base.isCollectionGroup,
		constraints: [...base.constraints, ...constraints]
	};
}

export function where(
	field: string,
	op: '==',
	value: unknown
): WhereConstraint {
	return { __kind: 'where', field, op, value };
}

export function orderBy(
	field: string,
	dir: 'asc' | 'desc' = 'asc'
): OrderByConstraint {
	return { __kind: 'orderBy', field, dir };
}

export function collectionGroup(_db: unknown, name: string): Query {
	return {
		__kind: 'query',
		path: name,
		isCollectionGroup: true,
		constraints: []
	};
}

// Para mantener compat con codigo que importa `db` de firebase. En local
// no hay instancia, devolvemos un placeholder.
export function db(): unknown {
	return null;
}

// =============================================================================
// CRUD
// =============================================================================

async function apiCall<T = unknown>(body: object): Promise<T> {
	const res = await fetch(API, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const txt = await res.text();
		throw new Error(`[db local] ${res.status}: ${txt}`);
	}
	return res.json() as Promise<T>;
}

export async function getDoc(ref: DocRef): Promise<DocumentSnapshot> {
	const out = await apiCall<{ exists: boolean; data: DocData | null }>({
		op: 'get',
		path: colPathOf(ref),
		id: ref.id
	});
	return makeDocSnap(ref, out.data);
}

export async function getDocs(
	qOrCol: Query | CollectionRef
): Promise<QuerySnapshot> {
	const docs = await fetchDocsFor(qOrCol);
	const snaps = docs.map((d) => makeDocSnap(refFor(qOrCol, d.id), d));
	return { docs: snaps, size: snaps.length };
}

export async function addDoc(
	col: CollectionRef,
	data: Record<string, unknown>
): Promise<DocRef> {
	const { id } = await apiCall<{ id: string }>({
		op: 'add',
		path: col.path,
		data
	});
	return { __kind: 'doc', path: `${col.path}/${id}`, id };
}

export async function setDoc(
	ref: DocRef,
	data: Record<string, unknown>
): Promise<void> {
	await apiCall({ op: 'set', path: colPathOf(ref), id: ref.id, data });
}

export async function updateDoc(
	ref: DocRef,
	data: Record<string, unknown>
): Promise<void> {
	await apiCall({ op: 'update', path: colPathOf(ref), id: ref.id, data });
}

export async function deleteDoc(ref: DocRef): Promise<void> {
	await apiCall({ op: 'delete', path: colPathOf(ref), id: ref.id });
}

// =============================================================================
// onSnapshot (polling)
// =============================================================================

export function onSnapshot(
	target: DocRef,
	cb: (snap: DocumentSnapshot) => void
): Unsubscribe;
export function onSnapshot(
	target: CollectionRef | Query,
	cb: (snap: QuerySnapshot) => void
): Unsubscribe;
export function onSnapshot(
	target: DocRef | CollectionRef | Query,
	cb:
		| ((snap: DocumentSnapshot) => void)
		| ((snap: QuerySnapshot) => void)
): Unsubscribe {
	let cancelado = false;
	let interval: ReturnType<typeof setInterval> | null = null;
	let ultimo: string = '';

	async function tick(): Promise<void> {
		if (cancelado) return;
		try {
			if (target.__kind === 'doc') {
				const snap = await getDoc(target);
				const hash = JSON.stringify(snap.data() ?? null);
				if (hash !== ultimo) {
					ultimo = hash;
					(cb as (s: DocumentSnapshot) => void)(snap);
				}
			} else {
				const snap = await getDocs(target);
				const hash = JSON.stringify(snap.docs.map((d) => d.data()));
				if (hash !== ultimo) {
					ultimo = hash;
					(cb as (s: QuerySnapshot) => void)(snap);
				}
			}
		} catch (err) {
			console.error('[db local] onSnapshot poll error', err);
		}
	}

	void tick(); // fetch inicial inmediato
	interval = setInterval(tick, POLL_MS);

	return () => {
		cancelado = true;
		if (interval) clearInterval(interval);
	};
}

// =============================================================================
// WriteBatch
// =============================================================================

export function writeBatch(_db?: unknown): WriteBatch {
	const ops: import('./storage.server').WriteOp[] = [];
	const b: WriteBatch = {
		set(ref, data) {
			ops.push({ type: 'set', path: colPathOf(ref), id: ref.id, data });
			return b;
		},
		update(ref, data) {
			ops.push({ type: 'update', path: colPathOf(ref), id: ref.id, data });
			return b;
		},
		delete(ref) {
			ops.push({ type: 'delete', path: colPathOf(ref), id: ref.id });
			return b;
		},
		async commit() {
			if (ops.length === 0) return;
			await apiCall({ op: 'batch', ops });
		}
	};
	return b;
}

// =============================================================================
// Helpers internos
// =============================================================================

function isDocRef(x: unknown): x is DocRef {
	return (
		typeof x === 'object' &&
		x !== null &&
		(x as { __kind?: string }).__kind === 'doc'
	);
}

function isCollectionRef(x: unknown): x is CollectionRef {
	return (
		typeof x === 'object' &&
		x !== null &&
		(x as { __kind?: string }).__kind === 'collection'
	);
}

function randomId(): string {
	return (
		Math.random().toString(36).slice(2, 12) +
		Math.random().toString(36).slice(2, 10)
	);
}

function makeDocSnap(ref: DocRef, data: DocData | null): DocumentSnapshot {
	return {
		id: ref.id,
		ref,
		exists: () => data !== null,
		data: () => {
			if (!data) return undefined;
			// id no se reporta en data() — Firestore lo separa.
			const { id: _id, ...rest } = data;
			return rest;
		}
	};
}

function refFor(qOrCol: Query | CollectionRef, id: string): DocRef {
	return { __kind: 'doc', path: `${qOrCol.path}/${id}`, id };
}

async function fetchDocsFor(qOrCol: Query | CollectionRef): Promise<DocData[]> {
	if (qOrCol.__kind === 'collection') {
		const { docs } = await apiCall<{ docs: DocData[] }>({
			op: 'list',
			path: qOrCol.path
		});
		return docs;
	}
	if (qOrCol.isCollectionGroup) {
		const { items } = await apiCall<{
			items: { path: string; doc: DocData }[];
		}>({ op: 'colgroup', name: qOrCol.path });
		// Adjuntamos el path real al doc para que el caller pueda inspeccionarlo
		// via doc.ref.path (compat con cancha-de-sede vs cancha-de-torneo).
		return items.map(({ path, doc }) => ({ ...doc, __path: path }));
	}
	const { docs } = await apiCall<{ docs: DocData[] }>({
		op: 'list',
		path: qOrCol.path
	});
	return aplicarConstraints(docs, qOrCol.constraints);
}

function aplicarConstraints(
	docs: DocData[],
	constraints: readonly Constraint[]
): DocData[] {
	let out = docs;
	for (const c of constraints) {
		if (c.__kind === 'where') {
			out = out.filter((d) => (d as Record<string, unknown>)[c.field] === c.value);
		}
	}
	// orderBy se aplica al final (firestore lo ordena despues del filter).
	const orders = constraints.filter(
		(c): c is OrderByConstraint => c.__kind === 'orderBy'
	);
	if (orders.length > 0) {
		out = [...out].sort((a, b) => {
			for (const o of orders) {
				const av = (a as Record<string, unknown>)[o.field];
				const bv = (b as Record<string, unknown>)[o.field];
				const cmp =
					av === bv
						? 0
						: av === undefined || av === null
							? 1
							: bv === undefined || bv === null
								? -1
								: av < bv
									? -1
									: 1;
				if (cmp !== 0) return o.dir === 'desc' ? -cmp : cmp;
			}
			return 0;
		});
	}
	return out;
}
