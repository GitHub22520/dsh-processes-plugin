/**
 * 项目级持久化后台进程注册表（`ctx.processes`）。
 *
 * 进程记录按「工作区 = 规范化后的 cwd」分组落盘到 `$DSH_HOME/processes.json`，
 * 跨会话、跨 dsh 重启可见。运行中的真身在 `ctx.subprocess.spawn` 的进程树里，
 * 停止/重启走整树 terminate；dsh 重启后上次遗留的 running/stopping 一律对账为「已停止」。
 */
import { Service } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

const HOME = process.env.DSH_HOME ?? path.join(homedir(), '.dsh')
const STORE_FILE = path.join(HOME, 'processes.json')
const COLLECT_BYTES = 256 * 1024
const TAIL_BYTES = 64 * 1024

/**
 * 规范化工作区键：`fs.realpath`（与 workspaceRegistry 的 canonical path 对齐，
 * 折叠符号链接）+ Windows 大小写折叠；目录暂不可实时回退到 `path.resolve`。
 */
async function workspaceKey(cwd) {
  const dir = path.resolve(cwd || process.cwd())
  try {
    const real = await realpath(dir)
    return real.replace(/\\/g, '/').toLowerCase()
  } catch {
    return dir.replace(/\\/g, '/').toLowerCase()
  }
}

/** 引号感知的命令分词：`pnpm dev --port 8080` → ['pnpm','dev','--port','8080'] */
function splitCommand(command) {
  const tokens = []
  const length = command.length
  let i = 0
  while (i < length) {
    while (i < length && /\s/.test(command[i])) i += 1
    if (i >= length) break
    const ch = command[i]
    if (ch === '"' || ch === "'") {
      const quote = ch
      i += 1
      let part = ''
      while (i < length && command[i] !== quote) {
        part += command[i]
        i += 1
      }
      if (i >= length) throw new Error(`未闭合的引号: ${command}`)
      i += 1
      tokens.push(part)
    } else {
      let part = ''
      while (i < length && !/\s/.test(command[i])) {
        part += command[i]
        i += 1
      }
      tokens.push(part)
    }
  }
  return tokens
}

function tail(text, max) {
  if (text.length <= max) return text
  return text.slice(text.length - max)
}

function spawnArgv(executable, args) {
  if (process.platform !== 'win32') return [executable, ...args]
  const extension = path.extname(executable).toLowerCase()
  if (extension !== '.cmd' && extension !== '.bat') return [executable, ...args]
  return [process.env.ComSpec ?? 'cmd.exe', '/d', '/s', '/c', 'call', executable, ...args]
}

export class ProcessRegistry extends Service {
  static inject = ['subprocess']

  constructor(ctx) {
    super(ctx, 'processes')
    this.subprocess = ctx.subprocess
    this.records = new Map() // workspaceKey -> Map<id, record>
    this.live = new Map() // id -> { handle, record, stoppedByUser }
    this.loaded = false
  }

  async ensureLoaded() {
    if (this.loaded) return
    this.loaded = true
    let migrated = false
    try {
      const raw = JSON.parse(await readFile(STORE_FILE, 'utf8'))
      for (const [ws, list] of Object.entries(raw)) {
        const all = new Map()
        for (const rec of list) {
          if (rec.status === 'stopped' && rec.exitCode === 0 && rec.detail === 'exit code: 0') {
            rec.status = 'completed'
            migrated = true
          }
          if (rec.status === 'running' || rec.status === 'stopping') {
            rec.status = 'stopped'
            rec.detail = 'dsh 重启后对账为已停止'
            rec.finishedAt = rec.finishedAt ?? Date.now()
          }
          all.set(rec.id, rec)
        }
        this.records.set(ws, all)
      }
      if (migrated) await this.save()
    } catch {
      // 尚无存档或不可读：从空开始。
    }
  }

  async save() {
    const dump = {}
    for (const [ws, all] of this.records) dump[ws] = [...all.values()]
    await mkdir(HOME, { recursive: true })
    await writeFile(STORE_FILE, JSON.stringify(dump, null, 2))
  }

  async mapFor(cwd) {
    await this.ensureLoaded()
    const ws = await workspaceKey(cwd)
    let all = this.records.get(ws)
    if (!all) {
      all = new Map()
      this.records.set(ws, all)
    }
    return all
  }

  find(id) {
    for (const all of this.records.values()) {
      if (all.has(id)) return all.get(id)
    }
    return undefined
  }

  publicView(rec) {
    return {
      id: rec.id,
      name: rec.name,
      command: rec.command,
      status: rec.status,
      pid: rec.pid,
      cwd: rec.cwd,
      startedAt: rec.startedAt,
      finishedAt: rec.finishedAt,
      exitCode: rec.exitCode,
      detail: rec.detail,
      outputTail: rec.outputTail,
    }
  }

