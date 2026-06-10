<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import CategoriaForm from '$lib/components/CategoriaForm.svelte';
	import { suscribirTorneo, eliminarTorneo } from '$lib/services/torneos';
	import {
		suscribirCategorias,
		crearCategoria,
		actualizarCategoria,
		eliminarCategoria
	} from '$lib/services/categorias';
	import { AMBIENTE } from '$lib/firebase';
	import { generarCategoriaInput } from '$lib/dev/factories';
	import {
		GENEROS_CATEGORIA,
		NIVELES_CATEGORIA,
		nombreCategoria,
		type Torneo,
		type Categoria,
		type CategoriaInput
	} from '$lib/types/torneo';

	// El parametro [id] siempre esta presente cuando esta ruta matchea,
	// pero el tipo generado es string | undefined. Afirmamos.
	const id = $derived(page.params.id as string);

	let torneo = $state<Torneo | null>(null);
	let cargandoTorneo = $state(true);
	let categorias = $state<Categoria[]>([]);
	let cargandoCats = $state(true);

	// Estado de los sheets. Dos booleans/ids en lugar de un enum porque cada
	// sheet es independiente y puede abrirse/cerrarse con su propia accion.
	let sheetNueva = $state(false);
	let editandoId = $state<string | null>(null);

	const catEditando = $derived(
		editandoId ? (categorias.find((c) => c.id === editandoId) ?? null) : null
	);

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
		// Limpiamos los sheets para no quedar editando una categoria del
		// torneo anterior.
		sheetNueva = false;
		editandoId = null;

		const unsubT = suscribirTorneo(tid, (t) => {
			torneo = t;
			cargandoTorneo = false;
		});
		const unsubC = suscribirCategorias(tid, (c) => {
			categorias = c;
			cargandoCats = false;
		});
		return () => {
			unsubT();
			unsubC();
		};
	});

	// Si la categoria que se esta editando desaparece (otro cliente la borro,
	// o el snapshot llego antes), cerramos el sheet para que la UI no quede
	// con un sheet abierto sobre datos invalidos.
	$effect(() => {
		if (editandoId && !catEditando) {
			editandoId = null;
		}
	});

	function rangoFechas(t: Torneo): string {
		const inicio = new Date(t.fechaInicio + 'T00:00:00');
		const fin = new Date(t.fechaFin + 'T00:00:00');
		const fmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' });
		if (t.fechaInicio === t.fechaFin) return fmt.format(inicio);
		return `${fmt.format(inicio)} – ${fmt.format(fin)}`;
	}

	async function handleEliminarTorneo() {
		if (!torneo) return;
		const ok = confirm(
			`¿Eliminar el torneo "${torneo.nombre}"? Se borran también sus categorías.`
		);
		if (!ok) return;
		await eliminarTorneo(id);
		await goto('/torneos', { replaceState: true });
	}

	async function handleCrearCat(data: CategoriaInput) {
		await crearCategoria(id, data);
		sheetNueva = false;
	}

	async function handleActualizarCat(data: CategoriaInput) {
		if (!editandoId) return;
		await actualizarCategoria(id, editandoId, data);
		editandoId = null;
	}

	async function handleEliminarCat(cat: Categoria) {
		const ok = confirm(`¿Eliminar la categoría "${nombreCategoria(cat)}"?`);
		if (!ok) return;
		await eliminarCategoria(id, cat.id);
	}

	const initialNuevaCat: CategoriaInput = {
		nivel: '4ta',
		genero: 'Caballeros',
		cupos: null
	};

	// Boton "Test" disponible solo fuera de produccion.
	const onTestCat = AMBIENTE !== 'prod' ? generarCategoriaInput : undefined;
</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	<a
		href="/torneos"
		class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
	>
		<i class="bi bi-arrow-left"></i>
		Torneos
	</a>

	{#if cargandoTorneo}
		<div class="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if !torneo}
		<div class="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
			No se encontró el torneo.
		</div>
	{:else}
		<header class="mt-3 mb-6 flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold text-gray-900">{torneo.nombre}</h1>
				<p class="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
					<i class="bi bi-calendar-event"></i>
					{rangoFechas(torneo)}
				</p>
			</div>
			<div class="flex items-center gap-2">
				<a
					href={`/torneos/${id}/editar`}
					class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
				>
					<i class="bi bi-pencil"></i>
					Editar
				</a>
				<button
					type="button"
					onclick={handleEliminarTorneo}
					class="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
				>
					<i class="bi bi-trash"></i>
					Eliminar
				</button>
			</div>
		</header>

		<section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900">Categorías</h2>
				<button
					type="button"
					onclick={() => (sheetNueva = true)}
					class="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
				>
					<i class="bi bi-plus-lg"></i>
					Nueva categoría
				</button>
			</div>

			{#if cargandoCats}
				<p class="py-8 text-center text-sm text-gray-400">
					<i class="bi bi-arrow-clockwise animate-spin"></i> Cargando…
				</p>
			{:else if categorias.length === 0}
				<p class="py-8 text-center text-sm text-gray-500">
					Todavía no hay categorías. Creá la primera para arrancar.
				</p>
			{:else}
				<ul class="divide-y divide-gray-100">
					{#each categoriasOrdenadas as c (c.id)}
						<li class="flex items-center justify-between gap-3 py-3">
							<div class="min-w-0">
								<p class="font-medium text-gray-900">{nombreCategoria(c)}</p>
								<p class="text-xs text-gray-500">
									{c.cupos === null ? 'Sin tope de cupos' : `${c.cupos} cupos`}
								</p>
							</div>
							<div class="flex shrink-0 items-center gap-1">
								<button
									type="button"
									onclick={() => (editandoId = c.id)}
									class="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
									aria-label="Editar {nombreCategoria(c)}"
								>
									<i class="bi bi-pencil"></i>
								</button>
								<button
									type="button"
									onclick={() => handleEliminarCat(c)}
									class="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700"
									aria-label="Eliminar {nombreCategoria(c)}"
								>
									<i class="bi bi-trash"></i>
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<!-- Sheet de nueva categoria: form en blanco. -->
<BottomSheet
	open={sheetNueva}
	onClose={() => (sheetNueva = false)}
	title="Nueva categoría"
>
	<CategoriaForm
		initial={initialNuevaCat}
		submitLabel="Crear"
		onSubmit={handleCrearCat}
		onCancel={() => (sheetNueva = false)}
		onTest={onTestCat}
	/>
</BottomSheet>

<!-- Sheet de editar categoria: form precargado con la categoria activa. El
     {#key editandoId} fuerza remount al cambiar de A a B sin cerrar antes. -->
<BottomSheet
	open={editandoId !== null && catEditando !== null}
	onClose={() => (editandoId = null)}
	title="Editar categoría"
>
	{#if catEditando}
		{#key editandoId}
			<CategoriaForm
				initial={{
					nivel: catEditando.nivel,
					genero: catEditando.genero,
					cupos: catEditando.cupos
				}}
				submitLabel="Guardar cambios"
				onSubmit={handleActualizarCat}
				onCancel={() => (editandoId = null)}
			/>
		{/key}
	{/if}
</BottomSheet>
