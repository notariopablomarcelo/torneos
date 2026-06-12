<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import RangoFechas from '$lib/components/RangoFechas.svelte';
	import { suscribirTorneo, eliminarTorneo } from '$lib/services/torneos';
	import { suscribirCategorias } from '$lib/services/categorias';
	import { suscribirCanchasDelTorneo } from '$lib/services/programacion';
	import type { TorneoCancha } from '$lib/types/programacion';
	import {
		GENEROS_CATEGORIA,
		NIVELES_CATEGORIA,
		nombreCategoria,
		type Torneo,
		type Categoria
	} from '$lib/types/torneo';
	// El alta y la edicion de categoria viven en pantallas dedicadas
	// (/categorias/nueva y /categorias/[cid]/editar) — esta lista solo
	// navega hacia esas pantallas.

	// El parametro [id] siempre esta presente cuando esta ruta matchea,
	// pero el tipo generado es string | undefined. Afirmamos.
	const id = $derived(page.params.id as string);

	let torneo = $state<Torneo | null>(null);
	let cargandoTorneo = $state(true);
	let categorias = $state<Categoria[]>([]);
	let cargandoCats = $state(true);
	let canchasTorneo = $state<TorneoCancha[]>([]);

	// Listado ordenado por nivel (1ra -> 9na) y, dentro del mismo nivel, por
	// genero (Caballeros -> Damas -> Mixto). El orden viene de la posicion en
	// los arrays canonicos NIVELES_CATEGORIA y GENEROS_CATEGORIA.
	const categoriasOrdenadas = $derived(
		[...categorias].sort((a, b) => {
			const d = NIVELES_CATEGORIA.indexOf(a.nivel) - NIVELES_CATEGORIA.indexOf(b.nivel);
			if (d !== 0) return d;
			return GENEROS_CATEGORIA.indexOf(a.genero) - GENEROS_CATEGORIA.indexOf(b.genero);
		})
	);

	// $effect (en vez de onMount) para que las suscripciones se renueven si
	// SvelteKit reusa la instancia del componente al navegar entre /torneos/A
	// y /torneos/B. Al cambiar id, el cleanup desuscribe y se re-suscribe al
	// nuevo torneo. Reseteamos los flags de carga para mostrar el loader.
	$effect(() => {
		const tid = id;
		cargandoTorneo = true;
		cargandoCats = true;
		torneo = null;
		categorias = [];

		const unsubT = suscribirTorneo(tid, (t) => {
			torneo = t;
			cargandoTorneo = false;
		});
		const unsubC = suscribirCategorias(tid, (c) => {
			categorias = c;
			cargandoCats = false;
		});
		const unsubCanchas = suscribirCanchasDelTorneo(tid, (cs) => {
			canchasTorneo = cs;
		});
		return () => {
			unsubT();
			unsubC();
			unsubCanchas();
		};
	});

	const subCanchas = $derived(
		canchasTorneo.length === 0
			? 'Sin canchas'
			: `${canchasTorneo.length} ${canchasTorneo.length === 1 ? 'cancha' : 'canchas'}`
	);


	async function handleEliminarTorneo() {
		if (!torneo) return;
		const ok = confirm(
			`¿Eliminar el torneo "${torneo.nombre}"? Se borran también sus categorías.`
		);
		if (!ok) return;
		await eliminarTorneo(id);
		await goto('/torneos', { replaceState: true });
	}

</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	<a
		href="/torneos"
		class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
	>
		<i class="bi bi-arrow-left"></i>
		Torneos
	</a>

	{#if cargandoTorneo}
		<div class="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if !torneo}
		<div class="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			No se encontró el torneo.
		</div>
	{:else}
		<section class="mt-3 mb-6 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
			<div class="p-5">
				<h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">{torneo.nombre}</h1>
				<div class="mt-2">
					<RangoFechas inicio={torneo.fechaInicio} fin={torneo.fechaFin} />
				</div>
			</div>
			<footer class="flex items-center justify-end gap-1 border-t border-gray-100 px-3 py-2 dark:border-gray-800">
				<a
					href={`/torneos/${id}/editar`}
					title="Editar torneo"
					aria-label="Editar torneo"
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
				>
					<i class="bi bi-pencil"></i>
				</a>
				<button
					type="button"
					onclick={handleEliminarTorneo}
					title="Eliminar torneo"
					aria-label="Eliminar torneo"
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-700 dark:text-gray-400 dark:hover:bg-red-900/40 dark:hover:text-red-400"
				>
					<i class="bi bi-trash"></i>
				</button>
			</footer>
		</section>

		<!-- Cards de gestion del torneo (canchas + programacion). -->
		<div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
			<a
				href={`/torneos/${id}/canchas`}
				class="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
			>
				<span
					class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
				>
					<i class="bi bi-grid-3x3 text-xl"></i>
				</span>
				<div class="min-w-0 flex-1">
					<p class="text-base font-semibold text-gray-900 dark:text-gray-100">Canchas</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">{subCanchas}</p>
				</div>
				<i class="bi bi-chevron-right shrink-0 text-base text-gray-300 dark:text-gray-600"></i>
			</a>
			<a
				href={`/torneos/${id}/programacion`}
				class="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
			>
				<span
					class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
				>
					<i class="bi bi-calendar3 text-xl"></i>
				</span>
				<div class="min-w-0 flex-1">
					<p class="text-base font-semibold text-gray-900 dark:text-gray-100">Programación</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">Asignar fecha, hora y cancha</p>
				</div>
				<i class="bi bi-chevron-right shrink-0 text-base text-gray-300 dark:text-gray-600"></i>
			</a>
		</div>

		<section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Categorías</h2>
				<a
					href={`/torneos/${id}/categorias/nueva`}
					title="Nueva categoría"
					aria-label="Nueva categoría"
					class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600"
				>
					<i class="bi bi-plus-lg text-lg"></i>
				</a>
			</div>

			{#if cargandoCats}
				<p class="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
					<i class="bi bi-arrow-clockwise animate-spin"></i> Cargando…
				</p>
			{:else if categorias.length === 0}
				<p class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
					Todavía no hay categorías. Creá la primera para arrancar.
				</p>
			{:else}
				<!-- Mismo divisor que la lista de inscripciones del detalle de
				     categoria, para consistencia visual. -->
				<ul class="divide-y-2 divide-gray-200 dark:divide-gray-700">
					{#each categoriasOrdenadas as c (c.id)}
						<li>
							<a
								href={`/torneos/${id}/categorias/${c.id}`}
								class="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-gray-50 dark:hover:bg-gray-800"
							>
								<div class="min-w-0 flex-1">
									<p class="font-medium text-gray-900 dark:text-gray-100">{nombreCategoria(c)}</p>
									<p class="text-xs text-gray-500 dark:text-gray-400">
										{c.cupos === null ? 'Sin tope de cupos' : `${c.cupos} cupos`}
									</p>
								</div>
								<i class="bi bi-chevron-right text-gray-400 dark:text-gray-500"></i>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

