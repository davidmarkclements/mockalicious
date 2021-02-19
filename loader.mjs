import { readSync } from 'fs'
import { compileFunction as sanity } from 'vm'
import { createRequire } from 'module'
import { workerData } from 'worker_threads'
import SonicBoom from 'sonic-boom'
const sonicOut = new SonicBoom({ fd: 1 })
const sonicErr = new SonicBoom({ fd: 2 })

process.stdout.write = (data) => sonicOut.write(data + '')
process.stderr.write = (data) => sonicErr.write(data + '')

if (workerData) {
  const { meta, fd } = workerData
  const unsup = ['setegid', 'seteuid', 'setgid', 'setgroups', 'setuid', 'chdir']
  for (const method of unsup) {
    process[method] = () => {
      const message = `
        process.${method} is not supported in Mockalicious Autoload Mode
        if these methods are required, use Mockalicious with --experimental-loader
      `
      throw Error(message)
    }
  }

  // worker data opens port, do not let it hold process open
  process._getActiveHandles()[0].unref()

  process.on('uncaughtExceptionMonitor', (err, origin) => {
    process._rawDebug(origin, '\n\n', err)
  })
  // it's in the loader, so it's triggered before
  // any other exit handlers
  process.on('exit', (code) => {
    meta[0] = code
  })

  const buf = Buffer.alloc(1)
  setInterval(() => {
    readSync(fd, buf, 0, 1)
    if (buf[0] === 3) process.exit(130) // SIGINT
    if (buf[0] === 4) process.exit(0) // EOF
  }, 1000).unref()
}

const kMockalicious = Symbol.for('mockalicious')
let current = { counter: 0, entry: '', names: new Set(), mocks: {} }
global[kMockalicious] = ({ counter, entry, names, mocks } = {}) => {
  const require = createRequire(entry)
  for (const name of names) {
    require.cache[require.resolve(name)] = {
      exports: mocks[name].default || mocks[name]
    }
  }
  current = { counter, entry, names, mocks }
}

global[kMockalicious].get = (key) => current.mocks[key]

global[kMockalicious].clear = () => {
  const { cache } = createRequire(import.meta.url)
  for (const id of Object.keys(cache)) delete cache[id]
  current = { counter: current.counter, entry: '', names: new Set(), mocks: {} }
}

export function resolve (specifier, ctx, defaultResolve) {
  const { names, counter } = current
  if (/node:/.test(specifier)) specifier = specifier.split(':')[1]
  if (names.has(specifier)) {
    // counter busts cache
    return {
      url: `mockalicious:${specifier}:${counter}`
    }
  }
  if (specifier[0] === '.') specifier += `?c=${counter}`
  return defaultResolve(specifier, ctx, defaultResolve)
}

export async function getFormat (url, ctx, defaultGetFormat) {
  if (/mockalicious:/.test(url)) {
    return { format: 'module' }
  }
  return defaultGetFormat(url, ctx, defaultGetFormat)
}

export async function getSource (url, ctx, defaultGetSource) {
  if (/mockalicious:/.test(url)) {
    const { mocks } = current
    const [, name] = url.split(':')
    const mod = mocks[name]
    const api = typeof mod !== 'function'
      ? Object.getOwnPropertyNames(mod)
      : Object.getOwnPropertyNames(mod).filter((key) => {
        if (key === 'length') return false
        if (key === 'name') return false
        return true
      })
    const exports = api.map((k) => {
      try {
        // the following checks if the export value is legal
        sanity(`const ${k} = 1`)
        return `export const ${k} = mod['${k}']`
      } catch {
        return ''
      }
    }).filter(Boolean)
    if (api.includes('default') === false) exports.push('export default mod')
    else exports.push('export default mod.default')
    const source = `
      const mod = global[Symbol.for('mockalicious')].get('${name}')
      ${exports.join('\n      ')}
    `
    return { source }
  }
  return defaultGetSource(url, ctx, defaultGetSource)
}
