<script lang="ts">
	// Lista de nombres de los jugadores de una inscripcion, uno arriba del
	// otro. Se usa en cualquier lugar donde mostremos "la pareja" (banner,
	// listado de inscripciones, zona expandida, etc.) para mantener la
	// presentacion consistente. Para una linea unica (confirms, aria-labels)
	// seguimos usando nombreInscripcion(insc, porId) que devuelve string.

	type Props = {
		nombres: string[];
		class?: string;
	};

	let { nombres, class: extraClass = '' }: Props = $props();
</script>

{#each nombres as n, i (i)}
	<p class="truncate text-sm text-gray-900 {extraClass}">{n}</p>
{/each}
