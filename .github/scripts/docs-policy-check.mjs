#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_CONFIG_FILE = '.docs-policy.json';

/**
 * 将仓库内相对路径统一成 POSIX 风格，避免 macOS/Linux 路径分隔符差异影响匹配。
 */
function normalizeRepoPath(file) {
  return file.split(path.sep).join('/');
}

/**
 * 支持本策略需要的轻量 glob：
 * - `*` 匹配单层路径片段；
 * - `**` 匹配任意层级；
 * - 其他字符按字面量匹配。
 */
function globToRegExp(pattern) {
  const normalized = normalizeRepoPath(pattern);
  let source = '^';

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if ('\\^$+?.()|{}[]'.includes(char)) {
      source += `\\${char}`;
    } else {
      source += char;
    }
  }

  source += '$';
  return new RegExp(source);
}

function matchesAny(file, patterns = []) {
  return patterns.some((pattern) => globToRegExp(pattern).test(file));
}

function markdownFilesFromGit(root) {
  const output = execFileSync('git', ['ls-files', '*.md'], {
    cwd: root,
    encoding: 'utf8',
  });

  return output
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean)
    .map(normalizeRepoPath);
}

function readConfig(root, configPath = DEFAULT_CONFIG_FILE) {
  const absolutePath = path.resolve(root, configPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Docs policy config not found: ${configPath}`);
  }

  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function readIndexText(files, readText) {
  return files
    .map((file) => {
      try {
        return readText(file);
      } catch {
        return '';
      }
    })
    .join('\n');
}

function isKebabCaseMarkdown(file) {
  const basename = path.posix.basename(file);
  return basename === 'README.md' || /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(basename);
}

function localMarkdownLinks(markdown) {
  const links = [];
  const linkPattern = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  for (const match of markdown.matchAll(linkPattern)) {
    const target = match[1];
    if (
      target.startsWith('#') ||
      target.startsWith('http://') ||
      target.startsWith('https://') ||
      target.startsWith('mailto:')
    ) {
      continue;
    }

    const normalizedTarget = normalizeRepoPath(target.split('#')[0].split('?')[0]);
    if (normalizedTarget.endsWith('.md')) {
      links.push(normalizedTarget);
    }
  }

  return links;
}

/**
 * 对一组 Markdown 路径执行组织级文档策略。
 *
 * `config` 是仓库级微调入口：组织默认 check 负责执行，仓库只声明允许目录、
 * 是否要求 README 索引、以及该仓库不应承载的文档类型关键词。
 */
export function checkDocsPolicy({ files, readText, config }) {
  const errors = [];
  const normalizedFiles = files.map(normalizeRepoPath);
  const allowedMarkdownPaths = config.allowedMarkdownPaths ?? ['README.md', 'AGENTS.md', 'docs/**'];

  for (const file of normalizedFiles) {
    if (!matchesAny(file, allowedMarkdownPaths)) {
      errors.push({
        file,
        message: 'Markdown file is outside allowed documentation locations.',
      });
    }

    for (const term of config.forbiddenPathTerms ?? []) {
      if (file.toLowerCase().includes(term.toLowerCase())) {
        errors.push({
          file,
          message: `Markdown path contains forbidden term "${term}" for this repository.`,
        });
      }
    }

    if (config.enforceKebabCaseDocs && file.startsWith('docs/') && !isKebabCaseMarkdown(file)) {
      errors.push({
        file,
        message: 'docs/ Markdown filename must use kebab-case or README.md.',
      });
    }
  }

  if (config.readmeAllowedLocalLinkPaths) {
    const readmeText = readIndexText(['README.md'], readText);
    for (const linkedFile of localMarkdownLinks(readmeText)) {
      if (!matchesAny(linkedFile, config.readmeAllowedLocalLinkPaths)) {
        errors.push({
          file: 'README.md',
          message: `README links to ${linkedFile}, which is not an allowed README entrypoint.`,
        });
      }
    }
  }

  if (config.requireIndexedDocs) {
    const indexFiles = config.indexFiles ?? ['README.md'];
    const indexText = readIndexText(indexFiles, readText);
    const unindexedAllowedPaths = config.unindexedAllowedPaths ?? [];

    for (const file of normalizedFiles) {
      if (!file.startsWith('docs/') || matchesAny(file, unindexedAllowedPaths)) {
        continue;
      }

      if (!indexText.includes(file)) {
        errors.push({
          file,
          message: 'docs/ Markdown file must be linked from one configured index file.',
        });
      }
    }
  }

  return { errors };
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    config: DEFAULT_CONFIG_FILE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      args.root = argv[index + 1];
      index += 1;
    } else if (arg === '--config') {
      args.config = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root);
  const config = readConfig(root, args.config);
  const files = markdownFilesFromGit(root);
  const result = checkDocsPolicy({
    files,
    config,
    readText: (file) => readFileSync(path.join(root, file), 'utf8'),
  });

  for (const error of result.errors) {
    console.error(`::error file=${error.file}::${error.message}`);
  }

  if (result.errors.length > 0) {
    process.exitCode = 1;
  } else {
    console.log(`Docs policy check passed for ${files.length} Markdown files.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
