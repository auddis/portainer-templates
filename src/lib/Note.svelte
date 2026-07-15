<script lang="ts">
  let { note }: { note: string } = $props();
</script>

<section class="note">
  <h2>Notes</h2>
  <div class="note-content">{@html note}</div>
</section>

<style lang="scss">
  .note {
    background: var(--card);
    border-radius: 6px;
    padding: 1rem;
    margin: 1rem auto;
    max-width: 1000px;
    h2 {
      margin: 0 0 0.5rem;
      font-size: 2rem;
    }
    .note-content {
      background: var(--card-2);
      padding: 1rem;
      border-radius: 6px;
      overflow-wrap: break-word;
      :global(a) {
        color: var(--accent);
      }
      :global(img) {
        max-width: 100%;
      }
    }
  }
</style>
