<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, open = $bindable(false), children }: {
    title: string;
    open?: boolean;
    children: Snippet;
  } = $props();

  const panelId = $props.id();
</script>

<section class="collapsible">
  <h2>
    <button type="button" aria-expanded={open} aria-controls={panelId} onclick={() => (open = !open)}>
      {title}
      <span class="chevron" aria-hidden="true"></span>
    </button>
  </h2>
  <div id={panelId} class="panel" class:open inert={!open}>
    <div class="panel-inner">{@render children()}</div>
  </div>
</section>

<style lang="scss">
  .collapsible {
    max-width: 1000px;
    margin: 1rem auto;
    padding: 0 1rem;
    background: var(--card);
    border-radius: 6px;
    overflow: hidden;
    h2 {
      margin: 0;
      font-size: 2rem;
    }
    h2 button {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 0;
      background: none;
      border: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: color 0.2s ease;
      &:hover {
        color: var(--accent);
      }
      &:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
      }
    }
    .chevron {
      flex-shrink: 0;
      width: 0.6rem;
      height: 0.6rem;
      border-right: 2px solid var(--accent);
      border-bottom: 2px solid var(--accent);
      transform: rotate(45deg);
      transition: transform 0.25s ease;
    }
    h2 button[aria-expanded='true'] .chevron {
      transform: rotate(-135deg);
    }
    .panel {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows 0.25s ease;
      &.open {
        grid-template-rows: 1fr;
      }
    }
    .panel-inner {
      overflow: hidden;
      padding-bottom: 1rem;
    }
    @media (prefers-reduced-motion: reduce) {
      .panel, .chevron, h2 button {
        transition: none;
      }
    }
  }
</style>
