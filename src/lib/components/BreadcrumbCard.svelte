<script lang="ts">
	// Card informativo de contexto. Se usa arriba en sub-pantallas (e.g.
	// inscripciones, zonas, detalle de zona) para mostrar la jerarquia
	// torneo > categoria > zona, donde cada nivel es clickeable y lleva
	// a su pantalla. Funciona como navegacion + ubicacion.
	type Item = {
		// Etiqueta tipografica chica a la izquierda: "Torneo", "Categoría", etc.
		prefijo: string;
		// Contenido principal de la fila (nombre del torneo, categoria, etc.).
		label: string;
		// Si se pasa, la fila es link; sino, solo texto.
		href?: string;
	};

	let { items }: { items: Item[] } = $props();
</script>

<section class="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
	<ul class="divide-y divide-gray-100">
		{#each items as item, i (i)}
			<li>
				{#if item.href}
					<a href={item.href} class="block px-4 py-3 hover:bg-gray-50">
						<p class="text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
							{item.prefijo}
						</p>
						<p class="mt-0.5 truncate text-sm font-semibold text-gray-900">
							{item.label}
						</p>
					</a>
				{:else}
					<div class="px-4 py-3">
						<p class="text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
							{item.prefijo}
						</p>
						<p class="mt-0.5 truncate text-sm font-semibold text-gray-900">
							{item.label}
						</p>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</section>
