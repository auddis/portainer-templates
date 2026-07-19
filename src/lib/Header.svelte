<script lang="ts">
  import Button from '$lib/Button.svelte';
  import { gitHubRepo } from '$src/constants';

  let { floating = false }: { floating?: boolean } = $props();

  const links = [
    { to: '/', icon: 'whale', label: 'All Templates' },
    { to: '/search', icon: 'search', label: 'Search' },
    { to: '/usage', icon: 'install-instructions', label: 'Install' },
    { to: '/changelog', icon: 'changelog', label: 'Changelog' },
    { to: gitHubRepo, icon: 'github', label: 'GitHub' },
  ];

  let open = $state(false);
  let scrollY = $state(0);
  let innerHeight = $state(0);

  // On the homepage the bar hides until you've scrolled past the hero
  const shown = $derived(!floating || scrollY > innerHeight * 0.9);
</script>

<svelte:window bind:scrollY bind:innerHeight onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<header class:floating class:shown inert={!shown}>
  <a class="title" href="/">
    <img src="https://i.ibb.co/hMymwH0/portainer-templates-small.png" alt="Portainer Templates logo" width="40" height="40" />
    <h2>Portainer Templates</h2>
  </a>

  <button
    class="burger"
    class:open
    aria-label="Menu"
    aria-expanded={open}
    aria-controls="site-nav"
    onclick={() => (open = !open)}
  >
    <span></span><span></span><span></span>
  </button>

  <nav id="site-nav" class:open>
    {#each links as { to, icon, label } (to)}
      <Button {to} {icon} action={() => (open = false)}>{label}</Button>
    {/each}
  </nav>
</header>

<style lang="scss">
  header {
    position: relative;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--card);
    padding: 0.25rem 1rem;

    a.title {
      display: flex;
      align-items: center;
      gap: 1rem;
      color: var(--foreground);
      text-decoration: none;
      h2 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
      }
      img {
        width: 40px;
        transition: all 0.3s ease-in-out;
      }
      &:hover img { transform: rotate(-5deg) scale(1.1); }
    }

    nav {
      display: flex;
      gap: 1rem;
    }

    .burger {
      display: none;
      flex-direction: column;
      justify-content: center;
      gap: 5px;
      width: 40px;
      height: 40px;
      padding: 0;
      background: none;
      border: none;
      cursor: pointer;
      span {
        width: 24px;
        height: 2px;
        border-radius: 2px;
        background: var(--foreground);
        transition: transform 0.25s ease, opacity 0.25s ease;
      }
      &.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
      &.open span:nth-child(2) { opacity: 0; }
      &.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
    }
  }

  header.floating {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    transform: translateY(-100%);
    transition: transform 0.3s ease;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    &.shown { transform: translateY(0); }
  }

  @media (max-width: 768px) {
    header {
      a.title h2 { font-size: 1.25rem; }
      .burger { display: flex; }
      nav {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        flex-direction: column;
        align-items: stretch;
        gap: 0.5rem;
        padding: 0.5rem 1rem 1rem;
        background: var(--card);
        box-shadow: 0 8px 12px rgba(0, 0, 0, 0.25);
        transform: translateY(-8px);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.2s ease;
        &.open {
          transform: translateY(0);
          opacity: 1;
          pointer-events: auto;
        }
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    header.floating,
    header nav,
    .burger span { transition: none; }
  }
</style>
