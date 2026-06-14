<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import BreadcrumbCard from '$lib/components/BreadcrumbCard.svelte';
	import CanchaForm from '$lib/components/CanchaForm.svelte';
	import SedeForm from '$lib/components/SedeForm.svelte';
	import {
		actualizarCancha,
		actualizarSede,
		crearCancha,
		eliminarCancha,
		eliminarSede,
		obtenerSede,
		suscribirCanchas
	} from '$lib/services/sedes';
	import { suscribirUsosDeCanchas } from '$lib/services/programacion';
	import { AMBIENTE } from '$lib/firebase';
	import { generarCanchaInput } from '$lib/dev/factories';
	import type { Cancha, CanchaInput, Sede, SedeInput } from '$lib/types/sede';

	const sid = $derived(page.params.sid as string);

	let sede = $state<Sede | null>(null);
	let canchas = $state<Cancha[]>([]);
	let cargando = $state(true);
	let errorCarga = $state<string | null>(null);
	let canchasEnUso = $state<Set<string>>(new Set());
	let sedesEnUso = $state<Set<string>>(new Set());

	const sedeEnUso = $derived(sedesEnUso.has(sid));
	function canchaEnUso(canchaId: string): boolean {
		return canchasEnUso.has(canchaId);
	}

	let sheetEditarSede = $state(false);
	let sheetNuevaCancha = $state(false);
	let editandoCanchaId = $state<string | null>(null);

	const canchaEditando = $derived(
		editandoCanchaId
			? (canchas.find((c) => c.id === editandoCanchaId) ?? null)
			: null
	);

	$effect(() => {
		const s = sid;
		cargando = true;
		errorCarga = null;
		sede = null;
		canchas = [];
		sheetEditarSede = false;
		sheetNuevaCancha = false;
		editandoCanchaId = null;

		let cancelado = false;
		const unsubC = suscribirCanchas(s, (val) => {
			canchas = val;
		});
		const unsubUsos = suscribirUsosDeCanchas((u) => {
			canchasEnUso = u.canchaIds;
			sedesEnUso = u.sedeIds;
		});

		(async () => {
			try {
				const result = await obtenerSede(s);
				if (cancelado) return;
				sede = result;
				if (!result) errorCarga = 'No se encontró la sede.';
			} catch (err) {
				if (cancelado) return;
				errorCarga = err instanceof Error ? err.message : 'Error al cargar.';
			} finally {
				if (!cancelado) cargando = false;
			}
		})();

		return () => {
			cancelado = true;
			unsubC();
			unsubUsos();
		};
	});

	$effect(() => {
		if (editandoCanchaId && !canchaEditando) {
			editandoCanchaId = null;
		}
	});

	async function handleActualizarSede(data: SedeInput) {
		await actualizarSede(sid, data);
		sede = await obtenerSede(sid);
		sheetEditarSede = false;
	}

	async function handleEliminarSede() {
		if (!sede) return;
		if (sedeEnUso) {
			alert(
				'No se puede eliminar: la sede está siendo usada por algún torneo. Quitala primero de los torneos que usan sus canchas.'
			);
			return;
		}
		const ok = confirm(
			`¿Eliminar la sede "${sede.nombre}"? Se borran también todas sus canchas.`
		);
		if (!ok) return;
		await eliminarSede(sid);
		await goto('/sedes', { replaceState: true });
	}

	async function handleCrearCancha(data: CanchaInput) {
		await crearCancha(sid, data);
		sheetNuevaCancha = false;
	}

	async function handleActualizarCancha(data: CanchaInput) {
		if (!editandoCanchaId) return;
		await actualizarCancha(sid, editandoCanchaId, data);
		editandoCanchaId = null;
	}

	async function handleEliminarCancha() {
		if (!editandoCanchaId || !canchaEditando) return;
		if (canchaEnUso(editandoCanchaId)) {
			alert(
				'No se puede eliminar: la cancha está siendo usada por algún torneo. Quitala primero de los torneos.'
			);
			return;
		}
		const ok = confirm(`¿Eliminar la cancha "${canchaEditando.nombre}"?`);
		if (!ok) return;
		await eliminarCancha(sid, editandoCanchaId);
		editandoCanchaId = null;
	}

	const initialNuevaCancha: CanchaInput = { nombre: '' };

	const onTestCancha =
		AMBIENTE !== 'prod' ? () => generarCanchaInput(canchas) : undefined;
