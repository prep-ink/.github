import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const STATUS_ORDER = ['Blocked', 'In Progress', 'Review', 'Todo', 'Ready', 'Done'];

/**
 * 将 `gh project item-list --format json` 的字段整理成日报只需要的事实。
 *
 * GitHub CLI 会把 Project 自定义字段按展示名输出，例如 `target Date`
 * 和 `delivery Tier`，这里集中做一次兼容，后面的 Scrum 摘要逻辑只读稳定字段。
 */
export function normalizeProjectItem(rawItem) {
  const content = rawItem.content ?? {};
  const repository =
    content.repository ??
    rawItem.repository?.replace(/^https:\/\/github\.com\//, '') ??
    '';

  return {
    number: content.number ?? null,
    repository,
    title: content.title ?? rawItem.title ?? '(untitled)',
    type: content.type ?? rawItem.type ?? 'ProjectItem',
    url: content.url ?? rawItem.url ?? '',
    status: rawItem.status ?? 'No Status',
    labels: Array.isArray(rawItem.labels) ? rawItem.labels : [],
    sprint: rawItem.sprint ?? '',
    targetDate: rawItem['target Date'] ?? rawItem.targetDate ?? '',
    deliveryTier: rawItem['delivery Tier'] ?? rawItem.deliveryTier ?? '',
  };
}

/**
 * 生成飞书机器人可直接发送的项目日报文本。
 *
 * 规则保持轻量：Project 是看板视图，Issue / PR 是事实源；日报只指出
 * 当前应推进、风险阻塞、需要人类决策和 Review，不自动承诺优先级或 Owner。
 */
export function buildDigest({
  items,
  now = new Date(),
  projectName = 'GitHub Project',
  projectUrl = '',
  timeZone = 'Asia/Shanghai',
}) {
  const normalizedItems = items.map(normalizeProjectItem);
  const today = dateKeyInTimeZone(now, timeZone);
  const statusCounts = countByStatus(normalizedItems);
  const openItems = normalizedItems.filter((item) => !isDone(item));

  const riskItems = openItems
    .filter((item) => isBlocked(item) || isOverdue(item, today))
    .sort((a, b) => compareByRisk(a, b, today))
    .slice(0, 8);

  const humanDecisionItems = openItems
    .filter((item) => needsHumanDecision(item))
    .sort((a, b) => compareByTargetDate(a, b))
    .slice(0, 8);

  const reviewItems = openItems
    .filter((item) => isReviewItem(item))
    .sort((a, b) => compareByTargetDate(a, b))
    .slice(0, 8);

  const focusItems = openItems
    .filter((item) => isFocusItem(item, today))
    .sort((a, b) => compareByRisk(a, b, today))
    .slice(0, 10);

  const projectLink = projectUrl ? `[${projectName}](${projectUrl})` : projectName;
  const lines = [
    `**品墨项目日报 - ${today}**`,
    '',
    `看板：${projectLink}`,
    `概况：${formatStatusCounts(statusCounts)}；未完成 ${openItems.length} / 总计 ${normalizedItems.length}`,
    '',
    section('今日应推进', focusItems, today),
    '',
    section('风险/阻塞', riskItems, today),
    '',
    section('需要人工决策', humanDecisionItems, today),
    '',
    section('Review 中', reviewItems, today),
    '',
    '_事实源：GitHub Projects / Issues / PRs；本日报不会修改看板状态、优先级、Owner 或 Sprint 承诺。_',
  ];

  return {
    text: lines.join('\n'),
    stats: {
      total: normalizedItems.length,
      open: openItems.length,
      risks: riskItems.length,
      needsHumanDecision: humanDecisionItems.length,
      review: reviewItems.length,
    },
  };
}

/**
 * 飞书自定义机器人 webhook 的卡片 payload。
 *
 * 使用 interactive card + markdown，便于在群里保留链接和分组结构。
 * 如果机器人启用了签名校验，传入 `signSecret` 后会附加 timestamp/sign。
 */
export function buildFeishuPayload(text, { signSecret = '', nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
  const payload = {
    msg_type: 'interactive',
    card: {
      config: {
        wide_screen_mode: true,
      },
      elements: [
        {
          tag: 'markdown',
          content: text,
        },
      ],
    },
  };

  if (!signSecret) return payload;

  const timestamp = String(nowSeconds);
  const stringToSign = `${timestamp}\n${signSecret}`;
  return {
    timestamp,
    sign: createHmac('sha256', stringToSign).update('').digest('base64'),
    ...payload,
  };
}

/**
 * 从 GitHub CLI 读取组织 Project 条目。
 *
 * Action 内使用 `GH_TOKEN` 供 `gh` 鉴权；本地调试时可复用当前登录账号。
 */
function readProjectItems({ owner, number, limit }) {
  const stdout = execFileSync(
    'gh',
    ['project', 'item-list', String(number), '--owner', owner, '--limit', String(limit), '--format', 'json'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  return JSON.parse(stdout).items ?? [];
}

/**
 * 向飞书机器人发送日报。
 *
 * webhook 是敏感值，只从环境变量读取，不写入日志。
 */
export async function sendFeishu({ webhook, payload }) {
  const response = await fetch(webhook, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Feishu webhook failed: ${response.status} ${body}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return;

  const body = await response.json();
  const code = body.code ?? body.StatusCode ?? 0;
  if (code !== 0) {
    const message = body.msg ?? body.message ?? body.StatusMessage ?? 'unknown error';
    throw new Error(`Feishu webhook business error: ${code} ${message}`);
  }
}

async function main() {
  const owner = process.env.PROJECT_OWNER ?? 'prep-ink';
  const number = process.env.PROJECT_NUMBER ?? '2';
  const limit = Number(process.env.PROJECT_ITEM_LIMIT ?? '100');
  const projectName = process.env.PROJECT_NAME ?? `Project #${number}`;
  const projectUrl = process.env.PROJECT_URL ?? `https://github.com/orgs/${owner}/projects/${number}`;
  const timeZone = process.env.DIGEST_TIME_ZONE ?? 'Asia/Shanghai';
  const dryRun = process.env.DRY_RUN === 'true';
  const webhook = process.env.FEISHU_BOT_WEBHOOK;
  const signSecret = process.env.FEISHU_BOT_SECRET ?? '';

  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('PROJECT_ITEM_LIMIT must be an integer between 1 and 500.');
  }

  if (!dryRun && !webhook) {
    throw new Error('FEISHU_BOT_WEBHOOK is required unless DRY_RUN=true.');
  }

  const items = readProjectItems({ owner, number, limit });
  const digest = buildDigest({ items, projectName, projectUrl, timeZone });
  console.log(digest.text);

  if (dryRun) {
    console.log('\nDRY_RUN=true, skip Feishu webhook.');
    return;
  }

  await sendFeishu({
    webhook,
    payload: buildFeishuPayload(digest.text, { signSecret }),
  });
}

function section(title, items, today) {
  if (items.length === 0) {
    return `**${title}**\n- 暂无`;
  }

  return [`**${title}**`, ...items.map((item) => `- ${formatItem(item, today)}`)].join('\n');
}

function formatItem(item, today) {
  const ref = formatRef(item);
  const metadata = [
    item.status,
    item.targetDate ? `Target: ${item.targetDate}` : '',
    item.deliveryTier ? `Tier: ${item.deliveryTier}` : '',
    item.sprint,
  ].filter(Boolean);
  const risk = riskNote(item, today);
  return `${ref} ${item.title}${metadata.length > 0 ? `（${metadata.join(' / ')}）` : ''}${risk ? ` - ${risk}` : ''}`;
}

function formatRef(item) {
  const repoName = item.repository.split('/').at(-1) ?? item.repository;
  const label = item.number ? `${repoName}#${item.number}` : repoName;
  return item.url ? `[${label}](${item.url})` : label;
}

function formatStatusCounts(statusCounts) {
  return Object.entries(statusCounts)
    .sort(([a], [b]) => statusRank(a) - statusRank(b) || a.localeCompare(b))
    .map(([status, count]) => `${status}: ${count}`)
    .join(' / ');
}

function countByStatus(items) {
  const counts = {};
  for (const item of items) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  return counts;
}

function isFocusItem(item, today) {
  if (isDone(item)) return false;
  if (isBlocked(item) || needsHumanDecision(item) || isReviewItem(item)) return true;
  if (item.status === 'In Progress' || item.status === 'Review') return true;
  const diff = daysFromToday(item.targetDate, today);
  return item.deliveryTier === 'Core' && diff !== null && diff <= 2;
}

function isDone(item) {
  return item.status.toLowerCase() === 'done';
}

function isBlocked(item) {
  return item.status.toLowerCase() === 'blocked' || item.labels.includes('blocked');
}

function needsHumanDecision(item) {
  return item.labels.includes('needs-human') || item.status.toLowerCase().includes('human');
}

function isReviewItem(item) {
  return item.type === 'PullRequest' || item.status.toLowerCase() === 'review';
}

function isOverdue(item, today) {
  const diff = daysFromToday(item.targetDate, today);
  return diff !== null && diff < 0;
}

function riskNote(item, today) {
  if (isBlocked(item)) return 'blocked';
  if (needsHumanDecision(item)) return '需要负责人决策';
  const diff = daysFromToday(item.targetDate, today);
  if (diff === null) return '';
  if (diff < 0) return `已过期 ${Math.abs(diff)} 天`;
  if (diff === 0) return '今天到期';
  if (diff === 1) return '明天到期';
  return '';
}

function compareByRisk(a, b, today) {
  const aOverdue = daysFromToday(a.targetDate, today) ?? 9999;
  const bOverdue = daysFromToday(b.targetDate, today) ?? 9999;
  return aOverdue - bOverdue || compareByTargetDate(a, b);
}

function compareByTargetDate(a, b) {
  return (a.targetDate || '9999-12-31').localeCompare(b.targetDate || '9999-12-31');
}

function statusRank(status) {
  const index = STATUS_ORDER.indexOf(status);
  return index === -1 ? STATUS_ORDER.length : index;
}

function dateKeyInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function daysFromToday(targetDate, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
  const target = Date.parse(`${targetDate}T00:00:00.000Z`);
  const current = Date.parse(`${today}T00:00:00.000Z`);
  return Math.round((target - current) / 86_400_000);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
