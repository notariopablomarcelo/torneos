<script lang="ts">
	import { page } from '$app/state';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import BreadcrumbCard from '$lib/components/BreadcrumbCard.svelte';
	import InscripcionNombres from '$lib/components/InscripcionNombres.svelte';
	import KebabMenu from '$lib/components/KebabMenu.svelte';
	import ResultadoForm from '$lib/components/ResultadoForm.svelte';
	import { suscribirTorneo } from '$lib/services/torneos';
	import { obtenerCategoria } from '$lib/services/categorias';
	import { suscribirJugadores } from '$lib/services/jugadores';
	import { suscribirInscripciones } from '$lib/services/inscripciones';
	import {
		borrarResultadoPartido,
		cambiarClasificanZona,
		cambiarModalidadZona,
		cargarResultadoPartido,
		suscribirPartidos,
		suscribirZonas
	} from '$lib/services/armado';
	import {
		suscribirCanchasDelTorneo,
		suscribirTodasLasCanchas
	} from '$lib/services/programacion';
	import { suscribirSedes } from '$lib/services/sedes';
	import { etiquetaFechaCorta } from '$lib/dates';
	import { horaAMinutos, minutosAHora } from '$lib/programacion/algoritmo';
	import type { TorneoCancha } from '$lib/types/programacion';
	import type { Cancha, Sede } from '$lib/types/sede';
	import {
		calcularTablaPosiciones,
		estadoZona,
		resolverParejaRef
	} from '$lib/zonas/resultados';
	import { AMBIENTE } from '$lib/firebase';
	import { generarResultadoPartido } from '$lib/dev/factories';
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
	import type {
		ModalidadZona4,
		ParejaRef,
		Partido,
		ResultadoPartido,
		Zona
	} from '$lib/types/armado';
	import type { Jugador } from '$lib/types/jugador';

	const tid = $derived(page.params.id as string);
	const cid = $derived(page.params.cid as string);
	const zid = $derived(page.params.zid as string);

	let torneo = $state<Torneo | null>(null);
	let categoria = $state<Categoria | null>(null);
	let inscripciones = $state<Inscripcion[]>([]);
	let jugadores = $state<Jugador[]>([]);
	let zonas = $state<Zona[]>([]);
	let partidos = $state<Partido[]>([]);
	// Para resolver nombres en el tab cronologia.
	let canchasTorneo = $state<TorneoCancha[]>([]);
	let canchasGlobales = $state<Cancha[]>([]);
	let sedes = $state<Sede[]>([]);
	let cargandoCategoria = $state(true);
	let cargandoJugadores = $state(true);
	let errorCarga = $state<string | null>(null);

	const cargando = $derived(cargandoCategoria || cargandoJugadores);

	const jugadoresPorId = $derived(new Map(jugadores.map((j) => [j.id, j])));
	const inscripcionesPorId = $derived(
		new Map(inscripciones.map((i) => [i.id, i]))
	);
	const zona = $derived(zonas.find((z) => z.id === zid) ?? null);

	const onTestResultado =
		AMBIENTE !== 'prod' ? generarResultadoPartido : undefined;

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
		partidos = [];

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
		const unsubP = suscribirPartidos(t, c, (val) => {
			partidos = val;
		});
		const unsubCT = suscribirCanchasDelTorneo(t, (val) => {
			canchasTorneo = val;
		});
		const unsubCG = suscribirTodasLasCanchas((val) => {
			canchasGlobales = val;
		});
		const unsubSe = suscribirSedes((val) => {
			sedes = val;
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
			unsubP();
			unsubCT();
			unsubCG();
			unsubSe();
		};
	});

	// Lookups para la cronologia (tab nuevo).
	const sedesPorId = $derived(new Map(sedes.map((s) => [s.id, s])));
	const canchasGlobalesPorId = $derived(
		new Map(canchasGlobales.map((c) => [c.id, c]))
	);
	const canchasTorneoPorCanchaId = $derived(
		new Map(canchasTorneo.map((tc) => [tc.canchaId, tc]))
	);

	function labelCancha(canchaId: string): string {
		const cancha = canchasGlobalesPorId.get(canchaId);
		if (!cancha) return 'Cancha desconocida';
		const sede = sedesPorId.get(cancha.sedeId);
		return sede ? `${cancha.nombre} · ${sede.nombre}` : cancha.nombre;
	}

	function rangoHorarioPartido(horaInicio: string): string {
		const finMin = horaAMinutos(horaInicio) + 90;
		return `${horaInicio} – ${minutosAHora(finMin)}`;
	}

	const partidosZ = $derived(
		[...partidos]
			.filter((p) => p.zonaId === zid)
			.sort((a, b) => a.numeroEnZona - b.numeroEnZona)
	);

	const tabla = $derived(zona ? calcularTablaPosiciones(zona, partidos) : []);
	const hayJugados = $derived(partidosZ.some((p) => p.resultado !== null));
	const est = $derived(zona ? estadoZona(zona, partidosZ) : 'Pendiente');

	function descripcionParejaRef(ref: ParejaRef): string {
		if (ref.tipo === 'GanadorPartido' || ref.tipo === 'PerdedorPartido') {
			const inscId = resolverParejaRef(ref, partidosZ);
			if (inscId) {
				const insc = inscripcionesPorId.get(inscId);
				if (insc) return nombreInscripcion(insc, jugadoresPorId);
			}
		}
		switch (ref.tipo) {
			case 'Inscripcion': {
				const insc = inscripcionesPorId.get(ref.inscripcionId);
				if (!insc) return 'Pareja desconocida';
				return nombreInscripcion(insc, jugadoresPorId);
			}
			case 'GanadorPartido':
				return `Ganador del P${ref.numeroEnZona}`;
			case 'PerdedorPartido':
				return `Perdedor del P${ref.numeroEnZona}`;
			case 'PosicionZona':
				// Solo aparece en bracket; en zona detail nunca deberia llegar aca.
				return `${ref.posicion}° de Zona ${ref.letraZona}`;
			default: {
				const _exhaustivo: never = ref;
				return _exhaustivo;
			}
		}
	}

	function nombresDeParejaRef(ref: ParejaRef): string[] {
		if (ref.tipo === 'GanadorPartido' || ref.tipo === 'PerdedorPartido') {
			const inscId = resolverParejaRef(ref, partidosZ);
			if (inscId) {
				const insc = inscripcionesPorId.get(inscId);
				if (insc) return nombresJugadores(insc, jugadoresPorId);
			}
			return [descripcionParejaRef(ref)];
		}
		if (ref.tipo === 'PosicionZona') {
			return [descripcionParejaRef(ref)];
		}
		const insc = inscripcionesPorId.get(ref.inscripcionId);
		if (!insc) return ['Pareja desconocida'];
		return nombresJugadores(insc, jugadoresPorId);
	}

	// ===== Carga de resultados =====

	type TabId = 'posiciones' | 'partidos' | 'cronologia';
	let tabActiva = $state<TabId>('posiciones');

	// Partidos de la zona que ya tienen programacion, ordenados cronologicamente.
	const partidosProgramadosZ = $derived(
		[...partidosZ]
			.filter((p) => p.programacion !== null && p.programacion !== undefined)
			.sort((a, b) => {
				const pA = a.programacion!;
				const pB = b.programacion!;
				if (pA.fecha !== pB.fecha) return pA.fecha.localeCompare(pB.fecha);
				return pA.hora.localeCompare(pB.hora);
			})
	);

	// Agrupar por fecha para que el tab muestre dias separados.
	type GrupoFecha = {
		fecha: string;
		partidos: Partido[];
	};
	const cronologiaPorFecha = $derived.by<GrupoFecha[]>(() => {
		const map = new Map<string, Partido[]>();
		for (const p of partidosProgramadosZ) {
			const f = p.programacion!.fecha;
			const arr = map.get(f) ?? [];
			arr.push(p);
			map.set(f, arr);
		}
		return Array.from(map.entries())
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([fecha, partidos]) => ({ fecha, partidos }));
	});

	let partidoEditandoId = $state<string | null>(null);

	const partidoEditando = $derived(
		partidoEditandoId
			? (partidos.find((p) => p.id === partidoEditandoId) ?? null)
			: null
	);

	function abrirResultado(partidoId: string) {
		partidoEditandoId = partidoId;
	}

	function cerrarResultado() {
		partidoEditandoId = null;
	}

	async function handleCargarResultado(r: ResultadoPartido) {
		if (!partidoEditandoId) return;
		await cargarResultadoPartido(tid, cid, partidoEditandoId, r);
		partidoEditandoId = null;
	}

	async function handleBorrarResultado() {
		if (!partidoEditandoId) return;
		await borrarResultadoPartido(tid, cid, partidoEditandoId);
		partidoEditandoId = null;
	}

	// ===== Autocarga de resultados (solo no-prod) =====
	//
	// Genera resultados random para todos los partidos PENDIENTES de la zona
	// con `generarResultadoPartido`. Util para probar el flujo de cierre de
	// zona / armado de bracket sin tener que tipear sets uno por uno.
	let autoCargando = $state(false);

	async function handleAutocargarResultados() {
		const pendientes = partidos.filter(
			(p) => p.zonaId === zid && p.resultado === null
		);
		if (pendientes.length === 0) return;
		autoCargando = true;
		try {
			for (const p of pendientes) {
				await cargarResultadoPartido(tid, cid, p.id, generarResultadoPartido());
			}
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al autocargar resultados.');
		} finally {
			autoCargando = false;
		}
	}

	// ===== Cambio de modalidad =====

	let sheetModalidad = $state(false);
	let nuevaModalidad = $state<ModalidadZona4>('todosContraTodos');
	let aplicandoModalidad = $state(false);

	function abrirCambioModalidad() {
		if (!zona || zona.tamano !== 4) return;
		nuevaModalidad = zona.modalidad;
		sheetModalidad = true;
	}

	async function aplicarCambioModalidad() {
		if (!zona) return;
		aplicandoModalidad = true;
		try {
			await cambiarModalidadZona(tid, cid, zona.id, nuevaModalidad);
			sheetModalidad = false;
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al cambiar la modalidad');
		} finally {
			aplicandoModalidad = false;
		}
	}

	// ===== Cambio de clasifican =====

	let sheetClasifican = $state(false);
	let nuevoClasifican = $state<1 | 2 | 3>(2);
	let aplicandoClasifican = $state(false);

	const opcionesClasificanDisponibles = $derived<(1 | 2 | 3)[]>(
		zona?.tamano === 4 ? [1, 2, 3] : [1, 2]
	);

	function abrirCambioClasifican() {
		if (!zona) return;
		nuevoClasifican = zona.clasifican;
		sheetClasifican = true;
	}

	async function aplicarCambioClasifican() {
		if (!zona) return;
		aplicandoClasifican = true;
		try {
			await cambiarClasificanZona(tid, cid, zona.id, nuevoClasifican);
			sheetClasifican = false;
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al cambiar clasificación');
		} finally {
			aplicandoClasifican = false;
		}
	}

	function formatearMarcador(p: Partido): string {
		if (!p.resultado) return '';
		if (p.resultado.motivo === 'WO') return 'W.O.';
		return p.resultado.sets
			.map((s) => {
				const tb =
					s.tiebreakP1 !== undefined && s.tiebreakP2 !== undefined
						? ` (${s.tiebreakP1}-${s.tiebreakP2})`
						: '';
				return `${s.p1}-${s.p2}${tb}`;
			})
			.join(', ');
	}

	const kebabItems = $derived(
		zona
			? zona.tamano === 4
				? [
						{
							label: 'Cambiar modalidad',
							icono: 'bi-arrow-left-right',
							onClick: abrirCambioModalidad
						},
						{
							label: 'Cambiar clasifican',
							icono: 'bi-trophy',
							onClick: abrirCambioClasifican
						}
					]
				: [
						{
							label: 'Cambiar clasifican',
							icono: 'bi-trophy',
							onClick: abrirCambioClasifican
						}
					]
			: []
	);
