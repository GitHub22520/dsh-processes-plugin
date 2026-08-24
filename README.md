# dsh-processes-plugin

为 DSH 提供项目级、可跨会话复用的后台进程管理能力。插件将由 `pnpm dev`、开发服务器或测试服务启动的进程登记到当前工作区，模型可以通过 `process_*` 工具发现并复用已有进程，用户也可以在会话页的“进程”Tab 中查看和管理它们。

## 功能

- 以规范化后的工作区目录作为作用域，不同项目的进程记录相互隔离。
- 持久化保存进程记录到 `$DSH_HOME/processes.json`，DSH 重启后仍可查看历史记录。
- 支持启动、停止、重启、查看最近输出和移除进程记录。
- 同时提供模型工具、会话页 UI 和 `/processes` loopback RPC，三者共用同一份注册表。
- 捕获标准输出和标准错误，最多保留 64 KiB 的输出尾部用于查看。
- Windows 下自动兼容 `.cmd`/`.bat` 可执行文件，并支持带引号的命令参数。

## 项目结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | 宿主侧 `ctx.processes` 服务和进程注册表 |
| `tools.js` | 注册 `process_list`、`process_start`、`process_stop`、`process_restart`、`process_output`、`process_remove` |
| `rpc.js` | 为浏览器端提供 `/processes` loopback RPC |
| `src/client/index.tsx` | 会话页“进程”Tab 的 React 源码 |
| `lib/client.js` | 已构建的浏览器端产物 |
| `cordis.patch.yml` | 将宿主服务、工具和 RPC 插入 DSH 的组合包配置 |

## 环境要求

- Node.js 18 或更高版本
- pnpm
- 可运行的 DSH / deepseek-harness 环境

## 安装与构建

在插件目录安装依赖，并构建浏览器端产物：

```sh
pnpm install
npx tsdown
```

`npx tsdown` 会将 `src/client/index.tsx` 构建为 `lib/client.js`。宿主侧代码为 ESM，无需额外编译。

## 在 DSH 中使用

推荐使用 profile 安装插件：

```sh
dsh plugin --profile demo add D:\path\to\dsh-processes-plugin
dsh --profile demo
```

也可以在 `deepseek-harness` 仓库中直接通过 patch 运行源码：

```sh
pnpm dsh web --patch D:\path\to\dsh-processes-plugin\cordis.patch.yml
```

打开 DSH Web 界面后，在会话页选择“进程”Tab，即可：

1. 查看当前工作区的运行中、已完成、已停止和异常退出进程。
2. 新建后台进程（例如 `pnpm dev --port 8080`）。
3. 停止或重启进程。
4. 查看实时输出尾部并移除已停止的记录。

## 模型工具

插件会注册以下工具。除 `process_start` 外，其余工具的 `process_id` 均来自 `process_list`：

| 工具 | 说明 |
| --- | --- |
| `process_list` | 列出当前项目的后台进程 |
| `process_start` | 在项目作用域启动命令，可选名称和工作目录 |
| `process_stop` | 请求停止后台进程树 |
| `process_restart` | 使用原始命令重启进程 |
| `process_output` | 查看进程最近的输出尾部 |
| `process_remove` | 移除已停止、已完成或异常退出的记录 |

示例：模型先调用 `process_list` 检查服务是否已经运行；只有不存在可复用进程时，再调用 `process_start`。

## 数据与状态

默认数据文件为：

```text
~/.dsh/processes.json
```

可通过 `DSH_HOME` 指定 DSH 数据目录。工作区键会经过 `realpath` 规范化，并在 Windows 上统一为小写，因此同一项目通过符号链接访问时仍会尽量复用同一份记录。

进程状态包括：

- `running`：正在运行
- `stopping`：已请求停止，等待进程树退出
- `completed`：以退出码 0 正常结束
- `stopped`：由用户停止，或 DSH 重启后对遗留运行状态进行对账
- `failed`：以非零退出码或信号异常结束

停止中的进程不能直接移除，必须等待其进入终态后再执行 `process_remove`。

## 开发

修改客户端源码后重新构建：

```sh
npx tsdown
```

宿主插件入口和导出定义位于 `package.json`。如需调试进程管理逻辑，可重点查看 `index.js` 中的 `ProcessRegistry`，以及 `tools.js` 和 `rpc.js` 的调用边界。

## License

当前仓库未声明许可证。如需对外发布，请先补充合适的 `LICENSE` 文件。
