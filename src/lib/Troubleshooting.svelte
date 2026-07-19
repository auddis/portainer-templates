<script lang="ts">
  import { gitHubRepo } from '$src/constants';

  let { appRepo = null, templateSource = null }: { appRepo?: string | null; templateSource?: string | null } = $props();

  let open = $state(false);

  const repoLink = (repoUrl?: string | null): { slug: string; href: string } | null => {
    if (!repoUrl) return null;
    try {
      const url = new URL(repoUrl);
      const [owner, repo] = url.pathname.split('/').filter(Boolean);
      if (!url.hostname.endsWith('github.com') || !owner || !repo) return null;
      const slug = `${owner}/${repo.replace(/\.git$/i, '')}`;
      return { slug, href: `https://github.com/${slug}/issues/new` };
    } catch {
      return null;
    }
  };

  const rows = $derived([
    { label: 'Bug within the app', link: repoLink(appRepo), fallback: "Open an issue within the app's repo" },
    { label: 'Template not working', link: repoLink(templateSource), fallback: "Open an issue within the template's repo" },
    { label: 'This website not working', link: repoLink(gitHubRepo), fallback: '' },
  ]);
</script>

<section class="raise-issue">
  <h2>
    <button type="button" aria-expanded={open} aria-controls="raise-issue-panel" onclick={() => (open = !open)}>
      Troubleshooting
      <span class="chevron" aria-hidden="true"></span>
    </button>
  </h2>
  <div id="raise-issue-panel" class="panel" class:open inert={!open}>
    <div class="panel-inner">
      <div class="troubleshooting-item">
        <h3>Raise an issue</h3>
        <p>Found something which isn't working as it should? Here's how to report it.</p>
        <ul>
          {#each rows as row (row.label)}
            <li>
              <strong>{row.label}:</strong>
              {#if row.link}
                Open an issue on <a href={row.link.href} target="_blank" rel="noreferrer">{row.link.slug}</a>
              {:else}
                {row.fallback}
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </div>
</section>

<style lang="scss">
  .raise-issue {
    max-width: 1000px;
    margin: 1rem auto;
    padding: 0 1rem;
    background: var(--card);
    border-radius: 6px;

    h2 {
      margin: 0;
      font-size: 2rem;
    }
    h3 {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 600;
    }
    button {
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
    button[aria-expanded='true'] .chevron {
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
    }
    .troubleshooting-item {
      padding: 0 0 1rem;
      &:not(:last-child) {
        border-bottom: 2px solid var(--background);
        margin-bottom: 1rem;
      }
      p {
        margin: 0 0 0.25rem;
      }
      ul {
        margin: 0;
        padding-left: 1.25rem;
        li {
          strong {
            font-weight: 500;
          }
        }
      }
      a {
        color: var(--accent);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .panel, .chevron, button {
        transition: none;
      }
    }
  }
</style>
