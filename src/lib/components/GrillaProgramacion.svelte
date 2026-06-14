<script lang="ts">
	import type { Partido } from '$lib/types/armado';
	import type { TorneoCancha } from '$lib/types/programacion';
	import type { Cancha, Sede } from '$lib/types/sede';
	import {
		horaAMinutos,
		horaFinAMinutos,
		minutosAHora
	} from '$lib/programacion/algoritmo';

	// =============================================================================
	// Grilla visual de programacion: vertical = horarios, horizontal = canchas
	// agrupadas por sede. Cada partido programado es un bloque posicionado de
	// forma absoluta dentro de su columna de cancha, con `top` y `height`
	// calculados a partir de la hora.
	//
	// Patron adaptado de PadelRoom/CourtsGrid: flex container + posicionamiento
	// absoluto. Sin CSS Grid, sin tabla. Reactivo a cambios de fecha y filtro.
	// =============================================================================

	type Props = {
		partidos: Partido[];
		fecha: string; // YYYY-MM-DD
		canchasTorneo: TorneoCancha[];
		canchasGlobales: Cancha[];
		sedes: Sede[];
		// Set vacio = todas las categorias visibles. Sino solo las del set.
		filtroCategoriasIds: Set<string>;
		// Color por categoria (mismo asignacion que los chips de filtro).
		colorCategoria: (categoriaId: string) => { bg: string; fg: string };
		// Label corto del partido (fallback). Si `contextoLabel` esta
		// presente, este se usa solo para el `title` del bloque.
		labelPartido: (p: Partido) => string;
		// Opcional: contexto del partido (ej. "Zona A", "8vos") para
		// renderizar como PILL coloreado al inicio del bloque.
		contextoLabel?: (p: Partido) => string;
		// Color del pill de contexto. Si no se pasa, usa el de la categoria.
		colorContexto?: (p: Partido) => { bg: string; fg: string };
		// Opcional: nombres apilados de los jugadores que conforman cada
		// pareja. Devolvemos un array por pareja para que la grilla los
		// renderee uno abajo del otro (formato visual habitual en padel).
		// Si la pareja no se puede resolver, devolver null para esa pareja
		// y la grilla la omite.
		nombresParejas?: (p: Partido) => {
			pareja1: string[] | null;
			pareja2: string[] | null;
		};
		// Opcional: 1 o 2 si el partido tiene resultado cargado (indica
		// que pareja gano). null si no hay resultado. La grilla muestra
		// una copa al lado del nombre de la pareja ganadora.
		ganadorPartido?: (p: Partido) => 1 | 2 | null;
		// Pixels por hora. Default 82 (compacto, alcanza desktop). Mobile
		// puede pasar 90 si necesita mas aire para los nombres.
		rowH?: number;
		// Ancho minimo de cada columna de cancha. Default 120. Las
		// columnas se estiran a `flex-1` para llenar el contenedor padre.
		columnaWidth?: { min: number };
		onPartidoClick: (partidoId: string) => void;
	};

	let {
		partidos,
		fecha,
		canchasTorneo,
		canchasGlobales,
		sedes,
		filtroCategoriasIds,
		colorCategoria,
		labelPartido,
		contextoLabel,
		colorContexto,
		nombresParejas,
		ganadorPartido,
		rowH: rowHProp,
		columnaWidth,
		onPartidoClick
	}: Props = $props();

	// Constantes visuales.
	// 82px/hora → 123px por bloque de 90min — entran horario + pill + 2
	// lineas por pareja + divisor + 2 lineas por pareja sin recortar.
	const ROW_H = $derived(rowHProp ?? 82); // pixels por hora
	const DURACION_MIN = 90; // duracion estimada por partido
	// Padding superior/inferior del area de horarios. Sirve para que el label
	// del primer y ultimo horario no queden pegados al borde / al header.
	const PAD_Y = 10;
	const COL_MIN = $derived(columnaWidth?.min ?? 120);

	const canchasGlobalesPorId = $derived(
		new Map(canchasGlobales.map((c) => [c.id, c]))
	);
	const sedesPorId = $derived(new Map(sedes.map((s) => [s.id, s])));

	// "Dia visual": [08:00 hoy, 08:00 manana). Partidos programados en la
	// madrugada del dia siguiente (00:00-07:59) aparecen como continuacion
	// del dia actual. Eso permite que un partido a las 23:00 + 90 min y
	// otro a las 00:30 se vean en la misma grilla.
	const CORTE_DIA_VISUAL_MIN = 8 * 60;
	const fechaSiguiente = $derived.by(() => {
		const d = new Date(fecha + 'T00:00:00');
		d.setDate(d.getDate() + 1);
		return d.toISOString().slice(0, 10);
	});

	// Minutos visuales de un partido en el dia actual. Si es del dia
	// actual → su hora normal. Si es de la madrugada del siguiente
	// (hora < 08:00) → hora + 1440 (continuacion). Si no pertenece a este
	// dia visual, devuelve null.
	function inicioMinVisual(prog: {
		fecha: string;
		hora: string;
	}): number | null {
		if (prog.fecha === fecha) return horaAMinutos(prog.hora);
		if (prog.fecha === fechaSiguiente) {
			const m = horaAMinutos(prog.hora);
			if (m < CORTE_DIA_VISUAL_MIN) return m + 24 * 60;
		}
		return null;
	}

	// Canchas del torneo enriquecidas con sede + rango horario del dia.
	// Solo incluimos las que tienen disponibilidad para esta fecha; sin
	// disponibilidad, no tiene sentido mostrar la columna.
	type ColumnaCancha = {
		torneoCanchaId: string;
		canchaId: string;
		canchaNombre: string;
		sedeId: string;
		sedeNombre: string;
		// Lista de rangos disponibles para esa fecha (puede ser horario partido
		// — ej. mañana + tarde con cierre intermedio).
		rangos: { desdeMin: number; hastaMin: number }[];
	};

	const columnas = $derived.by<ColumnaCancha[]>(() => {
		const out: ColumnaCancha[] = [];
		for (const tc of canchasTorneo) {
			const cancha = canchasGlobalesPorId.get(tc.canchaId);
			const sede = sedesPorId.get(tc.sedeId);
			const rangosDelDia = tc.disponibilidad.filter((r) => r.fecha === fecha);
			// Rangos de la madrugada del dia siguiente: si la cancha tiene
			// disponibilidad de 00:00 a 08:00 del dia D+1, la mostramos
			// como continuacion del dia D (sumando 24h).
			const rangosMadrugada = tc.disponibilidad.filter(
				(r) =>
					r.fecha === fechaSiguiente &&
					horaAMinutos(r.desde) < CORTE_DIA_VISUAL_MIN
			);
			if (rangosDelDia.length === 0 && rangosMadrugada.length === 0) continue;
			const rangos = [
				...rangosDelDia.map((r) => ({
					desdeMin: horaAMinutos(r.desde),
					hastaMin: horaFinAMinutos(r.hasta)
				})),
				...rangosMadrugada.map((r) => ({
					desdeMin: horaAMinutos(r.desde) + 24 * 60,
					hastaMin:
						Math.min(horaFinAMinutos(r.hasta), CORTE_DIA_VISUAL_MIN) +
						24 * 60
				}))
			].sort((a, b) => a.desdeMin - b.desdeMin);
			out.push({
				torneoCanchaId: tc.id,
				canchaId: tc.canchaId,
				canchaNombre: cancha?.nombre ?? 'Cancha ?',
				sedeId: tc.sedeId,
				sedeNombre: sede?.nombre ?? 'Sede ?',
				rangos
			});
		}
		// Ordenar por sede, despues por cancha.
		out.sort((a, b) => {
			const ds = a.sedeNombre.localeCompare(b.sedeNombre, 'es');
			if (ds !== 0) return ds;
			return a.canchaNombre.localeCompare(b.canchaNombre, 'es');
		});
		return out;
	});

	// Rango global de horas a mostrar. El dia visual arranca SIEMPRE a las
	// 08:00; el fin se extiende hasta cubrir el ultimo partido programado
	// (incluyendo los de la madrugada del dia siguiente).
	const rangoGlobal = $derived.by<{ inicioMin: number; finMin: number }>(() => {
		const inicio = CORTE_DIA_VISUAL_MIN;
		if (columnas.length === 0) {
			return { inicioMin: inicio, finMin: 22 * 60 };
		}
		let fin = -Infinity;
		for (const c of columnas) {
			for (const r of c.rangos) {
				if (r.hastaMin > fin) fin = r.hastaMin;
			}
		}
		if (!Number.isFinite(fin)) fin = 22 * 60;
		// Extender el `fin` si hay partidos cuya hora visual termina mas
		// alla del rango de canchas (caso continuacion-de-madrugada).
		for (const p of partidos) {
			if (!p.programacion) continue;
			const iniV = inicioMinVisual(p.programacion);
			if (iniV === null) continue;
			const finP = iniV + DURACION_MIN;
			if (finP > fin) fin = finP;
		}
		// Redondeamos a horas enteras para los labels.
		const finH = Math.ceil(fin / 60) * 60;
		return { inicioMin: inicio, finMin: finH };
	});

	const totalMin = $derived(rangoGlobal.finMin - rangoGlobal.inicioMin);
	const alturaInternaPx = $derived((totalMin / 60) * ROW_H);
	const alturaPx = $derived(alturaInternaPx + PAD_Y * 2);
	const horasLabels = $derived.by<number[]>(() => {
		const out: number[] = [];
		for (let m = rangoGlobal.inicioMin; m <= rangoGlobal.finMin; m += 60) {
			out.push(m / 60);
		}
		return out;
	});

	// Partidos visibles agrupados por cancha. Aplicamos filtro de categoria
	// aca para no renderear bloques de categorias ocultas.
	function partidosDeCancha(canchaId: string): Partido[] {
		return partidos.filter(
			(p) =>
				p.programacion &&
				p.programacion.canchaId === canchaId &&
				inicioMinVisual(p.programacion) !== null &&
				(filtroCategoriasIds.size === 0 ||
					filtroCategoriasIds.has(p.categoriaId))
		);
	}

	function topPxDeMin(min: number): number {
		return ((min - rangoGlobal.inicioMin) / 60) * ROW_H + PAD_Y;
	}

	function topPxDePartido(prog: { fecha: string; hora: string }): number {
		const min = inicioMinVisual(prog) ?? horaAMinutos(prog.hora);
		return topPxDeMin(min);
	}

	function altoBloquePx(): number {
		return (DURACION_MIN / 60) * ROW_H;
	}

	// Areas "no disponibles" de una columna: los gaps en el tiempo que no
	// estan cubiertos por ningun rango de la cancha. Incluye el gap inicial
	// (antes del primer rango), los gaps intermedios (entre rangos cuando
	// es horario partido) y el gap final.
	function areasNoDisponibles(
		c: ColumnaCancha
	): { topMin: number; altoMin: number }[] {
		const out: { topMin: number; altoMin: number }[] = [];
		if (c.rangos.length === 0) {
			out.push({
				topMin: 0,
				altoMin: rangoGlobal.finMin - rangoGlobal.inicioMin
			});
			return out;
		}
		// Antes del primer rango.
		const primero = c.rangos[0]!;
		if (primero.desdeMin > rangoGlobal.inicioMin) {
			out.push({
				topMin: 0,
				altoMin: primero.desdeMin - rangoGlobal.inicioMin
			});
		}
		// Gaps entre rangos.
		for (let i = 0; i < c.rangos.length - 1; i++) {
			const actual = c.rangos[i]!;
			const siguiente = c.rangos[i + 1]!;
			if (siguiente.desdeMin > actual.hastaMin) {
				out.push({
					topMin: actual.hastaMin - rangoGlobal.inicioMin,
					altoMin: siguiente.desdeMin - actual.hastaMin
				});
			}
		}
		// Después del último rango.
		const ultimo = c.rangos[c.rangos.length - 1]!;
		if (ultimo.hastaMin < rangoGlobal.finMin) {
			out.push({
				topMin: ultimo.hastaMin - rangoGlobal.inicioMin,
				altoMin: rangoGlobal.finMin - ultimo.hastaMin
			});
		}
		return out;
	}

	// Formato "HH:mm – HH:mm" para mostrar inicio-fin del partido. Si el fin
	// pasa de las 24:00 lo representamos como 00:XX (modulo 24) — visual.
	function rangoHorarioStr(horaInicio: string): string {
		const inicioMin = horaAMinutos(horaInicio);
		const finMin = inicioMin + DURACION_MIN;
		return `${horaInicio} – ${minutosAHora(finMin)}`;
	}

	// Bloques libres: huecos dentro de los rangos disponibles donde no hay
	// partidos programados. Render gris, label "Libre HH:MM a HH:MM".
	function bloquesLibres(
		c: ColumnaCancha
	): { desdeMin: number; hastaMin: number }[] {
		const out: { desdeMin: number; hastaMin: number }[] = [];
		const ocupados = partidosDeCancha(c.canchaId)
			.map((p) => {
				const ini = inicioMinVisual(p.programacion!);
				return ini === null
					? null
					: { desdeMin: ini, hastaMin: ini + DURACION_MIN };
			})
			.filter((x): x is { desdeMin: number; hastaMin: number } => x !== null)
			.sort((a, b) => a.desdeMin - b.desdeMin);
		for (const r of c.rangos) {
			let cursor = r.desdeMin;
			for (const p of ocupados) {
				if (p.hastaMin <= r.desdeMin) continue;
				if (p.desdeMin >= r.hastaMin) break;
				const ini = Math.max(p.desdeMin, r.desdeMin);
				if (ini > cursor) {
					out.push({ desdeMin: cursor, hastaMin: ini });
				}
				cursor = Math.max(cursor, Math.min(p.hastaMin, r.hastaMin));
			}
			if (cursor < r.hastaMin) {
				out.push({ desdeMin: cursor, hastaMin: r.hastaMin });
			}
		}
		return out;
	}
