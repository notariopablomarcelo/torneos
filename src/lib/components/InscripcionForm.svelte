<script lang="ts">
	import { untrack } from 'svelte';
	import {
		inscripcionInputSchema,
		type InscripcionInput
	} from '$lib/types/inscripcion';
	import type { Jugador } from '$lib/types/jugador';
	import { sustantivoInscripcion } from '$lib/types/torneo';
	import TextField from './TextField.svelte';
	import JugadorSelector from './JugadorSelector.svelte';

	type Props = {
		initial: InscripcionInput;
		cantidadJugadores: number;
		// jugadores: base completa (sin filtrar). Asi el JugadorSelector puede
		// resolver el nombre del seleccionado aunque ya este "ocupado" en
		// otra inscripcion (caso comun apenas se guarda y el snapshot llega).
		jugadores: Jugador[];
		// excluirGlobal: ids ya inscriptos en otras inscripciones de la
		// categoria. Se excluyen del picker pero se siguen resolviendo si
		// vienen como value (no muestra "Jugador no encontrado" por accidente).
		excluirGlobal?: string[];
		submitLabel?: string;
		onSubmit: (data: InscripcionInput) => Promise<void>;
		onCancel?: () => void;
		// onTest devuelve null si no hay suficientes jugadores disponibles.
		onTest?: () => InscripcionInput | null;
		// Si se pasa, aparece boton "Eliminar" rojo a la izquierda del footer.
		onEliminar?: () => Promise<void>;
	};

	let {
		initial,
		cantidadJugadores,
		jugadores,
		excluirGlobal = [],
		submitLabel = 'Guardar',
		onSubmit,
		onCancel,
		onTest,
		onEliminar
	}: Props = $props();

	let borrando = $state(false);

	async function handleEliminarClick() {
		if (!onEliminar) return;
		borrando = true;
		try {
			await onEliminar();
		} finally {
			borrando = false;
		}
	}

	const seed = untrack(() => initial);
	const cantSeed = untrack(() => cantidadJugadores);

	// Vector de N slots (uno por jugador del equipo). Se inicializa desde el
	// initial.jugadores, completando con null los slots faltantes.
	let jugadoresSel = $state<(string | null)[]>(
		Array.from({ length: cantSeed }, (_, i) => seed.jugadores[i] ?? null)
	);
	let rankingStr = $state(seed.ranking === null ? '' : String(seed.ranking));

	// Si la cantidad cambia mientras el form vive (raro pero posible si el
	// padre cambia la categoria sin remount), redimensionar preservando los
	// valores existentes. Skip cuando ya coincide para evitar re-emitir.
	$effect(() => {
		const target = cantidadJugadores;
		if (jugadoresSel.length === target) return;
		if (jugadoresSel.length < target) {
			jugadoresSel = [
				...jugadoresSel,
				...Array(target - jugadoresSel.length).fill(null)
			];
		} else {
			jugadoresSel = jugadoresSel.slice(0, target);
		}
	});

	let errores = $state<Record<string, string[] | undefined>>({});
	let errorGlobal = $state<string | null>(null);
	let guardando = $state(false);

	function excluirPara(slot: number): string[] {
		// Otros slots ocupados, excepto el del slot actual (asi el value propio
		// no se autoexcluye), mas los ya inscriptos globalmente en otras
		// inscripciones de la categoria.
		const otrosSlots = jugadoresSel.filter(
			(id, i): id is string => id !== null && i !== slot
		);
		return [...excluirGlobal, ...otrosSlots];
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errores = {};
		errorGlobal = null;

		const sustantivo = sustantivoInscripcion(cantidadJugadores);

		// Cada slot debe tener jugador.
		const slotsVacios = jugadoresSel.filter((id) => id === null).length;
		if (slotsVacios > 0) {
			errores = { jugadores: [`Falta completar la ${sustantivo}`] };
			return;
		}
		// No duplicados.
		const ids = jugadoresSel as string[];
		if (new Set(ids).size !== ids.length) {
			errores = { jugadores: ['Hay un jugador repetido'] };
			return;
		}

		// Ranking opcional: vacio => null. Si tiene algo debe ser entero >= 1.
		let ranking: number | null = null;
		const rankingTrim = rankingStr.trim();
		if (rankingTrim !== '') {
			const r = Number(rankingTrim);
			if (!Number.isInteger(r) || r < 1) {
				errores = { ranking: ['Tiene que ser un entero >= 1 (o vacío)'] };
				return;
			}
			ranking = r;
		}

		const parsed = inscripcionInputSchema.safeParse({ jugadores: ids, ranking });
		if (!parsed.success) {
			errores = parsed.error.flatten().fieldErrors;
			return;
		}

		guardando = true;
		try {
			await onSubmit(parsed.data);
		} catch (err) {
			errorGlobal = err instanceof Error ? err.message : 'Error al guardar';
		} finally {
			guardando = false;
		}
	}

	function err(campo: 'jugadores' | 'ranking'): string | null {
		return errores[campo]?.[0] ?? null;
	}

	function handleTest() {
		if (!onTest) return;
		const datos = onTest();
		if (!datos) {
			errorGlobal = `No hay suficientes jugadores disponibles (se necesitan ${cantidadJugadores}).`;
			return;
		}
		jugadoresSel = [
			...datos.jugadores,
			...Array.from(
				{ length: Math.max(0, cantidadJugadores - datos.jugadores.length) },
				() => null
			)
		];
		rankingStr = datos.ranking === null ? '' : String(datos.ranking);
		errores = {};
		errorGlobal = null;
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	{#each Array(cantidadJugadores) as _, i (i)}
		<JugadorSelector
			id={`insc-jug-${i}`}
			label={cantidadJugadores === 1 ? 'Jugador' : `Jugador ${i + 1}`}
			value={jugadoresSel[i]}
			onChange={(id) => {
				jugadoresSel[i] = id;
			}}
			{jugadores}
			excluir={excluirPara(i)}
			error={i === 0 ? err('jugadores') : null}
		/>
	{/each}

	<TextField
		id="insc-ranking"
		label="Ranking (opcional)"
		type="text"
		inputmode="numeric"
		pattern="[0-9]*"
		bind:value={rankingStr}
		error={err('ranking')}
	/>

	{#if errorGlobal}
		<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			{errorGlobal}
		</div>
	{/if}

	<div class="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
		<div class="flex items-center gap-2">
			{#if onEliminar}
				<button
					type="button"
					onclick={handleEliminarClick}
					disabled={guardando || borrando}
					class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 sm:flex-none dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/40"
				>
					{#if borrando}
						<i class="bi bi-arrow-clockwise animate-spin"></i>
					{:else}
						<i class="bi bi-trash"></i>
					{/if}
					Eliminar
				</button>
			{/if}
			{#if onTest}
				<button
					type="button"
					onclick={handleTest}
					disabled={guardando || borrando}
					title="Rellenar con datos de prueba"
					class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-400 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 sm:flex-none dark:text-gray-400 dark:hover:bg-gray-800"
				>
					<i class="bi bi-magic"></i>
					Test
				</button>
			{/if}
		</div>
		<div class="flex items-center gap-2 sm:gap-3">
			{#if onCancel}
				<button
					type="button"
					onclick={onCancel}
					disabled={guardando || borrando}
					class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 sm:flex-none dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
				>
					Cancelar
				</button>
			{/if}
			<button
				type="submit"
				disabled={guardando || borrando}
				class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 sm:flex-none"
			>
				{#if guardando}
					<i class="bi bi-arrow-clockwise animate-spin"></i>
				{/if}
				{submitLabel}
			</button>
		</div>
	</div>
</form>
