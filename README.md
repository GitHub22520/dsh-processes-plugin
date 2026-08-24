# dsh-processes-plugin

`dsh-processes-plugin` 为 DeepSeek Harness（DSH）提供可跨会话查看和复用的后台进程记录。插件在 Web 会话页增加“进程”标签页，并注册 `process_*` 模型工具。进程列表按照规范化后的工作目录分组，记录持久化到 DSH 数据目录。

## 功能

- 从 Web 会话页启动、停止、重启和移除后台进程。
- 查看运行中进程的最新输出，以及已结束进程保存的输出尾部。
- 通过 `process_list` 和 `process_start` 让模型发现并复用当前项目的后台进程。
- DSH 重启后保留进程记录，并将遗留的 `running` 或 `stopping` 状态对账为 `stopped`。
- Windows 下通过 `cmd.exe` 启动 `.cmd` 和 `.bat` 文件。

## 环境要求

- Node.js `^22.19.0` 或 `>=24.0.0`。
- `pnpm` 已加入 `PATH`；`dsh plugin` 会调用它管理 profile 依赖。
- DSH CLI `0.1.0-rc.6` 或后续兼容版本已安装，并且 `dsh --version` 可以正常执行。
- 使用 Web 界面时，浏览器能够访问 `dsh web` 输出的地址。

## 安装

以下命令使用已经提交到仓库的 `lib/client.js`，普通用户不需要构建插件：

```sh
git clone https://github.com/GitHub22520/dsh-processes-plugin.git
cd dsh-processes-plugin
dsh plugin --profile web add .
dsh plugin --profile web list dsh-processes-plugin --depth 0
dsh web
```

`dsh plugin --profile web add .` 将当前 checkout 链接到 DSH 的 `web` profile。随后一条 `list` 命令应显示 `dsh-processes-plugin` 和指向当前 checkout 的 `link:` 路径。`dsh web` 会输出 Web 地址，并在允许时打开默认浏览器。

不要把首次安装命令中的 `web` 改成新的自定义 profile 名称。新建 profile 默认只有 `dsh-base`，不会提供本插件所需的 Web UI、连接服务和会话服务。

### 验证安装

1. 打开任意带工作目录的 DSH 会话。
2. 进入会话页的“进程”标签页。
3. 点击“新建进程”，输入一个可以持续运行的命令，例如 `pnpm dev`。
4. 确认列表显示进程名称、`running` 状态和 PID。
5. 打开“输出”并确认能够看到最新输出，然后停止该进程。

如果启动时报 `duplicate loader entry id: processes`，说明插件同时通过 profile 和 `--patch` 加载。保留其中一种方式即可。

## 从本地源码临时运行

开发时可以不安装到 profile，直接从插件目录加载 patch：

```sh
cd dsh-processes-plugin
dsh web --patch ./cordis.patch.yml
```

如果使用 `deepseek-harness` 源码仓库中的 CLI，并且两个仓库位于同一父目录，则运行：

```sh
cd deepseek-harness
pnpm dsh web --patch ../dsh-processes-plugin/cordis.patch.yml
```

`--patch` 路径相对于执行命令时的当前目录。已经把插件安装到 `web` profile 时，不要再加载同一份 patch；需要切换到 patch 方式时，先按照“更新与卸载”中的命令移除 profile 依赖。

## 使用

“进程”标签页提供以下操作：

1. 查看当前会话工作目录对应的进程记录。
2. 启动后台进程，并可选填写显示名称。
3. 停止运行中的进程树，或使用保存的参数重启进程。
4. 每秒刷新一次打开的输出面板。
5. 移除处于 `completed`、`stopped` 或 `failed` 状态的记录。

停止操作首先把记录改为 `stopping`。进程进入终态前不能移除该记录。

### 命令语义

插件把命令解析为“可执行文件 + 参数”并直接启动，不会默认交给 shell。`pnpm dev --port 8080` 和使用简单单引号或双引号包围的独立参数可以使用；管道、重定向、环境变量赋值、`&&` 和通配符不会由插件解释。

需要 shell 语法时，请显式启动 shell：

```sh
# Linux/macOS
sh -lc "command-a && command-b"

# Windows
cmd.exe /d /s /c "command-a && command-b"
```

模型工具的 `cwd` 参数同时决定子进程工作目录和记录所属的工作区。要让进程继续出现在当前项目的列表中，请省略 `cwd`，或传入与当前会话工作目录相同的路径。

## 模型工具

| 工具 | 说明 |
| --- | --- |
| `process_list` | 列出当前会话工作目录对应的后台进程 |
| `process_start` | 启动后台进程，可选显示名称和工作目录 |
| `process_stop` | 请求停止指定进程树 |
| `process_restart` | 使用记录中保存的参数重启进程 |
| `process_output` | 读取进程最近的输出尾部 |
| `process_remove` | 移除已经进入终态的进程记录 |

