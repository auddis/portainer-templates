<script lang="ts">
  import { lazyLoad } from '$lib/lazy-load';
  import Icon from '$lib/Icon.svelte';

  let { src, name, size = 64 }: { src?: string; name: string; size?: number } = $props();
  // track which src failed, so switching to a new logo clears the broken state on its own
  let failedSrc = $state<string | undefined>(undefined);
  const broken = $derived(!!src && src === failedSrc);
</script>

{#if src && !broken}
  <img class="loading" style:width="{size}px" style:height="{size}px" use:lazyLoad={src} alt={name} onerror={() => (failedSrc = src)} />
{:else}
  <span class="logo-fallback" style:width="{size}px" style:height="{size}px" title="Logo unavailable">
    <Icon name="whale" width="{size * 0.6}px" height="{size * 0.6}px" color="rgba(255, 255, 255, 0.1)" hoverColor="rgba(255, 255, 255, 0.25)" />
  </span>
{/if}

<style lang="scss">
  img {
    width: 64px;
    height: 64px;
    border-radius: 6px;
    object-fit: contain;
    overflow: hidden;
    color: var(--card);
    &.loading {
      background: linear-gradient(90deg, var(--card-2) 25%, rgba(255, 255, 255, 0.06) 37%, var(--card-2) 63%);
      background-size: 400% 100%;
      animation: logo-skeleton 1.4s ease infinite;
      font-size: 1rem;
      text-align: center;
      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    }
  }
  .logo-fallback {
    width: 64px;
    height: 64px;
    border-radius: 6px;
    background: var(--card-2);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  @keyframes logo-skeleton {
    0% { background-position: 100% 50%; }
    100% { background-position: 0 50%; }
  }
</style>
