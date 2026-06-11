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
		// initial=null => carga nueva; con valor => editar el existente.
		initial: ResultadoPartido | null;
		// Nombres de las parejas: un string por jugador para renderlos apilados
		// (igual que en el resto de la app).
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

	// Estado interno. Inicializamos con 2 sets vacios cuando no hay resultado,
	// o copiamos los sets existentes si estamos editando.
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

	let sets = $state<SetEditable[]>(
		seedInicial?.sets.length ? seedInicial.sets.map(setToEditable) : []
	);
	// Para W.O. el ganador es manual (no se infiere). Para el caso normal lo
	// tomamos del marcador (con override posible si el user marca abandono).
	let motivo = $state<MotivoResultado>(seedInicial?.motivo ?? 'normal');
	let motivoPrevio: MotivoResultado = seedInicial?.motivo ?? 'normal';
	let ganadorManual = $state<1 | 2 | null>(seedInicial?.ganadorEs ?? null);

	let errorGlobal = $state<string | null>(null);
	let guardando = $state(false);
	let borrandoState = $state(false);

	// Convierte los sets editables a SetResultado validos. Set con campos
	// vacios o con games iguales se ignora.
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
	// - WO: lo elige el usuario (no se juega nada).
	// - Abandono: lo elige el usuario tambien — porque la pareja que abandona
	//   puede haber ido GANANDO en el marcador (ej. 6-2, 3-1 y abandona).
	//   Inferir del marcador en abandono daria un ganador erroneo. Asi que
	//   forzamos seleccion manual.
	// - Normal: lo inferimos del marcador. Si hay empate de sets, caemos a
	//   ganadorManual (la caja amber pide elegir).
	const ganadorCalculado = $derived.by<1 | 2 | null>(() => {
		if (motivo === 'WO' || motivo === 'abandono') return ganadorManual;
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

	function marcarMotivo(m: MotivoResultado) {
		motivo = m;
		// W.O. limpia los sets (no hay sets jugados).
		if (m === 'WO') {
			sets = [];
			ganadorManual = ganadorManual ?? 1;
		}
		// En abandono el ganador hay que confirmarlo a mano (el que abandona
		// puede haber ido ganando). Limpiamos seleccion previa solo si venia
		// de "normal" donde el ganador era inferido del marcador.
		if (m === 'abandono' && motivoPrevio !== 'abandono') {
			ganadorManual = null;
		}
		motivoPrevio = m;
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
				errorGlobal = 'En W.O. tenés que marcar quién es el ganador.';
				return;
			}
			parsed = [];
		} else if (motivo === 'abandono') {
			if (!ganadorManual) {
				errorGlobal = 'Marcá quién ganó el partido.';
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
		errorGlobal = null;
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
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<!-- Indicador del partido. -->
	<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
		<InscripcionNombres nombres={nombresPareja1} />
		<p class="my-1 text-center text-xs font-medium text-gray-400">vs</p>
		<InscripcionNombres nombres={nombresPareja2} />
	</div>

	<!-- Tabs de motivo: normal / W.O. / abandono. -->
	<div class="flex w-full items-center gap-1 rounded-xl bg-gray-100 p-1">
		<button
			type="button"
			onclick={() => marcarMotivo('normal')}
			aria-pressed={motivo === 'normal'}
			class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition {motivo ===
			'normal'
				? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5'
				: 'bg-transparent font-medium text-gray-500'}"
		>
			<i class="bi bi-trophy"></i>
			Normal
		</button>
		<button
			type="button"
			onclick={() => marcarMotivo('WO')}
			aria-pressed={motivo === 'WO'}
			class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition {motivo ===
			'WO'
				? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5'
				: 'bg-transparent font-medium text-gray-500'}"
		>
			<i class="bi bi-person-x"></i>
			W.O.
		</button>
		<button
			type="button"
			onclick={() => marcarMotivo('abandono')}
			aria-pressed={motivo === 'abandono'}
			class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition {motivo ===
			'abandono'
				? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5'
				: 'bg-transparent font-medium text-gray-500'}"
		>
			<i class="bi bi-flag"></i>
			Abandono
		</button>
	</div>

	{#if motivo === 'WO'}
		<!-- En W.O. solo elegir ganador. Sin sets. -->
		<div>
			<p class="mb-2 text-sm font-medium text-gray-700">Ganador por W.O.</p>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<button
					type="button"
					onclick={() => (ganadorManual = 1)}
					aria-pressed={ganadorManual === 1}
					class="rounded-lg border p-3 text-left transition {ganadorManual === 1
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
						: 'border-gray-200 bg-white hover:border-gray-300'}"
				>
					<InscripcionNombres nombres={nombresPareja1} />
				</button>
				<button
					type="button"
					onclick={() => (ganadorManual = 2)}
					aria-pressed={ganadorManual === 2}
					class="rounded-lg border p-3 text-left transition {ganadorManual === 2
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
						: 'border-gray-200 bg-white hover:border-gray-300'}"
				>
					<InscripcionNombres nombres={nombresPareja2} />
				</button>
			</div>
		</div>
	{:else}
		<!-- Sets editables. -->
		<div>
			<p class="mb-2 text-sm font-medium text-gray-700">Sets</p>
			<ul class="space-y-2">
				{#each sets as s, i (i)}
					<li class="flex items-center gap-2">
						<span class="w-6 text-xs font-semibold text-gray-500">{i + 1}</span>
						<input
							type="text"
							inputmode="numeric"
							pattern="[0-9]*"
							maxlength="2"
							value={s.p1}
							oninput={(e) => setSet(i, 'p1', e.currentTarget.value)}
							placeholder="–"
							class="w-12 rounded-md border border-gray-300 px-2 py-1.5 text-center text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
						/>
						<span class="text-gray-400">–</span>
						<input
							type="text"
							inputmode="numeric"
							pattern="[0-9]*"
							maxlength="2"
							value={s.p2}
							oninput={(e) => setSet(i, 'p2', e.currentTarget.value)}
							placeholder="–"
							class="w-12 rounded-md border border-gray-300 px-2 py-1.5 text-center text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
						/>
						{#if (Number(s.p1) === 7 && Number(s.p2) === 6) || (Number(s.p1) === 6 && Number(s.p2) === 7)}
							<input
								type="text"
								inputmode="numeric"
								pattern="[0-9]*"
								maxlength="2"
								value={s.tiebreakP1}
								oninput={(e) => setSet(i, 'tiebreakP1', e.currentTarget.value)}
								placeholder="tb"
								title="Tiebreak pareja 1"
								class="w-12 rounded-md border border-gray-200 px-2 py-1.5 text-center text-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
							/>
							<span class="text-xs text-gray-400">/</span>
							<input
								type="text"
								inputmode="numeric"
								pattern="[0-9]*"
								maxlength="2"
								value={s.tiebreakP2}
								oninput={(e) => setSet(i, 'tiebreakP2', e.currentTarget.value)}
								placeholder="tb"
								title="Tiebreak pareja 2"
								class="w-12 rounded-md border border-gray-200 px-2 py-1.5 text-center text-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
							/>
						{/if}
						<button
							type="button"
							onclick={() => quitarSet(i)}
							aria-label="Quitar set {i + 1}"
							class="ml-auto rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
						>
							<i class="bi bi-x"></i>
						</button>
					</li>
				{/each}
			</ul>
			<button
				type="button"
				onclick={agregarSet}
				class="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
			>
				<i class="bi bi-plus-lg"></i>
				Agregar set
			</button>
		</div>

		<!-- Abandono: seleccion explicita del ganador. El que abandona puede
		     haber ido ganando en el marcador, asi que no se infiere del set. -->
		{#if motivo === 'abandono'}
			<div>
				<p class="mb-1 text-sm font-medium text-gray-700">Ganador del partido</p>
				<p class="mb-2 text-xs text-gray-500">El otro abandonó.</p>
				<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<button
						type="button"
						onclick={() => (ganadorManual = 1)}
						aria-pressed={ganadorManual === 1}
						class="rounded-lg border p-3 text-left transition {ganadorManual === 1
							? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
							: 'border-gray-200 bg-white hover:border-gray-300'}"
					>
						<InscripcionNombres nombres={nombresPareja1} />
					</button>
					<button
						type="button"
						onclick={() => (ganadorManual = 2)}
						aria-pressed={ganadorManual === 2}
						class="rounded-lg border p-3 text-left transition {ganadorManual === 2
							? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
							: 'border-gray-200 bg-white hover:border-gray-300'}"
					>
						<InscripcionNombres nombres={nombresPareja2} />
					</button>
				</div>
			</div>
		{/if}

		<!-- Indicador de ganador inferido (solo en motivo normal). Cuando no se
		     puede inferir (sets cargados pero empatan), pedimos eleccion manual. -->
		{#if motivo === 'normal' && ganadorCalculado === null && sets.some((s) => s.p1.trim() !== '' || s.p2.trim() !== '')}
			<div class="rounded-lg border border-amber-200 bg-amber-50 p-3">
				<p class="mb-2 text-xs text-amber-800">No se puede inferir el ganador. Marcá uno:</p>
				<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<button
						type="button"
						onclick={() => (ganadorManual = 1)}
						aria-pressed={ganadorManual === 1}
						class="rounded-lg border p-2 text-left transition {ganadorManual === 1
							? 'border-brand-500 bg-white ring-2 ring-brand-200'
							: 'border-gray-200 bg-white'}"
					>
						<InscripcionNombres nombres={nombresPareja1} />
					</button>
					<button
						type="button"
						onclick={() => (ganadorManual = 2)}
						aria-pressed={ganadorManual === 2}
						class="rounded-lg border p-2 text-left transition {ganadorManual === 2
							? 'border-brand-500 bg-white ring-2 ring-brand-200'
							: 'border-gray-200 bg-white'}"
					>
						<InscripcionNombres nombres={nombresPareja2} />
					</button>
				</div>
			</div>
		{:else if ganadorCalculado !== null}
			<div class="rounded-lg bg-brand-50 p-2">
				<p class="mb-1 flex items-center gap-1.5 text-xs font-semibold text-brand-700">
					<i class="bi bi-trophy-fill"></i>
					Gana
				</p>
				<InscripcionNombres
					nombres={ganadorCalculado === 1 ? nombresPareja1 : nombresPareja2}
					class="font-semibold text-brand-700"
				/>
			</div>
		{/if}
	{/if}

	{#if errorGlobal}
		<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
			{errorGlobal}
		</div>
	{/if}

	<!-- Footer: en mobile pasamos a 2 filas full-width (Borrar/Test arriba,
	     Cancelar/Guardar abajo). En desktop vuelve a una sola fila. -->
	<div class="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
		<div class="flex items-center gap-2">
			{#if onBorrar && seedInicial}
				<button
					type="button"
					onclick={handleBorrar}
					disabled={guardando || borrandoState}
					class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 sm:flex-none"
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
					class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-400 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 sm:flex-none"
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
					class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 sm:flex-none"
				>
					Cancelar
				</button>
			{/if}
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
		</div>
	</div>
</form>
