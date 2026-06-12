<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { tema } from '$lib/stores/tema';

	// Drawer lateral izquierdo, estilo PadelRoom. Agrupa la navegacion por
	// secciones (Torneos / Jugadores). Hoy cada seccion tiene un solo item;
	// queda preparado para sumar mas (ej. Activos / Finalizados en Torneos,
	// Ranking en Jugadores, etc.).
	type ItemMenu = {
		href: string;
		label: string;
		icono: string;
		// Marca el item como activo si la ruta es igual o empieza con este
		// prefijo (incluye subrutas tipo /torneos/123/editar).
		matchPrefix?: string;
	};

	const ITEMS: ItemMenu[] = [
		{ href: '/torneos', label: 'Torneos', icono: 'bi-trophy' },
		{ href: '/jugadores', label: 'Jugadores', icono: 'bi-people' },
		{ href: '/sedes', label: 'Sedes', icono: 'bi-geo-alt' },
		{ href: '/configuracion', label: 'Configuración', icono: 'bi-sliders' }
	];

	let { open = $bindable(false) }: { open: boolean } = $props();

	function cerrar() {
		open = false;
	}

	function navegar(href: string) {
		cerrar();
		goto(href);
	}

	const rutaActual = $derived(page.url?.pathname ?? '');

	function esActiva(item: ItemMenu): boolean {
		const prefix = item.matchPrefix ?? item.href;
		return rutaActual === prefix || rutaActual.startsWith(prefix + '/');
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) cerrar();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Backdrop: sin transition para no flickear el clic. -->
{#if open}
	<div
		role="presentation"
		onclick={cerrar}
		class="fixed inset-0 z-40 bg-black/40"
	></div>
{/if}

<!-- Drawer: siempre montado, slide via transform. -->
<aside
	aria-hidden={!open}
	class="fixed top-0 left-0 z-50 flex h-full w-72 max-w-[80vw] transform flex-col bg-white shadow-xl transition-transform duration-300 ease-out dark:bg-gray-900 {open
		? 'translate-x-0'
		: '-translate-x-full'}"
>
	<!-- Header del drawer (color de marca). -->
	<div
		class="flex items-center justify-between gap-3 bg-brand-600 px-5 py-4 text-white dark:bg-brand-700"
	>
		<div class="flex items-center gap-2">
			<i class="bi bi-trophy text-lg"></i>
			<span class="font-semibold">Gestión de Torneos</span>
		</div>
		<button
			type="button"
			onclick={cerrar}
			aria-label="Cerrar menú"
			class="-mr-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
		>
			<i class="bi bi-x-lg"></i>
		</button>
	</div>

	<!-- Body con los items planos. -->
	<nav class="flex-1 overflow-y-auto py-2">
		<ul>
			{#each ITEMS as item (item.href)}
				{@const activo = esActiva(item)}
				<li>
					<button
						type="button"
						onclick={() => navegar(item.href)}
						aria-current={activo ? 'page' : undefined}
						class="flex w-full items-center gap-3 px-5 py-3 text-sm transition {activo
							? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
							: 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'}"
					>
						<i class="bi {item.icono} text-base"></i>
						<span>{item.label}</span>
					</button>
				</li>
			{/each}
		</ul>
	</nav>

	<!-- Footer: toggle de tema. -->
	<footer class="border-t border-gray-100 dark:border-gray-800">
		<button
			type="button"
			onclick={() => tema.toggle()}
			aria-label={$tema === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
			class="flex w-full items-center gap-3 px-5 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
		>
			<i
				class="bi {$tema === 'oscuro' ? 'bi-sun' : 'bi-moon-stars'} text-base"
			></i>
			<span>{$tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro'}</span>
		</button>
	</footer>
</aside>
