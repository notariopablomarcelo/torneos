// Storage server-side para el modo local. Lee/escribe ./data/db.json
// como un unico archivo con todas las colecciones.
//
// Estructura del JSON:
//   {
//     "torneos": [ { "id": "abc", ...campos }, ... ],
//     "torneos/abc/categorias": [ ... ],
//     "jugadores": [ ... ],
//     ...
//   }
//
// Es un archivo unico (no por coleccion) para simplificar inspeccion/backup.
// Para dev local single-user es trivial; en produccion con concurrencia no
// sirve, pero esa no es la meta.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DATA_DIR = './data';
const DB_FILE = join(DATA_DIR, 'db.json');

type DocPlain = Record<string, unknown> & { id: string };
type DBSnapshot = Record<string, DocPlain[]>;

let _cache: DBSnapshot | null = null;
let _writePromise: Promise<void> = Promise.resolve();

async function ensureDir(): Promise<void> {
	if (!existsSync(DATA_DIR)) {
		await mkdir(DATA_DIR, { recursive: true });
	}
}

async function loadFromDisk(): Promise<DBSnapshot> {
	await ensureDir();
	if (!existsSync(DB_FILE)) return {};
	try {
		const raw = await readFile(DB_FILE, 'utf8');
		if (!raw.trim()) return {};
		return JSON.parse(raw) as DBSnapshot;
	} catch (err) {
		console.error('[db] Error leyendo db.json, parto vacio:', err);
		return {};
	}
}

async function readAll(): Promise<DBSnapshot> {
	if (_cache) return _cache;
	_cache = await loadFromDisk();
	return _cache;
}

async function writeAll(): Promise<void> {
	if (!_cache) return;
	await ensureDir();
	// Atomico: write a tmp + rename, asi no se corrompe si crashea.
	const tmp = DB_FILE + '.tmp';
	const json = JSON.stringify(_cache, null, 2);
	await writeFile(tmp, json, 'utf8');
	const { rename } = await import('node:fs/promises');
	await rename(tmp, DB_FILE);
}

// Serializa las escrituras para que no se pisen en concurrencia.
async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
	const prev = _writePromise;
	let release!: () => void;
	const next = new Promise<void>((res) => (release = res));
	_writePromise = next;
	await prev;
	try {
		return await fn();
	} finally {
		release();
	}
}

// =============================================================================
// API publica para el endpoint
// =============================================================================

export type WriteOp =
	| { type: 'set'; path: string; id: string; data: Record<string, unknown> }
	| { type: 'update'; path: string; id: string; data: Record<string, unknown> }
	| { type: 'delete'; path: string; id: string };

function randomId(): string {
	return (
		Math.random().toString(36).slice(2, 12) +
		Math.random().toString(36).slice(2, 10)
	);
}

export async function listColeccion(path: string): Promise<DocPlain[]> {
	const db = await readAll();
	return db[path] ?? [];
}

export async function obtenerDoc(
	path: string,
	id: string
): Promise<DocPlain | null> {
	const docs = await listColeccion(path);
	return docs.find((d) => d.id === id) ?? null;
}

export async function crearDoc(
	path: string,
	data: Record<string, unknown>,
	idExplicito?: string
): Promise<string> {
	return withWriteLock(async () => {
		const db = await readAll();
		const id = idExplicito ?? randomId();
		const arr = (db[path] = db[path] ?? []);
		// Si ya existe un doc con ese id (caso de set con id explicito),
		// pisa. Sino agrega.
		const idx = arr.findIndex((d) => d.id === id);
		const doc: DocPlain = { ...data, id };
		if (idx >= 0) arr[idx] = doc;
		else arr.push(doc);
		await writeAll();
		return id;
	});
}

export async function actualizarDoc(
	path: string,
	id: string,
	parcial: Record<string, unknown>
): Promise<void> {
	return withWriteLock(async () => {
		const db = await readAll();
		const arr = db[path] ?? [];
		const idx = arr.findIndex((d) => d.id === id);
		if (idx < 0) {
			throw new Error(`Documento no encontrado: ${path}/${id}`);
		}
		arr[idx] = { ...arr[idx], ...parcial, id }; // id no se sobreescribe
		await writeAll();
	});
}

export async function eliminarDoc(path: string, id: string): Promise<void> {
	return withWriteLock(async () => {
		const db = await readAll();
		const arr = db[path];
		if (!arr) return;
		const idx = arr.findIndex((d) => d.id === id);
		if (idx >= 0) {
			arr.splice(idx, 1);
			await writeAll();
		}
	});
}

// Batch atomico: aplica TODAS las operaciones o ninguna.
export async function batch(ops: WriteOp[]): Promise<void> {
	return withWriteLock(async () => {
		// Snapshot del estado actual para rollback ante error.
		const db = await readAll();
		const backup = JSON.parse(JSON.stringify(db)) as DBSnapshot;
		try {
			for (const op of ops) {
				const arr = (db[op.path] = db[op.path] ?? []);
				if (op.type === 'set') {
					const idx = arr.findIndex((d) => d.id === op.id);
					const doc: DocPlain = { ...op.data, id: op.id };
					if (idx >= 0) arr[idx] = doc;
					else arr.push(doc);
				} else if (op.type === 'update') {
					const idx = arr.findIndex((d) => d.id === op.id);
					if (idx < 0) {
						throw new Error(
							`Documento no encontrado para update: ${op.path}/${op.id}`
						);
					}
					arr[idx] = { ...arr[idx], ...op.data, id: op.id };
				} else {
					const idx = arr.findIndex((d) => d.id === op.id);
					if (idx >= 0) arr.splice(idx, 1);
				}
			}
			await writeAll();
		} catch (err) {
			// Rollback: restauro el snapshot.
			_cache = backup;
			throw err;
		}
	});
}

// CollectionGroup: junta docs de TODAS las colecciones cuyo path termina
// en `name`. Replica el comportamiento de Firestore con un filtro de path
// disponible al caller (el caller puede inspeccionar el path real
// devuelto para filtrar).
export async function collectionGroup(
	name: string
): Promise<{ path: string; doc: DocPlain }[]> {
	const db = await readAll();
	const out: { path: string; doc: DocPlain }[] = [];
	for (const [path, docs] of Object.entries(db)) {
		const segments = path.split('/');
		if (segments[segments.length - 1] === name) {
			for (const doc of docs) out.push({ path, doc });
		}
	}
	return out;
}

// Util para tests / utilidades CLI.
export async function resetDB(): Promise<void> {
	return withWriteLock(async () => {
		_cache = {};
		await writeAll();
	});
}
