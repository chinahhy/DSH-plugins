/* Loaded through DSH's existing ModuleLoader; React belongs to the host. */
const { createElement: h, useState, useEffect, useRef } = require('react')
const control = async (path, method = 'GET', body) => {
  const response = await fetch('/dsh-tether/' + path, {
    method, signal: AbortSignal.timeout(30000), headers: { 'x-dsh-tether-control': '1', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new Error(response.status === 403 ? '请在 Mac 的 DSH 窗口管理配对。' : '连接服务不可用，请重新加载插件。')
  return response.json()
}
function RelaySwitch({ wide }) {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const gate = useRef(false)
  const alive = useRef(false)
  const epoch = useRef(0)
  useEffect(() => {
    alive.current = true
    const refresh = async () => {
      if (gate.current) return
      const ticket = epoch.current
      try {
        const next = await control('relay')
        if (alive.current && ticket === epoch.current && !gate.current) { setState(next); setError('') }
      } catch { if (alive.current && ticket === epoch.current && !gate.current) setError('暂时无法读取中继状态') }
    }
    void refresh()
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void refresh() }, 5000)
    return () => { alive.current = false; clearInterval(timer) }
  }, [])
  const choose = async mode => {
    if (gate.current || !state || state.switching || !state.privateAvailable || (state.mode === mode && state.ready)) return
    gate.current = true; epoch.current++; setBusy(true); setError('')
    try {
      const next = await control('relay', 'POST', { mode })
      if (alive.current) setState(next)
    } catch {
      try { const actual = await control('relay'); if (alive.current) setState(actual) } catch {}
      if (alive.current) setError('切换未完成，请检查连接后重试')
    } finally { gate.current = false; if (alive.current) setBusy(false) }
  }
  const selected = state?.mode === 'private'
  const pending = busy || state?.switching
  const disabled = !state || pending || !state.privateAvailable
  const description = !state ? '正在读取中继设置' : !state.privateAvailable ? '尚未配置自建中继' : '选择 Mac 使用的中继；切换时手机会短暂重连，直连仍可用'
  return h('div', { 'data-tether-relay': true, 'data-compact': wide === false ? 'true' : undefined },
    wide !== false && h('span', { className: 'tether-relay-caption' }, '远程中继'),
    h('button', {
      type: 'button', role: 'switch', 'aria-label': '使用自建中继', 'aria-checked': Boolean(selected),
      'aria-busy': Boolean(pending), disabled, title: description,
      className: 'tether-relay-switch', 'data-private': selected ? 'true' : 'false',
      onClick: () => void choose(selected ? 'public' : 'private'),
      onKeyDown: event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); void choose(event.key === 'ArrowLeft' ? 'public' : 'private')
        }
      },
    },
      h('span', { className: 'tether-relay-thumb', 'aria-hidden': true }),
      h('span', { 'aria-hidden': true }, wide === false ? '公' : '公共'),
      h('span', { 'aria-hidden': true }, wide === false ? '自' : '自建'),
    ),
    h('span', { className: error ? 'tether-relay-error' : 'tether-relay-sr', role: error ? 'alert' : 'status', 'aria-live': 'polite' },
      error || (pending ? '正在切换中继' : state ? (state.ready ? (selected ? '已选择自建中继' : '已选择公共中继') : '连接服务待恢复') : '正在读取')),
  )
}

