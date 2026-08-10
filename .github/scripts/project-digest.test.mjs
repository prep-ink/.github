import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { test } from 'node:test';

import {
  buildDigest,
  buildFeishuPayload,
  normalizeProjectItem,
  sendFeishu,
} from './project-digest.mjs';

test('normalizeProjectItem keeps GitHub Project facts needed by the daily digest', () => {
  const item = normalizeProjectItem({
    content: {
      number: 14,
      repository: 'prep-ink/backend',
      title: '[backend][链路] 定义 P0 public/app/internal contract 与 OpenAPI 测试页',
      type: 'Issue',
      url: 'https://github.com/prep-ink/backend/issues/14',
    },
    'delivery Tier': 'Core',
    labels: ['repo:backend', 'ai-ready', 'type:feature'],
    repository: 'https://github.com/prep-ink/backend',
    sprint: 'Sprint 1 (8/5-8/11)',
    status: 'Todo',
    'target Date': '2026-08-11',
  });

  assert.deepEqual(item, {
    number: 14,
    repository: 'prep-ink/backend',
    title: '[backend][链路] 定义 P0 public/app/internal contract 与 OpenAPI 测试页',
    type: 'Issue',
    url: 'https://github.com/prep-ink/backend/issues/14',
    status: 'Todo',
    labels: ['repo:backend', 'ai-ready', 'type:feature'],
    sprint: 'Sprint 1 (8/5-8/11)',
    targetDate: '2026-08-11',
    deliveryTier: 'Core',
  });
});

test('buildDigest highlights non-done delivery risks and human decisions', () => {
  const digest = buildDigest({
    now: new Date('2026-08-10T01:00:00.000Z'),
    projectName: '品墨产品交付看板',
    projectUrl: 'https://github.com/orgs/prep-ink/projects/2',
    items: [
      {
        content: {
          number: 1,
          repository: 'prep-ink/backend',
          title: '[backend][8/21] 预置 Demo org、Project、capability、用户和 API Token',
          type: 'Issue',
          url: 'https://github.com/prep-ink/backend/issues/1',
        },
        'delivery Tier': 'Core',
        labels: ['repo:backend', 'ai-ready'],
        status: 'Todo',
        'target Date': '2026-08-09',
      },
      {
        content: {
          number: 24,
          repository: 'prep-ink/backend',
          title: 'docs: validate all PTE types through Langfuse and Mastra',
          type: 'PullRequest',
          url: 'https://github.com/prep-ink/backend/pull/24',
        },
        labels: ['needs-human'],
        reviewers: ['paraself'],
        status: 'Todo',
      },
      {
        content: {
          number: 12,
          repository: 'prep-ink/backend',
          title: 'Add typed agent prompt contracts and Mastra Studio primitives',
          type: 'PullRequest',
          url: 'https://github.com/prep-ink/backend/pull/12',
        },
        status: 'Done',
      },
    ],
  });

  assert.match(digest.text, /品墨项目日报/);
  assert.match(digest.text, /看板：\[品墨产品交付看板\]/);
  assert.match(digest.text, /Todo: 2/);
  assert.match(digest.text, /Done: 1/);
  assert.match(digest.text, /今日应推进/);
  assert.match(digest.text, /backend#1/);
  assert.match(digest.text, /风险\/阻塞/);
  assert.match(digest.text, /已过期 1 天/);
  assert.match(digest.text, /需要人工决策/);
  assert.match(digest.text, /backend#24/);
  assert.doesNotMatch(digest.text, /backend#12/);
});

test('buildFeishuPayload wraps markdown text for Feishu robot webhook', () => {
  assert.deepEqual(buildFeishuPayload('hello'), {
    msg_type: 'interactive',
    card: {
      config: {
        wide_screen_mode: true,
      },
      elements: [
        {
          tag: 'markdown',
          content: 'hello',
        },
      ],
    },
  });
});

test('buildFeishuPayload signs payload when Feishu bot secret is provided', () => {
  assert.deepEqual(
    buildFeishuPayload('hello', {
      signSecret: 'test-secret',
      nowSeconds: 1234567890,
    }),
    {
      timestamp: '1234567890',
      sign: 'qCaOcLimil1ehZl6GzN2CUL6wgdt4onZPxvw8V+3TzA=',
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true,
        },
        elements: [
          {
            tag: 'markdown',
            content: 'hello',
          },
        ],
      },
    },
  );
});

test('sendFeishu rejects Feishu business errors even when HTTP status is 200', async () => {
  const server = await new Promise((resolve) => {
    const createdServer = http.createServer((request, response) => {
      request.resume();
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ code: 19024, msg: 'invalid sign' }));
    });
    createdServer.listen(0, () => resolve(createdServer));
  });

  try {
    const { port } = server.address();
    await assert.rejects(
      sendFeishu({
        webhook: `http://127.0.0.1:${port}/hook`,
        payload: buildFeishuPayload('hello'),
      }),
      /Feishu webhook business error: 19024 invalid sign/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('workflow falls back to dry run when Feishu webhook is missing', () => {
  const workflow = readFileSync('.github/workflows/daily-project-digest.yml', 'utf8');

  assert.match(workflow, /HAS_FEISHU_BOT_WEBHOOK: \$\{\{ secrets\.FEISHU_BOT_WEBHOOK != '' \}\}/);
  assert.match(workflow, /DRY_RUN: \$\{\{ .*secrets\.FEISHU_BOT_WEBHOOK == ''.* \}\}/);
  assert.match(workflow, /skip Feishu delivery/);
});
