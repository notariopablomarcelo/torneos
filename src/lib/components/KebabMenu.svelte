<script lang="ts">
	// Menu kebab generico (tres puntos verticales). Cada item dispara una
	// accion al hacer click. Soporta items destructivos (rojo) y un icono
	// opcional por item. Cierra con click fuera o Esc (con capture para no
	// escaparse a un <dialog> ancestro y cerrar el modal por accidente).

	type Item = {
		label: string;
		icono?: string;
		onClick: () => void;
		destructive?: boolean;
	};

	type Props = {
		items: Item[];
		label?: string;
	};

	let { items, label = 'Más acciones' }: Props = $props();

	let abierto = $state(false);
	let containerRef = $state<HTMLDivElement>();

	function alternar() {
		abierto = !abierto;
	}

	function ejecutar(item: Item) {
		abierto = false;
		item.onClick();
	}

	function onWindowDown(e: MouseEvent) {
		if (containerRef && !containerRef.contains(e.target as Node)) {
			abierto = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && abierto) {
			e.preventDefault();
			e.stopPropagation();
			abierto = false;
		}
	}

	$effect(() => {
		if (abierto) {
			window.addEventListener('mousedown', onWindowDown);
			window.addEventListener('keydown', onKey, { capture: true });
			return () => {
				window.removeEventListener('mousedown', onWindowDown);
				window.removeEventListener('keydown', onKey, { capture: true });
			};
		}
	});
</script>

<div class="relative" bind:this={containerRef}>
	<button
		type="button"
		onclick={alternar}
		aria-label={label}
		aria-haspopup="menu"
		aria-expanded={abierto}
		class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
	>
		<i class="bi bi-three-dots-vertical"></i>
	</button>

	{#if abierto}
		<div
			role="menu"
			class="absolute top-full right-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
		>
			{#each items as item (item.label)}
				<button
					type="button"
					role="menuitem"
					onclick={() => ejecutar(item)}
					class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition {item.destructive
						? 'text-red-700 hover:bg-red-50'
						: 'text-gray-700 hover:bg-gray-50'}"
				>
					{#if item.icono}
						<i class="bi {item.icono} w-4"></i>
					{/if}
					{item.label}
				</button>
			{/each}
		</div>
	{/if}
</div>
