<script lang="ts">
	import { calcularDistribucion } from '$lib/zonas/algoritmo';
	import type {
		Algoritmo,
		ArmadoConfig,
		Clasifican,
		ModalidadZona4,
		TamanoZona
	} from '$lib/types/armado';

	type Props = {
		cantidadInscripciones: number;
		submitLabel?: string;
		onSubmit: (config: Omit<ArmadoConfig, 'armadoEn'>) => Promise<void>;
		onCancel?: () => void;
	};

	let {
		cantidadInscripciones,
		submitLabel = 'Armar zonas',
		onSubmit,
		onCancel
	}: Props = $props();

	// Estado del form. Por separado y derivados los strings para los enums
	// numericos (asi se bindean en los radio cards sin conversiones implicitas).
	let algoritmo = $state<Algoritmo>('snake');
	let tamanoStr = $state<'3' | '4'>('3');
	let modalidadZona4 = $state<ModalidadZona4>('todosContraTodos');
	let clasificanStr = $state<'1' | '2' | '3'>('2');

	const tamanoPreferido = $derived<TamanoZona>(Number(tamanoStr) as TamanoZona);
	const clasificanPorZona = $derived<Clasifican>(Number(clasificanStr) as Clasifican);

	let guardando = $state(false);
	let errorGlobal = $state<string | null>(null);

	const previsualizacion = $derived.by(() => {
		try {
			const d = calcularDistribucion(cantidadInscripciones, tamanoPreferido);
			return { ok: true as const, ...d };
		} catch (err) {
			return {
				ok: false as const,
				mensaje: err instanceof Error ? err.message : 'Distribución inválida'
			};
		}
	});

	const hayZonasDe4 = $derived(previsualizacion.ok && previsualizacion.zonas4 > 0);

	// Si el user habia elegido "3 por zona" pero la distribucion no genera
	// zonas de 4, bajamos a 2 (porque en zona de 3 max es 2). Asi evitamos
	// que quede una eleccion invalida al regresar a este paso.
	$effect(() => {
		if (clasificanStr === '3' && !hayZonasDe4) {
			clasificanStr = '2';
		}
	});

	// Detectamos cuando elegis "preferir 4" pero el resultado NO tiene zonas
	// de 4 (caso N=9: el algoritmo cae al esquema de 3 porque no hay forma
	// limpia de hacer 4s). En ese caso avisamos.
	const huboFallback = $derived(
		previsualizacion.ok &&
			tamanoPreferido === 4 &&
			previsualizacion.zonas4 === 0
	);

	// Mensaje extra para los casos mixtos (parte de zonas de 4, parte de 3).
	// Ayuda a entender que la preferencia no se aplica a todas.
	const huboMixto = $derived(
		previsualizacion.ok &&
			previsualizacion.zonas3 > 0 &&
			previsualizacion.zonas4 > 0
	);

	// Wizard: 3 pasos si no hay zonas de 4 (sin modalidad), 4 si las hay.
	// Pasos:
	//   1 = Algoritmo
	//   2 = Tamaño
	//   3 = Modalidad (skipped si no hay zonas de 4)
	//   4 = Clasifican
	let pasoActual = $state(1);
	const totalPasos = $derived(hayZonasDe4 ? 4 : 3);

	// Si despues de elegir tamaño quedamos sin zonas de 4 y estabamos en el
	// paso 3 (modalidad), saltar a 4 (clasifican). Y si volvemos a tamano 4,
	// el paso 3 se vuelve relevante de nuevo. Mantenemos el indice 1..totalPasos.
	$effect(() => {
		if (pasoActual > totalPasos) pasoActual = totalPasos;
	});

	// El indice "logico" del paso 3 cambia: si hayZonasDe4, es modalidad; si no
	// hay, es clasifican (porque skip). En lugar de remapear, definimos un id
	// por paso visual.
	const idsPasos = $derived<('algoritmo' | 'tamano' | 'modalidad' | 'clasifican')[]>(
		hayZonasDe4
			? ['algoritmo', 'tamano', 'modalidad', 'clasifican']
			: ['algoritmo', 'tamano', 'clasifican']
	);
	const idPasoActual = $derived(idsPasos[pasoActual - 1] ?? 'algoritmo');

	const esUltimo = $derived(pasoActual === totalPasos);

	function avanzar() {
		if (esUltimo) return;
		pasoActual += 1;
	}

	function retroceder() {
		if (pasoActual === 1) return;
		pasoActual -= 1;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errorGlobal = null;
		if (!previsualizacion.ok) {
			errorGlobal = previsualizacion.mensaje;
			return;
		}
		guardando = true;
		try {
			await onSubmit({
				algoritmo,
				tamanoPreferido,
				modalidadZona4,
				clasificanPorZona
			});
		} catch (err) {
			errorGlobal = err instanceof Error ? err.message : 'Error al armar zonas';
		} finally {
			guardando = false;
		}
	}
