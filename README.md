# dataseer-ic

伞仓库（umbrella）：把编译器、领域模型、引擎插件和考卷体系组装成一套可部署、可考核的问数产品。编译器、模型、引擎与测评仓库以 git submodule 引入，互不引用；本仓只做构建、部署与本机运行编排。

## 目录

| 路径 | 内容 |
|---|---|
| `vendors/telora` | 编译器（Rust），把领域模型编成 wasm |
| `vendors/lab-ontology` | IC 领域模型定义，产物 `dist/ic-model.wasm` |
| `vendors/dari` | 引擎与 DSH 插件（`packages/dsh/*` 发布插件制品） |
| `runtime/` | DSH 运行时版本锁定（`pnpm-lock.yaml`）与本地补丁 |
| `exam/` | 测评子模块：题目、考官方法、工具、IC 数据生成与覆盖检查 |
| `scripts/` | token 捕获与编辑器启动脚本 |
| `tests/` | 安装和测评命令转调的隔离测试 |
| `.deploy/` | 部署与跑批产物（不入库） |

`runtime/` 是安装输入：`install-profile` 将其中的依赖声明、锁文件和补丁复制到部署目录，使用 `--frozen-lockfile` 安装 DSH 运行时。

## 快速开始

安装 Git 和 mise，然后克隆仓库并安装项目固定版本的工具链。

```sh
git clone --recurse-submodules https://github.com/hh9527/dataseer-ic.git
cd dataseer-ic
mise trust
mise install
```

已有工作副本可用 `git submodule update --init --recursive` 补齐子模块。工具版本见 [mise.toml](mise.toml)。

```sh
mise exec -- just build-model
mise exec -- just deploy 10924
mise exec -- just run 10924
```

`just deploy` 会构建插件并准备独立工作区。`just run` 会在前台启动 DSH Web，打开终端打印的访问地址即可体验问数。部署和运行命令需显式指定端口，示例使用 `10924`。如需重启正在运行的服务，执行 `touch .deploy/10924/dsh/.ctrl`。

`just deploy 10924` 会在该端口缺少数据库时调用 `just generate-data 10924`。数据库和元数据分别保存在 `.deploy/10924/dsh/db.sqlite` 和 `.deploy/10924/dsh/db.sqlite.json`。后续部署校验 SHA-256 并复用该端口的数据。主动执行 `just generate-data 10924` 会刷新该端口的数据和 UTC 截至时刻。可通过 `just deploy 10924 <模型> <数据库>` 指定其他来源，数据库旁须有同名的 `.json` 元数据文件。

## 考核

另开终端，在仓库根目录运行 `mise exec -- just run-tester 10924` 启动考官服务。下列命令可在已激活 mise 的终端执行，也可加上 `mise exec --` 前缀。

题库在独立的 `exam` 子模块中维护，本仓的考官命令统一转调 `exam/justfile`，并显式传入伞仓的部署根目录。题目一题一份，原有分析卷在 `exam/questions/T1/`，扩展卷在 `A1`–`C1` 子目录；考官的职责、流程、澄清规则与记录表见 `exam/考官须知.md`。

```sh
just list                                  # 题号 / 类型 / 难度 / 追问步数 / 标题
just new-session 10924 --clear             # 新建会话并清空考生工作区
just ask 10924 --opening                   # 发定稿开场白
just ask 10924 --question T1-001             # 发题面（自动加「任务 T1-001：」）
just ask 10924 --question T1-016 --step 2   # 递进题的第二步追问
just submit 10924 --select "1;2"           # 澄清；多问题按分号分段
just wait 10924                            # 上一轮没结束，继续等
```

配套数据由测评子模块生成，读取选定模型版本发布的 JSON 契约：

```sh
just generate-data 10924 --anchor-utc 2026-11-25T02:44:00Z
```

生成器在发布前执行逐题数据覆盖检查；固定日期题需选择覆盖题面的窗口。题目、场景与工具的维护说明见 [测评仓库](exam/README.md)，抽取来源与边界见 [迁移记录](exam/MIGRATION.md)。数据库、轨迹和测评记录放在 `.deploy/` 或外部目录，不进入 submodule。

## 编辑器（LSP）

`.dari` 的补全、诊断与定义跳转由 `scripts/dari-lsp.sh` 提供。Helix 的 `~/.config/helix/languages.toml` 指向它即可：

```toml
[language-server.dari]
command = "/absolute/path/to/dataseer-ic/scripts/dari-lsp.sh"

[[language]]
name = "dari"
file-types = ["dari"]
roots = ["dari.json", "package.json", ".git"]
language-servers = ["dari"]
grammar = "dari"
```

LSP 以打开的文件为准，向上找到最近的 `dari.json` 作为工作区，读其中的 `model`；`DARI_LSP_ROOT` 可强制指定工作区。`DARI_LSP_MODEL` 可强制指定模型，`DARI_LSP_DEPLOY` 可指定运行时所在的部署；工作区在 `.deploy/<端口>/dsh/demo-ws` 下时自动用同一个部署的运行时。模型缺失时 LSP 仍会启动，模型相关检查退化为 `model-unavailable` 诊断。

## 目录约定

```text
.deploy/<port>/dsh/       部署与运行状态：DSH_HOME、demo-ws 工作区、run.sh、token
.deploy/<port>/tester/    考官服务状态：state.json、exam.port、exam.pid、.ctrl
.deploy/runs/             跑批记录（每轮一份 markdown）
```

`.deploy/` 整体被 `.gitignore` 排除，跑批记录也不入库。

## 环境变量

| 变量 | 作用 |
|---|---|
| `DEPLOY_ROOT` | 部署根目录，默认 `$PWD/.deploy` |
| `DARI_DOMAIN` | 领域标识，默认 `ic`，写进 `dari.json` |
| `DARI_REPO` | 插件来源仓库，默认 `vendors/dari` |
| `TELORA_BIN` | 编译模型用的 telora，伞内固定用 `vendors/telora/target/release/telora` |
| `DSH_CMD` | 覆盖启动 dsh 的命令，默认用 `runtime/` 里锁定的版本 |

## 子模块

子模块通过父仓库 gitlink 固定提交。首次获取和复现当前版本：

```sh
git submodule update --init --recursive
```

升级时在子模块的工作分支完成改动与验收，经授权提交后，再在父仓更新对应 gitlink。`exam` 的题目、数据生成与模型契约需要联合核对。

`just build-model` 会先用 `vendors/telora` 重新编编译器，再编模型，保证编译器与插件运行时 ABI 一致；不要用系统里其它版本的 telora 编产物。
