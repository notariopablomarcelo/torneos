<script lang="ts">
	import { page } from '$app/state';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import BreadcrumbCard from '$lib/components/BreadcrumbCard.svelte';
	import { suscribirTorneo } from '$lib/services/torneos';
	import { suscribirCategorias } from '$lib/services/categorias';
	import { suscribirSedes } from '$lib/services/sedes';
	import {
		actualizarDisponibilidad,
		aplicarSeleccionCanchas,
		calcularCapacidad,
		estimarRangoDemandaTorneo,
		quitarCanchaDelTorneo,
		suscribirCanchasDelTorneo,
		suscribirTodasLasCanchas
	} from '$lib/services/programacion';
	import { etiquetaFechaCorta, rangoFechasInclusivo } from '$lib/dates';
	import type { Cancha, Sede } from '$lib/types/sede';
	import type { TorneoCancha, RangoHorario } from '$lib/types/programacion';
	import { RANGO_DEFAULT } from '$lib/types/programacion';
	import type { Categoria, Torneo } from '$lib/types/torneo';

	const id = $derived(page.params.id as string);

	let torneo = $state<Torneo | null>(null);
	let cargandoTorneo = $state(true);
	let sedes = $state<Sede[]>([]);
	let canchasGlobales = $state<Cancha[]>([]);
	let canchasTorneo = $state<TorneoCancha[]>([]);
	let categorias = $state<Categoria[]>([]);
	let cargandoSedes = $state(true);
	let cargandoCanchas = $state(true);

	let sheetSelector = $state(false);
	let expandidaId = $state<string | null>(null);
	let aplicandoSeleccion = $state(false);

	const cargando = $derived(cargandoTorneo || cargandoSedes || cargandoCanchas);

	const sedesPorId = $derived(new Map(sedes.map((s) => [s.id, s])));
	const canchasPorId = $derived(new Map(canchasGlobales.map((c) => [c.id, c])));

	// Fechas del torneo (para los rangos de disponibilidad).
	const fechasTorneo = $derived(
		torneo ? rangoFechasInclusivo(torneo.fechaInicio, torneo.fechaFin) : []
	);

	$effect(() => {
		const tid = id;
		cargandoTorneo = true;
		cargandoSedes = true;
		cargandoCanchas = true;
		torneo = null;
		sedes = [];
		canchasGlobales = [];
		canchasTorneo = [];
		sheetSelector = false;
		expandidaId = null;

		const unsubT = suscribirTorneo(tid, (t) => {
			torneo = t;
			cargandoTorneo = false;
		});
		const unsubS = suscribirSedes((s) => {
			sedes = s;
			cargandoSedes = false;
		});
		const unsubCG = suscribirTodasLasCanchas((cs) => {
			canchasGlobales = cs;
		});
		const unsubCT = suscribirCanchasDelTorneo(tid, (cs) => {
			canchasTorneo = cs;
			cargandoCanchas = false;
		});
		const unsubCats = suscribirCategorias(tid, (cats) => {
			categorias = cats;
		});

		return () => {
			unsubT();
			unsubS();
			unsubCG();
			unsubCT();
			unsubCats();
		};
	});

	// =====
	// Selector de canchas: arma una lista por sede con checkbox.
	// =====

	let seleccion = $state<Set<string>>(new Set());

	function abrirSelector() {
		seleccion = new Set(canchasTorneo.map((tc) => tc.canchaId));
		sheetSelector = true;
	}

	function toggleSeleccion(canchaId: string) {
		const next = new Set(seleccion);
		if (next.has(canchaId)) next.delete(canchaId);
		else next.add(canchaId);
		seleccion = next;
	}

	async function aplicarSeleccion() {
		if (!torneo) return;
		aplicandoSeleccion = true;
		try {
			const deseadas = Array.from(seleccion)
				.map((cid) => canchasPorId.get(cid))
				.filter((c): c is Cancha => Boolean(c))
				.map((c) => ({ canchaId: c.id, sedeId: c.sedeId }));
			await aplicarSeleccionCanchas(
				id,
				torneo.fechaInicio,
				torneo.fechaFin,
				canchasTorneo,
				deseadas
			);
			sheetSelector = false;
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al aplicar la selección');
		} finally {
			aplicandoSeleccion = false;
		}
	}

	// Agrupar canchas globales por sede para el modal.
	const canchasAgrupadas = $derived.by(() => {
		const map = new Map<string, Cancha[]>();
		for (const c of canchasGlobales) {
			const arr = map.get(c.sedeId) ?? [];
			arr.push(c);
			map.set(c.sedeId, arr);
		}
		return sedes
			.map((s) => ({
				sede: s,
				canchas: (map.get(s.id) ?? []).sort((a, b) =>
					a.nombre.localeCompare(b.nombre)
				)
			}))
			.filter((g) => g.canchas.length > 0);
	});

	// =====
	// Disponibilidad por dia
	// =====

	// Rangos disponibles para esa fecha (puede haber 0, 1 o varios — el
	// modelo soporta horario partido, ej. mañana + tarde).
	function rangosDeFecha(tc: TorneoCancha, fecha: string): RangoHorario[] {
		return tc.disponibilidad.filter((r) => r.fecha === fecha);
	}

	// Actualiza un rango especifico identificado por (fecha, indexEnLaFecha).
	// Construimos el array nuevo respetando el orden original — para evitar
	// reorderings raros al editar.
	async function setHorarioRango(
		tc: TorneoCancha,
		fecha: string,
		indexEnFecha: number,
		campo: 'desde' | 'hasta',
		valor: string
	) {
		const nueva = tc.disponibilidad.map((r) => ({ ...r }));
		let i = 0;
		for (const r of nueva) {
			if (r.fecha !== fecha) continue;
			if (i === indexEnFecha) {
				r[campo] = valor;
				break;
			}
			i += 1;
		}
		await actualizarDisponibilidad(id, tc.id, nueva);
	}

	async function quitarRango(
		tc: TorneoCancha,
		fecha: string,
		indexEnFecha: number
	) {
		const nueva: RangoHorario[] = [];
		let i = 0;
		for (const r of tc.disponibilidad) {
			if (r.fecha === fecha && i === indexEnFecha) {
				i += 1;
				continue; // skip — este es el que quito
			}
			if (r.fecha === fecha) i += 1;
			nueva.push(r);
		}
		await actualizarDisponibilidad(id, tc.id, nueva);
	}

	async function agregarRango(tc: TorneoCancha, fecha: string) {
		await actualizarDisponibilidad(id, tc.id, [
			...tc.disponibilidad,
			{ fecha, desde: RANGO_DEFAULT.desde, hasta: RANGO_DEFAULT.hasta }
		]);
	}

	async function handleQuitarCancha(tc: TorneoCancha) {
		const c = canchasPorId.get(tc.canchaId);
		const ok = confirm(
			`¿Quitar la cancha "${c?.nombre ?? '?'}" del torneo?`
		);
		if (!ok) return;
		await quitarCanchaDelTorneo(id, tc.id);
	}

	function toggleExpandida(tcid: string) {
		expandidaId = expandidaId === tcid ? null : tcid;
	}
