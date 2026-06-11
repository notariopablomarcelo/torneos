<script lang="ts">
	import { page } from '$app/state';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import BreadcrumbCard from '$lib/components/BreadcrumbCard.svelte';
	import InscripcionForm from '$lib/components/InscripcionForm.svelte';
	import InscripcionNombres from '$lib/components/InscripcionNombres.svelte';
	import { suscribirTorneo } from '$lib/services/torneos';
	import { obtenerCategoria } from '$lib/services/categorias';
	import { suscribirJugadores } from '$lib/services/jugadores';
	import {
		suscribirInscripciones,
		crearInscripcion,
		actualizarInscripcion,
		eliminarInscripcion
	} from '$lib/services/inscripciones';
	import { AMBIENTE } from '$lib/firebase';
	import { generarInscripcionInput } from '$lib/dev/factories';
	import {
		nombreCategoria,
		obtenerCantidadJugadores,
		sustantivoInscripcion,
		type Categoria,
		type Torneo
	} from '$lib/types/torneo';
	import {
		nombreInscripcion,
		nombresJugadores,
		type Inscripcion,
		type InscripcionInput
	} from '$lib/types/inscripcion';
	import type { Jugador } from '$lib/types/jugador';

	const tid = $derived(page.params.id as string);
	const cid = $derived(page.params.cid as string);

	let torneo = $state<Torneo | null>(null);
	let categoria = $state<Categoria | null>(null);
	let inscripciones = $state<Inscripcion[]>([]);
	let jugadores = $state<Jugador[]>([]);
	let cargandoCategoria = $state(true);
	let cargandoJugadores = $state(true);
	let errorCarga = $state<string | null>(null);

	const cargando = $derived(cargandoCategoria || cargandoJugadores);

	let sheetNueva = $state(false);
	let editandoId = $state<string | null>(null);

	const cantidad = $derived(categoria ? obtenerCantidadJugadores(categoria) : 2);
	const jugadoresPorId = $derived(new Map(jugadores.map((j) => [j.id, j])));

	const inscEditando = $derived(
		editandoId ? (inscripciones.find((i) => i.id === editandoId) ?? null) : null
	);

	$effect(() => {
		const t = tid;
		const c = cid;
		cargandoCategoria = true;
		cargandoJugadores = true;
		errorCarga = null;
		torneo = null;
		categoria = null;
		inscripciones = [];
		sheetNueva = false;
		editandoId = null;

		let cancelado = false;
		const unsubT = suscribirTorneo(t, (val) => {
			torneo = val;
		});
		const unsubI = suscribirInscripciones(t, c, (val) => {
			inscripciones = val;
		});
		const unsubJ = suscribirJugadores((val) => {
			jugadores = val;
			cargandoJugadores = false;
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
			unsubJ();
		};
	});

	$effect(() => {
		if (editandoId && !inscEditando) {
			editandoId = null;
		}
	});

	async function handleCrear(data: InscripcionInput) {
		await crearInscripcion(tid, cid, data);
		sheetNueva = false;
	}

	async function handleActualizar(data: InscripcionInput) {
		if (!editandoId) return;
		await actualizarInscripcion(tid, cid, editandoId, data);
		editandoId = null;
	}

	async function handleEliminar(insc: Inscripcion) {
		const nombre = nombreInscripcion(insc, jugadoresPorId);
		const ok = confirm(`¿Eliminar la ${sustantivoInscripcion(cantidad)} "${nombre}"?`);
		if (!ok) return;
		await eliminarInscripcion(tid, cid, insc.id);
	}

	const ocupadosGlobal = $derived(inscripciones.flatMap((i) => i.jugadores));
	const excluirNueva = $derived(ocupadosGlobal);
	const excluirEdicion = $derived.by(() => {
		if (!inscEditando) return ocupadosGlobal;
		const propios = new Set(inscEditando.jugadores);
		return ocupadosGlobal.filter((id) => !propios.has(id));
	});
	const cantidadDisponiblesNueva = $derived(jugadores.length - ocupadosGlobal.length);

	const rankingsExistentes = $derived(
		inscripciones.map((i) => i.ranking).filter((r): r is number => r !== null)
	);

	const inscripcionesOrdenadas = $derived(
		[...inscripciones].sort((a, b) => {
			if (a.ranking === null && b.ranking === null) return a.creadoEn.localeCompare(b.creadoEn);
			if (a.ranking === null) return 1;
			if (b.ranking === null) return -1;
			return a.ranking - b.ranking;
		})
	);

	const initialNueva: InscripcionInput = {
		jugadores: [],
		ranking: null
	};

	const onTestNueva = $derived(
		AMBIENTE !== 'prod'
			? () => {
					const ocupados = new Set(ocupadosGlobal);
					const disponibles = jugadores.filter((j) => !ocupados.has(j.id));
					return generarInscripcionInput(disponibles, cantidad, rankingsExistentes);
				}
			: undefined
	);
</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	{#if cargando}
		<div class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if errorCarga}
		<div class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
			{errorCarga}
		</div>
	{:else if categoria}
		<a
			href={`/torneos/${tid}/categorias/${cid}`}
			class="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
		>
			<i class="bi bi-arrow-left"></i>
			Volver
		</a>

		<BreadcrumbCard
			items={[
				{ prefijo: 'Torneo', label: torneo?.nombre ?? '—' },
				{ prefijo: 'Categoría', label: nombreCategoria(categoria) }
			]}
		/>

		<header class="mb-4 flex items-center justify-between">
			<h1 class="text-xl font-bold text-gray-900">Inscripciones</h1>
			<button
				type="button"
				onclick={() => (sheetNueva = true)}
				disabled={cantidadDisponiblesNueva < cantidad}
				class="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				<i class="bi bi-plus-lg"></i>
				Nueva {sustantivoInscripcion(cantidad)}
			</button>
		</header>

		{#if jugadores.length < cantidad}
			<div
				class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
			>
				<i class="bi bi-info-circle"></i>
				Faltan jugadores en la base. Cargá al menos {cantidad} desde
				<a href="/jugadores" class="font-medium underline">Jugadores</a> antes de inscribir.
			</div>
		{:else if cantidadDisponiblesNueva < cantidad}
			<div
				class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
			>
				<i class="bi bi-info-circle"></i>
				Todos los jugadores de la base ya están inscriptos en esta categoría.
			</div>
		{/if}

		{#if inscripciones.length === 0}
			<div
				class="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500"
			>
				<i class="bi bi-people text-4xl text-gray-300"></i>
				<p class="mt-3 font-medium">Todavía no hay inscripciones</p>
				<p class="text-sm">
					Cargá la primera para empezar a armar las zonas después.
				</p>
			</div>
		{:else}
			<p class="mb-2 text-xs text-gray-400">
				{inscripciones.length}
				{inscripciones.length === 1
					? sustantivoInscripcion(cantidad)
					: sustantivoInscripcion(cantidad) + 's'}
			</p>
			<ul class="space-y-1.5">
				{#each inscripcionesOrdenadas as i (i.id)}
					<li>
						<button
							type="button"
							onclick={() => (editandoId = i.id)}
							aria-label="Editar {nombreInscripcion(i, jugadoresPorId)}"
							class="flex w-full items-start gap-3 rounded-[10px] border border-gray-200 bg-white p-3 text-left hover:border-gray-300 hover:bg-gray-50"
						>
							<span
								title={i.ranking === null ? 'Sin ranking' : `Ranking ${i.ranking}`}
								class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold {i.ranking ===
								null
									? 'bg-gray-50 text-gray-400'
									: 'bg-gray-100 text-gray-700'}"
							>
								{i.ranking ?? '–'}
							</span>
							<div class="min-w-0 flex-1">
								<InscripcionNombres nombres={nombresJugadores(i, jugadoresPorId)} />
							</div>
							<i class="bi bi-chevron-right shrink-0 text-base text-gray-300"></i>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<BottomSheet
	open={sheetNueva}
	onClose={() => (sheetNueva = false)}
	title={`Nueva ${sustantivoInscripcion(cantidad)}`}
>
	<InscripcionForm
		initial={initialNueva}
		cantidadJugadores={cantidad}
		{jugadores}
		excluirGlobal={excluirNueva}
		submitLabel="Crear"
		onSubmit={handleCrear}
		onCancel={() => (sheetNueva = false)}
		onTest={onTestNueva}
	/>
</BottomSheet>

<BottomSheet
	open={editandoId !== null && inscEditando !== null}
	onClose={() => (editandoId = null)}
	title={`Editar ${sustantivoInscripcion(cantidad)}`}
>
	{#if inscEditando}
		{#key editandoId}
			<InscripcionForm
				initial={{
					jugadores: inscEditando.jugadores,
					ranking: inscEditando.ranking
				}}
				cantidadJugadores={cantidad}
				{jugadores}
				excluirGlobal={excluirEdicion}
				submitLabel="Guardar"
				onSubmit={handleActualizar}
				onCancel={() => (editandoId = null)}
				onEliminar={() => handleEliminar(inscEditando!)}
			/>
		{/key}
	{/if}
</BottomSheet>
