<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import { HINTS } from './config';

  /* question-mark tooltip; `for` pulls a shared hint, `tip` passes custom (optionally html) content */
  let { for: key, tip, html = false, align = 'left' }: {
    for?: keyof typeof HINTS;
    tip?: string;
    html?: boolean;
    align?: 'left' | 'right';
  } = $props();
  const id = $props.id();
  const text = $derived(tip ?? (key !== undefined ? HINTS[key] : undefined));
</script>

{#if text}
  <span class="help-tip" class:right={align === 'right'}>
    <button type="button" class="trigger" aria-label="What's this?" aria-describedby="{id}-tip">
      <Icon name="help" width="14px" height="14px" />
    </button>
    <span role="tooltip" id="{id}-tip" class="bubble">{#if html}{@html text}{:else}{text}{/if}</span>
  </span>
{/if}

<style lang="scss">
  .help-tip {
    position: relative;
    display: inline-flex;
    .trigger {
      display: inline-flex;
      padding: 0;
      border: none;
      background: none;
      color: inherit;
      opacity: 0.65;
      cursor: help;
      &:hover {
        opacity: 1;
        color: var(--accent);
      }
      &:focus-visible {
        opacity: 1;
        color: var(--accent);
        outline: 2px solid var(--accent);
        outline-offset: 2px;
        border-radius: 50%;
      }
    }
    .bubble {
      position: absolute;
      bottom: calc(100% + 8px);
      right: -0.25rem;
      z-index: 5;
      width: max-content;
      max-width: 16rem;
      padding: 0.5rem 0.6rem;
      border-radius: 6px;
      background: var(--card);
      color: var(--foreground);
      box-shadow: var(--shadow);
      font-size: 0.8rem;
      font-weight: 400;
      line-height: 1.4;
      letter-spacing: normal;
      text-align: left;
      text-transform: none;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s ease-in-out;
      :global(a) {
        color: var(--accent);
        text-decoration: underline;
      }
      :global(code) {
        font-size: 0.9em;
      }
      &::after {
        content: '';
        position: absolute;
        top: 100%;
        right: 0.5rem;
        border: 5px solid transparent;
        border-top-color: var(--card);
      }
    }
    &.right .bubble {
      right: auto;
      left: -0.25rem;
      &::after {
        right: auto;
        left: 0.5rem;
      }
    }
    &:hover .bubble,
    .trigger:focus-visible ~ .bubble {
      opacity: 1;
      visibility: visible;
    }
    @media (prefers-reduced-motion: reduce) {
      .bubble {
        transition: none;
      }
    }
  }
</style>
