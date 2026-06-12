<script lang="ts">
	import { onMount } from 'svelte';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import JugadorForm from '$lib/components/JugadorForm.svelte';
	import {
		suscribirJugadores,
		crearJugador,
		actualizarJugador,
		eliminarJugador
	} from '$lib/services/jugadores';
	import { AMBIENTE } from '$lib/firebase';
	import { generarJugadorInput } from '$lib/dev/factories';
	import type { Jugador, JugadorInput } from '$lib/types/jugador';

	let jugadores = $state<Jugador[]>([]);
	let cargando = $state(true);
	let busqueda = $state('');

	let sheetNuevo = $state(false);
	let editandoId = $state<string | null>(null);

	const jugadorEditando = $derived(
		editandoId ? (jugadores.find((j) => j.id === editandoId) ?? null) : null
	);

	// Quita acentos para que "martin" matchee "Martín" y "n" matchee "Ñ".
	// Despues lowercase para case-insensitive.
	function normalizar(s: string): string {
		return s
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase();
	}

	const jugadoresFiltrados = $derived.by(() => {
		const q = normalizar(busqueda.trim());
		const base = q
			? jugadores.filter((j) => normalizar(j.nombreCompleto).includes(q))
			: jugadores;
		// Orden alfabetico locale-aware. Firestore ordena por bytes UTF-8 (Ñ
		// despues de Z, acentos al final); en cliente con localeCompare('es')
		// queda como espera un hispanohablante.
		return [...base].sort((a, b) =>
			a.nombreCompleto.localeCompare(b.nombreCompleto, 'es', { sensitivity: 'base' })
		);
	});

	onMount(() => {
		const unsub = suscribirJugadores((js) => {
			jugadores = js;
			cargando = false;
		});
		return unsub;
	});

	// Si el jugador que se esta editando desaparece, cerramos el sheet.
	$effect(() => {
		if (editandoId && !jugadorEditando) {
			editandoId = null;
		}
	});

	async function handleCrear(data: JugadorInput) {
		await crearJugador(data);
		sheetNuevo = false;
	}

	async function handleActualizar(data: JugadorInput) {
		if (!editandoId) return;
		await actualizarJugador(editandoId, data);
		editandoId = null;
	}

	async function handleEliminar() {
		if (!editandoId || !jugadorEditando) return;
		const ok = confirm(
			`¿Eliminar al jugador "${jugadorEditando.nombreCompleto}"?`
		);
		if (!ok) return;
		await eliminarJugador(editandoId);
		editandoId = null;
	}

	const initialNuevo: JugadorInput = {
		nombreCompleto: '',
		telefono: null
	};

	// Pasamos la lista de nombreCompleto ya cargados para que la factory los
	// evite. Asi clickear Test no genera duplicados.
	const onTest =
		AMBIENTE !== 'prod'
			? () =>
					generarJugadorInput(new Set(jugadores.map((j) => j.nombreCompleto)))
			: undefined;
</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	<header class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Jugadores</h1>
		<button
			type="button"
			onclick={() => (sheetNuevo = true)}
			title="Nuevo jugador"
			aria-label="Nuevo jugador"
			class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600"
		>
			<i class="bi bi-plus-lg text-lg"></i>
		</button>
	</header>

	<div class="mb-4">
		<div class="relative">
			<i
				class="bi bi-search absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 dark:text-gray-500"
			></i>
			<input
				type="search"
				bind:value={busqueda}
				placeholder="Buscar por nombre…"
				aria-label="Buscar jugador"
				class="w-full rounded-lg border border-gray-300 bg-white py-2 pr-3 pl-9 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none dark:border-gray-700 dark:bg-gray-900"
			/>
		</div>
	</div>

	{#if cargando}
		<div class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
			<p class="mt-2 text-sm">Cargando…</p>
		</div>
	{:else if jugadores.length === 0}
		<div
			class="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
		>
			<i class="bi bi-person text-4xl text-gray-300 dark:text-gray-600"></i>
			<p class="mt-3 font-medium">Todavía no hay jugadores</p>
			<p class="text-sm">Cargá el primero para empezar a usarlos en los torneos.</p>
			<button
				type="button"
				onclick={() => (sheetNuevo = true)}
				class="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
			>
				<i class="bi bi-plus-lg"></i>
				Nuevo jugador
			</button>
		</div>
	{:else if jugadoresFiltrados.length === 0}
		<div class="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
			Sin resultados para "{busqueda}".
		</div>
	{:else}
		<!-- Contador chico arriba de la lista, estilo PadelRoom. -->
		<p class="mb-2 text-xs text-gray-400 dark:text-gray-500">
			{jugadoresFiltrados.length}
			{jugadoresFiltrados.length === 1 ? 'jugador' : 'jugadores'}
		</p>
		<!-- Card por jugador. Todo el card es clickeable → abre el modal de
		     edicion (no hay vista de detalle por ahora, asi que la accion
		     primaria es editar). Eliminar vive adentro del modal. -->
		<ul class="space-y-1.5">
			{#each jugadoresFiltrados as j (j.id)}
				<li>
					<button
						type="button"
						onclick={() => (editandoId = j.id)}
						aria-label="Editar {j.nombreCompleto}"
						class="flex w-full items-center gap-2.5 rounded-[10px] border border-gray-200 bg-white px-3.5 py-3 text-left hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-800"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate text-[15px] font-semibold text-gray-900 dark:text-gray-100">
								{j.nombreCompleto}
							</p>
							{#if j.telefono}
								<p class="truncate text-xs text-gray-500 dark:text-gray-400">{j.telefono}</p>
							{:else}
								<p class="truncate text-xs text-amber-700 italic dark:text-amber-300">Sin teléfono</p>
							{/if}
						</div>
						<i class="bi bi-chevron-right shrink-0 text-base text-gray-300 dark:text-gray-600"></i>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<BottomSheet open={sheetNuevo} onClose={() => (sheetNuevo = false)} title="Nuevo jugador">
	<JugadorForm
		initial={initialNuevo}
		submitLabel="Crear"
		onSubmit={handleCrear}
		onCancel={() => (sheetNuevo = false)}
		{onTest}
	/>
</BottomSheet>

<BottomSheet
	open={editandoId !== null && jugadorEditando !== null}
	onClose={() => (editandoId = null)}
	title="Editar jugador"
>
	{#if jugadorEditando}
		{#key editandoId}
			<JugadorForm
				initial={{
					nombreCompleto: jugadorEditando.nombreCompleto,
					telefono: jugadorEditando.telefono
				}}
				submitLabel="Guardar"
				onSubmit={handleActualizar}
				onCancel={() => (editandoId = null)}
				onEliminar={handleEliminar}
			/>
		{/key}
	{/if}
</BottomSheet>
