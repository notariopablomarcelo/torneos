<script lang="ts">
	import {
		generarPaleta,
		hexToRgb,
		paleta,
		PALETA_DEFAULT,
		rgbToHex
	} from '$lib/stores/paleta';
	import { tema } from '$lib/stores/tema';

	// El input type=color devuelve valores en lowercase, asi que mantenemos
	// todo el flujo en lowercase para evitar discrepancias.
	const valorActual = $derived($paleta.brand.toLowerCase());
	const rgb = $derived(hexToRgb(valorActual));
	const generada = $derived(generarPaleta(valorActual));
	const niveles = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

	function setBrand(hex: string) {
		paleta.setBrand(hex.toLowerCase());
	}

	function setR(v: number) {
		setBrand(rgbToHex(v, rgb.g, rgb.b));
	}
	function setG(v: number) {
		setBrand(rgbToHex(rgb.r, v, rgb.b));
	}
	function setB(v: number) {
		setBrand(rgbToHex(rgb.r, rgb.g, v));
	}

	function reset() {
		paleta.reset();
	}

	const bgActual = $derived(
		$tema === 'oscuro' ? $paleta.bgDark : $paleta.bgLight
	);

	function setBg(hex: string) {
		const h = hex.toLowerCase();
		if ($tema === 'oscuro') paleta.setBgDark(h);
		else paleta.setBgLight(h);
	}

	// Presets de fondo light (sutiles, neutros).
	const PRESETS_BG_LIGHT: { nombre: string; hex: string }[] = [
		{ nombre: 'Gris muy claro', hex: '#f9fafb' },
		{ nombre: 'Gris claro (default)', hex: '#f3f4f6' },
		{ nombre: 'Gris pálido', hex: '#e5e7eb' },
		{ nombre: 'Crema', hex: '#fafaf9' },
		{ nombre: 'Stone', hex: '#f5f5f4' },
		{ nombre: 'Blanco puro', hex: '#ffffff' }
	];
	const PRESETS_BG_DARK: { nombre: string; hex: string }[] = [
		{ nombre: 'Casi negro (default)', hex: '#030712' },
		{ nombre: 'Gris noche', hex: '#0f172a' },
		{ nombre: 'Gris carbón', hex: '#111827' },
		{ nombre: 'Negro puro', hex: '#000000' },
		{ nombre: 'Gris medio', hex: '#1f2937' }
	];

	// Presets convenientes.
	const PRESETS: { nombre: string; hex: string }[] = [
		{ nombre: 'Azul Francia', hex: PALETA_DEFAULT.brand },
		{ nombre: 'Verde esmeralda', hex: '#10b981' },
		{ nombre: 'Ámbar', hex: '#f59e0b' },
		{ nombre: 'Rojo coral', hex: '#ef4444' },
		{ nombre: 'Violeta', hex: '#8b5cf6' },
		{ nombre: 'Cyan', hex: '#06b6d4' },
		{ nombre: 'Naranja', hex: '#f97316' },
		{ nombre: 'Rosa', hex: '#ec4899' }
	];
</script>