</script>

<!-- Stepper visual. Cada bolita es un paso; la activa y las completadas
     van en brand, las futuras gris. -->
<div class="mb-5 flex items-center justify-center gap-2">
	{#each Array(totalPasos) as _, i (i)}
		<div
			class="h-2 w-8 rounded-full transition-colors {i + 1 <= pasoActual
				? 'bg-brand-500'
				: 'bg-gray-200 dark:bg-gray-800'}"
		></div>
	{/each}
</div>

<form onsubmit={handleSubmit}>
	{#if idPasoActual === 'algoritmo'}
		<div class="space-y-4">
			<div>
				<h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">¿Cómo distribuir las parejas?</h3>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Elegí el método para repartir las inscripciones en zonas.</p>
			</div>

			<div class="space-y-2">
				<button
					type="button"
					onclick={() => (algoritmo = 'snake')}
					aria-pressed={algoritmo === 'snake'}
					class="block w-full rounded-lg border p-3 text-left transition {algoritmo === 'snake'
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-700'
						: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
				>
					<div class="flex items-start gap-2">
						<i
							class="bi {algoritmo === 'snake' ? 'bi-check-circle-fill text-brand-500' : 'bi-circle text-gray-300 dark:text-gray-600'} mt-0.5"
						></i>
						<div>
							<p class="font-medium text-gray-900 dark:text-gray-100">Snake / serpentina</p>
							<p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
								Reparte por ranking en zigzag (A B C C B A …) para que cada zona quede balanceada. Estándar FAP.
							</p>
						</div>
					</div>
				</button>

				<button
					type="button"
					onclick={() => (algoritmo = 'random')}
					aria-pressed={algoritmo === 'random'}
					class="block w-full rounded-lg border p-3 text-left transition {algoritmo === 'random'
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-700'
						: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
				>
					<div class="flex items-start gap-2">
						<i
							class="bi {algoritmo === 'random' ? 'bi-check-circle-fill text-brand-500' : 'bi-circle text-gray-300 dark:text-gray-600'} mt-0.5"
						></i>
						<div>
							<p class="font-medium text-gray-900 dark:text-gray-100">Random / sorteo libre</p>
							<p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
								Ignora el ranking y mezcla al azar. Útil para torneos amistosos o cuando no hay ranking confiable.
							</p>
						</div>
					</div>
				</button>
			</div>
		</div>
	{:else if idPasoActual === 'tamano'}
		<div class="space-y-4">
			<div>
				<h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">¿Cuántas parejas por zona?</h3>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Si N no divide exacto, completamos con zonas del otro tamaño.</p>
			</div>

			<div class="space-y-2">
				<button
					type="button"
					onclick={() => (tamanoStr = '3')}
					aria-pressed={tamanoStr === '3'}
					class="block w-full rounded-lg border p-3 text-left transition {tamanoStr === '3'
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-700'
						: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
				>
					<div class="flex items-start gap-2">
						<i
							class="bi {tamanoStr === '3' ? 'bi-check-circle-fill text-brand-500' : 'bi-circle text-gray-300 dark:text-gray-600'} mt-0.5"
						></i>
						<div>
							<p class="font-medium text-gray-900 dark:text-gray-100">Preferir 3 <span class="text-xs font-normal text-gray-500 dark:text-gray-400">(FAP)</span></p>
							<p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
								Zonas de 3 con round-robin (3 partidos por zona). Estándar de la federación.
							</p>
						</div>
					</div>
				</button>

				<button
					type="button"
					onclick={() => (tamanoStr = '4')}
					aria-pressed={tamanoStr === '4'}
					class="block w-full rounded-lg border p-3 text-left transition {tamanoStr === '4'
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-700'
						: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
				>
					<div class="flex items-start gap-2">
						<i
							class="bi {tamanoStr === '4' ? 'bi-check-circle-fill text-brand-500' : 'bi-circle text-gray-300 dark:text-gray-600'} mt-0.5"
						></i>
						<div>
							<p class="font-medium text-gray-900 dark:text-gray-100">Preferir 4</p>
							<p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
								Zonas de 4 con más partidos por equipo. Habilita la opción de "doble oportunidad".
							</p>
						</div>
					</div>
				</button>
			</div>

			<!-- Previsualizacion en este paso porque ya tenemos algo concreto. -->
			<div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-800">
				<p class="mb-1 font-medium text-gray-700 dark:text-gray-300">Con {cantidadInscripciones} inscripciones:</p>
				{#if previsualizacion.ok}
					<p class="text-gray-600 dark:text-gray-400">
						{previsualizacion.zonas3 + previsualizacion.zonas4} zonas
						{#if previsualizacion.zonas4 > 0}
							· <strong>{previsualizacion.zonas4}</strong> de 4
						{/if}
						{#if previsualizacion.zonas3 > 0}
							· <strong>{previsualizacion.zonas3}</strong> de 3
						{/if}
					</p>
					{#if huboFallback}
						<p class="mt-2 flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
							<i class="bi bi-info-circle mt-0.5"></i>
							<span>Con {cantidadInscripciones} no es posible armar zonas de 4. Se generan zonas de 3.</span>
						</p>
					{:else if huboMixto}
						<p class="mt-2 flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
							<i class="bi bi-info-circle mt-0.5"></i>
							<span>
								{cantidadInscripciones} no es divisible exacto: se mezclan los dos tamaños. Las zonas
								{tamanoPreferido === 3 ? 'de 4' : 'de 3'}
								van {tamanoPreferido === 3 ? 'al inicio' : 'al final'}.
							</span>
						</p>
					{/if}
				{:else}
					<p class="text-red-600">{previsualizacion.mensaje}</p>
				{/if}
			</div>
		</div>
	{:else if idPasoActual === 'modalidad'}
		<div class="space-y-4">
			<div>
				<h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">Modalidad de las zonas de 4</h3>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Aplica solo a las zonas de 4 que se generen. Las de 3 son siempre round-robin.</p>
			</div>

			<div class="space-y-2">
				<button
					type="button"
					onclick={() => (modalidadZona4 = 'todosContraTodos')}
					aria-pressed={modalidadZona4 === 'todosContraTodos'}
					class="block w-full rounded-lg border p-3 text-left transition {modalidadZona4 === 'todosContraTodos'
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-700'
						: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
				>
					<div class="flex items-start gap-2">
						<i
							class="bi {modalidadZona4 === 'todosContraTodos' ? 'bi-check-circle-fill text-brand-500' : 'bi-circle text-gray-300 dark:text-gray-600'} mt-0.5"
						></i>
						<div>
							<p class="font-medium text-gray-900 dark:text-gray-100">Todos contra todos</p>
							<p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
								6 partidos por zona. Cada pareja juega contra todas las otras. Todos parejos.
							</p>
						</div>
					</div>
				</button>

				<button
					type="button"
					onclick={() => (modalidadZona4 = 'dobleOportunidad')}
					aria-pressed={modalidadZona4 === 'dobleOportunidad'}
					class="block w-full rounded-lg border p-3 text-left transition {modalidadZona4 === 'dobleOportunidad'
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-700'
						: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
				>
					<div class="flex items-start gap-2">
						<i
							class="bi {modalidadZona4 === 'dobleOportunidad' ? 'bi-check-circle-fill text-brand-500' : 'bi-circle text-gray-300 dark:text-gray-600'} mt-0.5"
						></i>
						<div>
							<p class="font-medium text-gray-900 dark:text-gray-100">Doble oportunidad</p>
							<p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
								4 partidos por zona. Cruces 1v4 y 2v3, después ganadores entre sí y perdedores tienen segunda chance.
							</p>
						</div>
					</div>
				</button>
			</div>
		</div>
	{:else if idPasoActual === 'clasifican'}
		<div class="space-y-4">
			<div>
				<h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">¿Cuántas pasan al bracket?</h3>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Define qué tan exigente es la fase de zonas.</p>
			</div>

			<div class="space-y-2">
				<button
					type="button"
					onclick={() => (clasificanStr = '2')}
					aria-pressed={clasificanStr === '2'}
					class="block w-full rounded-lg border p-3 text-left transition {clasificanStr === '2'
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-700'
						: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
				>
					<div class="flex items-start gap-2">
						<i
							class="bi {clasificanStr === '2' ? 'bi-check-circle-fill text-brand-500' : 'bi-circle text-gray-300 dark:text-gray-600'} mt-0.5"
						></i>
						<div>
							<p class="font-medium text-gray-900 dark:text-gray-100">2 por zona <span class="text-xs font-normal text-gray-500 dark:text-gray-400">(FAP)</span></p>
							<p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
								Las 2 mejores de cada zona pasan al bracket eliminatorio.
							</p>
						</div>
					</div>
				</button>

				<button
					type="button"
					onclick={() => (clasificanStr = '1')}
					aria-pressed={clasificanStr === '1'}
					class="block w-full rounded-lg border p-3 text-left transition {clasificanStr === '1'
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-700'
						: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
				>
					<div class="flex items-start gap-2">
						<i
							class="bi {clasificanStr === '1' ? 'bi-check-circle-fill text-brand-500' : 'bi-circle text-gray-300 dark:text-gray-600'} mt-0.5"
						></i>
						<div>
							<p class="font-medium text-gray-900 dark:text-gray-100">1 por zona</p>
							<p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
								Solo el campeón de cada zona pasa. Más exigente, bracket más chico.
							</p>
						</div>
					</div>
				</button>

				{#if hayZonasDe4}
					<button
						type="button"
						onclick={() => (clasificanStr = '3')}
						aria-pressed={clasificanStr === '3'}
						class="block w-full rounded-lg border p-3 text-left transition {clasificanStr ===
						'3'
							? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-700'
							: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
					>
						<div class="flex items-start gap-2">
							<i
								class="bi {clasificanStr === '3' ? 'bi-check-circle-fill text-brand-500' : 'bi-circle text-gray-300 dark:text-gray-600'} mt-0.5"
							></i>
							<div>
								<p class="font-medium text-gray-900 dark:text-gray-100">3 por zona</p>
								<p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
									Solo aplica a las zonas de 4. Bracket más grande, menos eliminados en
									fase de grupos.
								</p>
							</div>
						</div>
					</button>
				{/if}
			</div>

			<!-- Resumen final en el ultimo paso. -->
			<div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-800">
				<p class="mb-1 font-medium text-gray-700 dark:text-gray-300">Vas a armar:</p>
				{#if previsualizacion.ok}
					<p class="text-gray-600 dark:text-gray-400">
						{previsualizacion.zonas3 + previsualizacion.zonas4} zonas
						{#if previsualizacion.zonas4 > 0}
							· {previsualizacion.zonas4} de 4
						{/if}
						{#if previsualizacion.zonas3 > 0}
							· {previsualizacion.zonas3} de 3
						{/if}
						· {clasificanPorZona} {clasificanPorZona === 1 ? 'clasifica' : 'clasifican'} por zona
					</p>
					{#if huboFallback}
						<p class="mt-2 flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
							<i class="bi bi-info-circle mt-0.5"></i>
							<span>Con {cantidadInscripciones} no es posible armar zonas de 4. Se generan zonas de 3.</span>
						</p>
					{/if}
				{:else}
					<p class="text-red-600">{previsualizacion.mensaje}</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if errorGlobal}
		<div class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			{errorGlobal}
		</div>
	{/if}

	<!-- Navegacion del wizard. -->
	<div class="mt-5 flex items-center justify-between gap-3">
		{#if pasoActual === 1}
			{#if onCancel}
				<button
					type="button"
					onclick={onCancel}
					disabled={guardando}
					class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
				>
					Cancelar
				</button>
			{:else}
				<div></div>
			{/if}
		{:else}
			<button
				type="button"
				onclick={retroceder}
				disabled={guardando}
				class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
			>
				<i class="bi bi-arrow-left"></i>
				Atrás
			</button>
		{/if}

		{#if esUltimo}
			<button
				type="submit"
				disabled={guardando || !previsualizacion.ok}
				class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if guardando}
					<i class="bi bi-arrow-clockwise animate-spin"></i>
				{/if}
				{submitLabel}
			</button>
		{:else}
			<button
				type="button"
				onclick={avanzar}
				disabled={!previsualizacion.ok}
				class="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				Siguiente
				<i class="bi bi-arrow-right"></i>
			</button>
		{/if}
	</div>
</form>
