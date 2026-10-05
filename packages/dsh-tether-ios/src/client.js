/* Loaded through DSH's existing ModuleLoader; React belongs to the host. */
const { createElement: h, useState, useEffect } = require('react')
const control = async (path, method = 'GET', body) => {
  const response = await fetch('/dsh-tether/' + path, {
    method, headers: { 'x-dsh-tether-control': '1', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new Error(response.status === 403 ? '请在 Mac 的 DSH 窗口管理配对。' : '连接服务不可用，请重新加载插件。')
  return response.json()
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
    document.head.appendChild(style)
    return () => style.remove()
  })
  const slots = ctx.get('slots')
  slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'dsh-tether-ios', order: 60 }, props => h(Tether, props)))
}
