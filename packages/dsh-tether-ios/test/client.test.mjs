import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
function render(canSwitch) {
  const state = { mode: 'private', ready: true, privateAvailable: true, switching: false, canSwitch }
  const requests = []
  let index = 0
  const context = vm.createContext({ exports: {}, AbortSignal,
    fetch: async (url, options) => { requests.push({ url, ...options }); return { ok: true, json: async () => state } },
    require: () => ({
      createElement: (tag, props, ...children) => ({ tag, props, children }),
      useState: () => [[state, '', false][index++], () => {}],
      useRef: value => ({ current: value }), useEffect: () => {},
    }),
  })
  const tree = vm.runInContext(source + '\nRelaySwitch({wide:true})', context)
  return { tree, requests, button: tree.children.find(c => c?.tag === 'button') }
}
test('paired phone displays current relay and cannot send mutation by click or keyboard', async () => {
  const { tree, button, requests } = render(false)
  assert.equal(button.props['aria-checked'], true)
  assert.equal(button.props.disabled, true)
  assert.match(button.props.title, /请在 Mac/)
  const status = tree.children.find(c => c?.props?.role === 'status')
  assert.match(status.children.join(''), /已选择自建中继.*请在 Mac 切换/)
  assert.equal(status.props.className, 'tether-relay-hint')
  button.props.onClick()
  button.props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requests.length, 0)
})
test('Mac control remains enabled and submits the opposite selection', async () => {
  const { button, requests } = render(true)
  assert.equal(button.props.disabled, false)
  button.props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requests.length, 1)
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].url, '/dsh-tether/relay')
  assert.deepEqual(JSON.parse(requests[0].body), { mode: 'public' })
})
