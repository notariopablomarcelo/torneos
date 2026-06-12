<script lang="ts">
	import { untrack } from 'svelte';
	import {
		inscripcionInputSchema,
		type BloqueoJugador,
		type InscripcionInput
	} from '$lib/types/inscripcion';
	import type { Jugador } from '$lib/types/jugador';
	import { sustantivoInscripcion } from '$lib/types/torneo';
	import TextField from './TextField.svelte';
	import JugadorSelector from './JugadorSelector.svelte';
	import { etiquetaFechaCorta } from '$lib/dates';

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
		// Fechas del torneo (YYYY-MM-DD) — necesarias para mostrar los dias en
		// los que el jugador puede declarar bloqueos. Si esta vacio, la
		// seccion de bloqueos no se muestra (caso fallback / contexto sin
		// fechas).
		fechasTorneo?: string[];
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
		fechasTorneo = [],
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

	// Bloqueos por jugador. Estado local indexado por jugadorId para que el
	// toggle y el redraw sean O(1). Cada entrada es la lista de bloqueos
	// horarios de ese jugador para este torneo. Al cambiar el jugador de un
	// slot (slot.onChange), los bloqueos del jugador SALIENTE se descartan
	// para no mandar bloqueos huerfanos al guardar.
	let bloqueosPorJugador = $state<Record<string, BloqueoJugador[]>>(
		(() => {
			const inicial: Record<string, BloqueoJugador[]> = {};
			for (const b of seed.bloqueosJugadores ?? []) {
				const arr = inicial[b.jugadorId] ?? [];
				arr.push(b);
				inicial[b.jugadorId] = arr;
			}
			return inicial;
		})()
	);

	const jugadoresPorId = $derived(new Map(jugadores.map((j) => [j.id, j])));

	function nombreDe(jid: string): string {
		return jugadoresPorId.get(jid)?.nombreCompleto ?? 'Jugador';
	}

	function bloqueosDe(jid: string, fecha: string): BloqueoJugador[] {
		return (bloqueosPorJugador[jid] ?? []).filter((b) => b.fecha === fecha);
	}

	function agregarBloqueo(jid: string, fecha: string) {
		const arr = bloqueosPorJugador[jid] ?? [];
		bloqueosPorJugador = {
			...bloqueosPorJugador,
			[jid]: [...arr, { jugadorId: jid, fecha, desde: '12:00', hasta: '14:00' }]
		};
	}

	function setBloqueoCampo(
		jid: string,
		fecha: string,
		indiceEnFecha: number,
		campo: 'desde' | 'hasta',
		valor: string
	) {
		const todos = bloqueosPorJugador[jid] ?? [];
		const nuevos: BloqueoJugador[] = [];
		let i = 0;
		for (const b of todos) {
			if (b.fecha === fecha && i === indiceEnFecha) {
				nuevos.push({ ...b, [campo]: valor });
				i += 1;
			} else {
				if (b.fecha === fecha) i += 1;
				nuevos.push(b);
			}
		}
		bloqueosPorJugador = { ...bloqueosPorJugador, [jid]: nuevos };
	}

	function quitarBloqueo(jid: string, fecha: string, indiceEnFecha: number) {
		const todos = bloqueosPorJugador[jid] ?? [];
		const nuevos: BloqueoJugador[] = [];
		let i = 0;
		for (const b of todos) {
			if (b.fecha === fecha && i === indiceEnFecha) {
				i += 1;
				continue;
			}
			if (b.fecha === fecha) i += 1;
			nuevos.push(b);
		}
		bloqueosPorJugador = { ...bloqueosPorJugador, [jid]: nuevos };
	}

	// Al cambiar de jugador en un slot, limpiamos los bloqueos del jugador
	// que salio (si ya no esta en ningun slot). Asi al guardar no quedan
	// bloqueos huerfanos referenciando jugadores que no estan en la
	// inscripcion.
	function onCambioJugador(slot: number, nuevoId: string | null) {
		const anterior = jugadoresSel[slot];
		jugadoresSel[slot] = nuevoId;
		if (anterior && !jugadoresSel.some((id, i) => i !== slot && id === anterior)) {
			const { [anterior]: _eliminar, ...resto } = bloqueosPorJugador;
			void _eliminar;
			bloqueosPorJugador = resto;
		}
	}

	// Para el toggle UI de "mostrar bloqueos del jugador X".
	let bloqueosAbiertos = $state<Record<string, boolean>>({});

	function contarBloqueos(jid: string): number {
		return (bloqueosPorJugador[jid] ?? []).length;
	}

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

		// Recolectar TODOS los bloqueos de jugadores que siguen en la
		// inscripcion (los huerfanos ya se limpian en onCambioJugador).
		const bloqueosFlat: BloqueoJugador[] = [];
		for (const jid of ids) {
			const arr = bloqueosPorJugador[jid] ?? [];
			for (const b of arr) {
				// Defensa: descartar bloqueos con rango invalido (desde >= hasta)
				// o fecha vacia. La validacion Zod tambien lo rechaza, pero
				// preferimos no enviar ruido.
				if (b.desde && b.hasta && b.fecha) {
					bloqueosFlat.push(b);
				}
			}
		}

		const parsed = inscripcionInputSchema.safeParse({
			jugadores: ids,
			ranking,
			bloqueosJugadores: bloqueosFlat.length > 0 ? bloqueosFlat : undefined
		});
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
		{@const jid = jugadoresSel[i]}
		<div class="space-y-2">
			<JugadorSelector
				id={`insc-jug-${i}`}
				label={cantidadJugadores === 1 ? 'Jugador' : `Jugador ${i + 1}`}
				value={jid}
				onChange={(id) => onCambioJugador(i, id)}
				{jugadores}
				excluir={excluirPara(i)}
				error={i === 0 ? err('jugadores') : null}
			/>

			<!-- Bloqueos horarios: solo si hay jugador asignado y el form
			     recibio las fechas del torneo. -->
			{#if jid && fechasTorneo.length > 0}
				{@const total = contarBloqueos(jid)}
				<details
					bind:open={bloqueosAbiertos[jid]}
					class="rounded-lg border border-dashed border-gray-300 dark:border-gray-700"
				>
					<summary class="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs">
						<i class="bi bi-clock-history text-gray-500 dark:text-gray-400"></i>
						<span class="text-gray-700 dark:text-gray-300">
							Bloqueos de horarios de {nombreDe(jid)} (opcional)
						</span>
						{#if total > 0}
							<span class="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
								{total}
							</span>
						{/if}
					</summary>
					<div class="space-y-2 border-t border-gray-100 p-3 dark:border-gray-800">
						<p class="text-[11px] text-gray-500 dark:text-gray-400">
							Marcá los rangos en que <strong>NO</strong> puede jugar. Lo demás se asume disponible.
						</p>
						<ul class="space-y-2">
							{#each fechasTorneo as fecha (fecha)}
								{@const rangos = bloqueosDe(jid, fecha)}
								<li class="rounded-md border border-gray-100 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-800/50">
									<div class="mb-1 flex items-center justify-between gap-2">
										<span class="text-[11px] font-medium text-gray-700 dark:text-gray-300">
											{etiquetaFechaCorta(fecha)}
										</span>
										<button
											type="button"
											onclick={() => agregarBloqueo(jid, fecha)}
											class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/40"
										>
											<i class="bi bi-plus-lg text-[9px]"></i>
											Bloqueo
										</button>
									</div>
									{#if rangos.length > 0}
										<ul class="space-y-1">
											{#each rangos as r, idx (idx)}
												<li class="flex items-center gap-1.5">
													<input
														type="time"
														value={r.desde}
														onchange={(e) =>
															setBloqueoCampo(jid, fecha, idx, 'desde', e.currentTarget.value)}
														class="w-20 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-900"
													/>
													<span class="text-[10px] text-gray-400">a</span>
													<input
														type="time"
														value={r.hasta}
														onchange={(e) =>
															setBloqueoCampo(jid, fecha, idx, 'hasta', e.currentTarget.value)}
														class="w-20 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-900"
													/>
													<button
														type="button"
														onclick={() => quitarBloqueo(jid, fecha, idx)}
														aria-label="Quitar bloqueo"
														class="ml-auto rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400"
													>
														<i class="bi bi-x text-xs"></i>
													</button>
												</li>
											{/each}
										</ul>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				</details>
			{/if}
		</div>
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
