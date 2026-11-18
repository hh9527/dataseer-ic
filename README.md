# dataseer-ic

伞仓库（umbrella）：把编译器、领域模型、引擎插件和考卷体系组装成一套可部署、可考核的问数产品。三个引擎仓以 git submodule 引入，互不引用；本仓只做构建、部署与本机运行编排。

## 目录

| 路径 | 内容 |
|---|---|
| `vendors/telora` | 编译器（Rust），把领域模型编成 wasm |
| `vendors/lab-ontology` | IC 领域模型定义，产物 `dist/ic-model.wasm` |
| `vendors/dari` | 引擎与 DSH 插件（`packages/dsh/*` 发布插件制品） |
| `runtime/` | DSH 运行时版本锁定（`pnpm-lock.yaml`）与本地补丁 |
| `exam/` | 考卷体系：题目、开场白、考官须知 |
| `scripts/` | 考官工具 `exam.mjs`、`run-tester.mjs`、`capture-token.mjs` |
| `tests/` | 安装流程的隔离测试 |
| `.deploy/` | 部署与跑批产物（不入库） |

## 依赖

- Node.js 22+
- pnpm（构建插件与安装运行时）
- Rust / cargo（仅构建 telora 时需要）
- watchexec（`just run` 的自动重启）
- just（命令入口）

首次克隆后拉取子模块：

```sh
git submodule update --init --recursive
```

## 快速开始

**端口没有默认值，每条命令都要显式给出**，例如 `just run 10924`。

```sh
just build                 # 构建插件发布目录 vendors/dari/dist
just model                 # 用 vendors/telora 的编译器编 IC 模型
just deploy 10924 <模型> <数据文件>   # 准备部署（不启动服务）
just run 10924             # 前台启动 dsh web，并把一次性 token 写进 .deploy/10924/dsh/token
just run-tester 10924      # 另开终端：跟着 token 起考官服务
```

`deploy` 的模型参数留空时用伞内构建的 `vendors/lab-ontology/dist/ic-model.wasm`；数据文件留空时不写 `demo-ws/dari.json`，工作区就是个空配置。部署产物在 `.deploy/<port>/dsh`，服务由生成的 `run.sh` 启动，`touch .deploy/<port>/dsh/.ctrl` 可重启。

## 考核

题目一题一份，见 `exam/questions/T1001.md`–`T1018.md`；考官的职责、流程、澄清规则与记录表见 `exam/考官须知.md`。

```sh
just list                                  # 题号 / 类型 / 难度 / 追问步数 / 标题
just new-session 10924 --clear             # 新建会话并清空考生工作区
just ask 10924 --opening                   # 发定稿开场白
just ask 10924 --question T1001.md         # 发题面（自动加「任务 T1001：」）
just ask 10924 --question T1016.md --step 2   # 递进题的第二步追问
just submit 10924 --select "1;2"           # 澄清；多问题按分号分段
just wait 10924                            # 上一轮没结束，继续等
```

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

三个子模块都跟踪 `main`。更新：

```sh
git submodule update --remote --merge
git add vendors && git commit -m "chore: 同步子模块"
```

`just model` 会先用 `vendors/telora` 重新编编译器，再编模型，保证编译器与插件运行时 ABI 一致；不要用系统里其它版本的 telora 编产物。
