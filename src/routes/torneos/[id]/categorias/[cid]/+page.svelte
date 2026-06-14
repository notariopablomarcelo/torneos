<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { suscribirTorneo } from '$lib/services/torneos';
	import {
		obtenerCategoria,
		eliminarCategoria
	} from '$lib/services/categorias';
	import { suscribirInscripciones } from '$lib/services/inscripciones';
	import { suscribirZonas } from '$lib/services/armado';
	import {
		nombreCategoria,
		obtenerCantidadJugadores,
		sustantivoInscripcion,
		type Categoria,
		type Torneo
	} from '$lib/types/torneo';
	import type { Inscripcion } from '$lib/types/inscripcion';
	import type { Zona } from '$lib/types/armado';

	const tid = $derived(page.params.id as string);
	const cid = $derived(page.params.cid as string);

	let torneo = $state<Torneo | null>(null);
	let categoria = $state<Categoria | null>(null);
	let inscripciones = $state<Inscripcion[]>([]);
	let zonas = $state<Zona[]>([]);
	let cargandoCategoria = $state(true);
	let errorCarga = $state<string | null>(null);

	const cantidad = $derived(categoria ? obtenerCantidadJugadores(categoria) : 2);
	const estaArmada = $derived((categoria?.armadoConfig ?? null) !== null);
	const bracketArmado = $derived((categoria?.bracketConfig ?? null) !== null);

	$effect(() => {
		const t = tid;
		const c = cid;
		cargandoCategoria = true;
		errorCarga = null;
		torneo = null;
		categoria = null;
		inscripciones = [];
		zonas = [];

		let cancelado = false;
		const unsubT = suscribirTorneo(t, (val) => {
			torneo = val;
		});
		const unsubI = suscribirInscripciones(t, c, (val) => {
			inscripciones = val;
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
			unsubZ();
		};
	});

	async function handleEliminarCategoria() {
		if (!categoria) return;
		const ok = confirm(
			`¿Eliminar la categoría "${nombreCategoria(categoria)}"? Se borran también sus inscripciones.`
		);
		if (!ok) return;
		await eliminarCategoria(tid, cid);
		await goto(`/torneos/${tid}`, { replaceState: true });
	}

	// La edicion vive en /editar — esta pantalla solo navega hacia alla.

	// Resumen de preferencia de estructura para mostrar en la card. Si la
	// categoria no la tiene seteada devuelve null y la card no la muestra.
	// Si tiene estructura personalizada, describe cada grupo.
	const resumenEstructura = $derived.by(() => {
		if (!categoria) return null;
		const {
			tamanoPreferido,
			modalidadZona4,
			clasificanPorZona,
			cupos,
			estructuraPersonalizada
		} = categoria;
		// Modo custom: cada grupo es una linea.
		if (estructuraPersonalizada && estructuraPersonalizada.length > 0) {
			const partes = estructuraPersonalizada.map((g) => {
				const tamLabel = `Zona${g.cantidad === 1 ? '' : 's'} de ${g.tamano}`;
				const modalidadLabel =
					g.tamano === 4
						? g.modalidad === 'dobleOportunidad'
							? ' DO'
							: ' RR'
						: '';
				return `${g.cantidad} ${tamLabel}${modalidadLabel} · clasifican ${g.clasifican}`;
			});
			const cantZonas = estructuraPersonalizada.reduce(
				(s, g) => s + g.cantidad,
				0
			);
			return { partes, cantZonas, custom: true as const };
		}
		// Modo simple.
		if (!tamanoPreferido && !clasificanPorZona) return null;
		const partes: string[] = [];
		if (tamanoPreferido) {
			partes.push(`Zonas de ${tamanoPreferido}`);
		}
		if (tamanoPreferido === 4 && modalidadZona4) {
			partes.push(
				modalidadZona4 === 'todosContraTodos'
					? 'Todos contra todos'
					: 'Doble oportunidad'
			);
		}
		if (clasificanPorZona) {
			partes.push(
				`Clasifican ${clasificanPorZona} ${clasificanPorZona === 1 ? 'pareja' : 'parejas'} por zona`
			);
		}
		const cantZonas =
			cupos && tamanoPreferido ? Math.ceil(cupos / tamanoPreferido) : null;
		return { partes, cantZonas, custom: false as const };
	});

	// Texto de la sub-info de Inscripciones / Zonas.
	const inscripcionesCompletas = $derived(
		categoria?.cupos !== null &&
			categoria?.cupos !== undefined &&
			inscripciones.length >= categoria.cupos
	);
	const subInscripciones = $derived(
		inscripciones.length === 0
			? 'Sin inscripciones'
			: `${inscripciones.length} ${
					inscripciones.length === 1
						? sustantivoInscripcion(cantidad)
						: sustantivoInscripcion(cantidad) + 's'
				}`
	);

	const subZonas = $derived(
		!estaArmada
			? 'Sin armar'
			: zonas.length === 1
				? '1 zona'
				: `${zonas.length} zonas`
	);

	const subBracket = $derived.by(() => {
		if (!bracketArmado) return 'Sin armar';
		const n = categoria?.bracketConfig?.cantidadParejas ?? 0;
		return `${n} ${n === 1 ? 'pareja' : 'parejas'}`;
	});

</script>

<div class="mx-auto max-w-4xl p-4 sm:p-6">
	<a
		href={`/torneos/${tid}`}
		class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
	>
		<i class="bi bi-arrow-left"></i>
		{torneo?.nombre ?? 'Torneo'}
	</a>

	{#if cargandoCategoria}
		<div
			class="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500"
		>
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if errorCarga}
		<div class="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-400">
			{errorCarga}
		</div>
	{:else if categoria}
		<!-- Header de la categoria. Pills compactos arriba con los datos
		     clave; debajo, la preferencia de estructura si esta cargada. -->
		<section class="mt-3 mb-6 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
			<div class="p-5">
				<h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">
					{nombreCategoria(categoria)}
				</h1>

				<!-- Pills de stats compactos: cupos, tamano de equipo. -->
				<div class="mt-3 flex flex-wrap gap-2">
					<span class="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
						<i class="bi bi-people text-[11px] text-gray-500 dark:text-gray-400"></i>
						{categoria.cupos === null ? 'Sin tope' : `${categoria.cupos} cupos`}
					</span>
					<span class="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
						<i class="bi bi-person-arms-up text-[11px] text-gray-500 dark:text-gray-400"></i>
						{cantidad} por equipo
					</span>
				</div>

				<!-- Estructura preferida: solo si hay algo cargado. Sirve de
				     "spec" rapida de como va a quedar el torneo. -->
				{#if resumenEstructura}
					<div class="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/40">
						<p class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
							<i class="bi bi-rulers"></i>
							Estructura preferida
						</p>
						<ul class="space-y-0.5 text-xs text-gray-700 dark:text-gray-300">
							{#each resumenEstructura.partes as parte (parte)}
								<li class="flex items-center gap-1.5">
									<i class="bi bi-check2 text-[10px] text-emerald-600 dark:text-emerald-400"></i>
									{parte}
								</li>
							{/each}
							{#if resumenEstructura.cantZonas}
								<li class="flex items-center gap-1.5">
									<i class="bi bi-check2 text-[10px] text-emerald-600 dark:text-emerald-400"></i>
									{resumenEstructura.cantZonas}
									{resumenEstructura.cantZonas === 1 ? 'zona en total' : 'zonas en total'}
								</li>
							{/if}
						</ul>
					</div>
				{/if}
			</div>
			<!-- Tira de Inscripciones EMBEBIDA en el card de info. Mantiene el
			     look del drill-down (icono + titulo + sub + chevron) pero como
			     fila dentro del card existente, antes del footer de acciones. -->
			<a
				href={`/torneos/${tid}/categorias/${cid}/inscripciones`}
				class="flex w-full items-center gap-4 border-t border-gray-100 px-4 py-3 transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
			>
				<span
					class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
				>
					<i class="bi bi-people text-lg"></i>
				</span>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-semibold text-gray-900 dark:text-gray-100">Inscripciones</p>
					<p class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
						<span>{subInscripciones}</span>
						{#if inscripcionesCompletas}
							<span
								title="Cupo completo"
								aria-label="Cupo completo"
								class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
							>
								<i class="bi bi-check-circle-fill text-[9px]"></i>
								Completo
							</span>
						{:else if categoria.cupos !== null && inscripciones.length > 0}
							<span class="text-[10px] text-gray-400 dark:text-gray-500">
								/ {categoria.cupos}
							</span>
						{/if}
					</p>
				</div>
				<i class="bi bi-chevron-right shrink-0 text-base text-gray-300 dark:text-gray-600"></i>
			</a>
			<footer
				class="flex items-center justify-end gap-1 border-t border-gray-100 px-3 py-2 dark:border-gray-800"
			>
				<a
					href={`/torneos/${tid}/categorias/${cid}/editar`}
					title="Editar categoría"
					aria-label="Editar categoría"
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
				>
					<i class="bi bi-pencil"></i>
				</a>
				<button
					type="button"
					onclick={handleEliminarCategoria}
					title="Eliminar categoría"
					aria-label="Eliminar categoría"
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-700 dark:text-gray-400 dark:hover:bg-red-900/40 dark:hover:text-red-400"
				>
					<i class="bi bi-trash"></i>
				</button>
			</footer>
		</section>

		<!-- Drill-down de Zonas y Cuadro Final (Inscripciones ahora vive
		     dentro del card de info de arriba). -->
		<ul class="space-y-3">
			<li>
				<a
					href={`/torneos/${tid}/categorias/${cid}/zonas`}
					class="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
				>
					<span
						class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
					>
						<i class="bi bi-diagram-3 text-xl"></i>
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-base font-semibold text-gray-900 dark:text-gray-100">Zonas</p>
						<p class="text-xs text-gray-500 dark:text-gray-400">{subZonas}</p>
					</div>
					<i class="bi bi-chevron-right shrink-0 text-base text-gray-300 dark:text-gray-600"></i>
				</a>
			</li>
			<li>
				<a
					href={`/torneos/${tid}/categorias/${cid}/bracket`}
					class="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
				>
					<span
						class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
					>
						<i class="bi bi-trophy text-xl"></i>
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-base font-semibold text-gray-900 dark:text-gray-100">Fase Eliminatoria</p>
						<p class="text-xs text-gray-500 dark:text-gray-400">{subBracket}</p>
					</div>
					<i class="bi bi-chevron-right shrink-0 text-base text-gray-300 dark:text-gray-600"></i>
				</a>
			</li>
		</ul>
	{/if}
</div>

