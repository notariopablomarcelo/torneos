<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import CategoriaForm from '$lib/components/CategoriaForm.svelte';
	import InscripcionForm from '$lib/components/InscripcionForm.svelte';
	import InscripcionNombres from '$lib/components/InscripcionNombres.svelte';
	import KebabMenu from '$lib/components/KebabMenu.svelte';
	import ArmadoZonasForm from '$lib/components/ArmadoZonasForm.svelte';
	import { suscribirTorneo } from '$lib/services/torneos';
	import {
		obtenerCategoria,
		actualizarCategoria,
		eliminarCategoria
	} from '$lib/services/categorias';
	import { suscribirJugadores } from '$lib/services/jugadores';
	import {
		suscribirInscripciones,
		crearInscripcion,
		actualizarInscripcion,
		eliminarInscripcion
	} from '$lib/services/inscripciones';
	import {
		agregarInscripcionAZona,
		armarZonasCategoria,
		cambiarClasificanZona,
		cambiarModalidadZona,
		desarmarZonasCategoria,
		suscribirPartidos,
		suscribirZonas
	} from '$lib/services/armado';
	import { AMBIENTE } from '$lib/firebase';
	import { generarCategoriaInput, generarInscripcionInput } from '$lib/dev/factories';
	import {
		nombreCategoria,
		obtenerCantidadJugadores,
		sustantivoInscripcion,
		type Categoria,
		type CategoriaInput,
		type Torneo
	} from '$lib/types/torneo';
	import {
		nombreInscripcion,
		nombresJugadores,
		type Inscripcion,
		type InscripcionInput
	} from '$lib/types/inscripcion';
	import type { ArmadoConfig, ModalidadZona4, ParejaRef, Partido, Zona } from '$lib/types/armado';
	import type { Jugador } from '$lib/types/jugador';

	const tid = $derived(page.params.id as string);
	const cid = $derived(page.params.cid as string);

	let torneo = $state<Torneo | null>(null);
	let categoria = $state<Categoria | null>(null);
	let inscripciones = $state<Inscripcion[]>([]);
	let jugadores = $state<Jugador[]>([]);
	let zonas = $state<Zona[]>([]);
	let partidos = $state<Partido[]>([]);
	// Flags separados para distinguir las fuentes y evitar el flicker donde
	// el banner "Faltan jugadores" se muestra antes de que jugadores cargue.
	let cargandoCategoria = $state(true);
	let cargandoJugadores = $state(true);
	let errorCarga = $state<string | null>(null);

	const cargando = $derived(cargandoCategoria || cargandoJugadores);

	let sheetNueva = $state(false);
	let editandoId = $state<string | null>(null);
	let sheetEditarCat = $state(false);
	let sheetArmado = $state(false);

	// Tab activa de la pantalla: inscripciones (default) o zonas. Si el
	// usuario cambia de categoria, reseteamos a inscripciones.
	type TabId = 'inscripciones' | 'zonas';
	let tabActiva = $state<TabId>('inscripciones');

	// Set de ids de zonas expandidas. Por default todas colapsadas — el
	// usuario abre lo que le interesa. Usamos un Set en estado reactivo y
	// re-asignamos para gatillar update.
	let zonasExpandidas = $state<Set<string>>(new Set());

	function toggleZona(zonaId: string) {
		const next = new Set(zonasExpandidas);
		if (next.has(zonaId)) next.delete(zonaId);
		else next.add(zonaId);
		zonasExpandidas = next;
	}

	// Tab activa dentro de cada zona expandida ('parejas' por default).
	type TabZona = 'parejas' | 'partidos';
	let tabsZonas = $state<Map<string, TabZona>>(new Map());

	function getTabZona(zonaId: string): TabZona {
		return tabsZonas.get(zonaId) ?? 'parejas';
	}

	function setTabZona(zonaId: string, tab: TabZona) {
		const next = new Map(tabsZonas);
		next.set(zonaId, tab);
		tabsZonas = next;
	}

	const cantidad = $derived(categoria ? obtenerCantidadJugadores(categoria) : 2);

	// Map para resolver nombres de jugadores por id sin tener que filtrar el
	// array cada vez. Se recalcula solo cuando jugadores cambia.
	const jugadoresPorId = $derived(new Map(jugadores.map((j) => [j.id, j])));

	const inscEditando = $derived(
		editandoId ? (inscripciones.find((i) => i.id === editandoId) ?? null) : null
	);

	// Suscripciones: torneo + categoria (one-shot via obtenerCategoria;
	// realtime no aporta porque la categoria solo cambia desde esta misma
	// pagina) + inscripciones (realtime) + jugadores (realtime, base global).
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
		sheetNueva = false;
		editandoId = null;
		sheetEditarCat = false;
		sheetArmado = false;
		tabActiva = 'inscripciones';

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
		};
	});

	$effect(() => {
		if (editandoId && !inscEditando) {
			editandoId = null;
		}
	});

	async function handleCrear(data: InscripcionInput) {
		await crearInscripcion(tid, cid, data);
		sheetNueva = false;
	}

	async function handleActualizar(data: InscripcionInput) {
		if (!editandoId) return;
		await actualizarInscripcion(tid, cid, editandoId, data);
		editandoId = null;
	}

	async function handleEliminar(insc: Inscripcion) {
		const nombre = nombreInscripcion(insc, jugadoresPorId);
		const ok = confirm(`¿Eliminar la ${sustantivoInscripcion(cantidad)} "${nombre}"?`);
		if (!ok) return;
		await eliminarInscripcion(tid, cid, insc.id);
	}

	async function handleEliminarCategoria() {
		if (!categoria) return;
		const ok = confirm(
			`¿Eliminar la categoría "${nombreCategoria(categoria)}"? Se borran también sus inscripciones.`
		);
		if (!ok) return;
		// Re-leemos la categoria por las dudas con su id real (el snapshot del
		// padre puede tardar) y volvemos al detalle del torneo.
		await eliminarCategoria(tid, cid);
		await goto(`/torneos/${tid}`, { replaceState: true });
	}

	async function handleActualizarCategoria(data: CategoriaInput) {
		await actualizarCategoria(tid, cid, data);
		// Refrescamos en cliente. obtenerCategoria es one-shot.
		categoria = await obtenerCategoria(tid, cid);
		sheetEditarCat = false;
	}

	// Ids ya inscriptos. Para "nueva" excluimos todos. Para "editar" excluimos
	// los de OTRAS inscripciones (los propios siguen disponibles). El
	// JugadorSelector recibe la base completa y este array como excluir, asi
	// puede resolver nombres incluso de jugadores recien inscriptos por la
	// misma operacion (evita flash rojo al cerrar el modal).
	const ocupadosGlobal = $derived(inscripciones.flatMap((i) => i.jugadores));

	const excluirNueva = $derived(ocupadosGlobal);

	const excluirEdicion = $derived.by(() => {
		if (!inscEditando) return ocupadosGlobal;
		const propios = new Set(inscEditando.jugadores);
		return ocupadosGlobal.filter((id) => !propios.has(id));
	});

	// Para el boton "Nueva" / mensaje "faltan jugadores": calculamos cuantos
	// quedan disponibles para crear una inscripcion mas.
	const cantidadDisponiblesNueva = $derived(jugadores.length - ocupadosGlobal.length);

	const rankingsExistentes = $derived(
		inscripciones.map((i) => i.ranking).filter((r): r is number => r !== null)
	);

	// Ordenamiento: inscripciones con ranking primero (asc), las sin ranking
	// al final por orden de creacion.
	const inscripcionesOrdenadas = $derived(
		[...inscripciones].sort((a, b) => {
			if (a.ranking === null && b.ranking === null) return a.creadoEn.localeCompare(b.creadoEn);
			if (a.ranking === null) return 1;
			if (b.ranking === null) return -1;
			return a.ranking - b.ranking;
		})
	);

	const initialNueva: InscripcionInput = {
		jugadores: [],
		ranking: null
	};

	const onTestNueva = $derived(
		AMBIENTE !== 'prod'
			? () => {
					const ocupados = new Set(ocupadosGlobal);
					const disponibles = jugadores.filter((j) => !ocupados.has(j.id));
					return generarInscripcionInput(disponibles, cantidad, rankingsExistentes);
				}
			: undefined
	);

	const onTestCat = AMBIENTE !== 'prod' ? generarCategoriaInput : undefined;

	// ===== Armado de zonas =====

	const armadoConfig = $derived(categoria?.armadoConfig ?? null);
	const estaArmada = $derived(armadoConfig !== null);

	// Habilitamos armar solo si hay al menos una distribucion valida. N=5 no
	// tiene una distribucion estandar con ninguna preferencia (1 zona de 5
	// no es FAP). El resto de N>=3 si.
	const armadoPosible = $derived.by(() => {
		const n = inscripciones.length;
		if (n < 3) return { ok: false as const, motivo: 'Se necesitan al menos 3 inscripciones.' };
		if (n === 5)
			return {
				ok: false as const,
				motivo: 'N=5 no tiene una distribución estándar. Sumá 1 (para 6) o sacá 2 (para 3).'
			};
		return { ok: true as const };
	});

	// Partidos agrupados por zonaId para mostrar dentro de cada zona.
	const partidosPorZona = $derived.by(() => {
		const map = new Map<string, Partido[]>();
		for (const p of partidos) {
			if (p.zonaId === null) continue;
			const lista = map.get(p.zonaId) ?? [];
			lista.push(p);
			map.set(p.zonaId, lista);
		}
		// Ordenar por numeroEnZona.
		for (const lista of map.values()) {
			lista.sort((a, b) => a.numeroEnZona - b.numeroEnZona);
		}
		return map;
	});

	const inscripcionesPorId = $derived(
		new Map(inscripciones.map((i) => [i.id, i]))
	);

	function descripcionParejaRef(ref: ParejaRef): string {
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
			default: {
				// Si en el futuro se agrega una variante (ej. 'Posicional' del
				// bracket), TS falla en compile time hasta agregar el case.
				const _exhaustivo: never = ref;
				return _exhaustivo;
			}
		}
	}

	// Refresca categoria.armadoConfig localmente despues de operaciones que
	// no son realtime (obtenerCategoria es one-shot).
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

	// Inscripciones que existen pero todavia no estan en ninguna zona armada
	// (caso tipico: la pareja se anoto despues del armado).
	const inscripcionesSinZona = $derived.by(() => {
		if (!estaArmada) return [];
		const enZonas = new Set(zonas.flatMap((z) => z.inscripcionIds));
		return inscripciones.filter((i) => !enZonas.has(i.id));
	});

	// Asignar una inscripcion a una zona: flujo de 2 pasos.
	// Paso 1: elegir zona destino (entre las que tienen tamano 3).
	// Paso 2: elegir modalidad para esa zona cuando pase a 4 (RR o DO).
	let asignandoInscripcionId = $state<string | null>(null);
	let zonaDestinoId = $state<string | null>(null);
	let modalidadDestino = $state<ModalidadZona4>('todosContraTodos');
	let aplicandoAsignacion = $state(false);

	const zonasQuePuedenRecibir = $derived(zonas.filter((z) => z.tamano === 3));
	const zonaDestino = $derived(zonas.find((z) => z.id === zonaDestinoId) ?? null);

	function abrirAsignar(inscripcionId: string) {
		asignandoInscripcionId = inscripcionId;
		zonaDestinoId = null;
		// Default a la modalidad macro de la categoria.
		modalidadDestino = armadoConfig?.modalidadZona4 ?? 'todosContraTodos';
	}

	function cerrarAsignar() {
		asignandoInscripcionId = null;
		zonaDestinoId = null;
	}

	function seleccionarZonaDestino(zonaId: string) {
		zonaDestinoId = zonaId;
		// Si la zona ya tiene modalidad propia (porque se modifico antes),
		// la respetamos; sino el default de la categoria.
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

	// Cambiar modalidad de una zona de 4. Estado del sheet separado del de
	// asignar, aunque la UI es parecida.
	let cambiandoModalidadZonaId = $state<string | null>(null);
	let nuevaModalidadParaZona = $state<ModalidadZona4>('todosContraTodos');
	let aplicandoModalidad = $state(false);

	const zonaCambiandoModalidad = $derived(
		cambiandoModalidadZonaId
			? (zonas.find((z) => z.id === cambiandoModalidadZonaId) ?? null)
			: null
	);

	function abrirCambioModalidad(zonaId: string) {
		const z = zonas.find((zz) => zz.id === zonaId);
		if (!z || z.tamano !== 4) return;
		cambiandoModalidadZonaId = zonaId;
		nuevaModalidadParaZona =
			z.modalidad === 'dobleOportunidad' ? 'dobleOportunidad' : 'todosContraTodos';
	}

	function cerrarCambioModalidad() {
		cambiandoModalidadZonaId = null;
	}

	// Cambiar clasifican de una zona. Opciones segun tamano (zona 3 = 1 o 2;
	// zona 4 = 1, 2 o 3).
	let cambiandoClasificanZonaId = $state<string | null>(null);
	let nuevoClasificanParaZona = $state<1 | 2 | 3>(2);
	let aplicandoClasifican = $state(false);

	const zonaCambiandoClasifican = $derived(
		cambiandoClasificanZonaId
			? (zonas.find((z) => z.id === cambiandoClasificanZonaId) ?? null)
			: null
	);
	const opcionesClasificanDisponibles = $derived<(1 | 2 | 3)[]>(
		zonaCambiandoClasifican?.tamano === 4 ? [1, 2, 3] : [1, 2]
	);

	function abrirCambioClasifican(zonaId: string) {
		const z = zonas.find((zz) => zz.id === zonaId);
		if (!z) return;
		cambiandoClasificanZonaId = zonaId;
		nuevoClasificanParaZona = z.clasifican;
	}

	function cerrarCambioClasifican() {
		cambiandoClasificanZonaId = null;
	}

	async function aplicarCambioClasifican() {
		if (!cambiandoClasificanZonaId) return;
		aplicandoClasifican = true;
		try {
			await cambiarClasificanZona(
				tid,
				cid,
				cambiandoClasificanZonaId,
				nuevoClasificanParaZona
			);
			cambiandoClasificanZonaId = null;
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al cambiar clasificación');
		} finally {
			aplicandoClasifican = false;
		}
	}

	async function aplicarCambioModalidad() {
		if (!cambiandoModalidadZonaId) return;
		aplicandoModalidad = true;
		try {
			await cambiarModalidadZona(tid, cid, cambiandoModalidadZonaId, nuevaModalidadParaZona);
			cambiandoModalidadZonaId = null;
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Error al cambiar la modalidad');
		} finally {
			aplicandoModalidad = false;
		}
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
			const next = new Set(zonasExpandidas);
			next.add(zonaDestinoId);
			zonasExpandidas = next;
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
	<a
		href={`/torneos/${tid}`}
		class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
	>
		<i class="bi bi-arrow-left"></i>
		{torneo?.nombre ?? 'Torneo'}
	</a>

	{#if cargando}
		<div class="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400">
			<i class="bi bi-arrow-clockwise animate-spin text-3xl"></i>
		</div>
	{:else if errorCarga}
		<div class="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
			{errorCarga}
		</div>
	{:else if categoria}
		<section class="mt-3 mb-6 rounded-xl border border-gray-200 bg-white shadow-sm">
			<div class="p-5">
				<h1 class="text-xl font-bold text-gray-900">{nombreCategoria(categoria)}</h1>
				<dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
					<dt class="text-gray-500">Por equipo</dt>
					<dd class="font-medium text-gray-900">
						{cantidad}
						{cantidad === 1 ? 'jugador' : 'jugadores'}
					</dd>
					<dt class="text-gray-500">Cupos</dt>
					<dd class="font-medium text-gray-900">
						{categoria.cupos === null ? 'Sin tope' : categoria.cupos}
					</dd>
				</dl>
			</div>
			<footer class="flex items-center justify-end gap-1 border-t border-gray-100 px-3 py-2">
				<button
					type="button"
					onclick={() => (sheetEditarCat = true)}
					title="Editar categoría"
					aria-label="Editar categoría"
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
				>
					<i class="bi bi-pencil"></i>
				</button>
				<button
					type="button"
					onclick={handleEliminarCategoria}
					title="Eliminar categoría"
					aria-label="Eliminar categoría"
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-700"
				>
					<i class="bi bi-trash"></i>
				</button>
			</footer>
		</section>

		<!-- Tabs estilo segmented control. La activa sale en blanco con sombra
		     sutil; la inactiva queda transparente con texto gris. Mobile-first. -->
		<div class="mb-4 flex w-full items-center gap-1 rounded-xl bg-gray-100 p-1">
			<button
				type="button"
				role="tab"
				aria-selected={tabActiva === 'inscripciones'}
				onclick={() => (tabActiva = 'inscripciones')}
				class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition {tabActiva ===
				'inscripciones'
					? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5'
					: 'bg-transparent font-medium text-gray-500 hover:text-gray-700'}"
			>
				<i class="bi bi-people text-base"></i>
				<span>Inscripciones</span>
				<span
					class="ml-0.5 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold {tabActiva ===
					'inscripciones'
						? 'bg-brand-50 text-brand-600'
						: 'bg-gray-200 text-gray-600'}"
				>
					{inscripciones.length}
				</span>
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={tabActiva === 'zonas'}
				onclick={() => (tabActiva = 'zonas')}
				class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition {tabActiva ===
				'zonas'
					? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5'
					: 'bg-transparent font-medium text-gray-500 hover:text-gray-700'}"
			>
				<i class="bi bi-diagram-3 text-base"></i>
				<span>Zonas</span>
				<span
					class="ml-0.5 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold {tabActiva ===
					'zonas'
						? 'bg-brand-50 text-brand-600'
						: 'bg-gray-200 text-gray-600'}"
				>
					{zonas.length}
				</span>
			</button>
		</div>

		{#if tabActiva === 'inscripciones'}
		<section class="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900">Inscripciones</h2>
				<button
					type="button"
					onclick={() => (sheetNueva = true)}
					disabled={cantidadDisponiblesNueva < cantidad}
					class="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<i class="bi bi-plus-lg"></i>
					Nueva {sustantivoInscripcion(cantidad)}
				</button>
			</div>

			{#if jugadores.length < cantidad}
				<div
					class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
				>
					<i class="bi bi-info-circle"></i>
					Faltan jugadores en la base. Cargá al menos {cantidad} desde
					<a href="/jugadores" class="font-medium underline">Jugadores</a> antes de inscribir.
				</div>
			{:else if cantidadDisponiblesNueva < cantidad}
				<div
					class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
				>
					<i class="bi bi-info-circle"></i>
					Todos los jugadores de la base ya están inscriptos en esta categoría.
				</div>
			{/if}

			{#if inscripciones.length === 0}
				<p class="py-8 text-center text-sm text-gray-500">
					Todavía no hay inscripciones.
				</p>
			{:else}
				<ul class="divide-y-2 divide-gray-200">
					{#each inscripcionesOrdenadas as i (i.id)}
						<li class="flex items-start justify-between gap-3 py-3">
							<div class="flex min-w-0 flex-1 items-start gap-3">
								<span
									title={i.ranking === null ? 'Sin ranking' : `Ranking ${i.ranking}`}
									class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold {i.ranking ===
									null
										? 'bg-gray-50 text-gray-400'
										: 'bg-gray-100 text-gray-700'}"
								>
									{i.ranking ?? '–'}
								</span>
								<div class="min-w-0 flex-1">
									<InscripcionNombres nombres={nombresJugadores(i, jugadoresPorId)} />
								</div>
							</div>
							<div class="flex shrink-0 items-center gap-1">
								<button
									type="button"
									onclick={() => (editandoId = i.id)}
									class="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
									aria-label="Editar {nombreInscripcion(i, jugadoresPorId)}"
								>
									<i class="bi bi-pencil"></i>
								</button>
								<button
									type="button"
									onclick={() => handleEliminar(i)}
									class="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700"
									aria-label="Eliminar {nombreInscripcion(i, jugadoresPorId)}"
								>
									<i class="bi bi-trash"></i>
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
		{:else if tabActiva === 'zonas'}
		<!-- Seccion zonas: armado del cuadro. Solo se muestra si hay al menos
		     3 inscripciones para tener una zona armable. -->
		<section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900">Zonas</h2>
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
			</div>

			{#if !estaArmada}
				<p class="py-8 text-center text-sm text-gray-500">
					{#if !armadoPosible.ok}
						{armadoPosible.motivo}
					{:else}
						Listo para armar. Apretá <strong>Armar zonas</strong> para elegir el formato.
					{/if}
				</p>
			{:else}
				<!-- Banner de inscripciones nuevas (sin zona asignada). Aparece
				     cuando alguien se inscribio despues del armado y necesita
				     incorporarse a una zona. -->
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

				<!-- Resumen de la config usada en el armado. -->
				{#if armadoConfig}
					<div class="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
						<p
							class="mb-2 text-[10px] font-semibold tracking-wider text-gray-500 uppercase"
						>
							Configuración del armado
						</p>
						<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
							<dt class="text-gray-500">Algoritmo</dt>
							<dd class="font-medium text-gray-900">
								{armadoConfig.algoritmo === 'snake' ? 'snake / serpentina' : 'random'}
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
					</div>
				{/if}

				<ul class="space-y-3">
					{#each zonas as z (z.id)}
						{@const partidosZ = partidosPorZona.get(z.id) ?? []}
						{@const expandida = zonasExpandidas.has(z.id)}
						<li class="overflow-hidden rounded-xl border border-gray-200 bg-white">
							<!-- Header clickeable para expandir/colapsar la zona. -->
							<button
								type="button"
								onclick={() => toggleZona(z.id)}
								aria-expanded={expandida}
								aria-label={`Zona ${z.letra}`}
								class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
							>
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
								<i
									class="bi bi-chevron-down text-gray-400 transition-transform {expandida
										? 'rotate-180'
										: ''}"
								></i>
							</button>

							{#if expandida}
								{@const tabZ = getTabZona(z.id)}
								<div class="space-y-4 border-t border-gray-100 p-4">
									<!-- Tabs Parejas / Partidos dentro de la zona. -->
									<div class="flex w-full items-center gap-1 rounded-xl bg-gray-100 p-1">
										<button
											type="button"
											role="tab"
											aria-selected={tabZ === 'parejas'}
											onclick={() => setTabZona(z.id, 'parejas')}
											class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs transition {tabZ ===
											'parejas'
												? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5'
												: 'bg-transparent font-medium text-gray-500 hover:text-gray-700'}"
										>
											<i class="bi bi-people"></i>
											<span>Parejas</span>
											<span
												class="inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold {tabZ ===
												'parejas'
													? 'bg-brand-50 text-brand-600'
													: 'bg-gray-200 text-gray-600'}"
											>
												{z.inscripcionIds.length}
											</span>
										</button>
										<button
											type="button"
											role="tab"
											aria-selected={tabZ === 'partidos'}
											onclick={() => setTabZona(z.id, 'partidos')}
											class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs transition {tabZ ===
											'partidos'
												? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-black/5'
												: 'bg-transparent font-medium text-gray-500 hover:text-gray-700'}"
										>
											<i class="bi bi-trophy"></i>
											<span>Partidos</span>
											<span
												class="inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold {tabZ ===
												'partidos'
													? 'bg-brand-50 text-brand-600'
													: 'bg-gray-200 text-gray-600'}"
											>
												{partidosZ.length}
											</span>
										</button>
									</div>

									{#if tabZ === 'parejas'}
									<!-- Parejas: cada una en su mini-card con posicion + nombres
									     apilados + ranking global. -->
									<div>
										<ul class="space-y-2">
											{#each z.inscripcionIds as inscId, idx (inscId)}
												{@const insc = inscripcionesPorId.get(inscId)}
												<li
													class="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
												>
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
													<span
														class="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200"
														title={insc?.ranking == null
															? 'Sin ranking'
															: `Ranking ${insc.ranking}`}
													>
														#{insc?.ranking ?? '–'}
													</span>
												</li>
											{/each}
										</ul>
									</div>
									{:else}
									<!-- Partidos en formato vertical: pareja1 / vs / pareja2. -->
									{#if partidosZ.length > 0}
										<ul class="space-y-2">
											{#each partidosZ as p (p.id)}
												<li class="rounded-lg border border-gray-100 bg-white p-3">
													<p
														class="mb-2 text-xs font-semibold tracking-wide text-brand-700"
													>
														P{p.numeroEnZona}
													</p>
													<p class="truncate text-sm font-medium text-gray-900">
														{descripcionParejaRef(p.pareja1Ref)}
													</p>
													<p
														class="my-1 text-center text-xs font-medium text-gray-400"
													>
														vs
													</p>
													<p class="truncate text-sm font-medium text-gray-900">
														{descripcionParejaRef(p.pareja2Ref)}
													</p>
												</li>
											{/each}
										</ul>
									{:else}
										<p class="py-6 text-center text-xs text-gray-500">Sin partidos.</p>
									{/if}
									{/if}

									<!-- Acciones de configuracion de la zona. Modalidad solo aplica
									     a zonas de 4; clasifican a ambas. -->
									<div class="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-2 text-xs">
										{#if z.tamano === 4}
											<div class="flex items-center justify-between px-1">
												<span class="text-gray-600">
													Modalidad:
													<strong class="text-gray-900"
														>{z.modalidad === 'dobleOportunidad'
															? 'doble oportunidad'
															: 'todos contra todos'}</strong
													>
												</span>
												<button
													type="button"
													onclick={() => abrirCambioModalidad(z.id)}
													class="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-brand-700 hover:bg-brand-100"
												>
													<i class="bi bi-pencil"></i>
													Cambiar
												</button>
											</div>
										{/if}
										<div class="flex items-center justify-between px-1">
											<span class="text-gray-600">
												Clasifican:
												<strong class="text-gray-900">{z.clasifican} por zona</strong>
											</span>
											<button
												type="button"
												onclick={() => abrirCambioClasifican(z.id)}
												class="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-brand-700 hover:bg-brand-100"
											>
												<i class="bi bi-pencil"></i>
												Cambiar
											</button>
										</div>
									</div>

								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
		{/if}
	{/if}
</div>

<BottomSheet
	open={sheetNueva}
	onClose={() => (sheetNueva = false)}
	title={`Nueva ${sustantivoInscripcion(cantidad)}`}
>
	<InscripcionForm
		initial={initialNueva}
		cantidadJugadores={cantidad}
		{jugadores}
		excluirGlobal={excluirNueva}
		submitLabel="Crear"
		onSubmit={handleCrear}
		onCancel={() => (sheetNueva = false)}
		onTest={onTestNueva}
	/>
</BottomSheet>

<BottomSheet
	open={editandoId !== null && inscEditando !== null}
	onClose={() => (editandoId = null)}
	title={`Editar ${sustantivoInscripcion(cantidad)}`}
>
	{#if inscEditando}
		{#key editandoId}
			<InscripcionForm
				initial={{
					jugadores: inscEditando.jugadores,
					ranking: inscEditando.ranking
				}}
				cantidadJugadores={cantidad}
				{jugadores}
				excluirGlobal={excluirEdicion}
				submitLabel="Guardar cambios"
				onSubmit={handleActualizar}
				onCancel={() => (editandoId = null)}
			/>
		{/key}
	{/if}
</BottomSheet>

<!-- Sheet para cambiar cuantos clasifican en una zona. -->
<BottomSheet
	open={cambiandoClasificanZonaId !== null}
	onClose={cerrarCambioClasifican}
	title={zonaCambiandoClasifican
		? `Clasifican Zona ${zonaCambiandoClasifican.letra}`
		: 'Clasifican'}
>
	{#if zonaCambiandoClasifican}
		<p class="mb-3 text-sm text-gray-600">
			Cuántas parejas de la Zona {zonaCambiandoClasifican.letra} pasan al bracket eliminatorio.
		</p>

		<div class="space-y-2">
			{#each opcionesClasificanDisponibles as n (n)}
				<button
					type="button"
					onclick={() => (nuevoClasificanParaZona = n)}
					aria-pressed={nuevoClasificanParaZona === n}
					class="block w-full rounded-lg border p-3 text-left transition {nuevoClasificanParaZona ===
					n
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
						: 'border-gray-200 bg-white hover:border-gray-300'}"
				>
					<div class="flex items-start gap-2">
						<i
							class="bi {nuevoClasificanParaZona === n ? 'bi-check-circle-fill text-brand-500' : 'bi-circle text-gray-300'} mt-0.5"
						></i>
						<div>
							<p class="font-medium text-gray-900">
								{n} por zona
								{#if n === 2}<span class="text-xs font-normal text-gray-500">(FAP)</span>{/if}
							</p>
							<p class="mt-0.5 text-xs text-gray-600">
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
				onclick={cerrarCambioClasifican}
				disabled={aplicandoClasifican}
				class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
			>
				Cancelar
			</button>
			<button
				type="button"
				onclick={aplicarCambioClasifican}
				disabled={aplicandoClasifican ||
					nuevoClasificanParaZona === zonaCambiandoClasifican.clasifican}
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

<!-- Sheet para cambiar la modalidad de una zona de 4. -->
<BottomSheet
	open={cambiandoModalidadZonaId !== null}
	onClose={cerrarCambioModalidad}
	title={zonaCambiandoModalidad ? `Modalidad Zona ${zonaCambiandoModalidad.letra}` : 'Modalidad'}
>
	{#if zonaCambiandoModalidad}
		<p class="mb-3 text-sm text-gray-600">
			La zona tiene 4 parejas. Elegí la modalidad de los partidos.
		</p>

		<div class="space-y-2">
			<button
				type="button"
				onclick={() => (nuevaModalidadParaZona = 'todosContraTodos')}
				aria-pressed={nuevaModalidadParaZona === 'todosContraTodos'}
				class="block w-full rounded-lg border p-3 text-left transition {nuevaModalidadParaZona ===
				'todosContraTodos'
					? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
					: 'border-gray-200 bg-white hover:border-gray-300'}"
			>
				<div class="flex items-start gap-2">
					<i
						class="bi {nuevaModalidadParaZona === 'todosContraTodos' ? 'bi-check-circle-fill text-brand-500' : 'bi-circle text-gray-300'} mt-0.5"
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
				onclick={() => (nuevaModalidadParaZona = 'dobleOportunidad')}
				aria-pressed={nuevaModalidadParaZona === 'dobleOportunidad'}
				class="block w-full rounded-lg border p-3 text-left transition {nuevaModalidadParaZona ===
				'dobleOportunidad'
					? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
					: 'border-gray-200 bg-white hover:border-gray-300'}"
			>
				<div class="flex items-start gap-2">
					<i
						class="bi {nuevaModalidadParaZona === 'dobleOportunidad' ? 'bi-check-circle-fill text-brand-500' : 'bi-circle text-gray-300'} mt-0.5"
					></i>
					<div>
						<p class="font-medium text-gray-900">Doble oportunidad</p>
						<p class="mt-0.5 text-xs text-gray-600">
							4 partidos. Cruces 1v4 y 2v3, después ganadores entre sí y perdedores tienen segunda chance.
						</p>
					</div>
				</div>
			</button>
		</div>

		{#if nuevaModalidadParaZona !== zonaCambiandoModalidad.modalidad}
			<p class="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
				<i class="bi bi-info-circle mt-0.5"></i>
				<span>
					Algunos partidos se regeneran. Los pares que existen en ambas modalidades se conservan con sus resultados; el resto se borra.
				</span>
			</p>
		{/if}

		<div class="mt-5 flex items-center justify-end gap-3">
			<button
				type="button"
				onclick={cerrarCambioModalidad}
				disabled={aplicandoModalidad}
				class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
			>
				Cancelar
			</button>
			<button
				type="button"
				onclick={aplicarCambioModalidad}
				disabled={aplicandoModalidad ||
					nuevaModalidadParaZona === zonaCambiandoModalidad.modalidad}
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

<!-- Sheet para asignar una inscripcion a una zona. 2 pasos: elegir zona
     (entre las que tienen tamano 3) y elegir la modalidad para esa zona
     cuando pase a 4 (RR o DO). -->
<BottomSheet
	open={asignandoInscripcionId !== null}
	onClose={cerrarAsignar}
	title={zonaDestinoId ? `Modalidad para Zona ${zonaDestino?.letra ?? ''}` : 'Elegir zona'}
>
	{#if asignandoInscripcionId}
		{@const insc = inscripcionesPorId.get(asignandoInscripcionId)}

		{#if !zonaDestinoId}
			<!-- Paso 1: elegir zona destino -->
			{#if insc}
				<p class="mb-3 text-sm text-gray-600">
					Asignar a <strong>{nombreInscripcion(insc, jugadoresPorId)}</strong>:
				</p>
			{/if}
			{#if zonasQuePuedenRecibir.length === 0}
				<p class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
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
								<span class="text-gray-500"> · {z.inscripcionIds.length} → {z.inscripcionIds.length + 1} parejas</span>
							</p>
							<i class="bi bi-arrow-right text-brand-500"></i>
						</button>
					{/each}
				</ul>
			{/if}
		{:else}
			<!-- Paso 2: elegir modalidad para la zona destino -->
			<p class="mb-3 text-sm text-gray-600">
				La <strong>Zona {zonaDestino?.letra}</strong> pasará de 3 a 4 parejas. ¿Qué modalidad querés para esta zona?
			</p>

			<div class="space-y-2">
				<button
					type="button"
					onclick={() => (modalidadDestino = 'todosContraTodos')}
					aria-pressed={modalidadDestino === 'todosContraTodos'}
					class="block w-full rounded-lg border p-3 text-left transition {modalidadDestino === 'todosContraTodos'
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
						: 'border-gray-200 bg-white hover:border-gray-300'}"
				>
					<div class="flex items-start gap-2">
						<i
							class="bi {modalidadDestino === 'todosContraTodos' ? 'bi-check-circle-fill text-brand-500' : 'bi-circle text-gray-300'} mt-0.5"
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
					class="block w-full rounded-lg border p-3 text-left transition {modalidadDestino === 'dobleOportunidad'
						? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
						: 'border-gray-200 bg-white hover:border-gray-300'}"
				>
					<div class="flex items-start gap-2">
						<i
							class="bi {modalidadDestino === 'dobleOportunidad' ? 'bi-check-circle-fill text-brand-500' : 'bi-circle text-gray-300'} mt-0.5"
						></i>
						<div>
							<p class="font-medium text-gray-900">Doble oportunidad</p>
							<p class="mt-0.5 text-xs text-gray-600">
								4 partidos. Cruces 1v4 y 2v3, después ganadores entre sí y perdedores tienen segunda chance.
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

<BottomSheet
	open={sheetEditarCat && categoria !== null}
	onClose={() => (sheetEditarCat = false)}
	title="Editar categoría"
>
	{#if categoria}
		<CategoriaForm
			initial={{
				nivel: categoria.nivel,
				genero: categoria.genero,
				cupos: categoria.cupos,
				cantidadJugadores: obtenerCantidadJugadores(categoria)
			}}
			submitLabel="Guardar cambios"
			onSubmit={handleActualizarCategoria}
			onCancel={() => (sheetEditarCat = false)}
			onTest={onTestCat}
		/>
	{/if}
</BottomSheet>
