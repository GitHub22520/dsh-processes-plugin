/**
 * 模型工具 `process_*`：让模型发现并复用当前项目里已经运行的进程，而不是重建。
 * 作用域 = 当前会话 header.cwd 所属工作区，与 UI tab 的 RPC 数据同一份注册表。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-tool-processes'
export const inject = ['processes', 'tools']

function scopeCwd(exec) {
  return exec.agent?.session?.header?.cwd ?? process.cwd()
}

function format(proc) {
  const state = {
    running: '运行中',
    stopping: '停止中',
    stopped: '已停止',
    completed: '已完成',
    failed: '异常退出',
  }[proc.status] ?? proc.status
  const when = proc.startedAt ? new Date(proc.startedAt).toISOString() : '—'
  const exit = proc.exitCode == null ? '' : `，exit=${proc.exitCode}`
  return `- ${proc.name}（${proc.id.slice(0, 8)}）[${state}] pid=${proc.pid ?? '—'} 启动于 ${when}${exit}\n  命令：${proc.command}\n  目录：${proc.cwd}`
}

export function apply(ctx) {
  const processes = ctx.processes
  const textOut = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }

  ctx.tools.register(defineTool({
    name: 'process_list',
    description: 'List background processes of the current project (workspace). Shows running, completed, stopped, and failed ones; reuse an already-running one instead of starting it again.',
    parameters: {},
    output: textOut,
    async execute(_args, exec) {
      const list = await processes.list(scopeCwd(exec))
      if (!list.length) return '（当前项目暂无后台进程）'
      return list.map(format).join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'process_start',
    description: 'Start a command as a project-scoped background process (e.g. "pnpm dev"). It keeps running and is discoverable across conversations in the same project.',
    parameters: {
      command: { type: 'string', required: true, description: 'Shell command line to run, e.g. "pnpm dev".' },
      name: { type: 'string', description: 'Optional short display name; defaults to the program name.' },
      cwd: { type: 'string', description: 'Optional working directory; defaults to the current project root.' },
    },
    output: textOut,
    async execute({ command, name, cwd }, exec) {
      const proc = await processes.start(cwd ?? scopeCwd(exec), { name, command })
      return `已启动进程 ${proc.name}（${proc.id.slice(0, 8)}，pid=${proc.pid}）\n命令：${proc.command}`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'process_stop',
    description: 'Stop a running background process in the current project.',
    parameters: {
      process_id: { type: 'string', required: true, description: 'The process id from process_list.' },
    },
    output: textOut,
    async execute({ process_id }, _exec) {
      const proc = await processes.stop(process_id)
      return `已请求停止 ${proc.name}（状态：${proc.status}）`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'process_restart',
    description: 'Restart a background process in the current project with its original command.',
    parameters: {
      process_id: { type: 'string', required: true, description: 'The process id from process_list.' },
    },
    output: textOut,
    async execute({ process_id }, _exec) {
      const proc = await processes.restart(process_id)
      return `已重启进程 ${proc.name}（${proc.id.slice(0, 8)}，pid=${proc.pid}）`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'process_output',
    description: 'Read the recent output tail of a background process in the current project.',
    parameters: {
      process_id: { type: 'string', required: true, description: 'The process id from process_list.' },
    },
    output: textOut,
    async execute({ process_id }, _exec) {
      return await processes.output(process_id)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'process_remove',
    description: 'Remove a stopped background process record from the current project.',
    parameters: {
      process_id: { type: 'string', required: true, description: 'The process id from process_list.' },
    },
    output: textOut,
    async execute({ process_id }, _exec) {
      await processes.remove(process_id)
      return `已移除进程记录 ${process_id}`
    },
  }))
}
