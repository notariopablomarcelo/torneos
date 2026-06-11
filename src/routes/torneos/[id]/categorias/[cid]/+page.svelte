<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import CategoriaForm from '$lib/components/CategoriaForm.svelte';
	import { suscribirTorneo } from '$lib/services/torneos';
	import {
		obtenerCategoria,
		actualizarCategoria,
		eliminarCategoria
	} from '$lib/services/categorias';
	import { suscribirInscripciones } from '$lib/services/inscripciones';
	import { suscribirZonas } from '$lib/services/armado';
	import { AMBIENTE } from '$lib/firebase';
	import { generarCategoriaInput } from '$lib/dev/factories';
	import {
		nombreCategoria,
		obtenerCantidadJugadores,
		sustantivoInscripcion,
		type Categoria,
		type CategoriaInput,
		type Torneo
	} from '$lib/types/torneo';
	import type { Inscripcion } from '$lib/types/inscripcion';
	import type { Zona } from '$lib/types/armado';

	const tid = $derived(page.params.id as string);
	const cid = $derived(page.params.cid as string);

	let torneo = $state<Torneo | null>(null);
	let categoria = $state<Categoria | null>(null);
	let inscripciones = $state<Inscripcion[]>([]);
	let zonas = $state<Zona[]>([]);
	let cargandoCategoria = $state(true);
	let errorCarga = $state<string | null>(null);

	let sheetEditarCat = $state(false);

	const cantidad = $derived(categoria ? obtenerCantidadJugadores(categoria) : 2);
	const estaArmada = $derived((categoria?.armadoConfig ?? null) !== null);

	$effect(() => {
		const t = tid;
		const c = cid;
		cargandoCategoria = true;
		errorCarga = null;
		torneo = null;
		categoria = null;
		inscripciones = [];
		zonas = [];
		sheetEditarCat = false;

		let cancelado = false;
		const unsubT = suscribirTorneo(t, (val) => {
			torneo = val;
		});
		const unsubI = suscribirInscripciones(t, c, (val) => {
			inscripciones = val;
		});
		const unsubZ = suscribirZonas(t, c, (val) => {
			zonas = val;
		});
		(async () => {
			try {
				const cat = await obtenerCategoria(t, c);
				if (cancelado) return;
				categoria = cat;
				if (!cat) errorCarga = 'No se encontró la categoría.';
			} catch (err) {
				if (cancelado) return;
				errorCarga = err instanceof Error ? err.message : 'Error al cargar.';
			} finally {
				if (!cancelado) cargandoCategoria = false;
			}
		})();
		return () => {
			cancelado = true;
			unsubT();
			unsubI();
			unsubZ();
		};
	});

	async function handleEliminarCategoria() {
		if (!categoria) return;
		const ok = confirm(
			`¿Eliminar la categoría "${nombreCategoria(categoria)}"? Se borran también sus inscripciones.`
		);
		if (!ok) return;
		await eliminarCategoria(tid, cid);
		await goto(`/torneos/${tid}`, { replaceState: true });
	}

	async function handleActualizarCategoria(data: CategoriaInput) {
		await actualizarCategoria(tid, cid, data);
		categoria = await obtenerCategoria(tid, cid);
		sheetEditarCat = false;
	}

	const onTestCat = AMBIENTE !== 'prod' ? generarCategoriaInput : undefined;

	// Texto de la sub-info de Inscripciones / Zonas.
	const subInscripciones = $derived(
		inscripciones.length === 0
			? 'Sin inscripciones'
			: `${inscripciones.length} ${
					inscripciones.length === 1
						? sustantivoInscripcion(cantidad)
						: sustantivoInscripcion(cantidad) + 's'
				}`
	);

	const subZonas = $derived(
		!estaArmada
			? 'Sin armar'
			: zonas.length === 1
				? '1 zona'
				: `${zonas.length} zonas`
	);
</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	<a
		href={`/torneos/${tid}`}
		class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
	>
		<i class="bi bi-arrow-left"></i>
		{torneo?.nombre ?? 'Torneo'}
	</a>

	{#if cargandoCategoria}
		<div
			class="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500"
		>
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if errorCarga}
		<div class="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			{errorCarga}
		</div>
	{:else if categoria}
		<!-- Header de la categoria. -->
		<section class="mt-3 mb-6 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
			<div class="p-5">
				<h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">{nombreCategoria(categoria)}</h1>
				<dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
					<dt class="text-gray-500 dark:text-gray-400">Por equipo</dt>
					<dd class="font-medium text-gray-900 dark:text-gray-100">
						{cantidad}
						{cantidad === 1 ? 'jugador' : 'jugadores'}
					</dd>
					<dt class="text-gray-500 dark:text-gray-400">Cupos</dt>
					<dd class="font-medium text-gray-900 dark:text-gray-100">
						{categoria.cupos === null ? 'Sin tope' : categoria.cupos}
					</dd>
				</dl>
			</div>
			<footer
				class="flex items-center justify-end gap-1 border-t border-gray-100 px-3 py-2 dark:border-gray-800"
			>
				<button
					type="button"
					onclick={() => (sheetEditarCat = true)}
					title="Editar categoría"
					aria-label="Editar categoría"
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
				>
					<i class="bi bi-pencil"></i>
				</button>
				<button
					type="button"
					onclick={handleEliminarCategoria}
					title="Eliminar categoría"
					aria-label="Eliminar categoría"
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-700 dark:text-gray-400 dark:hover:bg-red-900/40 dark:hover:text-red-400"
				>
					<i class="bi bi-trash"></i>
				</button>
			</footer>
		</section>

		<!-- 2 cards de drill-down. -->
		<ul class="space-y-3">
			<li>
				<a
					href={`/torneos/${tid}/categorias/${cid}/inscripciones`}
					class="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
				>
					<span
						class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
					>
						<i class="bi bi-people text-xl"></i>
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-base font-semibold text-gray-900 dark:text-gray-100">Inscripciones</p>
						<p class="text-xs text-gray-500 dark:text-gray-400">{subInscripciones}</p>
					</div>
					<i class="bi bi-chevron-right shrink-0 text-base text-gray-300 dark:text-gray-600"></i>
				</a>
			</li>
			<li>
				<a
					href={`/torneos/${tid}/categorias/${cid}/zonas`}
					class="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
				>
					<span
						class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
					>
						<i class="bi bi-diagram-3 text-xl"></i>
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-base font-semibold text-gray-900 dark:text-gray-100">Zonas</p>
						<p class="text-xs text-gray-500 dark:text-gray-400">{subZonas}</p>
					</div>
					<i class="bi bi-chevron-right shrink-0 text-base text-gray-300 dark:text-gray-600"></i>
				</a>
			</li>
		</ul>
	{/if}
</div>

<BottomSheet
	open={sheetEditarCat && categoria !== null}
	onClose={() => (sheetEditarCat = false)}
	title="Editar categoría"
>
	{#if categoria}
		<CategoriaForm
			initial={{
				nivel: categoria.nivel,
				genero: categoria.genero,
				cupos: categoria.cupos,
				cantidadJugadores: obtenerCantidadJugadores(categoria)
			}}
			submitLabel="Guardar"
			onSubmit={handleActualizarCategoria}
			onCancel={() => (sheetEditarCat = false)}
			onTest={onTestCat}
		/>
	{/if}
</BottomSheet>
