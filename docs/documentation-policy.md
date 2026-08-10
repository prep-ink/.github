# Prep Ink 文档组织规范

本规范是 `prep-ink` 组织级文档放置基线。目标是让人和 AI 在新增文档时有清晰归属，并让 CI 能拦住明显散落、重复或越界的文档。

## 组织级默认规则

- `README.md` 是入口索引，优先链接稳定文档，不沉淀大段事实副本。
- `AGENTS.md` 是仓库协作规则，说明 AI/工程师在该仓库内的执行边界。
- `ARCHITECTURE.md` 是该仓库长期稳定架构；没有稳定架构事实的仓库可以不设置。
- `BRIEF.md` 只属于产品事实来源仓库，普通业务仓库不得复制产品 brief。
- `PROGRESS.md` 记录可验证推进历史；不是第二份架构文档或产品路线图。
- `docs/**` 承载细节文档，文件名使用 `kebab-case.md`；目录内 `README.md` 可作为子索引。
- `docs/superpowers/**` 承载 agent 生成的 specs/plans，可作为执行过程资产；是否要求 README 索引由仓库配置决定。
- 除明确允许的根文件外，新增 Markdown 不应放在根目录或任意临时目录。

## README 索引边界

`README.md` 不是全量文档目录，只挂读者进入仓库时最需要的稳定入口：

- 仓库职责和当前状态。
- 根级稳定文档，例如 `ARCHITECTURE.md`、`BRIEF.md`、`PROGRESS.md`、`AGENTS.md`。
- 该仓库长期维护的 `docs/*.md` 主题文档。
- 少量有独立长期价值的子目录入口，例如 `komodo/bootstrap/README.md` 或 `docs/references/**/README.md`。
- 跨仓库事实来源的外部链接，例如 product PRD 或 brief。

`README.md` 不挂日常执行过程中高频生成的过程文档：

- `docs/superpowers/specs/**`
- `docs/superpowers/plans/**`
- 临时调研草稿、一次性执行记录、未批准 brainstorm

这类过程文档可以保留在允许目录中，但应通过子目录 README、日期排序或搜索访问；只有当某份过程文档升级为长期规范或稳定设计时，才应迁出过程目录并进入 README 索引。

## 跨仓库归属

- `product`：产品定位、能力边界、已批准 PRD、交付计划、路线图、产品发现、品牌命名和跨仓库产品背景。
- `infra`：Komodo、Compose/Swarm、Terraform、Ansible、入口层、非密环境声明、镜像 tag、运维 runbook 和生产部署事实。
- `backend`：API、Worker、Agents、数据模型、合约、服务边界、迁移、镜像构建和后端运行说明。
- `spa`：机构用户后台的页面、状态、前端流程、API contract 消费和验收边界。
- `admin`：内部运营后台的权限、页面、操作流程、审计、安全和后端集成边界。
- `landing`：官网/营销站点的信息架构、内容边界、SEO、转化路径、视觉和鉴权交接。
- `.github`：组织级 Issue/PR 模板、reusable workflow、检查脚本和协作规范。
- `skills`：组织级 agent skill 源码与引用资料；该仓库的文档结构单独定义，不默认套用业务仓库规则。

## 仓库级微调

每个仓库通过根目录 `.docs-policy.json` 声明自己的允许范围：

```json
{
  "extends": "prep-ink/documentation-policy@1",
  "allowedMarkdownPaths": ["README.md", "AGENTS.md", "ARCHITECTURE.md", "docs/**"],
  "readmeAllowedLocalLinkPaths": ["ARCHITECTURE.md", "AGENTS.md", "docs/*.md"],
  "indexFiles": ["README.md"],
  "requireIndexedDocs": true,
  "unindexedAllowedPaths": ["docs/superpowers/**"],
  "enforceKebabCaseDocs": true,
  "forbiddenPathTerms": ["prd", "roadmap", "product-discovery", "brand-naming", "epic"]
}
```

仓库可以加严规则，例如新增必需索引文件或禁止更多路径词；放宽组织边界前应先讨论，因为放宽通常意味着文档事实来源不清晰。

## CI Enforcement

组织级 reusable workflow 位于 `.github/workflows/docs-policy.yml`。业务仓库通过本地 workflow 调用它，并在 CI 中执行：

```yaml
jobs:
  docs-policy:
    uses: prep-ink/.github/.github/workflows/docs-policy.yml@main
```

本地验证时，在目标仓库根目录运行：

```bash
node ../.github/.github/scripts/docs-policy-check.mjs
```

该 check 当前拦截四类硬问题：

- Markdown 文件出现在仓库配置未允许的位置。
- `docs/**` 文件没有被配置的索引文件链接，除非仓库显式豁免。
- `docs/**` 文件名不是 `kebab-case.md` 或目录 `README.md`。
- `README.md` 链接了仓库配置未允许的本地过程文档。
- 当前仓库禁止承载的文档类型词出现在 Markdown 路径中。