</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	{#if cargando}
		<div
			class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500"
		>
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if errorCarga}
		<div
			class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400"
		>
			{errorCarga}
		</div>
	{:else if sede}
		<a
			href="/sedes"
			class="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
		>
			<i class="bi bi-arrow-left"></i>
			Volver
		</a>

		<BreadcrumbCard
			items={[
				{ prefijo: 'Sede', label: sede.nombre },
				...(sede.direccion ? [{ prefijo: 'Dirección', label: sede.direccion }] : [])
			]}
		>
			{#snippet footer()}
				<div class="flex items-center justify-end gap-1">
					<button
						type="button"
						onclick={() => (sheetEditarSede = true)}
						title="Editar sede"
						aria-label="Editar sede"
						class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
					>
						<i class="bi bi-pencil"></i>
					</button>
					<button
						type="button"
						onclick={handleEliminarSede}
						disabled={sedeEnUso}
						title={sedeEnUso
							? 'No se puede eliminar — la sede está usada por algún torneo'
							: 'Eliminar sede'}
						aria-label="Eliminar sede"
						class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-500 dark:text-gray-400 dark:hover:bg-red-900/40 dark:hover:text-red-400 dark:disabled:hover:text-gray-400"
					>
						<i class="bi bi-trash"></i>
					</button>
				</div>
			{/snippet}
		</BreadcrumbCard>

		<header class="mb-4 flex items-center justify-between">
			<h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Canchas</h1>
			<button
				type="button"
				onclick={() => (sheetNuevaCancha = true)}
				title="Nueva cancha"
				aria-label="Nueva cancha"
				class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600"
			>
				<i class="bi bi-plus-lg text-lg"></i>
			</button>
		</header>

		{#if canchas.length === 0}
			<div
				class="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
			>
				<i class="bi bi-grid-3x3 text-4xl text-gray-300 dark:text-gray-600"></i>
				<p class="mt-3 font-medium">Todavía no hay canchas</p>
				<p class="text-sm">Cargá la primera para poder programar partidos.</p>
			</div>
		{:else}
			<p class="mb-2 text-xs text-gray-400 dark:text-gray-500">
				{canchas.length}
				{canchas.length === 1 ? 'cancha' : 'canchas'}
			</p>
			<ul class="space-y-1.5">
				{#each canchas as c (c.id)}
					{@const enUso = canchaEnUso(c.id)}
					<li>
						<button
							type="button"
							onclick={() => (editandoCanchaId = c.id)}
							aria-label="Editar {c.nombre}"
							class="flex w-full items-center gap-2.5 rounded-[10px] border border-gray-200 bg-white px-3.5 py-3 text-left hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-800"
						>
							<span
								class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
							>
								<i class="bi bi-grid-3x3"></i>
							</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-[15px] font-semibold text-gray-900 dark:text-gray-100">
									{c.nombre}
								</p>
							</div>
							{#if enUso}
								<span
									class="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
									title="Usada por algún torneo"
								>
									<i class="bi bi-link-45deg text-[10px]"></i>
									En uso
								</span>
							{/if}
							<i class="bi bi-chevron-right shrink-0 text-base text-gray-300 dark:text-gray-600"></i>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<BottomSheet open={sheetEditarSede && sede !== null} onClose={() => (sheetEditarSede = false)} title="Editar sede">
	{#if sede}
		<SedeForm
			initial={{ nombre: sede.nombre, direccion: sede.direccion }}
			submitLabel="Guardar"
			onSubmit={handleActualizarSede}
			onCancel={() => (sheetEditarSede = false)}
		/>
	{/if}
</BottomSheet>

<BottomSheet open={sheetNuevaCancha} onClose={() => (sheetNuevaCancha = false)} title="Nueva cancha">
	<CanchaForm
		initial={initialNuevaCancha}
		submitLabel="Crear"
		onSubmit={handleCrearCancha}
		onCancel={() => (sheetNuevaCancha = false)}
		onTest={onTestCancha}
	/>
</BottomSheet>

<BottomSheet
	open={editandoCanchaId !== null && canchaEditando !== null}
	onClose={() => (editandoCanchaId = null)}
	title="Editar cancha"
>
	{#if canchaEditando}
		{@const enUso = canchaEnUso(canchaEditando.id)}
		{#if enUso}
			<div class="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
				<i class="bi bi-info-circle mr-1"></i>
				Esta cancha está siendo usada por algún torneo. Para eliminarla, quitala primero de los torneos.
			</div>
		{/if}
		{#key editandoCanchaId}
			<CanchaForm
				initial={{ nombre: canchaEditando.nombre }}
				submitLabel="Guardar"
				onSubmit={handleActualizarCancha}
				onCancel={() => (editandoCanchaId = null)}
				onEliminar={enUso ? undefined : handleEliminarCancha}
			/>
		{/key}
	{/if}
</BottomSheet>
