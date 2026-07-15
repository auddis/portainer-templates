<script lang="ts">
  import Button from '$lib/Button.svelte';

  let { url, label = 'Copy Templates' }: { url: string; label?: string } = $props();
  let copied = $state(false);

  const copy = () => {
    navigator.clipboard?.writeText(url);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  };
</script>

<Button action={copy} size="small" title={url}>{copied ? 'Copied' : label}</Button>
