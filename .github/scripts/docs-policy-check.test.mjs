import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkDocsPolicy } from './docs-policy-check.mjs';

test('accepts indexed docs under configured Markdown roots', () => {
  const result = checkDocsPolicy({
    files: ['README.md', 'AGENTS.md', 'ARCHITECTURE.md', 'docs/api-contract.md'],
    readText: (file) =>
      file === 'README.md'
        ? '# Example\n\n- [API Contract](docs/api-contract.md)\n'
        : '# Example\n',
    config: {
      allowedMarkdownPaths: ['README.md', 'AGENTS.md', 'ARCHITECTURE.md', 'docs/**'],
      indexFiles: ['README.md'],
      requireIndexedDocs: true,
    },
  });

  assert.deepEqual(result.errors, []);
});

test('rejects root Markdown files that are not explicitly allowed', () => {
  const result = checkDocsPolicy({
    files: ['README.md', 'random-note.md'],
    readText: () => '# Example\n',
    config: {
      allowedMarkdownPaths: ['README.md', 'docs/**'],
    },
  });

  assert.deepEqual(result.errors, [
    {
      file: 'random-note.md',
      message: 'Markdown file is outside allowed documentation locations.',
    },
  ]);
});

test('requires docs files to be linked from an index file unless exempted', () => {
  const result = checkDocsPolicy({
    files: [
      'README.md',
      'docs/api-contract.md',
      'docs/superpowers/plans/2026-08-10-example.md',
    ],
    readText: (file) => (file === 'README.md' ? '# Example\n' : '# Example\n'),
    config: {
      allowedMarkdownPaths: ['README.md', 'docs/**'],
      indexFiles: ['README.md'],
      requireIndexedDocs: true,
      unindexedAllowedPaths: ['docs/superpowers/**'],
    },
  });

  assert.deepEqual(result.errors, [
    {
      file: 'docs/api-contract.md',
      message: 'docs/ Markdown file must be linked from one configured index file.',
    },
  ]);
});

test('rejects forbidden document path terms in the wrong repository', () => {
  const result = checkDocsPolicy({
    files: ['README.md', 'docs/2026-roadmap.md'],
    readText: () => '# Example\n',
    config: {
      allowedMarkdownPaths: ['README.md', 'docs/**'],
      forbiddenPathTerms: ['roadmap'],
    },
  });

  assert.deepEqual(result.errors, [
    {
      file: 'docs/2026-roadmap.md',
      message: 'Markdown path contains forbidden term "roadmap" for this repository.',
    },
  ]);
});

test('rejects non-kebab-case docs filenames', () => {
  const result = checkDocsPolicy({
    files: ['README.md', 'docs/API Contract.md'],
    readText: (file) =>
      file === 'README.md'
        ? '# Example\n\n- [API Contract](docs/API Contract.md)\n'
        : '# Example\n',
    config: {
      allowedMarkdownPaths: ['README.md', 'docs/**'],
      indexFiles: ['README.md'],
      requireIndexedDocs: true,
      enforceKebabCaseDocs: true,
    },
  });

  assert.deepEqual(result.errors, [
    {
      file: 'docs/API Contract.md',
      message: 'docs/ Markdown filename must use kebab-case or README.md.',
    },
  ]);
});

test('allows README to link only configured stable local document entrypoints', () => {
  const result = checkDocsPolicy({
    files: [
      'README.md',
      'ARCHITECTURE.md',
      'docs/api-contract.md',
      'docs/superpowers/plans/2026-08-10-example.md',
    ],
    readText: (file) =>
      file === 'README.md'
        ? [
            '# Example',
            '',
            '- [Architecture](ARCHITECTURE.md)',
            '- [API Contract](docs/api-contract.md)',
            '- [Product BRIEF](https://github.com/prep-ink/product/blob/master/BRIEF.md)',
          ].join('\n')
        : '# Example\n',
    config: {
      allowedMarkdownPaths: ['README.md', 'ARCHITECTURE.md', 'docs/**'],
      readmeAllowedLocalLinkPaths: ['ARCHITECTURE.md', 'docs/*.md'],
      unindexedAllowedPaths: ['docs/superpowers/**'],
    },
  });

  assert.deepEqual(result.errors, []);
});

test('rejects process docs linked from the root README when not configured as README entrypoints', () => {
  const result = checkDocsPolicy({
    files: ['README.md', 'docs/superpowers/plans/2026-08-10-example.md'],
    readText: (file) =>
      file === 'README.md'
        ? '# Example\n\n- [Implementation plan](docs/superpowers/plans/2026-08-10-example.md)\n'
        : '# Example\n',
    config: {
      allowedMarkdownPaths: ['README.md', 'docs/**'],
      readmeAllowedLocalLinkPaths: ['docs/*.md'],
      unindexedAllowedPaths: ['docs/superpowers/**'],
    },
  });

  assert.deepEqual(result.errors, [
    {
      file: 'README.md',
      message:
        'README links to docs/superpowers/plans/2026-08-10-example.md, which is not an allowed README entrypoint.',
    },
  ]);
});