  async list(cwd) {
    const all = await this.mapFor(cwd)
    const items = [...all.values()].map((rec) => this.publicView(rec))
    items.sort((a, b) => {
      const liveA = a.status === 'running' || a.status === 'stopping' ? 0 : 1
      const liveB = b.status === 'running' || b.status === 'stopping' ? 0 : 1
      if (liveA !== liveB) return liveA - liveB
      return (b.startedAt ?? 0) - (a.startedAt ?? 0)
    })
    return items
  }

  async start(cwd, { name, command }) {
    const argv = splitCommand(command)
    if (argv.length === 0) throw new Error('命令不能为空')
    const exe = await this.subprocess.resolveExecutable(argv[0])
    const resolvedArgv = spawnArgv(exe, argv.slice(1))
    const all = await this.mapFor(cwd)
    const id = randomUUID()
    const rec = {
      id,
      name: name && name.trim() ? name.trim() : argv[0],
      command,
      argv: resolvedArgv,
      cwd: path.resolve(cwd || process.cwd()),
      status: 'running',
      pid: undefined,
      startedAt: Date.now(),
      finishedAt: undefined,
      exitCode: undefined,
      detail: undefined,
      outputTail: '',
    }
    const handle = this.subprocess.spawn({
      argv: resolvedArgv,
      cwd: rec.cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: COLLECT_BYTES },
        stderr: { maxBytes: COLLECT_BYTES },
      },
      graceMs: 5000,
    })
    rec.pid = handle.pid
    all.set(id, rec)
    const entry = { handle, record: rec, stoppedByUser: false }
    this.live.set(id, entry)
    handle.done.then(
      (outcome) => this.settle(entry, outcome),
      () => this.settle(entry, { exitCode: null, signal: null }),
    )
    await this.save()
    return this.publicView(rec)
  }

  async settle(entry, outcome) {
    const rec = entry.record
    if (this.live.get(rec.id) !== entry) return
    rec.status = entry.stoppedByUser
      ? 'stopped'
      : outcome.exitCode === 0 ? 'completed' : 'failed'
    rec.finishedAt = Date.now()
    rec.exitCode = outcome.exitCode ?? null
    rec.detail = outcome.signal ? `signal: ${outcome.signal}` : `exit code: ${outcome.exitCode}`
    const out = entry.handle.collected?.stdout?.readFrom(0)?.text ?? ''
    const err = entry.handle.collected?.stderr?.readFrom(0)?.text ?? ''
    rec.outputTail = tail(`${out}${err}`, TAIL_BYTES)
    this.live.delete(rec.id)
    await this.save()
  }

  async stop(id) {
    const rec = this.find(id)
    if (!rec) throw new Error(`进程不存在: ${id}`)
    const entry = this.live.get(id)
    if (!entry || (rec.status !== 'running' && rec.status !== 'stopping')) {
      return this.publicView(rec)
    }
    entry.stoppedByUser = true
    rec.status = 'stopping'
    entry.handle.terminate()
    await this.save()
    return this.publicView(rec)
  }

  async restart(id) {
    const rec = this.find(id)
    if (!rec) throw new Error(`进程不存在: ${id}`)
    const old = this.live.get(id)
    if (old && (rec.status === 'running' || rec.status === 'stopping')) {
      old.stoppedByUser = true
      rec.status = 'stopping'
      old.handle.terminate()
      await old.handle.done.catch(() => {})
      this.live.delete(id)
    }
    const argv = [...rec.argv]
    rec.argv = argv
    rec.status = 'running'
    rec.pid = undefined
    rec.startedAt = Date.now()
    rec.finishedAt = undefined
    rec.exitCode = undefined
    rec.detail = undefined
    rec.outputTail = ''
    const handle = this.subprocess.spawn({
      argv,
      cwd: rec.cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: COLLECT_BYTES },
        stderr: { maxBytes: COLLECT_BYTES },
      },
      graceMs: 5000,
    })
    rec.pid = handle.pid
    const entry = { handle, record: rec, stoppedByUser: false }
    this.live.set(id, entry)
    handle.done.then(
      (outcome) => this.settle(entry, outcome),
      () => this.settle(entry, { exitCode: null, signal: null }),
    )
    await this.save()
    return this.publicView(rec)
  }

  async output(id) {
    const entry = this.live.get(id)
    if (entry) {
      const out = entry.handle.collected?.stdout?.readFrom(0)?.text ?? ''
      const err = entry.handle.collected?.stderr?.readFrom(0)?.text ?? ''
      return tail(`${out}${err}`, TAIL_BYTES)
    }
    const rec = this.find(id)
    if (!rec) throw new Error(`进程不存在: ${id}`)
    return rec.outputTail || '（无输出）'
  }

  async remove(id) {
    const rec = this.find(id)
    if (!rec) throw new Error(`进程不存在: ${id}`)
    if (rec.status === 'running' || rec.status === 'stopping') {
      throw new Error('请先停止该进程再移除')
    }
    for (const all of this.records.values()) {
      if (all.delete(id)) break
    }
    await this.save()
    return { removed: true }
  }
}

export default ProcessRegistry