<div class="mx-auto max-w-3xl p-4 sm:p-6">
	<header class="mb-6">
		<h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Configuración</h1>
		<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
			Ajustá la paleta de colores del tema.
		</p>
	</header>

	<!-- Color principal. -->
	<section class="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
		<div class="mb-4 flex items-center justify-between gap-3">
			<div>
				<h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">Color principal</h2>
				<p class="text-xs text-gray-500 dark:text-gray-400">
					Los demás tonos (claros y oscuros) se generan automáticamente.
				</p>
			</div>
			<button
				type="button"
				onclick={reset}
				class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
			>
				<i class="bi bi-arrow-counterclockwise"></i>
				Restablecer
			</button>
		</div>

		<!-- Picker + valores RGB. -->
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
			<div class="flex items-center gap-3">
				<input
					type="color"
					value={valorActual}
					oninput={(e) => setBrand(e.currentTarget.value)}
					aria-label="Color principal"
					class="h-14 w-14 shrink-0 cursor-pointer rounded-lg border border-gray-200 dark:border-gray-700"
				/>
				<div class="font-mono text-sm text-gray-700 dark:text-gray-300">
					{valorActual}
				</div>
			</div>

			<div class="flex-1 space-y-2">
				<label class="flex items-center gap-3">
					<span class="w-4 font-mono text-xs font-semibold text-red-600 dark:text-red-400">R</span>
					<input
						type="range"
						min="0"
						max="255"
						value={rgb.r}
						oninput={(e) => setR(Number(e.currentTarget.value))}
						class="flex-1 accent-red-500"
					/>
					<input
						type="number"
						min="0"
						max="255"
						value={rgb.r}
						oninput={(e) => setR(Number(e.currentTarget.value))}
						class="w-14 rounded-md border border-gray-300 px-2 py-1 text-center text-xs dark:border-gray-700 dark:bg-gray-800"
					/>
				</label>
				<label class="flex items-center gap-3">
					<span class="w-4 font-mono text-xs font-semibold text-green-600 dark:text-green-400">G</span>
					<input
						type="range"
						min="0"
						max="255"
						value={rgb.g}
						oninput={(e) => setG(Number(e.currentTarget.value))}
						class="flex-1 accent-green-500"
					/>
					<input
						type="number"
						min="0"
						max="255"
						value={rgb.g}
						oninput={(e) => setG(Number(e.currentTarget.value))}
						class="w-14 rounded-md border border-gray-300 px-2 py-1 text-center text-xs dark:border-gray-700 dark:bg-gray-800"
					/>
				</label>
				<label class="flex items-center gap-3">
					<span class="w-4 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">B</span>
					<input
						type="range"
						min="0"
						max="255"
						value={rgb.b}
						oninput={(e) => setB(Number(e.currentTarget.value))}
						class="flex-1 accent-blue-500"
					/>
					<input
						type="number"
						min="0"
						max="255"
						value={rgb.b}
						oninput={(e) => setB(Number(e.currentTarget.value))}
						class="w-14 rounded-md border border-gray-300 px-2 py-1 text-center text-xs dark:border-gray-700 dark:bg-gray-800"
					/>
				</label>
			</div>
		</div>

		<!-- Presets rapidos. -->
		<div class="mt-4">
			<p class="mb-2 text-[10px] font-semibold tracking-wider text-gray-400 uppercase dark:text-gray-500">
				Presets
			</p>
			<div class="flex flex-wrap gap-2">
				{#each PRESETS as p (p.hex)}
					<button
						type="button"
						onclick={() => setBrand(p.hex)}
						aria-label={p.nombre}
						title={p.nombre}
						class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 transition hover:scale-110 dark:border-gray-700"
						style="background-color: {p.hex};"
					>
						{#if valorActual === p.hex}
							<i class="bi bi-check text-white drop-shadow"></i>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</section>

	<!-- Color de fondo. -->
	<section class="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
		<div class="mb-4">
			<h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">
				Color de fondo · {$tema === 'oscuro' ? 'Modo oscuro' : 'Modo claro'}
			</h2>
			<p class="text-xs text-gray-500 dark:text-gray-400">
				Se aplica al fondo general de la app. Cada modo (claro / oscuro) tiene su propio color guardado.
			</p>
		</div>

		<div class="flex items-center gap-3">
			<input
				type="color"
				value={bgActual}
				oninput={(e) => setBg(e.currentTarget.value)}
				aria-label="Color de fondo"
				class="h-14 w-14 shrink-0 cursor-pointer rounded-lg border border-gray-200 dark:border-gray-700"
			/>
			<div class="font-mono text-sm text-gray-700 dark:text-gray-300">
				{bgActual}
			</div>
		</div>

		<div class="mt-4">
			<p class="mb-2 text-[10px] font-semibold tracking-wider text-gray-400 uppercase dark:text-gray-500">
				Presets
			</p>
			<div class="flex flex-wrap gap-2">
				{#each $tema === 'oscuro' ? PRESETS_BG_DARK : PRESETS_BG_LIGHT as p (p.hex)}
					<button
						type="button"
						onclick={() => setBg(p.hex)}
						aria-label={p.nombre}
						title={p.nombre}
						class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 transition hover:scale-110 dark:border-gray-700"
						style="background-color: {p.hex};"
					>
						{#if bgActual === p.hex}
							<i class="bi bi-check {$tema === 'oscuro' ? 'text-white' : 'text-gray-700'} drop-shadow"></i>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</section>

	<!-- Vista previa de la paleta. -->
	<section class="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
		<h2 class="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">Paleta generada</h2>
		<div class="grid grid-cols-5 gap-2 sm:grid-cols-10">
			{#each niveles as n (n)}
				<div class="text-center">
					<div
						class="mb-1 h-10 rounded-md ring-1 ring-black/5"
						style="background-color: {generada[n]};"
						title="brand-{n} · {generada[n]}"
					></div>
					<p class="text-[10px] text-gray-500 dark:text-gray-400">{n}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Vista previa de componentes. -->
	<section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
		<h2 class="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">Vista previa</h2>
		<div class="space-y-3">
			<div class="flex flex-wrap items-center gap-3">
				<button class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
					Botón primario
				</button>
				<button class="inline-flex items-center gap-2 rounded-lg border border-brand-500 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/40">
					Botón secundario
				</button>
				<span class="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
					Chip activo
				</span>
			</div>
			<div class="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-700 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
				<i class="bi bi-info-circle"></i>
				Banner informativo con el color de marca.
			</div>
		</div>
	</section>
</div>
