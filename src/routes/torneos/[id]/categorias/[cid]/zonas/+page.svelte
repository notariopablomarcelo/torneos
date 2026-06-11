<script lang="ts">
	import { page } from '$app/state';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import BreadcrumbCard from '$lib/components/BreadcrumbCard.svelte';
	import InscripcionNombres from '$lib/components/InscripcionNombres.svelte';
	import KebabMenu from '$lib/components/KebabMenu.svelte';
	import ArmadoZonasForm from '$lib/components/ArmadoZonasForm.svelte';
	import { suscribirTorneo } from '$lib/services/torneos';
	import { obtenerCategoria } from '$lib/services/categorias';
	import { suscribirJugadores } from '$lib/services/jugadores';
	import { suscribirInscripciones } from '$lib/services/inscripciones';
	import {
		agregarInscripcionAZona,
		armarZonasCategoria,
		desarmarZonasCategoria,
		suscribirZonas
	} from '$lib/services/armado';
	import {
		nombreCategoria,
		type Categoria,
		type Torneo
	} from '$lib/types/torneo';
	import {
		nombreInscripcion,
		nombresJugadores,
		type Inscripcion
	} from '$lib/types/inscripcion';
	import type { ArmadoConfig, ModalidadZona4, Zona } from '$lib/types/armado';
	import type { Jugador } from '$lib/types/jugador';

	const tid = $derived(page.params.id as string);
	const cid = $derived(page.params.cid as string);

	let torneo = $state<Torneo | null>(null);
	let categoria = $state<Categoria | null>(null);
	let inscripciones = $state<Inscripcion[]>([]);
	let jugadores = $state<Jugador[]>([]);
	let zonas = $state<Zona[]>([]);
	let cargandoCategoria = $state(true);
	let cargandoJugadores = $state(true);
	let errorCarga = $state<string | null>(null);

	const cargando = $derived(cargandoCategoria || cargandoJugadores);

	let sheetArmado = $state(false);
	let sheetConfig = $state(false);

	// Paleta para diferenciar visualmente las zonas mediante una linea de color
	// a la izquierda del card. Se asigna ciclicamente por la letra (A=0, B=1,
	// ...). Hex directos para evitar el problema de Tailwind con clases
	// dinamicas sin safelist.
	const COLORES_ZONA = [
		'#3b82f6', // blue
		'#10b981', // emerald
		'#f59e0b', // amber
		'#ef4444', // rose
		'#8b5cf6', // violet
		'#06b6d4', // cyan
		'#f97316', // orange
		'#ec4899' // pink
	];

	function colorPorLetra(letra: string): string {
		const idx = letra.charCodeAt(0) - 'A'.charCodeAt(0);
		const safe = ((idx % COLORES_ZONA.length) + COLORES_ZONA.length) % COLORES_ZONA.length;
		return COLORES_ZONA[safe] as string;
	}

	const jugadoresPorId = $derived(new Map(jugadores.map((j) => [j.id, j])));
	const inscripcionesPorId = $derived(
		new Map(inscripciones.map((i) => [i.id, i]))
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
		zonas = [];
		sheetArmado = false;

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
		const unsubZ = suscribirZonas(t, c, (val) => {
			zonas = val;
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
			unsubZ();
		};
	});

	const armadoConfig = $derived(categoria?.armadoConfig ?? null);
	const estaArmada = $derived(armadoConfig !== null);

	const armadoPosible = $derived.by(() => {
		const n = inscripciones.length;
		if (n < 3)
			return { ok: false as const, motivo: 'Se necesitan al menos 3 inscripciones.' };
		if (n === 5)
			return {
				ok: false as const,
				motivo:
					'N=5 no tiene una distribución estándar. Sumá 1 (para 6) o sacá 2 (para 3).'
			};
		return { ok: true as const };
	});

	async function refrescarCategoria() {
		categoria = await obtenerCategoria(tid, cid);
	}

	async function handleArmar(config: Omit<ArmadoConfig, 'armadoEn'>) {
		await armarZonasCategoria(tid, cid, inscripciones, config);
		await refrescarCategoria();
		sheetArmado = false;
	}

	function handleRearmar() {
		const ok = confirm(
			'Re-armar borra las zonas y partidos actuales (con sus resultados si los hay) y vuelve a generar todo. ¿Continuar?'
		);
		if (!ok) return;
		sheetArmado = true;
	}

	async function handleDesarmar() {
		const ok = confirm(
			'Desarmar borra todas las zonas y partidos. La categoría vuelve a "no armada". ¿Continuar?'
		);
		if (!ok) return;
		await desarmarZonasCategoria(tid, cid);
		await refrescarCategoria();
	}

	// Inscripciones que existen pero todavia no estan en ninguna zona armada.
	const inscripcionesSinZona = $derived.by(() => {
		if (!estaArmada) return [];
		const enZonas = new Set(zonas.flatMap((z) => z.inscripcionIds));
		return inscripciones.filter((i) => !enZonas.has(i.id));
	});

	// Asignar a zona: flujo de 2 pasos.
	let asignandoInscripcionId = $state<string | null>(null);
	let zonaDestinoId = $state<string | null>(null);
	let modalidadDestino = $state<ModalidadZona4>('todosContraTodos');
	let aplicandoAsignacion = $state(false);

	const zonasQuePuedenRecibir = $derived(zonas.filter((z) => z.tamano === 3));
	const zonaDestino = $derived(
		zonas.find((z) => z.id === zonaDestinoId) ?? null
	);

	function abrirAsignar(inscripcionId: string) {
		asignandoInscripcionId = inscripcionId;
		zonaDestinoId = null;
		modalidadDestino = armadoConfig?.modalidadZona4 ?? 'todosContraTodos';
	}

	function cerrarAsignar() {
		asignandoInscripcionId = null;
		zonaDestinoId = null;
	}

	function seleccionarZonaDestino(zonaId: string) {
		zonaDestinoId = zonaId;
		const z = zonas.find((zz) => zz.id === zonaId);
		if (z && z.modalidad !== 'todosContraTodos') {
			modalidadDestino = z.modalidad;
		} else {
			modalidadDestino = armadoConfig?.modalidadZona4 ?? 'todosContraTodos';
		}
	}

	function volverAPaso1() {
		zonaDestinoId = null;
	}

	async function aplicarAsignacion() {
		if (!asignandoInscripcionId || !zonaDestinoId) return;
		aplicandoAsignacion = true;
		try {
			await agregarInscripcionAZona(
				tid,
				cid,
				zonaDestinoId,
				asignandoInscripcionId,
				inscripciones,
				modalidadDestino
			);
			asignandoInscripcionId = null;
			zonaDestinoId = null;
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al asignar a la zona');
		} finally {
			aplicandoAsignacion = false;
		}
	}
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
			<div class="flex items-center gap-1.5">
				<h1 class="text-xl font-bold text-gray-900">Zonas</h1>
				{#if estaArmada && armadoConfig}
					<button
						type="button"
						onclick={() => (sheetConfig = true)}
						title="Ver configuración del armado"
						aria-label="Ver configuración del armado"
						class="inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-brand-700"
					>
						<i class="bi bi-info-circle"></i>
					</button>
				{/if}
			</div>
			{#if estaArmada}
				<KebabMenu
					label="Acciones de zonas"
					items={[
						{
							label: 'Re-armar',
							icono: 'bi-arrow-clockwise',
							onClick: handleRearmar
						},
						{
							label: 'Desarmar',
							icono: 'bi-x-circle',
							onClick: handleDesarmar,
							destructive: true
						}
					]}
				/>
			{:else}
				<button
					type="button"
					onclick={() => (sheetArmado = true)}
					disabled={!armadoPosible.ok}
					title={!armadoPosible.ok ? armadoPosible.motivo : ''}
					class="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<i class="bi bi-diagram-3"></i>
					Armar zonas
				</button>
			{/if}
		</header>

		{#if !estaArmada}
			<div
				class="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500"
			>
				<i class="bi bi-diagram-3 text-4xl text-gray-300"></i>
				<p class="mt-3 font-medium">
					{#if !armadoPosible.ok}
						{armadoPosible.motivo}
					{:else}
						Listo para armar
					{/if}
				</p>
				{#if armadoPosible.ok}
					<p class="text-sm">
						Apretá <strong>Armar zonas</strong> para elegir el formato.
					</p>
				{/if}
			</div>
		{:else}
			<!-- Banner inscripciones sin asignar. -->
			{#if inscripcionesSinZona.length > 0}
				<div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
					<p class="mb-2 flex items-center gap-1.5 font-medium text-amber-900">
						<i class="bi bi-exclamation-circle"></i>
						{inscripcionesSinZona.length}
						{inscripcionesSinZona.length === 1 ? 'inscripción' : 'inscripciones'} sin asignar a
						zona
					</p>
					<ul class="space-y-2">
						{#each inscripcionesSinZona as i (i.id)}
							<li
								class="flex items-start justify-between gap-3 rounded-md bg-white p-3"
							>
								<div class="min-w-0 flex-1">
									<InscripcionNombres nombres={nombresJugadores(i, jugadoresPorId)} />
								</div>
								<button
									type="button"
									onclick={() => abrirAsignar(i.id)}
									disabled={zonasQuePuedenRecibir.length === 0}
									title={zonasQuePuedenRecibir.length === 0
										? 'No hay zonas con espacio (todas tienen 4). Re-armá para redistribuir.'
										: ''}
									class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
								>
									<i class="bi bi-arrow-right-circle"></i>
									Asignar
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Cards de zonas: cada card lista las parejas y linkea al detalle. -->
			<ul class="space-y-3">
				{#each zonas as z (z.id)}
					<li>
						<a
							href={`/torneos/${tid}/categorias/${cid}/zonas/${z.id}`}
							style="border-left: 4px solid {colorPorLetra(z.letra)};"
							class="block overflow-hidden rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
						>
							<div class="flex items-center gap-3 px-4 py-3">
								<span
									class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700"
								>
									{z.letra}
								</span>
								<p class="min-w-0 flex-1 text-sm text-gray-700">
									<span class="font-semibold text-gray-900">{z.tamano} parejas</span>
									<span class="text-gray-500">
										·
										{z.modalidad === 'dobleOportunidad'
											? 'doble oportunidad'
											: 'todos contra todos'}
									</span>
								</p>
								<i class="bi bi-chevron-right shrink-0 text-base text-gray-300"></i>
							</div>
							<ul class="space-y-2 border-t border-gray-100 bg-gray-50/50 p-3">
								{#each z.inscripcionIds as inscId, idx (inscId)}
									{@const insc = inscripcionesPorId.get(inscId)}
									<li class="flex items-start gap-3">
										<span
											class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-gray-700 ring-1 ring-gray-200"
										>
											{idx + 1}
										</span>
										<div class="min-w-0 flex-1">
											{#if insc}
												<InscripcionNombres
													nombres={nombresJugadores(insc, jugadoresPorId)}
												/>
											{:else}
												<p class="text-sm text-gray-500 italic">
													Pareja desconocida
												</p>
											{/if}
										</div>
										{#if insc?.ranking != null}
											<span
												class="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200"
												title={`Ranking ${insc.ranking}`}
											>
												#{insc.ranking}
											</span>
										{/if}
									</li>
								{/each}
							</ul>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<!-- Sheet con la configuracion del armado (solo lectura). -->
<BottomSheet
	open={sheetConfig && armadoConfig !== null}
	onClose={() => (sheetConfig = false)}
	title="Configuración del armado"
>
	{#if armadoConfig}
		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
			<dt class="text-gray-500">Algoritmo</dt>
			<dd class="font-medium text-gray-900">
				{armadoConfig.algoritmo === 'snake'
					? 'snake / serpentina'
					: 'random'}
			</dd>
			<dt class="text-gray-500">Tamaño preferido</dt>
			<dd class="font-medium text-gray-900">
				{armadoConfig.tamanoPreferido} parejas
			</dd>
			{#if zonas.some((z) => z.tamano === 4)}
				<dt class="text-gray-500">Modalidad zonas 4</dt>
				<dd class="font-medium text-gray-900">
					{armadoConfig.modalidadZona4 === 'todosContraTodos'
						? 'todos contra todos'
						: 'doble oportunidad'}
				</dd>
			{/if}
			<dt class="text-gray-500">Clasifican</dt>
			<dd class="font-medium text-gray-900">
				{armadoConfig.clasificanPorZona} por zona
			</dd>
		</dl>
		<div class="mt-5 flex justify-end">
			<button
				type="button"
				onclick={() => (sheetConfig = false)}
				class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
			>
				Cerrar
			</button>
		</div>
	{/if}
</BottomSheet>

<!-- Sheet del wizard de armado. -->
<BottomSheet
	open={sheetArmado}
	onClose={() => (sheetArmado = false)}
	title={estaArmada ? 'Re-armar zonas' : 'Armar zonas'}
>
	<ArmadoZonasForm
		cantidadInscripciones={inscripciones.length}
		submitLabel={estaArmada ? 'Re-armar' : 'Armar zonas'}
		onSubmit={handleArmar}
		onCancel={() => (sheetArmado = false)}
	/>
</BottomSheet>

<!-- Sheet asignar inscripcion a zona (2 pasos). -->
<BottomSheet
	open={asignandoInscripcionId !== null}
	onClose={cerrarAsignar}
	title={zonaDestinoId
		? `Modalidad para Zona ${zonaDestino?.letra ?? ''}`
		: 'Elegir zona'}
>
	{#if asignandoInscripcionId}
		{@const insc = inscripcionesPorId.get(asignandoInscripcionId)}

		{#if !zonaDestinoId}
			{#if insc}
				<p class="mb-3 text-sm text-gray-600">
					Asignar a <strong>{nombreInscripcion(insc, jugadoresPorId)}</strong>:
				</p>
			{/if}
			{#if zonasQuePuedenRecibir.length === 0}
				<p
					class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
				>
					No hay zonas con espacio. Re-armá la categoría para redistribuir.
				</p>
			{:else}
				<ul class="space-y-2">
					{#each zonasQuePuedenRecibir as z (z.id)}
						<button
							type="button"
							onclick={() => seleccionarZonaDestino(z.id)}
							class="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-brand-300 hover:bg-brand-50"
						>
							<span
								class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700"
							>
								{z.letra}
							</span>
							<p class="min-w-0 flex-1 text-sm">
								<span class="font-semibold text-gray-900">Zona {z.letra}</span>
								<span class="text-gray-500">
									· {z.inscripcionIds.length} → {z.inscripcionIds.length + 1}
									parejas</span
								>
							</p>
							<i class="bi bi-arrow-right text-brand-500"></i>
						</button>
					{/each}
				</ul>
			{/if}
		{:else}
			<p class="mb-3 text-sm text-gray-600">
				La <strong>Zona {zonaDestino?.letra}</strong> pasará de 3 a 4 parejas.
				¿Qué modalidad querés para esta zona?
			</p>

			<div class="space-y-2">
				<button
					type="button"
					onclick={() => (modalidadDestino = 'todosContraTodos')}
					aria-pressed={modalidadDestino === 'todosContraTodos'}
					class="block w-full rounded-lg border p-3 text-left transition {modalidadDestino ===
					'todosContraTodos'
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
						: 'border-gray-200 bg-white hover:border-gray-300'}"
				>
					<div class="flex items-start gap-2">
						<i
							class="bi {modalidadDestino === 'todosContraTodos'
								? 'bi-check-circle-fill text-brand-500'
								: 'bi-circle text-gray-300'} mt-0.5"
						></i>
						<div>
							<p class="font-medium text-gray-900">Todos contra todos</p>
							<p class="mt-0.5 text-xs text-gray-600">
								6 partidos por zona. Cada pareja juega contra todas las otras.
							</p>
						</div>
					</div>
				</button>

				<button
					type="button"
					onclick={() => (modalidadDestino = 'dobleOportunidad')}
					aria-pressed={modalidadDestino === 'dobleOportunidad'}
					class="block w-full rounded-lg border p-3 text-left transition {modalidadDestino ===
					'dobleOportunidad'
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
						: 'border-gray-200 bg-white hover:border-gray-300'}"
				>
					<div class="flex items-start gap-2">
						<i
							class="bi {modalidadDestino === 'dobleOportunidad'
								? 'bi-check-circle-fill text-brand-500'
								: 'bi-circle text-gray-300'} mt-0.5"
						></i>
						<div>
							<p class="font-medium text-gray-900">Doble oportunidad</p>
							<p class="mt-0.5 text-xs text-gray-600">
								4 partidos. Cruces 1v4 y 2v3, después ganadores entre sí y perdedores
								tienen segunda chance.
							</p>
						</div>
					</div>
				</button>
			</div>

			<div class="mt-5 flex items-center justify-between gap-3">
				<button
					type="button"
					onclick={volverAPaso1}
					disabled={aplicandoAsignacion}
					class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
				>
					<i class="bi bi-arrow-left"></i>
					Atrás
				</button>
				<button
					type="button"
					onclick={aplicarAsignacion}
					disabled={aplicandoAsignacion}
					class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if aplicandoAsignacion}
						<i class="bi bi-arrow-clockwise animate-spin"></i>
					{/if}
					Asignar a Zona {zonaDestino?.letra}
				</button>
			</div>
		{/if}
	{/if}
</BottomSheet>
