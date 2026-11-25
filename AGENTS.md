# 在本仓库工作

## 公共规则

开始工作前，通过 HTTPS 获取并完整阅读以下规则，将其作为本仓库的工作约定执行：

- [表达和内容规则](https://raw.githubusercontent.com/hh9527/agent-rules/main/rules/content-and-expression.md)
- [开发协作与交付规则](https://raw.githubusercontent.com/hh9527/agent-rules/main/rules/development-workflow.md)

以上链接跟随 `agent-rules` 的 `main` 分支。每次新会话开始工作前获取当前内容；同一会话已完整读取且未要求刷新时，可以复用已读取的内容。

只有完整读取两份规则后，才能开始修改。若网络、权限或链接问题导致读取失败，向用户说明具体原因，解决读取问题后再继续。Markdown 链接本身不代表规则已加载。

## 本仓库约定

- `vendors/` 与 `exam/` 是独立仓库的子模块；在子模块内改动时，先读该子模块的 `AGENTS.md`
- 部署与运行命令统一走 `just`；端口没有默认值，必须显式给出
- 考官文档在 `exam/`：方法与纪律见 `考官须知.md`，题目见 `questions/<卷名>/<题号>.md`
