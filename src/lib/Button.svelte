<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '$lib/Icon.svelte';

  interface Props {
    to?: string;
    action?: () => void;
    target?: string;
    icon?: string | null;
    selected?: boolean;
    children?: Snippet;
  }
  let { to = '', action = () => {}, target = '_self', icon = null, selected = false, children }: Props = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svelte:element this={to ? 'a' : 'button'} href={to} onclick={action} {target} class:selected>
  {#if icon}<Icon name={icon} />{/if}
  {@render children?.()}
</svelte:element>


<style lang="scss">
  a, button {
    position: relative;
    color: var(--foreground);
    text-decoration: none;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    transition: transform 200ms ease-in-out;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border: 1px solid transparent;
    background: var(--card);
    cursor: pointer;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--gradient);
      border-radius: 6px;
      z-index: -1;
      opacity: 0;
      transition: opacity 300ms ease-in-out;
    }

    &:hover, &.selected {
      transform: scale(1.05);
      &::before {
        opacity: 1;
      }
    }
  }
</style>