<script lang="ts">
import { slide } from 'svelte/transition';
import snarkdown from 'snarkdown';
import Collapsible from '$lib/Collapsible.svelte';

interface MultiDoc { name: string; content: string; description: string; }

let { content = null, multiContent = null, title = 'Container Documentation' }: {
  content?: string | null;
  multiContent?: MultiDoc[] | null;
  title?: string;
} = $props();

let openDocs = $state<Record<number, boolean>>({});
const toggleDoc = (index: number) => { openDocs[index] = !openDocs[index]; };

const hasContent = $derived(!!content || (!!multiContent && multiContent.length > 0));
</script>

{#if hasContent}
  {#if content}
    <Collapsible {title}>
      <div class="md">{@html snarkdown(content)}</div>
    </Collapsible>
  {:else if multiContent}
    <section class="docker-docs">
      <h2>{title}</h2>
      {#each multiContent as { name, description, content }, index}
        <h3>{name} Documentation</h3>
        <p class="desc">{description || ''}</p>
        <button onclick={() => toggleDoc(index)}>{ openDocs[index] ? 'Hide' : 'Expand' } {name}</button>
        {#if openDocs[index]}
          <div class="md" transition:slide>{@html snarkdown(content)}</div>
        {/if}
      {/each}
    </section>
  {/if}
{/if}

<style lang="scss">
  .md {
    :global(img) {
      max-width: 100%;
    }
    :global(a) {
      color: var(--accent);
      text-decoration: none;
    }
    :global(pre) {
      background: var(--card-2);
      padding: 1rem;
      border-radius: 6px;
      overflow: auto;
    }
  }
  .docker-docs {
    background: var(--card);
    padding: 1rem;
    border-radius: 6px;
    margin: 1rem auto;
    max-width: 1000px;
    h2 {
      font-size: 2rem;
      margin: 0;
    }
    h3 {
      margin: 0.5rem 0;
      text-transform: capitalize;
    }
    .desc {
      opacity: 0.7;
      margin: 0.5rem 0;
      font-style: italic;
    }
    button {
      background: var(--background);
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      border: none;
      color: var(--foreground);
      font-family: Kanit;
      font-size: 1.2rem;
      cursor: pointer;
      transition: all 0.2s ease-in-out;
      &:hover {
        background: var(--gradient);
        transform: scale(1.1) rotate(-1deg);
      }
    }
  }
</style>
