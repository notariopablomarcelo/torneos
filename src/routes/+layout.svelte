<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';

	// El polyfill detecta si el browser necesita la font de banderas (Windows
	// + Chrome desktop la necesitan; mobile y Mac no). Si hace falta, carga
	// la font "Twemoji Country Flags" via CDN. Solo en cliente.
	polyfillCountryFlagEmojis();

	let { children } = $props();
	let actualizacionDisponible = $state(false);

	// Las tabs se activan por prefijo de ruta: /torneos, /torneos/xyz/editar
	// y /torneos/nuevo activan "Torneos". Lo mismo para /jugadores. La home
	// "/" no matchea ninguna porque hace redirect a /torneos.
	const path = $derived(page.url?.pathname ?? '');
	function esActiva(prefix: string): boolean {
		return path === prefix || path.startsWith(prefix + '/');
	}

	const TABS = [
		{ href: '/torneos', label: 'Torneos', icono: 'bi-trophy' },
		{ href: '/jugadores', label: 'Jugadores', icono: 'bi-people' }
	];

	async function aplicarActualizacion() {
		if (!('serviceWorker' in navigator)) {
			window.location.reload();
			return;
		}
		const reg = await navigator.serviceWorker.getRegistration();
		if (reg?.waiting) {
			reg.waiting.postMessage({ type: 'SKIP_WAITING' });
		} else {
			window.location.reload();
		}
	}

	onMount(() => {
		const onUpdate = () => (actualizacionDisponible = true);
		window.addEventListener('app-actualizacion-disponible', onUpdate);

		// Failsafe iOS: si la app vuelve del background tras más de 30s,
		// recargar para tomar versión nueva. Excepción si hay operación
		// crítica en curso (flag en sessionStorage).
		let ocultadoEn: number | null = null;
		const onVisibility = () => {
			if (document.hidden) {
				ocultadoEn = Date.now();
			} else if (ocultadoEn && Date.now() - ocultadoEn > 30_000) {
				if (!sessionStorage.getItem('torneos_op_activa')) {
					window.location.reload();
				}
			}
		};
		document.addEventListener('visibilitychange', onVisibility);

		return () => {
			window.removeEventListener('app-actualizacion-disponible', onUpdate);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<!-- transform-gpu fuerza una capa propia en Safari iOS. Sin esto, sticky +
     backdrop-blur quedan "congelados" al scrollear (bug conocido del WebKit). -->
<nav
	class="sticky top-0 z-10 transform-gpu border-b border-gray-200 bg-white/95 backdrop-blur"
>
	<div class="mx-auto max-w-4xl px-4 sm:px-6">
		<div class="flex items-end justify-between gap-4">
			<div class="flex items-center gap-2 pt-3">
				<i class="bi bi-trophy text-brand-500"></i>
				<span class="text-sm font-semibold text-gray-900">Torneos de Pádel</span>
			</div>
			<ul class="flex gap-1">
				{#each TABS as t (t.href)}
					<li>
						<a
							href={t.href}
							aria-current={esActiva(t.href) ? 'page' : undefined}
							class="inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium {esActiva(
								t.href
							)
								? 'border-brand-500 text-brand-700'
								: 'border-transparent text-gray-500 hover:text-gray-900'}"
						>
							<i class="bi {t.icono}"></i>
							{t.label}
						</a>
					</li>
				{/each}
			</ul>
		</div>
	</div>
</nav>

{@render children()}

{#if actualizacionDisponible}
	<div
		class="fixed right-4 bottom-4 left-4 flex items-center justify-between rounded-xl bg-black p-4 text-white shadow-lg sm:left-auto sm:max-w-md"
	>
		<span>Nueva versión disponible</span>
		<button
			class="rounded-lg bg-brand-500 px-4 py-2 font-medium hover:bg-brand-600"
			onclick={aplicarActualizacion}
		>
			Actualizar
		</button>
	</div>
{/if}
