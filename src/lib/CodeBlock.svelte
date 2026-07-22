<script lang="ts">
  import Highlight from 'svelte-highlight';
  import type { LanguageFn } from 'highlight.js';

  let { code, language }: {
    code: string;
    language: { name: string; register: LanguageFn };
  } = $props();

  let copied = $state(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {}
  };
</script>

<div class="code-block">
  <button type="button" class="copy" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
  <Highlight {language} {code} />
</div>

<style lang="scss">
  .code-block {
    position: relative;
    background: var(--card-2);
    border-radius: 6px;
    padding: 0.5rem;
    margin: 0.5rem 0;
    .copy {
      position: absolute;
      right: 0.5rem;
      top: 0.5rem;
      z-index: 1;
      background: var(--background);
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      border: none;
      color: var(--foreground);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.2s ease-in-out;
      &:hover {
        background: var(--gradient);
      }
      &:focus-visible {
        outline: 2px solid var(--accent);
      }
    }
    :global(pre) {
      margin: 0;
      overflow-x: auto;
    }
    :global(.hljs) {
      background: var(--card-2);
      padding: 0;
      font-size: 0.95rem;
      line-height: 1.5;
    }
    @media (prefers-reduced-motion: reduce) {
      .copy {
        transition: none;
      }
    }
  }
</style>
