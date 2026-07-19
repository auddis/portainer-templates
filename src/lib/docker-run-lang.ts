import type { HLJSApi, Language } from 'highlight.js';

// Colour rules to make our generated docker run commands easy to scan.
export const dockerRunHighlight = {
  name: 'docker-run',
  register: (hljs: HLJSApi): Language => ({
    case_insensitive: false,
    keywords: { keyword: 'docker run sudo' },
    contains: [
      hljs.QUOTE_STRING_MODE,
      hljs.APOS_STRING_MODE,
      // the image always sits alone on its own line
      { className: 'built_in', begin: /(?<=\n\s+)[a-z0-9][\w./-]*(?::[\w.-]+)?(?:@sha256:[a-f0-9]+)?/ },
      // only flags after a space, so hyphens inside values stay safe
      { className: 'attr', begin: /(?<=\s)--?[A-Za-z][\w-]*/ },
      hljs.NUMBER_MODE,
      // dim the trailing backslashes
      { className: 'comment', begin: /\\(?=\n)/ },
    ],
  }),
};
