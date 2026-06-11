import { browser } from '$app/environment';
import { writable } from 'svelte/store';

// Store de tema con persistencia en localStorage. El store es la fuente de
// verdad en cliente; la clase .dark en <html> es el reflejo visual y la
// pone el script inline de app.html (antes del primer paint) y este store
// (cada vez que cambia).

export type Tema = 'claro' | 'oscuro';

const STORAGE_KEY = 'torneos:tema';

function leerGuardado(): Tema | null {
	if (!browser) return null;
	try {
		const v = localStorage.getItem(STORAGE_KEY);
		if (v === 'claro' || v === 'oscuro') return v;
	} catch {
		// localStorage puede fallar en modo privado.
	}
	return null;
}

function temaInicial(): Tema {
	const guardado = leerGuardado();
	if (guardado) return guardado;
	if (!browser) return 'claro';
	return window.matchMedia('(prefers-color-scheme: dark)').matches
		? 'oscuro'
		: 'claro';
}

function aplicar(t: Tema) {
	if (!browser) return;
	document.documentElement.classList.toggle('dark', t === 'oscuro');
	try {
		localStorage.setItem(STORAGE_KEY, t);
	} catch {
		// idem.
	}
}

function crear() {
	const inicial = temaInicial();
	const { subscribe, set } = writable<Tema>(inicial);

	// Sincronizamos por si el script inline detecto distinto valor que el
	// store (caso raro pero posible si localStorage cambio entre paints).
	if (browser) aplicar(inicial);

	return {
		subscribe,
		set(t: Tema) {
			aplicar(t);
			set(t);
		},
		toggle() {
			const prev = leerGuardado() ?? temaInicial();
			const next: Tema = prev === 'oscuro' ? 'claro' : 'oscuro';
			aplicar(next);
			set(next);
		}
	};
}

export const tema = crear();
