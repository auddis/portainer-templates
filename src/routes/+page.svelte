<script lang="ts">
  import { page } from '$app/state'

  import Hero from '$lib/Hero.svelte';
  import ListFilter from '$lib/ListFilter.svelte';
  import Categories from '$lib/Categories.svelte';
  import SearchSummary from '$lib/SearchSummary.svelte';
  import Templates from '$lib/TemplateList.svelte';
  import NoResults from '$lib/NoResults.svelte';
  import Footer from '$lib/Footer.svelte';
  import type { Template } from '$src/Types';
  import type { PageData } from './$types';
  import { baseUrl } from '$src/constants';

  let { data }: { data: PageData } = $props();

  const preSelectedCategories = page.url.searchParams.get('categories');

  let searchTerm = $state('');

  let selectedCategories = $state<string[]>(preSelectedCategories?.split(',') || []);

  let showCategories = $state(!!preSelectedCategories);

  const filteredTemplates = $derived(data.templates.filter((template: Template) => {
    const compareStr = (str1: string, str2: string) =>
      (str1 || '').toLowerCase().includes(str2.toLowerCase());

    if (selectedCategories.length) {
      const templateCategories = (template.categories || []).map((c) => c.toLowerCase());
      const hasSelectedCategory = selectedCategories.some((cat) =>
        templateCategories.includes(cat.toLocaleLowerCase())
      );
      if (!hasSelectedCategory) return false;
    }
    return (
      compareStr(template.title, searchTerm) ||
      compareStr(template.description, searchTerm) ||
      compareStr((template.categories || []).join(''), searchTerm)
    );
  }));

  const showHideCategoryList = () => {
    showCategories = !showCategories;
  };

  const toggleCategory = (category: string) => {
    if (selectedCategories.includes(category)) {
      selectedCategories = selectedCategories.filter((cat) => cat !== category);
    } else {
      selectedCategories = [...selectedCategories, category];
    }
  };

  const clearSearch = () => {
    searchTerm = '';
    selectedCategories = [];
  }

</script>

<svelte:head>
  <title>Portainer Templates</title>
  <meta name="description" content="A community-driven library of 400+ 1-click self-hosted apps and stacks, for easy use with Portainer or Docker-Compose" />
  <meta property="og:title" content="Portainer Templates" />
  <meta property="og:description" content="A community-driven library of 400+ 1-click self-hosted apps and stacks, for easy use with Portainer or Docker-Compose" />
  <meta property="og:url" content="{baseUrl}/" />
  <meta name="twitter:title" content="Portainer Templates" />
  <meta name="twitter:description" content="A community-driven library of 400+ 1-click self-hosted apps and stacks, for easy use with Portainer or Docker-Compose" />
  <link rel="canonical" href={baseUrl} />
</svelte:head>

<!-- Main title, and CTA buttons -->
<Hero />

<!-- Search bar, and Templates sub-title -->
<ListFilter
  bind:searchTerm={searchTerm}
  toggleCategories={showHideCategoryList}
  isCategoriesVisible={showCategories}
/>

<!-- List of categories to filter by -->
{#if showCategories}
  <Categories
    categories={data.categories}
    selectedCategories={selectedCategories}
    toggleCategory={toggleCategory}
  />
{/if}

<!-- Text showing num results, and users search term + filters  -->
<SearchSummary
  searchTerm={searchTerm}
  selectedCategories={selectedCategories}
  clearSearch={clearSearch}
  numResults={filteredTemplates.length}
  totalResults={data.templates.length}
/>

<!-- List of available templates (filtered, if needed) -->
<Templates templates={filteredTemplates} />

<!-- If there are no templates matching search term, show lil message -->
{#if !filteredTemplates.length}
  <NoResults />
{/if}

