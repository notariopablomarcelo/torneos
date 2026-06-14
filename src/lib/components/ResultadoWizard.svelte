<script lang="ts">
	import { untrack } from 'svelte';
	import type {
		MotivoResultado,
		ResultadoPartido,
		SetResultado
	} from '$lib/types/armado';
	import { ganadorInferido } from '$lib/zonas/resultados';
	import InscripcionNombres from './InscripcionNombres.svelte';

	type Props = {
		initial: ResultadoPartido | null;
		nombresPareja1: string[];
		nombresPareja2: string[];
		submitLabel?: string;
		onSubmit: (resultado: ResultadoPartido) => Promise<void>;
		onCancel?: () => void;
		onBorrar?: () => Promise<void>;
		onTest?: () => ResultadoPartido;
	};

	let {
		initial,
		nombresPareja1,
		nombresPareja2,
		submitLabel = 'Guardar',
		onSubmit,
		onCancel,
		onBorrar,
		onTest
	}: Props = $props();

	const seedInicial = untrack(() => initial);

	type SetEditable = {
		p1: string;
		p2: string;
		tiebreakP1: string;
		tiebreakP2: string;
	};

	function setToEditable(s: SetResultado): SetEditable {
		return {
			p1: String(s.p1),
			p2: String(s.p2),
			tiebreakP1: s.tiebreakP1 !== undefined ? String(s.tiebreakP1) : '',
			tiebreakP2: s.tiebreakP2 !== undefined ? String(s.tiebreakP2) : ''
		};
	}

	// Editar arranca en paso 2 con el motivo del seed; carga nueva arranca en 1.
	let paso = $state<1 | 2>(seedInicial ? 2 : 1);
	let motivo = $state<MotivoResultado>(seedInicial?.motivo ?? 'normal');
	let sets = $state<SetEditable[]>(
		seedInicial?.sets.length ? seedInicial.sets.map(setToEditable) : []
	);
	let ganadorManual = $state<1 | 2 | null>(seedInicial?.ganadorEs ?? null);
	// Para abandono: la pareja que abandono. La otra gana. Si estamos editando
	// y el seed era abandono, lo derivamos del ganadorEs guardado.
	let abandonaEs = $state<1 | 2 | null>(
		seedInicial?.motivo === 'abandono' && seedInicial?.ganadorEs
			? seedInicial.ganadorEs === 1
				? 2
				: 1
			: null
	);

	let errorGlobal = $state<string | null>(null);
	let guardando = $state(false);
	let borrandoState = $state(false);

	function parsearSets(): SetResultado[] {
		const out: SetResultado[] = [];
		for (const s of sets) {
			if (s.p1.trim() === '' && s.p2.trim() === '') continue;
			const p1 = Number(s.p1);
			const p2 = Number(s.p2);
			if (!Number.isFinite(p1) || !Number.isFinite(p2) || p1 < 0 || p2 < 0) {
				throw new Error('Sets inválidos: tienen que ser números >= 0');
			}
			const result: SetResultado = { p1, p2 };
			const tb1 = s.tiebreakP1.trim() !== '' ? Number(s.tiebreakP1) : undefined;
			const tb2 = s.tiebreakP2.trim() !== '' ? Number(s.tiebreakP2) : undefined;
			if (tb1 !== undefined && Number.isFinite(tb1)) result.tiebreakP1 = tb1;
			if (tb2 !== undefined && Number.isFinite(tb2)) result.tiebreakP2 = tb2;
			out.push(result);
		}
		return out;
	}

	// Ganador a guardar.
	// - WO: lo elige el usuario.
	// - Abandono: el OTRO de "abandonaEs".
	// - Normal: inferido del marcador; si empata, ganadorManual via caja amber.
	const ganadorCalculado = $derived.by<1 | 2 | null>(() => {
		if (motivo === 'WO') return ganadorManual;
		if (motivo === 'abandono') return abandonaEs === null ? null : abandonaEs === 1 ? 2 : 1;
		let parsed: SetResultado[];
		try {
			parsed = parsearSets();
		} catch {
			return null;
		}
		if (parsed.length === 0) return null;
		const inferido = ganadorInferido(parsed);
		if (inferido !== null) return inferido;
		return ganadorManual;
	});

	// Mostrar tiebreak en el set i? Aparece cuando games quedan 7-6 o 6-7.
	function mostrarTiebreak(s: SetEditable): boolean {
		const a = Number(s.p1);
		const b = Number(s.p2);
		return (a === 7 && b === 6) || (a === 6 && b === 7);
	}

	function elegirMotivo(m: MotivoResultado) {
		motivo = m;
		paso = 2;
		errorGlobal = null;
		if (m === 'WO') {
			sets = [];
			ganadorManual = ganadorManual ?? null;
		} else if (m === 'normal') {
			// No tocar sets — el usuario puede haber cargado y querer cambiar de
			// abandono a normal sin perder lo tipeado.
		} else if (m === 'abandono') {
			// idem normal — preservar sets parciales.
		}
	}

	function volverPaso1() {
		paso = 1;
		errorGlobal = null;
	}

	function agregarSet() {
		sets = [...sets, { p1: '', p2: '', tiebreakP1: '', tiebreakP2: '' }];
	}

	function quitarSet(i: number) {
		sets = sets.filter((_, idx) => idx !== i);
	}

	function setSet(i: number, key: keyof SetEditable, value: string) {
		const next = [...sets];
		next[i] = { ...next[i], [key]: value };
		sets = next;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errorGlobal = null;
		let parsed: SetResultado[];
		try {
			parsed = parsearSets();
		} catch (err) {
			errorGlobal = err instanceof Error ? err.message : 'Sets inválidos';
			return;
		}

		if (motivo === 'WO') {
			if (!ganadorManual) {
				errorGlobal = 'En walkover marcá qué pareja ganó.';
				return;
			}
			parsed = [];
		} else if (motivo === 'abandono') {
			if (!abandonaEs) {
				errorGlobal = 'Marcá qué pareja abandonó.';
				return;
			}
		} else {
			if (parsed.length === 0) {
				errorGlobal = 'Cargá al menos un set.';
				return;
			}
			if (ganadorCalculado === null) {
				errorGlobal = 'No se puede determinar el ganador. Marcá uno o ajustá los sets.';
				return;
			}
		}

		const resultado: ResultadoPartido = {
			sets: parsed,
			ganadorEs: (motivo === 'WO' ? ganadorManual! : ganadorCalculado!) as 1 | 2,
			motivo
		};

		guardando = true;
		try {
			await onSubmit(resultado);
		} catch (err) {
			errorGlobal = err instanceof Error ? err.message : 'Error al guardar';
		} finally {
			guardando = false;
		}
	}

	function handleTest() {
		if (!onTest) return;
		const r = onTest();
		motivo = r.motivo;
		sets = r.sets.map(setToEditable);
		ganadorManual = r.ganadorEs;
		abandonaEs = r.motivo === 'abandono' ? (r.ganadorEs === 1 ? 2 : 1) : null;
		errorGlobal = null;
		paso = 2;
	}

	async function handleBorrar() {
		if (!onBorrar) return;
		const ok = confirm('¿Borrar el resultado de este partido?');
		if (!ok) return;
		borrandoState = true;
		try {
			await onBorrar();
		} catch (err) {
			errorGlobal = err instanceof Error ? err.message : 'Error al borrar';
		} finally {
			borrandoState = false;
		}
	}

	const MOTIVOS_CFG: {
		key: MotivoResultado;
		label: string;
		descripcion: string;
		icono: string;
	}[] = [
		{
			key: 'normal',
			label: 'Normal',
			descripcion: 'Se jugó completo. Cargar sets.',
			icono: 'bi-trophy'
		},
		{
			key: 'WO',
			label: 'Walkover',
			descripcion: 'Una pareja no se presentó.',
			icono: 'bi-person-x'
		},
		{
			key: 'abandono',
			label: 'Abandono',
			descripcion: 'Una pareja dejó el partido a mitad.',
			icono: 'bi-flag'
		}
	];

	function etiquetaMotivo(m: MotivoResultado): string {
		return MOTIVOS_CFG.find((x) => x.key === m)?.label ?? m;
	}
	function iconoMotivo(m: MotivoResultado): string {
		return MOTIVOS_CFG.find((x) => x.key === m)?.icono ?? 'bi-trophy';
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<!-- Header: nombres de las parejas, siempre visible. -->
	<div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800">
		<InscripcionNombres nombres={nombresPareja1} />
		<p class="my-1 text-center text-xs font-medium text-gray-400 dark:text-gray-500">vs</p>
		<InscripcionNombres nombres={nombresPareja2} />
	</div>

	{#if paso === 1}
		<!-- Paso 1: elegir motivo. -->
		<div>
			<div class="mb-2 flex items-center justify-between">
				<p class="text-sm font-semibold text-gray-700 dark:text-gray-300">
					¿Cómo terminó el partido?
				</p>
				<span class="text-[10px] font-medium tracking-wider text-gray-400 uppercase dark:text-gray-500">
					Paso 1 de 2
				</span>
			</div>
			<div class="space-y-2">
				{#each MOTIVOS_CFG as m (m.key)}
					<button
						type="button"
						onclick={() => elegirMotivo(m.key)}
						class="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left transition hover:border-brand-400 hover:bg-brand-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-700 dark:hover:bg-brand-900/40"
					>
						<span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-lg text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
							<i class="bi {m.icono}"></i>
						</span>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
								{m.label}
							</p>
							<p class="text-xs text-gray-500 dark:text-gray-400">
								{m.descripcion}
							</p>
						</div>
						<i class="bi bi-chevron-right shrink-0 text-gray-400 dark:text-gray-500"></i>
					</button>
				{/each}
			</div>
		</div>
	{:else}
		<!-- Paso 2: detalle segun motivo. -->
		<div class="flex items-center justify-between">
			<button
				type="button"
				onclick={volverPaso1}
				class="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-brand-700 dark:text-gray-400 dark:hover:text-brand-300"
			>
				<i class="bi bi-arrow-left"></i>
				Cambiar tipo
			</button>
			<span class="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
				<i class="bi {iconoMotivo(motivo)} text-[10px]"></i>
				{etiquetaMotivo(motivo)}
			</span>
		</div>

		{#if motivo === 'WO'}
			<div>
				<p class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
					¿Quién gana por walkover?
				</p>
				<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<button
						type="button"
						onclick={() => (ganadorManual = 1)}
						aria-pressed={ganadorManual === 1}
						class="rounded-lg border p-3 text-left transition {ganadorManual === 1
							? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-700'
							: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
					>
						<InscripcionNombres nombres={nombresPareja1} />
					</button>
					<button
						type="button"
						onclick={() => (ganadorManual = 2)}
						aria-pressed={ganadorManual === 2}
						class="rounded-lg border p-3 text-left transition {ganadorManual === 2
							? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-700'
							: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
					>
						<InscripcionNombres nombres={nombresPareja2} />
					</button>
				</div>
			</div>
		{:else}
			{#if motivo === 'abandono'}
				<div class="rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-400">
					<i class="bi bi-info-circle mr-1"></i>
					Cargá los sets jugados hasta el abandono.
				</div>
			{/if}

			<!-- Cards de pareja con inputs verticales por set. Cada pareja en su
			     card; el set N de ambas parejas comparte fila para alinearse. -->
			<div>
				<p class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Sets</p>
				{#if sets.length === 0}
					<div class="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
						Todavía no agregaste ningún set.
					</div>
				{:else}
					<div class="grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-2 sm:gap-x-3">
						<!-- Headers de columna: nombres de cada pareja. -->
						<div class="rounded-md border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
							<InscripcionNombres nombres={nombresPareja1} />
						</div>
						<div></div>
						<div class="rounded-md border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
							<InscripcionNombres nombres={nombresPareja2} />
						</div>

						{#each sets as s, i (i)}
							{@const tb = mostrarTiebreak(s)}
							<!-- Pareja 1: input games + (opcional) input TB. -->
							<div class="flex flex-col items-center gap-1 rounded-md border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
								<input
									type="text"
									inputmode="numeric"
									pattern="[0-9]*"
									maxlength="2"
									value={s.p1}
									oninput={(e) => setSet(i, 'p1', e.currentTarget.value)}
									placeholder="–"
									aria-label="Set {i + 1} games pareja 1"
									class="w-14 rounded-md border border-gray-300 px-2 py-1.5 text-center text-base font-semibold focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none dark:border-gray-700"
								/>
								{#if tb}
									<input
										type="text"
										inputmode="numeric"
										pattern="[0-9]*"
										maxlength="2"
										value={s.tiebreakP1}
										oninput={(e) => setSet(i, 'tiebreakP1', e.currentTarget.value)}
										placeholder="tb"
										aria-label="Tiebreak pareja 1 set {i + 1}"
										class="w-12 rounded-md border border-gray-200 px-1.5 py-1 text-center text-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none dark:border-gray-700"
									/>
								{/if}
							</div>

							<!-- Columna central: label Set N + boton quitar. -->
							<div class="flex flex-col items-center justify-start gap-1 self-center">
								<span class="text-[10px] font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
									Set {i + 1}
								</span>
								<button
									type="button"
									onclick={() => quitarSet(i)}
									aria-label="Quitar set {i + 1}"
									title="Quitar set"
									class="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400"
								>
									<i class="bi bi-x text-sm"></i>
								</button>
							</div>

							<!-- Pareja 2: input games + (opcional) input TB. -->
							<div class="flex flex-col items-center gap-1 rounded-md border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
								<input
									type="text"
									inputmode="numeric"
									pattern="[0-9]*"
									maxlength="2"
									value={s.p2}
									oninput={(e) => setSet(i, 'p2', e.currentTarget.value)}
									placeholder="–"
									aria-label="Set {i + 1} games pareja 2"
									class="w-14 rounded-md border border-gray-300 px-2 py-1.5 text-center text-base font-semibold focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none dark:border-gray-700"
								/>
								{#if tb}
									<input
										type="text"
										inputmode="numeric"
										pattern="[0-9]*"
										maxlength="2"
										value={s.tiebreakP2}
										oninput={(e) => setSet(i, 'tiebreakP2', e.currentTarget.value)}
										placeholder="tb"
										aria-label="Tiebreak pareja 2 set {i + 1}"
										class="w-12 rounded-md border border-gray-200 px-1.5 py-1 text-center text-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none dark:border-gray-700"
									/>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<button
					type="button"
					onclick={agregarSet}
					class="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
				>
					<i class="bi bi-plus-lg"></i>
					Agregar set
				</button>
			</div>

			{#if motivo === 'abandono'}
				<!-- Quien abandono (la otra gana). -->
				<div>
					<p class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
						¿Quién abandonó?
					</p>
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<button
							type="button"
							onclick={() => (abandonaEs = 1)}
							aria-pressed={abandonaEs === 1}
							class="rounded-lg border p-3 text-left transition {abandonaEs === 1
								? 'border-red-500 bg-red-50 ring-2 ring-red-200 dark:bg-red-900/40 dark:ring-red-700'
								: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
						>
							<InscripcionNombres nombres={nombresPareja1} />
						</button>
						<button
							type="button"
							onclick={() => (abandonaEs = 2)}
							aria-pressed={abandonaEs === 2}
							class="rounded-lg border p-3 text-left transition {abandonaEs === 2
								? 'border-red-500 bg-red-50 ring-2 ring-red-200 dark:bg-red-900/40 dark:ring-red-700'
								: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
						>
							<InscripcionNombres nombres={nombresPareja2} />
						</button>
					</div>
				</div>
			{/if}

			<!-- Caja amber: solo cuando es Normal y el ganador no se puede inferir. -->
			{#if motivo === 'normal' && ganadorCalculado === null && sets.some((s) => s.p1.trim() !== '' || s.p2.trim() !== '')}
				<div class="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/40">
					<p class="mb-2 text-xs text-amber-800 dark:text-amber-300">
						No se puede inferir el ganador. Marcá uno:
					</p>
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<button
							type="button"
							onclick={() => (ganadorManual = 1)}
							aria-pressed={ganadorManual === 1}
							class="rounded-lg border p-2 text-left transition {ganadorManual === 1
								? 'border-brand-500 bg-white ring-2 ring-brand-200 dark:bg-gray-900 dark:ring-brand-700'
								: 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'}"
						>
							<InscripcionNombres nombres={nombresPareja1} />
						</button>
						<button
							type="button"
							onclick={() => (ganadorManual = 2)}
							aria-pressed={ganadorManual === 2}
							class="rounded-lg border p-2 text-left transition {ganadorManual === 2
								? 'border-brand-500 bg-white ring-2 ring-brand-200 dark:bg-gray-900 dark:ring-brand-700'
								: 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'}"
						>
							<InscripcionNombres nombres={nombresPareja2} />
						</button>
					</div>
				</div>
			{:else if ganadorCalculado !== null}
				<div class="rounded-lg bg-brand-50 p-2 dark:bg-brand-900/40">
					<p class="mb-1 flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
						<i class="bi bi-trophy-fill"></i>
						Gana
					</p>
					<InscripcionNombres
						nombres={ganadorCalculado === 1 ? nombresPareja1 : nombresPareja2}
						class="font-semibold text-brand-700 dark:text-brand-300"
					/>
				</div>
			{/if}
		{/if}
	{/if}

	{#if errorGlobal}
		<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			{errorGlobal}
		</div>
	{/if}

	<!-- Footer: en paso 1 solo Cancelar. En paso 2 boton Guardar + acciones. -->
	<div class="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
		<div class="flex items-center gap-2">
			{#if paso === 2 && onBorrar && seedInicial}
				<button
					type="button"
					onclick={handleBorrar}
					disabled={guardando || borrandoState}
					class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 sm:flex-none dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/40"
				>
					{#if borrandoState}
						<i class="bi bi-arrow-clockwise animate-spin"></i>
					{:else}
						<i class="bi bi-trash"></i>
					{/if}
					Borrar
				</button>
			{/if}
			{#if onTest}
				<button
					type="button"
					onclick={handleTest}
					disabled={guardando || borrandoState}
					title="Rellenar con resultado al azar"
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
					disabled={guardando || borrandoState}
					class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 sm:flex-none dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
				>
					Cancelar
				</button>
			{/if}
			{#if paso === 2}
				<button
					type="submit"
					disabled={guardando || borrandoState}
					class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
				>
					{#if guardando}
						<i class="bi bi-arrow-clockwise animate-spin"></i>
					{/if}
					{submitLabel}
				</button>
			{/if}
		</div>
	</div>
</form>
