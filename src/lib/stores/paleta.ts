import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { tema } from './tema';

// Store de paleta de marca: el usuario puede customizar el color brand-500
// (color primario). Desde ese color generamos los 9 tonos de la paleta
// (brand-50 a brand-900) ajustando lightness/saturation en HSL.
//
// El default es el azul Francia (#0072BB) que era el hardcodeado en layout.css.
// Cuando se cambia, las CSS custom properties --color-brand-* se sobrescriben
// en :root, y Tailwind 4 las respeta automaticamente (las utilities bg-brand-*
// usan var(--color-brand-*)).

export type Paleta = {
	brand: string; // hex del color primario (tipo "#0072bb")
	bgLight: string; // hex del fondo en modo claro
	bgDark: string; // hex del fondo en modo oscuro
};

// Defaults equivalentes a las clases Tailwind que veniamos usando:
// - bg-gray-100  → #f3f4f6 (light)
// - bg-gray-950  → #030712 (dark)
export const PALETA_DEFAULT: Paleta = {
	brand: '#0072bb',
	bgLight: '#f3f4f6',
	bgDark: '#030712'
};

const STORAGE_KEY = 'torneos:paleta';

// ===========================================================================
// Conversiones de color
// ===========================================================================

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const h = hex.replace('#', '');
	const r = parseInt(h.substring(0, 2), 16);
	const g = parseInt(h.substring(2, 4), 16);
	const b = parseInt(h.substring(4, 6), 16);
	return { r, g, b };
}

export function rgbToHex(r: number, g: number, b: number): string {
	const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
	const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(
	r: number,
	g: number,
	b: number
): { h: number; s: number; l: number } {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;
	let h = 0;
	let s = 0;
	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case rn:
				h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
				break;
			case gn:
				h = ((bn - rn) / d + 2) * 60;
				break;
			case bn:
				h = ((rn - gn) / d + 4) * 60;
				break;
		}
	}
	return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(
	h: number,
	s: number,
	l: number
): { r: number; g: number; b: number } {
	const sn = Math.max(0, Math.min(100, s)) / 100;
	const ln = Math.max(0, Math.min(100, l)) / 100;
	const c = (1 - Math.abs(2 * ln - 1)) * sn;
	const hp = (((h % 360) + 360) % 360) / 60;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	let r1 = 0;
	let g1 = 0;
	let b1 = 0;
	if (hp >= 0 && hp < 1) {
		r1 = c;
		g1 = x;
	} else if (hp < 2) {
		r1 = x;
		g1 = c;
	} else if (hp < 3) {
		g1 = c;
		b1 = x;
	} else if (hp < 4) {
		g1 = x;
		b1 = c;
	} else if (hp < 5) {
		r1 = x;
		b1 = c;
	} else {
		r1 = c;
		b1 = x;
	}
	const m = ln - c / 2;
	return {
		r: Math.round((r1 + m) * 255),
		g: Math.round((g1 + m) * 255),
		b: Math.round((b1 + m) * 255)
	};
}

// ===========================================================================
// Generacion de la paleta brand-50..900
// ===========================================================================

// Niveles de la paleta Tailwind tipica. Para cada uno definimos un L objetivo
// (lightness 0-100). El S se mantiene igual al base, salvo en los tonos muy
// claros (50, 100) donde se baja un poco para que no se vean "neon".
const NIVELES_L: { nivel: number; l: number; sMul: number }[] = [
	{ nivel: 50, l: 97, sMul: 0.55 },
	{ nivel: 100, l: 92, sMul: 0.65 },
	{ nivel: 200, l: 82, sMul: 0.8 },
	{ nivel: 300, l: 67, sMul: 0.9 },
	{ nivel: 400, l: 52, sMul: 1 },
	{ nivel: 500, l: 0, sMul: 1 }, // base (l se pisa con el valor del color)
	{ nivel: 600, l: -8, sMul: 1 }, // base - 8
	{ nivel: 700, l: -15, sMul: 1 },
	{ nivel: 800, l: -22, sMul: 1 },
	{ nivel: 900, l: -28, sMul: 1 }
];

// Genera el mapa de paleta a partir del color base.
export function generarPaleta(brandHex: string): Record<number, string> {
	const rgb = hexToRgb(brandHex);
	const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
	const out: Record<number, string> = {};
	for (const def of NIVELES_L) {
		let l: number;
		if (def.nivel === 500) {
			l = hsl.l;
		} else if (def.nivel < 500) {
			l = def.l; // tints: L absoluto.
		} else {
			l = Math.max(5, Math.min(95, hsl.l + def.l)); // shades: relativo al base.
		}
		const s = Math.max(0, Math.min(100, hsl.s * def.sMul));
		const newRgb = hslToRgb(hsl.h, s, l);
		out[def.nivel] = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
	}
	return out;
}

// ===========================================================================
// Aplicacion al DOM
// ===========================================================================

function aplicar(paleta: Paleta) {
	if (!browser) return;
	const generados = generarPaleta(paleta.brand);
	const root = document.documentElement;
	for (const [nivel, hex] of Object.entries(generados)) {
		root.style.setProperty(`--color-brand-${nivel}`, hex);
	}
	// Fondo del body segun el tema actual. Aplicamos como style inline para no
	// tener que editar app.html (la clase tailwind bg-gray-100 / dark:bg-gray-950
	// queda como fallback inicial; este style la sobreescribe).
	const esOscuro = root.classList.contains('dark');
	if (document.body) {
		document.body.style.backgroundColor = esOscuro
			? paleta.bgDark
			: paleta.bgLight;
	}
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(paleta));
	} catch {
		// ignore
	}
}

function leerGuardada(): Paleta | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<Paleta>;
		if (typeof parsed?.brand !== 'string') return null;
		// Mantenemos compat retroactiva: si la version guardada no tiene bgLight
		// o bgDark, completamos con el default.
		return {
			brand: parsed.brand,
			bgLight: typeof parsed.bgLight === 'string' ? parsed.bgLight : PALETA_DEFAULT.bgLight,
			bgDark: typeof parsed.bgDark === 'string' ? parsed.bgDark : PALETA_DEFAULT.bgDark
		};
	} catch {
		// ignore
	}
	return null;
}

function paletaInicial(): Paleta {
	return leerGuardada() ?? PALETA_DEFAULT;
}

// ===========================================================================
// Store publico
// ===========================================================================

function crear() {
	const inicial = paletaInicial();
	const { subscribe, set, update } = writable<Paleta>(inicial);

	if (browser) {
		aplicar(inicial);
		// Cuando cambia el tema (claro <-> oscuro), reaplicar el fondo del body
		// para que use el color guardado de ese modo.
		tema.subscribe(() => {
			let actual: Paleta = inicial;
			subscribe((p) => (actual = p))();
			aplicar(actual);
		});
	}

	function patch(partial: Partial<Paleta>) {
		update((p) => {
			const next = { ...p, ...partial };
			aplicar(next);
			return next;
		});
	}

	return {
		subscribe,
		set(p: Paleta) {
			aplicar(p);
			set(p);
		},
		setBrand(brand: string) {
			patch({ brand });
		},
		setBgLight(bgLight: string) {
			patch({ bgLight });
		},
		setBgDark(bgDark: string) {
			patch({ bgDark });
		},
		reset() {
			aplicar(PALETA_DEFAULT);
			set(PALETA_DEFAULT);
		}
	};
}

export const paleta = crear();
