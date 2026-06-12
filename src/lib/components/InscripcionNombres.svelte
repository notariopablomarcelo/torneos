<script lang="ts">
	// Lista de nombres de los jugadores de una inscripcion, uno arriba del
	// otro. Se usa en cualquier lugar donde mostremos "la pareja" (banner,
	// listado de inscripciones, zona expandida, etc.) para mantener la
	// presentacion consistente. Para una linea unica (confirms, aria-labels)
	// seguimos usando nombreInscripcion(insc, porId) que devuelve string.

	type Props = {
		nombres: string[];
		class?: string;
		// Si true, agrega un badge de reloj al primer nombre indicando que la
		// inscripcion tiene bloqueos horarios cargados (algun jugador no
		// puede en ciertos horarios). Visual indicativo para el admin.
		tieneBloqueos?: boolean;
	};

	let {
		nombres,
		class: extraClass = '',
		tieneBloqueos = false
	}: Props = $props();
</script>

{#each nombres as n, i (i)}
	<p class="truncate text-sm text-gray-900 dark:text-gray-100 {extraClass}">
		{n}{#if tieneBloqueos && i === 0}
			<i
				class="bi bi-clock-history ml-1 text-xs text-amber-600 dark:text-amber-400"
				title="Tiene bloqueos de horarios cargados"
				aria-label="Tiene bloqueos de horarios cargados"
			></i>
		{/if}
	</p>
{/each}
