<script lang="ts">
  import { tick } from 'svelte';
  import Logo from '$lib/Logo.svelte';
  import type { AppOption } from './config';

  let { apps, loading = false, onopen, onselect, focusOnMount = false }: {
    apps: AppOption[];
    loading?: boolean;
    onopen?: () => void;
    onselect: (app: AppOption) => void;
    focusOnMount?: boolean;
  } = $props();

  const id = $props.id();
  const MAX = 40;

  let query = $state('');
  let open = $state(false);
  let active = $state(0);
  let selected = $state<AppOption | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (focusOnMount) inputEl?.focus();
  });

  const results = $derived.by(() => {
    const q = query.trim().toLowerCase();
    // after picking, show the full list again so switching apps is easy
    if (!q || query === selected?.title) return apps.slice(0, MAX);
    const rank = (title: string) => {
      const t = title.toLowerCase();
      return t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 3;
    };
    return apps
      .map((app) => ({ app, rank: rank(app.title) }))
      .filter((r) => r.rank < 3)
      .sort((a, b) => a.rank - b.rank || a.app.title.localeCompare(b.app.title))
      .slice(0, MAX)
      .map((r) => r.app);
  });
  const activeIdx = $derived(Math.min(active, results.length - 1));

  const show = () => {
    onopen?.();
    open = true;
  };
  const close = () => {
    open = false;
    active = 0;
  };
  const choose = (app: AppOption) => {
    selected = app;
    query = app.title;
    close();
    onselect(app);
  };
  const move = async (delta: number) => {
    active = Math.max(0, Math.min(results.length - 1, activeIdx + delta));
    await tick();
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  };

  const onkeydown = (event: KeyboardEvent) => {
    if (!open && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      show();
      event.preventDefault();
      return;
    }
    if (!open) return;
    if (event.key === 'ArrowDown') { move(1); event.preventDefault(); }
    else if (event.key === 'ArrowUp') { move(-1); event.preventDefault(); }
    else if (event.key === 'Home') { move(-results.length); event.preventDefault(); }
    else if (event.key === 'End') { move(results.length); event.preventDefault(); }
    else if (event.key === 'Enter') {
      if (results[activeIdx]) choose(results[activeIdx]);
      event.preventDefault();
    }
    else if (['Escape', 'Tab'].includes(event.key)) close();
  };
</script>

<div class="app-picker" onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) close(); }}>
  <label for="{id}-input">App</label>
  <input
    bind:this={inputEl}
    id="{id}-input"
    type="text"
    role="combobox"
    aria-expanded={open}
    aria-controls="{id}-list"
    aria-autocomplete="list"
    aria-activedescendant={open && results.length ? `${id}-opt-${activeIdx}` : undefined}
    placeholder="Search for an app..."
    autocomplete="off"
    spellcheck="false"
    bind:value={query}
    onfocus={(e) => { show(); e.currentTarget.select(); }}
    onclick={show}
    oninput={() => { show(); active = 0; }}
    {onkeydown}
  />
  <ul id="{id}-list" role="listbox" aria-label="Apps" hidden={!open}>
    {#if loading && !apps.length}
      <li class="empty" role="presentation">Loading apps&hellip;</li>
    {:else if !results.length}
      <li class="empty" role="presentation">No apps match "{query}"</li>
    {/if}
    {#each results as app, i (app.slug)}
      <li
        id="{id}-opt-{i}"
        role="option"
        tabindex="-1"
        aria-selected={selected?.slug === app.slug}
        class:active={i === activeIdx}
        onmousedown={(e) => e.preventDefault()}
        onclick={() => choose(app)}
        onkeydown={(e) => e.key === 'Enter' && choose(app)}
        onpointermove={() => (active = i)}
      >
        <Logo src={app.logo} name="" size={24} />
        <span>{app.title}</span>
      </li>
    {/each}
    {#if !loading && results.length === MAX}
      <li class="empty" role="presentation">Keep typing to narrow down {apps.length} apps</li>
    {/if}
  </ul>
</div>

<style lang="scss">
  .app-picker {
    position: relative;
    max-width: 28rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    label {
      font-size: 0.7rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      opacity: 0.6;
    }
    input {
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      border: 1px solid var(--card-2);
      background: var(--background);
      color: var(--foreground);
      font: inherit;
      font-size: 1rem;
      &:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -1px;
      }
    }
    ul {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      z-index: 5;
      margin: 0.25rem 0 0;
      padding: 0.25rem;
      list-style: none;
      background: var(--card-2);
      border: 1px solid var(--background);
      border-radius: 6px;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
      max-height: 20rem;
      overflow-y: auto;
      li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.3rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
        span {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        &.active {
          background: var(--background);
          color: var(--accent);
        }
        &[aria-selected='true'] {
          color: var(--accent);
        }
        &.empty {
          cursor: default;
          opacity: 0.6;
          font-size: 0.85rem;
        }
      }
    }
  }
</style>