function Tether({ wide }) {
  const [open, setOpen] = useState(false)
  const [pair, setPair] = useState(null)
  const [devices, setDevices] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    if (!pair) return
    setExpired(false)
    const timer = setTimeout(() => { setExpired(true); setPair(null) }, pair.expiresInSec * 1000)
    return () => clearTimeout(timer)
  }, [pair])
  const run = async operation => {
    if (busy) return
    setBusy(true); setError('')
    try { await operation() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const refresh = async () => setDevices((await control('devices')).devices)
  return h('div', { 'data-tether-ios': true },
    h('button', { type: 'button', title: '连接 iPhone', onClick: () => { setOpen(true); void run(refresh) } }, wide === false ? '📱' : '连接 iPhone'),
    open && h('div', { className: 'tether-ios-overlay' }, h('section', { role: 'dialog', 'aria-modal': true, 'aria-label': 'iPhone 远程连接', className: 'tether-ios-dialog' },
      h('h2', null, 'iPhone 远程连接'),
      h('p', null, '打开 iOS Tether → 添加电脑 → 粘贴配对串。配对后手机可操作完整 DSH 界面。'),
      h('button', { disabled: busy, onClick: () => void run(async () => setPair(await control('pairing', 'POST'))) }, '生成 10 分钟配对码'),
      pair && h('textarea', { readOnly: true, 'aria-label': '配对串', value: pair.pairingString, onFocus: e => e.target.select(), rows: 3 }),
      pair && h('p', null, '不要把配对串发到聊天或日志。配对成功后该码立即失效。'),
      expired && h('p', null, '配对码已过期，请重新生成。'),
      h('h3', null, '已配对设备'),
      h('button', { disabled: busy, onClick: () => void run(refresh) }, '刷新设备'),
      h('ul', null, ...devices.map(device => h('li', { key: device.id },
        h('span', null, `${device.name} · ${device.online ? '在线' : '离线'}`),
        h('button', { disabled: busy, onClick: () => void run(async () => { setDevices((await control('devices', 'POST', { id: device.id })).devices) }) }, '撤销连接权限'),
      ))),
      error && h('p', { role: 'alert' }, error),
      h('button', { onClick: () => { setOpen(false); setPair(null) } }, '关闭'),
    )),
  )
}
exports.inject = ['slots']
exports.apply = ctx => {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = '[data-tether-ios] button{cursor:pointer;padding:6px 10px}.tether-ios-overlay{position:fixed;inset:0;z-index:10000;background:#0008;display:grid;place-items:center}.tether-ios-dialog{background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:12px;padding:24px;width:min(520px,90vw);max-height:85vh;overflow:auto}.tether-ios-dialog textarea{display:block;width:100%;box-sizing:border-box;margin-top:12px}.tether-ios-dialog li{display:flex;justify-content:space-between;gap:12px;margin:8px 0}'
    // The slot anchor uses display:contents; stack its actual flex parent, scoped to our control.
    style.textContent += "div:has(> [data-slot=\"sidebar.footer.action\"] [data-tether-relay]){flex-direction:column;align-items:stretch}[data-tether-relay]{box-sizing:border-box;width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 10px 9px;flex-wrap:wrap;color:var(--text-secondary,GrayText);font-size:12px}[data-tether-relay] .tether-relay-switch{position:relative;display:grid;grid-template-columns:1fr 1fr;align-items:center;isolation:isolate;min-width:104px;height:28px;padding:2px;border:1px solid color-mix(in srgb,CanvasText 14%,transparent);border-radius:999px;background:color-mix(in srgb,CanvasText 6%,Canvas);color:inherit;font:inherit;cursor:pointer;touch-action:manipulation}[data-tether-relay] .tether-relay-switch>span:not(.tether-relay-thumb){z-index:1;text-align:center;line-height:22px}[data-tether-relay] .tether-relay-thumb{position:absolute;inset:2px auto 2px 2px;width:calc(50% - 2px);border-radius:999px;background:Canvas;box-shadow:0 1px 4px #0002;transition:transform .16s ease}[data-tether-relay] [data-private=true] .tether-relay-thumb{transform:translateX(100%)}[data-tether-relay] [data-private=false]>span:nth-child(2),[data-tether-relay] [data-private=true]>span:nth-child(3){color:CanvasText;font-weight:600}[data-tether-relay] button:focus-visible{outline:2px solid Highlight;outline-offset:3px}[data-tether-relay] button:disabled{cursor:default;opacity:.55}[data-tether-relay] .tether-relay-error{flex-basis:100%;font-size:11px;color:var(--text-error,#c33);overflow-wrap:anywhere}[data-tether-relay] .tether-relay-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}[data-tether-relay][data-compact=true]{padding:5px 2px;justify-content:center}[data-tether-relay][data-compact=true] button{min-width:36px;width:36px;height:24px;font-size:10px}@media(prefers-reduced-motion:reduce){[data-tether-relay] .tether-relay-thumb{transition:none}}"
    document.head.appendChild(style)
    return () => style.remove()
  })
  const slots = ctx.get('slots')
  slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'dsh-tether-relay', order: 49 }, props => h(RelaySwitch, props)))
  slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'dsh-tether-ios', order: 60 }, props => h(Tether, props)))
}
