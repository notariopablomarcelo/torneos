<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';

	let { children } = $props();
	let actualizacionDisponible = $state(false);

	async function aplicarActualizacion() {
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

{@render children()}

{#if actualizacionDisponible}
	<div
		class="fixed right-4 bottom-4 left-4 flex items-center justify-between rounded-xl bg-black p-4 text-white shadow-lg sm:left-auto sm:max-w-md"
	>
		<span>Nueva versión disponible</span>
		<button
			class="rounded-lg bg-orange-500 px-4 py-2 font-medium hover:bg-orange-600"
			onclick={aplicarActualizacion}
		>
			Actualizar
		</button>
	</div>
{/if}
