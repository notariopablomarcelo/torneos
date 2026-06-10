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

	async function handleEliminar(j: Jugador) {
		const ok = confirm(`¿Eliminar al jugador "${j.nombreCompleto}"?`);
		if (!ok) return;
		await eliminarJugador(j.id);
	}

	const initialNuevo: JugadorInput = {
		nombreCompleto: '',
		telefono: null
	};

	const onTest = AMBIENTE !== 'prod' ? generarJugadorInput : undefined;
</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	<header class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Jugadores</h1>
			<p class="text-sm text-gray-500">Base global de jugadores reutilizable entre torneos.</p>
		</div>
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
				class="bi bi-search absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
			></i>
			<input
				type="search"
				bind:value={busqueda}
				placeholder="Buscar por nombre…"
				aria-label="Buscar jugador"
				class="w-full rounded-lg border border-gray-300 bg-white py-2 pr-3 pl-9 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
			/>
		</div>
	</div>

	{#if cargando}
		<div class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
			<p class="mt-2 text-sm">Cargando…</p>
		</div>
	{:else if jugadores.length === 0}
		<div
			class="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500"
		>
			<i class="bi bi-person text-4xl text-gray-300"></i>
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
		<div class="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
			Sin resultados para "{busqueda}".
		</div>
	{:else}
		<ul class="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
			{#each jugadoresFiltrados as j (j.id)}
				<li class="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
					<div class="min-w-0">
						<p class="font-medium text-gray-900">{j.nombreCompleto}</p>
						<p class="text-xs text-gray-500">
							{j.telefono ?? 'Sin teléfono'}
						</p>
					</div>
					<div class="flex shrink-0 items-center gap-1">
						<button
							type="button"
							onclick={() => (editandoId = j.id)}
							class="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
							aria-label="Editar {j.nombreCompleto}"
						>
							<i class="bi bi-pencil"></i>
						</button>
						<button
							type="button"
							onclick={() => handleEliminar(j)}
							class="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700"
							aria-label="Eliminar {j.nombreCompleto}"
						>
							<i class="bi bi-trash"></i>
						</button>
					</div>
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
				submitLabel="Guardar cambios"
				onSubmit={handleActualizar}
				onCancel={() => (editandoId = null)}
			/>
		{/key}
	{/if}
</BottomSheet>
