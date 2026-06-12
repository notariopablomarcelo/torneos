// Endpoint unico del adapter local. Recibe POST con un body
// `{ op, ...args }` y despacha al modulo de storage. Multiplexa todas las
// operaciones para no abrir un endpoint por funcion.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	actualizarDoc,
	batch,
	collectionGroup,
	crearDoc,
	eliminarDoc,
	listColeccion,
	obtenerDoc,
	resetDB,
	type WriteOp
} from '$lib/db/storage.server';

type Req =
	| { op: 'get'; path: string; id: string }
	| { op: 'list'; path: string }
	| { op: 'add'; path: string; data: Record<string, unknown>; id?: string }
	| { op: 'set'; path: string; id: string; data: Record<string, unknown> }
	| { op: 'update'; path: string; id: string; data: Record<string, unknown> }
	| { op: 'delete'; path: string; id: string }
	| { op: 'batch'; ops: WriteOp[] }
	| { op: 'colgroup'; name: string }
	| { op: 'reset' };

export const POST: RequestHandler = async ({ request }) => {
	let body: Req;
	try {
		body = (await request.json()) as Req;
	} catch {
		throw error(400, 'JSON invalido');
	}

	try {
		switch (body.op) {
			case 'get': {
				const doc = await obtenerDoc(body.path, body.id);
				return json({ exists: doc !== null, data: doc });
			}
			case 'list': {
				const docs = await listColeccion(body.path);
				return json({ docs });
			}
			case 'add': {
				const id = await crearDoc(body.path, body.data, body.id);
				return json({ id });
			}
			case 'set': {
				await crearDoc(body.path, body.data, body.id);
				return json({});
			}
			case 'update': {
				await actualizarDoc(body.path, body.id, body.data);
				return json({});
			}
			case 'delete': {
				await eliminarDoc(body.path, body.id);
				return json({});
			}
			case 'batch': {
				await batch(body.ops);
				return json({});
			}
			case 'colgroup': {
				const items = await collectionGroup(body.name);
				return json({ items });
			}
			case 'reset': {
				await resetDB();
				return json({});
			}
			default:
				throw error(400, 'Operacion desconocida');
		}
	} catch (err) {
		console.error('[api/db] error', err);
		const msg = err instanceof Error ? err.message : String(err);
		throw error(500, msg);
	}
};
