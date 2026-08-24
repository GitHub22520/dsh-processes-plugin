/**
 * 浏览器「进程」tab（会话视图槽 conversation.view）。
 * 数据经宿主 RPC 通道 `/processes` 获取（connection.rpc.call），列表每 3 秒刷新一次。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export const inject = ['connection', 'slots', 'locale']

import { NS, zh, en } from './locales'

type ProcessItem = {
  id: string
  name: string
  command: string
  status: string
  pid?: number | null
  cwd: string
  startedAt?: number
  finishedAt?: number
  exitCode?: number | null
  detail?: string
  outputTail?: string
}

type Actions = {
  sessionId: string
  list: () => Promise<ProcessItem[]>
  start: (command: string, name?: string, cwd?: string) => Promise<ProcessItem>
  stop: (id: string) => Promise<ProcessItem>
  restart: (id: string) => Promise<ProcessItem>
  remove: (id: string) => Promise<unknown>
  output: (id: string) => Promise<{ output: string }>
}

type StatusSpec = {
  label: string
  color: string
  background: string
}

const STATUS: Record<string, StatusSpec> = {
  running: { label: '运行中', color: '#2563eb', background: '#eff6ff' },
  stopping: { label: '停止中', color: '#c2410c', background: '#fff7ed' },
  stopped: { label: '已停止', color: '#667085', background: '#f2f4f7' },
  completed: { label: '已完成', color: '#15803d', background: '#f0fdf4' },
  failed: { label: '异常退出', color: '#dc2626', background: '#fef2f2' },
}

function fmtTime(ms?: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function ProcessesView(props: Actions) {
  const [rows, setRows] = useState<ProcessItem[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [logFor, setLogFor] = useState<string | null>(null)
  const [logText, setLogText] = useState('')
  const logRef = useRef<HTMLPreElement>(null)
  const logStickToBottom = useRef(true)
  const [showCreate, setShowCreate] = useState(false)
  const [command, setCommand] = useState('')
  const [name, setName] = useState('')

  const refresh = useCallback(async () => {
    try {
      const next = await props.list()
      setRows(next ?? [])
      setError('')
    } catch (err) {
      setError(err?.message ?? String(err))
    }
  }, [props.list])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 3000)
    return () => clearInterval(timer)
  }, [refresh])

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      await refresh()
      if (after) after()
    } catch (err) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (logFor === null) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refreshLog = async () => {
      try {
        const res = await props.output(logFor)
        if (active) setLogText(res?.output ?? '')
      } catch (err) {
        if (active) setLogText(err?.message ?? String(err))
      } finally {
        if (active) timer = setTimeout(() => void refreshLog(), 1000)
      }
    }
    void refreshLog()
    return () => {
      active = false
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [logFor, props.output])

  useLayoutEffect(() => {
    if (logFor !== null && logStickToBottom.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logFor, logText])

  const showLog = (id: string) => {
    logStickToBottom.current = true
    setLogFor(id)
    setLogText('')
  }

  const startCreate = async () => {
    if (!command.trim()) return
    await run(
      () => props.start(command.trim(), name.trim() || undefined),
      () => {
        setCommand('')
        setName('')
        setShowCreate(false)
      },
    )
  }

  const card: React.CSSProperties = {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    padding: 16,
    color: '#1c2430',
  }
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 0',
    borderBottom: '1px solid #eef1f5',
  }
  const btn: React.CSSProperties = {
    border: '1px solid #d5dbe3',
    background: '#fff',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>进程</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn} onClick={() => void refresh()}>刷新</button>
          <button style={btn} onClick={() => setShowCreate((v) => !v)}>新建进程</button>
        </div>
      </div>

      {error ? <div style={{ color: '#e74c3c', margin: '8px 0', fontSize: 13 }}>{error}</div> : null}

      {showCreate ? (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder="命令，如 pnpm dev"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            style={{ flex: 2, minWidth: 200, padding: '6px 8px', border: '1px solid #d5dbe3', borderRadius: 6 }}
          />
          <input
            placeholder="名称（可选）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1, minWidth: 120, padding: '6px 8px', border: '1px solid #d5dbe3', borderRadius: 6 }}
          />
          <button style={btn} disabled={busy} onClick={() => void startCreate()}>启动</button>
          <button style={btn} onClick={() => setShowCreate(false)}>取消</button>
        </div>
      ) : null}

      {rows.length === 0 && !error ? (
        <div style={{ color: '#8a94a6', fontSize: 13 }}>当前项目暂无后台进程，可点击「新建进程」启动一个。</div>
      ) : null}

      {rows.map((row) => {
        const status = STATUS[row.status] ?? STATUS.stopped
        const running = row.status === 'running' || row.status === 'stopping'
        return (
          <div key={row.id} style={rowStyle}>
            <span style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: status.color,
              boxShadow: row.status === 'running' ? `0 0 0 3px ${status.background}` : undefined,
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{row.name}</div>
              <div style={{ color: '#6b7480', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.command}>
                {row.command}
              </div>
            </div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              color: status.color,
              background: status.background,
              border: `1px solid ${status.color}40`,
              borderRadius: 6,
              padding: '3px 7px',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}>{status.label}{row.pid ? ` · pid ${row.pid}` : ''}</span>
            <span style={{ color: '#6b7480', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtTime(row.startedAt)}{row.detail ? ` · ${row.detail}` : ''}</span>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button style={btn} onClick={() => void showLog(row.id)}>输出</button>
              {running ? (
                <button style={btn} disabled={busy} onClick={() => void run(() => props.stop(row.id))}>停止</button>
              ) : (
                <button style={btn} disabled={busy} onClick={() => void run(() => props.restart(row.id))}>重启</button>
              )}
              {!running ? (
                <button style={btn} disabled={busy} onClick={() => void run(() => props.remove(row.id))}>移除</button>
              ) : null}
            </div>
          </div>
        )
      })}

      {logFor ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: '#6b7480' }}>输出（{String(logFor).slice(0, 8)}）</span>
            <button style={btn} onClick={() => setLogFor(null)}>关闭</button>
          </div>
          <pre
            ref={logRef}
            onScroll={() => {
              const element = logRef.current
              if (element) {
                logStickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 24
              }
            }}
            style={{
              background: '#10141a',
              color: '#d7e0ea',
              padding: 12,
              borderRadius: 8,
              maxHeight: 320,
              overflow: 'auto',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
            }}
          >{logText || '（暂无输出）'}</pre>
        </div>
      ) : null}
    </div>
  )
}

export function apply(ctx: any) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-processes: dictionaries')
  const t = ctx.locale.bind(NS)
  const connection = ctx.connection

  const call = async (endpoint: string, payload: unknown) => {
    const result = await connection.rpc.call('/processes', endpoint, payload)
    if (result && result.ok) return result.value
    const message = result?.error?.message ?? `RPC ${endpoint} 失败`
    throw new Error(message)
  }

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'processes',
    order: 20,
    locale: NS,
    label: () => t('view.processes'),
    inject: (sessionId: string): Actions => ({
      sessionId: String(sessionId),
      list: () => call('list', { sessionId }),
      start: (command: string, name?: string, cwd?: string) => call('start', { sessionId, command, name, cwd }),
      stop: (id: string) => call('stop', { sessionId, processId: id }),
      restart: (id: string) => call('restart', { sessionId, processId: id }),
      remove: (id: string) => call('remove', { sessionId, processId: id }),
      output: (id: string) => call('output', { sessionId, processId: id }),
    }),
  }, ProcessesView))
}