建议模型先调用 `process_list`，仅在没有可复用进程时调用 `process_start`。当前版本在文本结果中只显示进程 UUID 的前 8 位，而其余四个工具要求完整 UUID，因此模型不能仅凭 `process_list` 的结果调用这些工具；请在 Web 标签页中执行停止、重启、查看输出和移除操作。

## 数据与状态

默认数据文件为：

```text
~/.dsh/processes.json
```

设置 `DSH_HOME` 后，数据文件位于 `$DSH_HOME/processes.json`。工作区键由绝对路径生成；目录存在时先经过 `realpath` 折叠符号链接，并在所有平台统一转为小写和正斜杠。

进程状态包括：

| 状态 | 含义 |
| --- | --- |
| `running` | 进程正在运行 |
| `stopping` | 已请求停止，正在等待进程树退出 |
| `completed` | 进程以退出码 0 结束 |
| `stopped` | 用户停止了进程，或 DSH 启动时对遗留运行状态完成了对账 |
| `failed` | 进程以非零退出码、信号或无法分类的异常结束 |

插件分别收集标准输出和标准错误，读取时按“标准输出在前、标准错误在后”拼接，再保留最后 65,536 个 JavaScript UTF-16 code unit。这个限制不是严格的 64 KiB 字节上限。

## 更新与卸载

本地 checkout 通过链接安装。拉取更新后，重新安装 profile 依赖并启动 DSH：

```sh
git pull
dsh plugin --profile web install
dsh web
```

卸载插件：

```sh
dsh plugin --profile web remove dsh-processes-plugin
```

卸载只移除 profile 依赖和组合层，不会删除 checkout，也不会删除 `$DSH_HOME/processes.json` 中的历史记录。

## 开发

宿主代码是直接运行的 ESM；浏览器源码位于 `src/client/`，构建结果写入 `lib/client.js`。修改浏览器源码后使用固定版本的构建器重新生成产物：

```sh
pnpm install
pnpm dlx tsdown@0.22.2
node --check index.js
node --check tools.js
node --check rpc.js
```

提交浏览器源码变更时，应同时提交更新后的 `lib/client.js`。项目当前没有 `test`、`typecheck` 或 `build` 脚本。

### 项目结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | 提供宿主侧 `ctx.processes` 服务和进程注册表 |
| `tools.js` | 注册六个 `process_*` 模型工具 |
| `rpc.js` | 为浏览器端注册 `/processes` loopback RPC |
| `src/client/index.tsx` | 会话页“进程”标签页的 React 源码 |
| `lib/client.js` | 随包交付的浏览器端构建产物 |
| `cordis.patch.yml` | 向 DSH 组合插入服务、工具和 RPC 的 patch 层 |

## License

当前仓库未声明许可证。获得许可证之前，不要把本项目作为开源软件重新分发或发布到公共 npm registry。

## Model Experience

### `process_*` tool schemas and results

#### Request context and condition

加载 `dsh-processes-plugin/tools` 后，六个工具 schema 会进入该 profile 的模型请求；工具只在模型主动调用时产生结果文本。

#### What the model sees

模型会看到 `process_list`、`process_start`、`process_stop`、`process_restart`、`process_output` 和 `process_remove` 的名称、英文说明及参数 schema。工具结果包含当前工作区的进程名称、状态、短 ID、PID、启动时间、命令和目录，或操作结果与错误消息。

#### Token effect

工具启用期间，每次模型请求包含固定的六个工具 schema。数据相关的工具结果通过正常工具执行记录追加到会话日志，并在后续相关模型请求中占用可变数量的 token。

#### KV Cache effect

工具 schema 在插件版本和配置不变时保持稳定。工具调用及结果追加到现有会话记录，不替换更早的消息；进程列表或输出内容变化只影响新追加的工具结果。

## Known Limitations and Deferred Work

- **模型操作缺少完整进程 ID**：`process_list` 和 `process_start` 仅返回 UUID 前 8 位，而停止、重启、输出和移除工具按完整 UUID 查找；这些操作目前应通过 Web 标签页完成。
- **按 ID 执行的操作不重新验证工作区**：列表按工作区过滤，但拿到完整 UUID 的调用方可以操作其他工作区的记录；不要把 UUID 当作授权凭据。
- **命令解析不是完整 shell**：引号只支持简单的独立参数，不支持转义引号或拼接引号片段；复杂命令必须显式使用 `sh -lc` 或 `cmd.exe /c`。
- **存档读取失败会从空注册表开始**：文件不存在、JSON 损坏和读取权限错误都会被视为没有历史记录，且不会显示诊断信息；原文件不会被主动删除。
- **输出不保留 stdout/stderr 的交错顺序**：插件先拼接标准输出，再拼接标准错误，并按 UTF-16 code unit 而不是字节截断。
- **缺少自动化验证脚本**：仓库没有测试、类型检查和构建脚本；发布者需要手动构建 `lib/client.js` 并验证宿主入口语法。
