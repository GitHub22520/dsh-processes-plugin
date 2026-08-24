/**
 * 为「进程」tab 提供宿主 RPC 通道 `/processes`。浏览器半程通过
 * `ctx.connection.rpc.call('/processes', endpoint, payload)` 调用；宿主按
 * sessionId 解析出当前会话所属工作区，与模型工具复用同一份注册表。
 */
export const name = 'dsh-processes-rpc'
export const inject = ['processes', 'connection', 'sessions']

export function apply(ctx) {
  const processes = ctx.processes

  const resolution = async (payload, endpoint) => {
    switch (endpoint) {
      case 'list':
        return processes.list(await cwdFor(payload))
      case 'start':
        return processes.start(await cwdFor(payload), { name: payload.name, command: payload.command })
      case 'stop':
        return processes.stop(payload.processId)
      case 'restart':
        return processes.restart(payload.processId)
      case 'output':
        return { output: await processes.output(payload.processId) }
      case 'remove':
        return processes.remove(payload.processId)
      default:
        throw new Error(`unknown endpoint ${endpoint}`)
    }
  }

  const cwdFor = async (payload) => {
    if (payload.cwd) return payload.cwd
    if (payload.sessionId) {
      const session = ctx.sessions.get ? ctx.sessions.get(payload.sessionId) : undefined
      return session?.header?.cwd
    }
    return undefined
  }

  const dispose = ctx.connection.rpc.handle('/processes', async (endpoint, payload) => {
    try {
      const value = await resolution(payload ?? {}, endpoint)
      return { ok: true, value }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: { code: 'internal', message, details: {} } }
    }
  }, { authority: 'loopback' })

  ctx.effect(() => () => { dispose() }, 'processes rpc teardown')
}
