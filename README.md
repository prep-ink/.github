# prep-ink/.github

This repository stores organization-level GitHub defaults for Prep Ink.

It currently provides:

- Organization profile content in `profile/README.md`.
- Default Issue templates in `.github/ISSUE_TEMPLATE/`.
- Default Pull Request template in `.github/pull_request_template.md`.

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
- Require the `light` check before merging。
- Require conversation resolution before merging.
- Include administrators.
- Disable force pushes and branch deletions.

For delivery workflow details, see the product handbook:

https://github.com/prep-ink/product/blob/master/docs/process/agile-development-handbook.md