</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	{#if cargando}
		<div class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if errorCarga}
		<div class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			{errorCarga}
		</div>
	{:else if !zona}
		<div class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
			<p class="font-medium">Zona no encontrada</p>
		</div>
	{:else}
		<a
			href={`/torneos/${tid}/categorias/${cid}/zonas`}
			class="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
		>
			<i class="bi bi-arrow-left"></i>
			Volver
		</a>

		<BreadcrumbCard
			items={[
				{ prefijo: 'Torneo', label: torneo?.nombre ?? '—' },
				{
					prefijo: 'Categoría',
					label: categoria ? nombreCategoria(categoria) : '—'
				}
			]}
		/>

		<header class="mb-4 flex items-center justify-between gap-3">
			<div class="flex items-center gap-3">
				<span
					class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-lg font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
				>
					{zona.letra}
				</span>
				<div>
					<h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Zona {zona.letra}</h1>
					<p class="text-xs text-gray-500 dark:text-gray-400">
						{zona.tamano} parejas ·
						{zona.modalidad === 'dobleOportunidad'
							? 'doble oportunidad'
							: 'todos contra todos'}
						· clasifican {zona.clasifican}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				{#if est !== 'Pendiente'}
					<span
						class="rounded-full px-2 py-0.5 text-[10px] font-semibold {est ===
						'Finalizada'
							? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
							: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'}"
					>
						{est === 'Finalizada' ? 'Finalizada' : 'En curso'}
					</span>
				{/if}
				{#if AMBIENTE !== 'prod'}
					{@const pendientesZona = partidos.filter(
						(p) => p.zonaId === zid && p.resultado === null
					).length}
					{#if pendientesZona > 0}
						<button
							type="button"
							onclick={handleAutocargarResultados}
							disabled={autoCargando}
							title="Carga resultados random a todos los partidos pendientes (solo dev)"
							class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
						>
							{#if autoCargando}
								<i class="bi bi-arrow-clockwise animate-spin"></i>
							{:else}
								<i class="bi bi-magic"></i>
							{/if}
							Test · {pendientesZona}
						</button>
					{/if}
				{/if}
				<KebabMenu label="Acciones de la zona" items={kebabItems} />
			</div>
		</header>

		<!-- Tabs segmented control: posiciones / partidos / cronologia. -->
		<div class="mb-4 flex w-full items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
			<button
				type="button"
				role="tab"
				aria-selected={tabActiva === 'posiciones'}
				onclick={() => (tabActiva = 'posiciones')}
				class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs transition sm:gap-2 sm:px-3 sm:text-sm {tabActiva ===
				'posiciones'
					? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:text-brand-300'
					: 'bg-transparent font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
			>
				<i class="bi bi-list-ol text-base"></i>
				<span>Posiciones</span>
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={tabActiva === 'partidos'}
				onclick={() => (tabActiva = 'partidos')}
				class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs transition sm:gap-2 sm:px-3 sm:text-sm {tabActiva ===
				'partidos'
					? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:text-brand-300'
					: 'bg-transparent font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
			>
				<i class="bi bi-trophy text-base"></i>
				<span>Partidos</span>
				<span
					class="ml-0.5 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold {tabActiva ===
					'partidos'
						? 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400'
						: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}"
				>
					{partidosZ.length}
				</span>
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={tabActiva === 'cronologia'}
				onclick={() => (tabActiva = 'cronologia')}
				class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs transition sm:gap-2 sm:px-3 sm:text-sm {tabActiva ===
				'cronologia'
					? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:text-brand-300'
					: 'bg-transparent font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
			>
				<i class="bi bi-calendar3 text-base"></i>
				<span>Cronología</span>
				{#if partidosProgramadosZ.length > 0}
					<span
						class="ml-0.5 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold {tabActiva ===
						'cronologia'
							? 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400'
							: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}"
					>
						{partidosProgramadosZ.length}
					</span>
				{/if}
			</button>
		</div>

		{#if tabActiva === 'posiciones'}
		<section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
			<ul class="space-y-2">
				{#each tabla as fila, idx (fila.inscripcionId)}
					{@const insc = inscripcionesPorId.get(fila.inscripcionId)}
					{@const clasifica = idx < zona.clasifican}
					<li
						class="flex items-start gap-3 rounded-lg border p-3 {hayJugados &&
						clasifica
							? 'border-brand-200 bg-brand-50 dark:border-brand-700 dark:bg-brand-900/40'
							: 'border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800'}"
					>
						<span
							class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold {hayJugados &&
							clasifica
								? 'text-brand-700 ring-1 ring-brand-200 dark:bg-gray-900 dark:text-brand-300 dark:ring-brand-700'
								: 'text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700'}"
						>
							{idx + 1}
						</span>
						<div class="min-w-0 flex-1">
							{#if insc}
								<InscripcionNombres
									nombres={nombresJugadores(insc, jugadoresPorId)}
								/>
							{:else}
								<p class="text-sm text-gray-500 italic dark:text-gray-400">Pareja desconocida</p>
							{/if}
							{#if hayJugados}
								<p
									class="mt-1 flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400"
								>
									<span
										>PG <strong class="text-gray-700 dark:text-gray-300">{fila.pg}</strong></span
									>
									<span class="text-gray-300 dark:text-gray-600">·</span>
									<span
										>Sets <strong class="text-gray-700 dark:text-gray-300"
											>{fila.sf}-{fila.sc}</strong
										></span
									>
									<span class="text-gray-300 dark:text-gray-600">·</span>
									<span
										>Games <strong class="text-gray-700 dark:text-gray-300"
											>{fila.gf}-{fila.gc}</strong
										></span
									>
								</p>
							{/if}
						</div>
						{#if insc?.ranking != null}
							<span
								class="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-700"
								title={`Ranking ${insc.ranking}`}
							>
								#{insc.ranking}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		</section>

		{:else if tabActiva === 'partidos'}
		<section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
			{#if partidosZ.length === 0}
				<p class="py-6 text-center text-xs text-gray-500 dark:text-gray-400">Sin partidos.</p>
			{:else}
				<ul class="space-y-2">
					{#each partidosZ as p (p.id)}
						{@const jugado = p.resultado !== null}
						{@const gana1 = jugado && p.resultado!.ganadorEs === 1}
						{@const gana2 = jugado && p.resultado!.ganadorEs === 2}
						{@const nombres1 = nombresDeParejaRef(p.pareja1Ref)}
						{@const nombres2 = nombresDeParejaRef(p.pareja2Ref)}
						{@const sets = p.resultado?.sets ?? []}
						{@const esWO = jugado && p.resultado!.motivo === 'WO'}
						<li
							class="rounded-lg border bg-white p-3 dark:bg-gray-900 {jugado
								? 'border-gray-200 dark:border-gray-800'
								: 'border-gray-100 dark:border-gray-800'}"
						>
							<div class="mb-2 flex items-center justify-between gap-2">
								<p class="text-xs font-semibold tracking-wide text-brand-700 dark:text-brand-300">
									P{p.numeroEnZona}
								</p>
								{#if jugado && p.resultado!.motivo !== 'normal'}
									<span
										class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 uppercase dark:bg-amber-900/40 dark:text-amber-300"
									>
										{p.resultado!.motivo === 'WO' ? 'W.O.' : 'abandono'}
									</span>
								{/if}
							</div>

							<div
								class="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2"
							>
								<div class="min-w-0">
									{#each nombres1 as n, j (j)}
										<p
											class="truncate text-sm {gana1
												? 'font-semibold text-brand-700 dark:text-brand-300'
												: 'font-medium text-gray-900 dark:text-gray-100'}"
										>
											{n}
										</p>
									{/each}
								</div>
								{#if jugado && !esWO && sets.length > 0}
									<div class="flex shrink-0 gap-1.5">
										{#each sets as s, i (i)}
											<span
												class="font-mono text-sm {gana1
													? 'font-semibold text-brand-700 dark:text-brand-300'
													: 'text-gray-700 dark:text-gray-300'}"
											>
												{s.p1}{#if s.tiebreakP1 !== undefined}<sup
														class="text-[10px]">{s.tiebreakP1}</sup
													>{/if}
											</span>
										{/each}
									</div>
								{:else if esWO}
									<span
										class="shrink-0 font-mono text-xs {gana1
											? 'font-semibold text-brand-700 dark:text-brand-300'
											: 'text-gray-500 dark:text-gray-400'}"
									>
										{gana1 ? 'W' : '–'}
									</span>
								{:else}
									<span class="shrink-0"></span>
								{/if}
								<div class="w-4 shrink-0 text-right">
									{#if gana1}
										<i class="bi bi-trophy-fill text-xs text-brand-500"></i>
									{/if}
								</div>

								<div class="min-w-0">
									{#each nombres2 as n, j (j)}
										<p
											class="truncate text-sm {gana2
												? 'font-semibold text-brand-700 dark:text-brand-300'
												: 'font-medium text-gray-900 dark:text-gray-100'}"
										>
											{n}
										</p>
									{/each}
								</div>
								{#if jugado && !esWO && sets.length > 0}
									<div class="flex shrink-0 gap-1.5">
										{#each sets as s, i (i)}
											<span
												class="font-mono text-sm {gana2
													? 'font-semibold text-brand-700 dark:text-brand-300'
													: 'text-gray-700 dark:text-gray-300'}"
											>
												{s.p2}{#if s.tiebreakP2 !== undefined}<sup
														class="text-[10px]">{s.tiebreakP2}</sup
													>{/if}
											</span>
										{/each}
									</div>
								{:else if esWO}
									<span
										class="shrink-0 font-mono text-xs {gana2
											? 'font-semibold text-brand-700 dark:text-brand-300'
											: 'text-gray-500 dark:text-gray-400'}"
									>
										{gana2 ? 'W' : '–'}
									</span>
								{:else}
									<span class="shrink-0"></span>
								{/if}
								<div class="w-4 shrink-0 text-right">
									{#if gana2}
										<i class="bi bi-trophy-fill text-xs text-brand-500"></i>
									{/if}
								</div>
							</div>

							<div
								class="mt-3 flex justify-end border-t border-gray-100 pt-2 dark:border-gray-800"
							>
								<button
									type="button"
									onclick={() => abrirResultado(p.id)}
									class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/40"
								>
									<i class="bi {jugado ? 'bi-pencil' : 'bi-plus-circle'}"></i>
									{jugado ? 'Editar' : 'Cargar'}
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{:else}
		<!-- Tab Cronologia: partidos de la zona con programacion (fecha+hora+
		     cancha) ordenados cronologicamente. Estilo timeline con dot a la
		     izq + linea vertical conectando. Si ningun partido fue programado
		     todavia, mostramos un estado vacio con CTA hacia /programacion. -->
		<section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
			{#if partidosProgramadosZ.length === 0}
				<div class="py-8 text-center">
					<i class="bi bi-calendar3 text-3xl text-gray-300 dark:text-gray-600"></i>
					<p class="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">
						Sin partidos programados
					</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">
						Asigná fecha, hora y cancha desde
						<a
							href={`/torneos/${tid}/programacion`}
							class="font-medium text-brand-700 underline dark:text-brand-300"
						>
							Programación
						</a>
						.
					</p>
				</div>
			{:else}
				<div class="space-y-5">
					{#each cronologiaPorFecha as grupo (grupo.fecha)}
						<div>
							<p class="mb-3 text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
								{etiquetaFechaCorta(grupo.fecha)}
							</p>
							<ol class="relative border-l-2 border-gray-200 pl-5 dark:border-gray-700">
								{#each grupo.partidos as p (p.id)}
									{@const jugado = p.resultado !== null}
									{@const nombres1 = nombresDeParejaRef(p.pareja1Ref)}
									{@const nombres2 = nombresDeParejaRef(p.pareja2Ref)}
									<li class="mb-4 last:mb-0">
										<span
											class="absolute -left-[7px] mt-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white {jugado
												? 'bg-emerald-500'
												: 'bg-brand-500'} dark:border-gray-900"
										></span>
										<div class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
											<div class="mb-2 flex flex-wrap items-center gap-2">
												<span class="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
													{rangoHorarioPartido(p.programacion!.hora)}
												</span>
												<span class="text-xs text-gray-500 dark:text-gray-400">
													· P{p.numeroEnZona}
												</span>
												{#if jugado}
													<span class="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
														Jugado
													</span>
												{:else}
													<span class="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
														Pendiente
													</span>
												{/if}
											</div>
											<p class="mb-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
												<i class="bi bi-geo-alt-fill text-brand-500"></i>
												{labelCancha(p.programacion!.canchaId)}
											</p>
											<div class="grid grid-cols-2 gap-2">
												<div class="min-w-0">
													{#each nombres1 as n, j (j)}
														<p class="truncate text-xs text-gray-700 dark:text-gray-300">{n}</p>
													{/each}
												</div>
												<div class="min-w-0 border-l border-gray-100 pl-2 dark:border-gray-800">
													{#each nombres2 as n, j (j)}
														<p class="truncate text-xs text-gray-700 dark:text-gray-300">{n}</p>
													{/each}
												</div>
											</div>
											{#if jugado}
												<p class="mt-2 truncate font-mono text-xs text-gray-600 dark:text-gray-400">
													{formatearMarcador(p)}
												</p>
											{/if}
											<div class="mt-2 flex justify-end">
												<button
													type="button"
													onclick={() => abrirResultado(p.id)}
													class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/40"
												>
													<i class="bi {jugado ? 'bi-pencil' : 'bi-plus-circle'}"></i>
													{jugado ? 'Editar' : 'Cargar resultado'}
												</button>
											</div>
										</div>
									</li>
								{/each}
							</ol>
						</div>
					{/each}
				</div>
			{/if}
		</section>
		{/if}
	{/if}
</div>

<!-- Sheet cargar/editar resultado de partido. -->
<BottomSheet
	open={partidoEditando !== null}
	onClose={cerrarResultado}
	title={partidoEditando?.resultado ? 'Editar resultado' : 'Cargar resultado'}
>
	{#if partidoEditando}
		{#key partidoEditando.id}
			<ResultadoForm
				initial={partidoEditando.resultado}
				nombresPareja1={nombresDeParejaRef(partidoEditando.pareja1Ref)}
				nombresPareja2={nombresDeParejaRef(partidoEditando.pareja2Ref)}
				submitLabel={partidoEditando.resultado ? 'Guardar' : 'Cargar'}
				onSubmit={handleCargarResultado}
				onCancel={cerrarResultado}
				onBorrar={partidoEditando.resultado
					? handleBorrarResultado
					: undefined}
				onTest={onTestResultado}
			/>
		{/key}
	{/if}
</BottomSheet>

<!-- Sheet cambiar modalidad. -->
<BottomSheet
	open={sheetModalidad}
	onClose={() => (sheetModalidad = false)}
	title={zona ? `Modalidad Zona ${zona.letra}` : 'Modalidad'}
>
	{#if zona}
		<p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
			La zona tiene 4 parejas. Elegí la modalidad de los partidos.
		</p>

		<div class="space-y-2">
			<button
				type="button"
				onclick={() => (nuevaModalidad = 'todosContraTodos')}
				aria-pressed={nuevaModalidad === 'todosContraTodos'}
				class="block w-full rounded-lg border p-3 text-left transition {nuevaModalidad ===
				'todosContraTodos'
					? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-700'
					: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
			>
				<div class="flex items-start gap-2">
					<i
						class="bi {nuevaModalidad === 'todosContraTodos'
							? 'bi-check-circle-fill text-brand-500'
							: 'bi-circle text-gray-300 dark:text-gray-600'} mt-0.5"
					></i>
					<div>
						<p class="font-medium text-gray-900 dark:text-gray-100">Todos contra todos</p>
						<p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
							6 partidos por zona. Cada pareja juega contra todas las otras.
						</p>
					</div>
				</div>
			</button>

			<button
				type="button"
				onclick={() => (nuevaModalidad = 'dobleOportunidad')}
				aria-pressed={nuevaModalidad === 'dobleOportunidad'}
				class="block w-full rounded-lg border p-3 text-left transition {nuevaModalidad ===
				'dobleOportunidad'
					? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-700'
					: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
			>
				<div class="flex items-start gap-2">
					<i
						class="bi {nuevaModalidad === 'dobleOportunidad'
							? 'bi-check-circle-fill text-brand-500'
							: 'bi-circle text-gray-300 dark:text-gray-600'} mt-0.5"
					></i>
					<div>
						<p class="font-medium text-gray-900 dark:text-gray-100">Doble oportunidad</p>
						<p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
							4 partidos. Cruces 1v4 y 2v3, después ganadores entre sí y
							perdedores tienen segunda chance.
						</p>
					</div>
				</div>
			</button>
		</div>

		{#if nuevaModalidad !== zona.modalidad}
			<p
				class="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
			>
				<i class="bi bi-info-circle mt-0.5"></i>
				<span>
					Algunos partidos se regeneran. Los pares que existen en ambas
					modalidades se conservan con sus resultados; el resto se borra.
				</span>
			</p>
		{/if}

		<div class="mt-5 flex items-center justify-end gap-3">
			<button
				type="button"
				onclick={() => (sheetModalidad = false)}
				disabled={aplicandoModalidad}
				class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
			>
				Cancelar
			</button>
			<button
				type="button"
				onclick={aplicarCambioModalidad}
				disabled={aplicandoModalidad || nuevaModalidad === zona.modalidad}
				class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if aplicandoModalidad}
					<i class="bi bi-arrow-clockwise animate-spin"></i>
				{/if}
				Aplicar
			</button>
		</div>
	{/if}
</BottomSheet>

<!-- Sheet cambiar clasifican. -->
<BottomSheet
	open={sheetClasifican}
	onClose={() => (sheetClasifican = false)}
	title={zona ? `Clasifican Zona ${zona.letra}` : 'Clasifican'}
>
	{#if zona}
		<p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
			Cuántas parejas de la Zona {zona.letra} pasan al bracket eliminatorio.
		</p>

		<div class="space-y-2">
			{#each opcionesClasificanDisponibles as n (n)}
				<button
					type="button"
					onclick={() => (nuevoClasifican = n)}
					aria-pressed={nuevoClasifican === n}
					class="block w-full rounded-lg border p-3 text-left transition {nuevoClasifican ===
					n
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-900/40 dark:ring-brand-700'
						: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
				>
					<div class="flex items-start gap-2">
						<i
							class="bi {nuevoClasifican === n
								? 'bi-check-circle-fill text-brand-500'
								: 'bi-circle text-gray-300 dark:text-gray-600'} mt-0.5"
						></i>
						<div>
							<p class="font-medium text-gray-900 dark:text-gray-100">
								{n} por zona
								{#if n === 2}<span class="text-xs font-normal text-gray-500 dark:text-gray-400"
										>(FAP)</span
									>{/if}
							</p>
							<p class="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
								{#if n === 1}
									Solo el campeón pasa al bracket. Más exigente.
								{:else if n === 2}
									Las 2 mejores pasan al bracket.
								{:else}
									Las 3 mejores pasan. Solo el último queda eliminado.
								{/if}
							</p>
						</div>
					</div>
				</button>
			{/each}
		</div>

		<div class="mt-5 flex items-center justify-end gap-3">
			<button
				type="button"
				onclick={() => (sheetClasifican = false)}
				disabled={aplicandoClasifican}
				class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
			>
				Cancelar
			</button>
			<button
				type="button"
				onclick={aplicarCambioClasifican}
				disabled={aplicandoClasifican || nuevoClasifican === zona.clasifican}
				class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if aplicandoClasifican}
					<i class="bi bi-arrow-clockwise animate-spin"></i>
				{/if}
				Aplicar
			</button>
		</div>
	{/if}
</BottomSheet>
