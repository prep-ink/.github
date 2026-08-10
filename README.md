# prep-ink/.github

This repository stores organization-level GitHub defaults for Prep Ink.

It currently provides:

- Organization profile content in `profile/README.md`.
- Default Issue templates in `.github/ISSUE_TEMPLATE/`.
- Default Pull Request template in `.github/pull_request_template.md`.
- Documentation placement policy in `docs/documentation-policy.md`.
- Daily GitHub Project digest workflow in `.github/workflows/daily-project-digest.yml`.

## Organization Contribution Rules

这些规则是 `prep-ink` 组织内各仓库的默认协作基线；单仓库如需更严格规则，应在本仓库默认规则基础上加严，而不是放宽。

- `main` 是受保护主干，所有交付默认通过 Pull Request 合入。
- PR 合并前必须先对齐最新 `main`。如果 GitHub 显示分支落后或存在冲突，先 update branch、merge `main` 或 rebase 到 `origin/main`，再重新验证。
- 所有仓库必须提供名为 `light` 的 GitHub Actions check；组织级 ruleset 会把 `light` 作为合并 `main` 前的 required check。
- PR 描述必须使用组织默认模板，写清楚 Context、Changes、Verification、Risk 和 Reviewer 关注点。
- 合并前必须解决所有 review conversation。
- 禁止强推或删除受保护 `main` 分支。
- 管理员同样遵守主干保护规则，除非出现明确的紧急生产修复并在事后补 PR 记录。

## Main Branch Protection

当前 `prep-ink` 组织仓库的 `main` 分支保护基线：

- Require a pull request before merging.
- Require status checks to pass before merging，并启用 `strict`，确保 PR 分支必须先与 `main` 对齐。
- Require the `light` check before merging.
- Require conversation resolution before merging.
- Include administrators.
- Disable force pushes and branch deletions.

## Daily Project Digest

`.github/workflows/daily-project-digest.yml` 每天北京时间 09:00 读取 `prep-ink` 组织 Project #2「品墨产品交付看板」，按 GitHub Projects / Issues / PRs 事实汇总：

- 今日应推进
- 风险 / 阻塞
- 需要人工决策
- Review 中

需要在本仓库配置以下 GitHub Actions secrets：

- `FEISHU_BOT_WEBHOOK`：飞书群自定义机器人 webhook。未配置时 workflow 仍会生成日报日志，但会跳过飞书发送。
- `FEISHU_BOT_SECRET`：可选；如果飞书机器人启用了签名校验，则配置该 secret。
- `GH_PROJECT_TOKEN`：可选但建议配置；用于读取组织 Project、私有仓库 Issue 和 PR 的 GitHub token，建议具备 `repo`、`read:org`、`project` scope。未配置时 workflow 会先使用默认 `github.token` 尝试读取；如果 GitHub Actions 报 Project 或私有仓库权限不足，再补充这个 secret。

可选配置为 GitHub Actions repository variables；不配置时使用当前默认值：

- `PROJECT_OWNER`：默认 `prep-ink`
- `PROJECT_NUMBER`：默认 `2`
- `PROJECT_NAME`：默认 `品墨产品交付看板`
- `PROJECT_URL`：默认 `https://github.com/orgs/prep-ink/projects/2`
- `PROJECT_ITEM_LIMIT`：默认 `100`

手动验证时，可在 Actions 页面运行 `Daily Project Digest`，并选择 `dry_run=true`。这会读取 Project 并输出日报日志，但不会发送飞书。未配置 `FEISHU_BOT_WEBHOOK` 时，定时运行也会自动按 dry run 处理。

For delivery workflow details, see the product handbook:

https://github.com/prep-ink/product/blob/master/docs/process/agile-development-handbook.md