</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	{#if cargando}
		<div class="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if !torneo}
		<div class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			No se encontró el torneo.
		</div>
	{:else}
		<a
			href={`/torneos/${id}`}
			class="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
		>
			<i class="bi bi-arrow-left"></i>
			Volver
		</a>

		<BreadcrumbCard items={[{ prefijo: 'Torneo', label: torneo.nombre }]} />

		<header class="mb-4 flex items-center justify-between">
			<h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Canchas</h1>
			<button
				type="button"
				onclick={abrirSelector}
				disabled={canchasGlobales.length === 0}
				title={canchasGlobales.length === 0 ? 'Cargá sedes y canchas primero' : 'Agregar canchas'}
				class="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				<i class="bi bi-plus-lg"></i>
				Agregar
			</button>
		</header>

		<!-- Capacidad y demanda. La demanda es un RANGO segun la estructura
		     que se elija al armar (mejor caso = zonas de 4 con DO + clasifica
		     1; peor caso = zonas de 3 con RR + clasifican 2). El semaforo
		     compara capacidad contra ese rango. -->
		{#if canchasTorneo.length > 0}
			{@const cap = calcularCapacidad(canchasTorneo)}
			{@const dem = estimarRangoDemandaTorneo(categorias)}
			{@const conCupos = categorias.filter((c) => c.cupos !== null).length}
			{@const estadoCapacidad =
				dem.max === 0
					? 'sinDatos'
					: cap.partidos >= dem.max
						? 'sobra'
						: cap.partidos >= dem.min
							? 'justa'
							: 'falta'}

			<div class="mb-4 grid grid-cols-3 gap-2 rounded-lg border border-gray-200 bg-white p-3 text-center dark:border-gray-800 dark:bg-gray-900 sm:gap-3">
				<div>
					<p class="text-lg font-bold text-gray-900 dark:text-gray-100">
						{canchasTorneo.length}
					</p>
					<p class="text-[10px] tracking-wider text-gray-500 uppercase dark:text-gray-400">
						{canchasTorneo.length === 1 ? 'Cancha' : 'Canchas'}
					</p>
				</div>
				<div class="border-x border-gray-100 dark:border-gray-800">
					<p class="text-lg font-bold text-gray-900 dark:text-gray-100">
						{cap.horas.toFixed(1)}h
					</p>
					<p class="text-[10px] tracking-wider text-gray-500 uppercase dark:text-gray-400">
						Disponibles
					</p>
				</div>
				<div>
					<p class="text-lg font-bold text-gray-900 dark:text-gray-100">
						{cap.partidos}
					</p>
					<p class="text-[10px] tracking-wider text-gray-500 uppercase dark:text-gray-400">
						Slots ~90min
					</p>
				</div>
			</div>

			{#if estadoCapacidad === 'sinDatos'}
				{#if categorias.length > 0}
					<div class="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
						<i class="bi bi-info-circle"></i>
						Cargá cupos en las categorías para estimar cuántos partidos van a jugarse.
					</div>
				{/if}
			{:else}
				{@const colorClasses =
					estadoCapacidad === 'sobra'
						? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
						: estadoCapacidad === 'justa'
							? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
							: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/40 dark:text-red-300'}
				{@const iconClass =
					estadoCapacidad === 'sobra'
						? 'bi-check-circle-fill'
						: estadoCapacidad === 'justa'
							? 'bi-exclamation-circle-fill'
							: 'bi-x-circle-fill'}
				{@const exacto = dem.min === dem.max}
				{@const conEstructura = categorias.filter(
					(c) => c.cupos !== null && c.tamanoPreferido && c.clasificanPorZona
				).length}
				{@const todasConEstructura = conEstructura === conCupos && conCupos > 0}
				<div class="mb-4 flex items-start gap-3 rounded-lg border p-3 text-sm {colorClasses}">
					<i class="bi {iconClass} mt-0.5 text-lg"></i>
					<div class="flex-1">
						<p class="font-semibold">
							Demanda estimada:
							<strong class="font-mono">
								{exacto ? dem.max : `${dem.min}–${dem.max}`}
							</strong>
							partidos
						</p>
						<p class="mt-0.5 text-xs opacity-90">
							{#if estadoCapacidad === 'sobra'}
								{#if exacto}
									Capacidad suficiente — sobran {cap.partidos - dem.max} slots.
								{:else}
									Capacidad suficiente en cualquier estructura (sobran ~{cap.partidos -
										dem.max} slots en el peor caso).
								{/if}
							{:else if estadoCapacidad === 'justa'}
								Alcanza si elegís estructura compacta (zonas de 4 con doble oportunidad).
								Si armás todo con zonas de 3 round-robin, faltarían ~{dem.max -
									cap.partidos} slots.
							{:else if exacto}
								Faltan {dem.max - cap.partidos} slots. Sumá canchas, ampliá horarios o
								achicá cupos.
							{:else}
								Faltarían entre {dem.min - cap.partidos}–{dem.max - cap.partidos} slots.
								Sumá canchas, ampliá horarios o achicá cupos.
							{/if}
						</p>
						<p class="mt-1 text-[10px] opacity-70">
							{#if todasConEstructura}
								Calculado con la estructura preferida de cada categoría
							{:else if conEstructura > 0}
								{conEstructura} de {conCupos} categorías con estructura definida · resto estimado en rango
							{:else}
								Mín = zonas de 4 (DO) + 1 clasifica · Máx = zonas de 3 (RR) + 2 clasifican
							{/if}
							{#if conCupos < categorias.length}
								· Solo {conCupos} de {categorias.length} categorías tienen cupos
							{/if}
						</p>
					</div>
				</div>
			{/if}
		{/if}

		{#if canchasGlobales.length === 0}
			<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
				<p class="flex items-center gap-1.5 font-medium">
					<i class="bi bi-info-circle"></i>
					No hay canchas registradas
				</p>
				<p class="mt-1">
					Cargá sedes y canchas desde <a href="/sedes" class="underline">Sedes</a> antes de
					asignarlas a este torneo.
				</p>
			</div>
		{:else if canchasTorneo.length === 0}
			<div class="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
				<i class="bi bi-grid-3x3 text-4xl text-gray-300 dark:text-gray-600"></i>
				<p class="mt-3 font-medium">Sin canchas asignadas</p>
				<p class="text-sm">Apretá <strong>Agregar</strong> para elegir qué canchas usa este torneo.</p>
			</div>
		{:else}
			<ul class="space-y-2">
				{#each canchasTorneo as tc (tc.id)}
					{@const cancha = canchasPorId.get(tc.canchaId)}
					{@const sede = sedesPorId.get(tc.sedeId)}
					{@const expandida = expandidaId === tc.id}
					<li class="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
						<button
							type="button"
							onclick={() => toggleExpandida(tc.id)}
							class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
						>
							<span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
								<i class="bi bi-grid-3x3"></i>
							</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
									{cancha?.nombre ?? 'Cancha desconocida'}
								</p>
								<p class="truncate text-xs text-gray-500 dark:text-gray-400">
									{sede?.nombre ?? 'Sede desconocida'}
								</p>
							</div>
							<i class="bi bi-chevron-down text-gray-400 transition-transform dark:text-gray-500 {expandida ? 'rotate-180' : ''}"></i>
						</button>

						{#if expandida}
							<div class="space-y-2 border-t border-gray-100 p-4 dark:border-gray-800">
								<p class="text-[10px] font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
									Disponibilidad
								</p>
								<ul class="space-y-2">
									{#each fechasTorneo as fecha (fecha)}
										{@const rangos = rangosDeFecha(tc, fecha)}
										<li class="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
											<div class="mb-2 flex items-center justify-between gap-2">
												<span class="text-xs font-medium text-gray-700 dark:text-gray-300">
													{etiquetaFechaCorta(fecha)}
												</span>
												<button
													type="button"
													onclick={() => agregarRango(tc, fecha)}
													title="Agregar rango"
													class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/40"
												>
													<i class="bi bi-plus-lg text-[10px]"></i>
													Rango
												</button>
											</div>

											{#if rangos.length === 0}
												<p class="text-xs text-gray-400 italic dark:text-gray-500">
													No disponible
												</p>
											{:else}
												<ul class="space-y-1.5">
													{#each rangos as r, i (i)}
														<li class="flex items-center gap-2">
															<input
																type="time"
																value={r.desde}
																onchange={(e) =>
																	setHorarioRango(tc, fecha, i, 'desde', e.currentTarget.value)}
																class="w-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
															/>
															<span class="text-xs text-gray-400">a</span>
															<input
																type="time"
																value={r.hasta}
																onchange={(e) =>
																	setHorarioRango(tc, fecha, i, 'hasta', e.currentTarget.value)}
																class="w-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
															/>
															<button
																type="button"
																onclick={() => quitarRango(tc, fecha, i)}
																aria-label="Quitar rango"
																title="Quitar rango"
																class="ml-auto rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400"
															>
																<i class="bi bi-x"></i>
															</button>
														</li>
													{/each}
												</ul>
											{/if}
										</li>
									{/each}
								</ul>
								<div class="flex justify-end pt-2">
									<button
										type="button"
										onclick={() => handleQuitarCancha(tc)}
										class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/40"
									>
										<i class="bi bi-trash"></i>
										Quitar del torneo
									</button>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<!-- Selector de canchas: agrupado por sede, multi-select con checkboxes. -->
<BottomSheet open={sheetSelector} onClose={() => (sheetSelector = false)} title="Elegir canchas">
	<p class="mb-3 text-xs text-gray-500 dark:text-gray-400">
		Tildá las canchas que querés usar en este torneo. Cuando guardes, las nuevas se agregan con
		disponibilidad 08:00 a 00:00 (medianoche) — ajustalas después.
	</p>
	{#if canchasAgrupadas.length === 0}
		<p class="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
			No hay canchas disponibles.
		</p>
	{:else}
		<div class="space-y-4">
			{#each canchasAgrupadas as grupo (grupo.sede.id)}
				<div>
					<p class="mb-2 text-[10px] font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
						{grupo.sede.nombre}
					</p>
					<ul class="space-y-1.5">
						{#each grupo.canchas as cancha (cancha.id)}
							{@const checked = seleccion.has(cancha.id)}
							<li>
								<label
									class="flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition {checked
										? 'border-brand-500 bg-brand-50 dark:border-brand-700 dark:bg-brand-900/40'
										: 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'}"
								>
									<input
										type="checkbox"
										checked={checked}
										onchange={() => toggleSeleccion(cancha.id)}
										class="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-500 focus:ring-brand-200 dark:border-gray-700"
									/>
									<span class="min-w-0 flex-1 truncate font-medium text-gray-900 dark:text-gray-100">
										{cancha.nombre}
									</span>
								</label>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}

	<div class="mt-5 flex items-center justify-end gap-3">
		<button
			type="button"
			onclick={() => (sheetSelector = false)}
			disabled={aplicandoSeleccion}
			class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
		>
			Cancelar
		</button>
		<button
			type="button"
			onclick={aplicarSeleccion}
			disabled={aplicandoSeleccion}
			class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if aplicandoSeleccion}
				<i class="bi bi-arrow-clockwise animate-spin"></i>
			{/if}
			Aplicar
		</button>
	</div>
</BottomSheet>
