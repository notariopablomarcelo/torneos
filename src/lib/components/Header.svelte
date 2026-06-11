<script lang="ts">
	// Header global con boton hamburguesa a la izquierda. El listado de
	// secciones vive en el NavDrawer; aca solo dejamos titulo + boton menu
	// para no duplicar info.
	let { onMenuClick }: { onMenuClick: () => void } = $props();
</script>

<!-- transform-gpu fuerza una capa propia en Safari iOS para que sticky +
     backdrop-blur no queden "congelados" al scrollear (bug WebKit). -->
<header
	class="sticky top-0 z-30 transform-gpu border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95"
>
	<div class="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
		<button
			type="button"
			onclick={onMenuClick}
			aria-label="Abrir menú"
			class="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
		>
			<i class="bi bi-list text-2xl"></i>
		</button>
		<div class="flex items-center gap-2">
			<i class="bi bi-trophy text-brand-500"></i>
			<span class="text-sm font-semibold text-gray-900 dark:text-gray-100">
				Gestión de Torneos
			</span>
		</div>
	</div>
</header>
