<script lang="ts">
	import { untrack } from 'svelte';
	import { jugadorInputSchema, type JugadorInput } from '$lib/types/jugador';
	import TextField from './TextField.svelte';
	import SelectField from './SelectField.svelte';

	type Props = {
		initial: JugadorInput;
		submitLabel?: string;
		onSubmit: (data: JugadorInput) => Promise<void>;
		onCancel?: () => void;
		onTest?: () => JugadorInput;
		// Opcional: si se pasa, aparece un boton "Eliminar" a la izquierda del
		// footer. El handler hace la confirmacion y la baja.
		onEliminar?: () => Promise<void>;
	};

	let {
		initial,
		submitLabel = 'Guardar',
		onSubmit,
		onCancel,
		onTest,
		onEliminar
	}: Props = $props();

	let borrando = $state(false);

	async function handleEliminarClick() {
		if (!onEliminar) return;
		borrando = true;
		try {
			await onEliminar();
		} finally {
			borrando = false;
		}
	}

	// Lista de paises conocidos. Argentina primero porque es el principal del
	// dominio. "Otros" sirve de escape para codigos no listados; el input
	// adicional aparece al lado del select.
	type PaisId = 'ar' | 'py' | 'otros';
	const PAISES: { id: PaisId; label: string; codigo: string }[] = [
		{ id: 'ar', label: '🇦🇷 AR', codigo: '54' },
		{ id: 'py', label: '🇵🇾 PY', codigo: '595' },
		{ id: 'otros', label: '🌐 Otros', codigo: '' }
	];
	const opcionesPais = PAISES.map((p) => ({ value: p.id, label: p.label }));

	// Parsea el telefono almacenado (formato libre con +CODIGO al inicio) en
	// pais + codigo + numero. Si no matchea ningun pais conocido cae a "otros".
	function parsearTelefono(t: string | null): {
		pais: PaisId;
		codigo: string;
		numero: string;
	} {
		if (!t) return { pais: 'ar', codigo: '54', numero: '' };
		const m = t.trim().match(/^\+?(\d{1,4})[\s-]*(.*)$/);
		if (!m) return { pais: 'ar', codigo: '54', numero: t.trim() };
		const codigo = m[1] ?? '';
		const numero = (m[2] ?? '').trim();
		if (codigo === '54') return { pais: 'ar', codigo: '54', numero };
		if (codigo === '595') return { pais: 'py', codigo: '595', numero };
		return { pais: 'otros', codigo, numero };
	}

	const seed = untrack(() => initial);
	const seedTel = parsearTelefono(seed.telefono);

	let nombreCompleto = $state(seed.nombreCompleto);
	let paisId = $state<PaisId>(seedTel.pais);
	let codigoCustom = $state(seedTel.pais === 'otros' ? seedTel.codigo : '');
	let numero = $state(seedTel.numero);

	const codigoEfectivo = $derived(
		paisId === 'otros' ? codigoCustom.trim() : (PAISES.find((p) => p.id === paisId)?.codigo ?? '')
	);

	let errores = $state<Record<string, string[] | undefined>>({});
	let errorGlobal = $state<string | null>(null);
	let guardando = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errores = {};
		errorGlobal = null;

		const numeroNorm = numero.trim();
		let telefonoNorm: string | null = null;
		if (numeroNorm !== '') {
			if (!codigoEfectivo) {
				errores = { telefono: ['Falta el código de país'] };
				return;
			}
			telefonoNorm = `+${codigoEfectivo} ${numeroNorm}`;
		}

		const parsed = jugadorInputSchema.safeParse({
			nombreCompleto,
			telefono: telefonoNorm
		});

		if (!parsed.success) {
			errores = parsed.error.flatten().fieldErrors;
			return;
		}

		guardando = true;
		try {
			await onSubmit(parsed.data);
		} catch (err) {
			errorGlobal = err instanceof Error ? err.message : 'Error al guardar';
		} finally {
			guardando = false;
		}
	}

	function err(campo: 'nombreCompleto' | 'telefono'): string | null {
		return errores[campo]?.[0] ?? null;
	}

	function aplicarTelefono(t: string | null) {
		const p = parsearTelefono(t);
		paisId = p.pais;
		codigoCustom = p.pais === 'otros' ? p.codigo : '';
		numero = p.numero;
	}

	function handleTest() {
		if (!onTest) return;
		const datos = onTest();
		nombreCompleto = datos.nombreCompleto;
		aplicarTelefono(datos.telefono);
		errores = {};
		errorGlobal = null;
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<TextField
		id="jug-nombre"
		label="Nombre completo"
		bind:value={nombreCompleto}
		error={err('nombreCompleto')}
	/>

	<div>
		<div class="flex gap-2">
			<SelectField
				id="jug-pais"
				label="País"
				bind:value={paisId}
				options={opcionesPais}
				class="w-32 shrink-0"
			/>
			{#if paisId === 'otros'}
				<TextField
					id="jug-cod"
					label="Código"
					bind:value={codigoCustom}
					type="text"
					inputmode="numeric"
					maxlength={4}
					class="shrink-0 w-20"
				/>
			{/if}
			<TextField
				id="jug-tel"
				label="Teléfono"
				bind:value={numero}
				type="tel"
				inputmode="numeric"
				class="flex-1 min-w-0"
				error={err('telefono')}
			/>
		</div>
	</div>

	{#if errorGlobal}
		<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
			{errorGlobal}
		</div>
	{/if}

	<!-- Footer: en mobile 2 filas full-width (acciones secundarias arriba,
	     Cancelar/Guardar abajo). En desktop una sola fila. -->
	<div class="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
		<div class="flex items-center gap-2">
			{#if onEliminar}
				<button
					type="button"
					onclick={handleEliminarClick}
					disabled={guardando || borrando}
					class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 sm:flex-none"
				>
					{#if borrando}
						<i class="bi bi-arrow-clockwise animate-spin"></i>
					{:else}
						<i class="bi bi-trash"></i>
					{/if}
					Eliminar
				</button>
			{/if}
			{#if onTest}
				<button
					type="button"
					onclick={handleTest}
					disabled={guardando || borrando}
					title="Rellenar con datos de prueba"
					class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-400 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 sm:flex-none"
				>
					<i class="bi bi-magic"></i>
					Test
				</button>
			{/if}
		</div>
		<div class="flex items-center gap-2 sm:gap-3">
			{#if onCancel}
				<button
					type="button"
					onclick={onCancel}
					disabled={guardando || borrando}
					class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 sm:flex-none"
				>
					Cancelar
				</button>
			{/if}
			<button
				type="submit"
				disabled={guardando || borrando}
				class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 sm:flex-none"
			>
				{#if guardando}
					<i class="bi bi-arrow-clockwise animate-spin"></i>
				{/if}
				{submitLabel}
			</button>
		</div>
	</div>
</form>