</script>

{#if columnas.length === 0}
	<div
		class="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
	>
		<i class="bi bi-calendar-x text-3xl text-gray-300 dark:text-gray-600"></i>
		<p class="mt-2 font-medium">No hay canchas disponibles para esta fecha</p>
		<p class="text-xs">
			Cargá disponibilidad para esta fecha en <strong>Canchas</strong> o cambiá de día.
		</p>
	</div>
{:else}
	<div
		class="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
	>
		<!-- Header de canchas (sticky horizontal). -->
		<div class="flex border-b border-gray-200 dark:border-gray-800">
			<!-- Spacer para alinear con la columna de horas. -->
			<div class="w-14 shrink-0 border-r border-gray-200 dark:border-gray-800"></div>
			{#each columnas as c (c.torneoCanchaId)}
				<div
					class="flex-1 border-r border-gray-200 px-2 py-2 text-center last:border-r-0 dark:border-gray-800"
					style="min-width: {COL_MIN}px;"
				>
					<p class="truncate text-[11px] text-gray-400 dark:text-gray-500">
						{c.sedeNombre}
					</p>
					<p
						class="truncate font-bold text-gray-600 uppercase dark:text-gray-300"
						style="font-size: 13px; letter-spacing: 0.08em;"
					>
						{c.canchaNombre}
					</p>
				</div>
			{/each}
		</div>

		<!-- Grilla. -->
		<div class="flex">
			<!-- Columna de horas. -->
			<div
				class="relative w-14 shrink-0 border-r border-gray-200 dark:border-gray-800"
				style="height: {alturaPx}px"
			>
				{#each horasLabels as h (h)}
					{@const top = topPxDeMin(h * 60)}
					<!-- Centrado vertical exacto sobre el tick con translateY. -->
					<div
						class="absolute text-right font-medium text-gray-500 dark:text-gray-400"
						style="top: {top}px; right: 6px; font-size: 11px; line-height: 1.2; transform: translateY(-50%); white-space: nowrap;"
					>
						{String(h % 24).padStart(2, '0')}:00
					</div>
				{/each}
			</div>

			<!-- Columnas de canchas. -->
			{#each columnas as c (c.torneoCanchaId)}
				<div
					class="relative flex-1 border-r border-gray-200 last:border-r-0 dark:border-gray-800"
					style="height: {alturaPx}px; min-width: {COL_MIN}px;"
				>
					<!-- Areas fuera de disponibilidad: cubre los gaps antes/entre/
					     después de los rangos de la cancha. -->
					{#each areasNoDisponibles(c) as area, i (i)}
						<div
							class="area-no-disp absolute right-0 left-0"
							style="top: {(area.topMin / 60) * ROW_H + PAD_Y}px; height: {(area.altoMin / 60) * ROW_H}px"
						></div>
					{/each}

					<!-- Lineas de hora. -->
					{#each horasLabels.slice(1) as h (h)}
						{@const top = topPxDeMin(h * 60)}
						<div
							class="absolute right-0 left-0 border-t border-gray-100 dark:border-gray-800"
							style="top: {top}px"
						></div>
					{/each}

					<!-- Bloques libres: huecos dentro de la disponibilidad sin
					     partido. Render gris con label "Libre HH:MM a HH:MM". -->
					{#each bloquesLibres(c) as libre, i (i)}
						{@const topL = topPxDeMin(libre.desdeMin)}
						{@const altoL =
							((libre.hastaMin - libre.desdeMin) / 60) * ROW_H}
						<div
							class="absolute overflow-hidden rounded border border-dashed border-gray-300 bg-gray-100/80 px-2 py-1 text-[10px] leading-tight text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400"
							style="top: {topL + 2}px; left: 2px; right: 2px; height: {altoL - 4}px;"
						>
							<p class="truncate font-medium">
								Libre {minutosAHora(libre.desdeMin)} a {minutosAHora(libre.hastaMin)} | {libre.hastaMin - libre.desdeMin} min
							</p>
						</div>
					{/each}

					<!-- Bloques de partidos. -->
					{#each partidosDeCancha(c.canchaId) as p (p.id)}
						{@const prog = p.programacion!}
						{@const top = topPxDePartido(prog)}
						{@const altoBlk = altoBloquePx()}
						{@const color = colorCategoria(p.categoriaId)}
						{@const parejas = nombresParejas
							? nombresParejas(p)
							: { pareja1: null, pareja2: null }}
						{@const ganador = ganadorPartido ? ganadorPartido(p) : null}
						<button
							type="button"
							onclick={() => onPartidoClick(p.id)}
							class="absolute overflow-hidden rounded px-2 py-1.5 text-left leading-tight transition hover:scale-[1.02] hover:shadow-md"
							style="top: {top +
								2}px; left: 2px; right: 2px; height: {altoBlk -
								4}px; background-color: {color.bg}; color: {color.fg};"
							title={labelPartido(p)}
						>
							<p class="text-xs font-bold">
								{rangoHorarioStr(prog.hora)}
							</p>
							{#if contextoLabel}
								{@const cBg = colorContexto ? colorContexto(p).bg : color.bg}
								{@const cFg = colorContexto ? colorContexto(p).fg : color.fg}
								<p class="mt-0.5 flex items-center gap-1 text-[10px]">
									<span
										class="inline-block rounded-full px-1.5 py-[1px] font-semibold leading-tight"
										style="background-color: {cBg}; color: {cFg};"
									>
										{contextoLabel(p)}
									</span>
									<span class="opacity-80">P{p.numeroEnZona}</span>
								</p>
							{:else}
								<p class="truncate text-[10px] opacity-80">
									{labelPartido(p)}
								</p>
							{/if}
							{#if parejas.pareja1 && parejas.pareja1.length > 0}
								<div class="mt-1 flex items-start gap-1">
									{#if ganador === 1}
										<i
											class="bi bi-trophy-fill mt-[2px] shrink-0 text-[10px] text-amber-500"
											aria-label="Ganador"
										></i>
									{/if}
									<div class="min-w-0 flex-1">
										{#each parejas.pareja1 as nombre, j (j)}
											<p class="truncate text-xs font-medium leading-tight">
												{nombre}
											</p>
										{/each}
									</div>
								</div>
							{/if}
							{#if parejas.pareja2 && parejas.pareja2.length > 0}
								<div
									class="mt-1 flex items-start gap-1 border-t pt-1"
									style="border-color: currentColor; border-opacity: 0.25;"
								>
									{#if ganador === 2}
										<i
											class="bi bi-trophy-fill mt-[2px] shrink-0 text-[10px] text-amber-500"
											aria-label="Ganador"
										></i>
									{/if}
									<div class="min-w-0 flex-1">
										{#each parejas.pareja2 as nombre, j (j)}
											<p class="truncate text-xs font-medium leading-tight">
												{nombre}
											</p>
										{/each}
									</div>
								</div>
							{/if}
						</button>
					{/each}
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	/* "No disponible" — patron rayado diagonal sutil. Se distingue claramente
	   del fondo blanco de los rangos disponibles sin opacar la grilla. */
	.area-no-disp {
		background-color: rgb(156 163 175 / 0.14);
		background-image: repeating-linear-gradient(
			135deg,
			transparent 0 6px,
			rgb(107 114 128 / 0.22) 6px 7px
		);
	}
	:global(.dark) .area-no-disp {
		background-color: rgb(30 41 59 / 0.7);
		background-image: repeating-linear-gradient(
			135deg,
			transparent 0 6px,
			rgb(148 163 184 / 0.18) 6px 7px
		);
	}
</style>
