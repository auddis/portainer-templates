<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import type { DeployMode } from '$src/Types';

  let { modes }: { modes: DeployMode[] } = $props();

  const LABEL: Record<number, string> = { 1: 'Container', 2: 'Swarm', 3: 'Stack', 4: 'Edge' };
  const ICON: Record<number, string> = { 1: 'container', 2: 'swarm', 3: 'stack', 4: 'stack' };
  const HINT: Record<number, string> = {
    1: 'Single Docker container',
    2: 'Docker Swarm stack',
    3: 'Docker Compose stack',
    4: 'Compose edge stack',
  };
</script>

{#snippet body(type: number)}
  <Icon name={ICON[type] ?? 'stack'} width="1em" height="1em" />
  {LABEL[type] ?? 'App'}
{/snippet}

{#if modes.length > 1}
  <nav class="deploy-modes" aria-label="Deployment method">
    {#each modes as mode (mode.slug)}
      {#if mode.current}
        <span class="mode current" aria-current="page" title={HINT[mode.type]}>{@render body(mode.type)}</span>
      {:else}
        <a class="mode" href="/{mode.slug}" title="View the {LABEL[mode.type]} version">{@render body(mode.type)}</a>
      {/if}
    {/each}
  </nav>
{:else if modes.length === 1}
  <p class="deploy-tag" title={HINT[modes[0].type]}>{@render body(modes[0].type)}</p>
{/if}

<style lang="scss">
  .deploy-modes,
  .deploy-tag {
    flex-shrink: 0;
    align-self: flex-start;
    font-size: 0.85rem;
    border-radius: 6px;
  }

  .deploy-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    margin: 0;
    padding: 0.35rem 0.75rem;
    background: var(--card-2);
    color: var(--foreground);
    opacity: 0.8;
  }

  .deploy-modes {
    display: inline-flex;
    overflow: hidden;
    border: 1px solid var(--card-2);
    .mode {
      display: inline-flex;
      align-items: center;
      gap: 0.4em;
      padding: 0.35rem 0.75rem;
      color: var(--foreground);
      text-decoration: none;
      line-height: 1.4;
      background: var(--card-2);
      transition: background 0.15s ease, color 0.15s ease;
      &:not(:last-child) {
        border-right: 1px solid var(--card-2);
      }
      &:not(.current):hover {
        color: var(--accent);
      }
      &:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
      }
      &.current {
        background: var(--accent);
        color: var(--background);
        font-weight: 500;
        cursor: default;
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .deploy-modes .mode {
      transition: none;
    }
  }
</style>
