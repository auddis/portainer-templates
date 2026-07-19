<script lang="ts">
  import { baseUrl } from '$src/constants';

  let { title, description, path = '/', image }: {
    title: string;
    description: string;
    path?: string;
    image?: string;
  } = $props();

  const url = $derived(`${baseUrl}${path}`);
  // only raster images crawlers can fetch and render (no svg, ico or data URIs)
  const cardSafe = $derived(image && /^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(image) ? image : undefined);
  const cardImage = $derived(cardSafe || `${baseUrl}/banner.png`);
  const cardType = $derived(cardSafe ? 'summary' : 'summary_large_image');
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={url} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={url} />
  <meta property="og:image" content={cardImage} />
  <meta name="twitter:card" content={cardType} />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={cardImage} />
</svelte:head>
