'use strict'
const sleep = require('atomic-sleep')
const { openSync } = require('fs')
const { fileURLToPath } = require('url')
const { createRequire } = require('module')
const { Worker, SHARE_ENV } = require('worker_threads')
const kMockalicious = Symbol.for('mockalicious')
const loader = require.resolve('./loader.mjs')

const normalize = (file) => {
  try {
    file = fileURLToPath(file)
  } catch {}
  return file
}

const loaderPresent = typeof global[kMockalicious] === 'function'

function mockalicious (file) {
  file = normalize(file)
  if (loaderPresent === false) {
    const shared = new SharedArrayBuffer(8)
    const meta = new Int32Array(shared)
    meta[0] = -1
    const fd = (process.platform === 'win32')
      ? process.stdin.fd
      : openSync('/dev/tty', 'rs')
    const worker = new Worker(file, {
      workerData: { meta, fd },
      env: SHARE_ENV,
      execArgv: ['--experimental-loader=' + loader]
    })
    if ('setRawMode' in process.stdin) process.stdin.setRawMode(true)
    while ((Atomics.load(meta, 0) === -1)) {
      sleep(250) // keep pressure off cpu
    }
    const [code] = meta
    process.exit(code)
  }
  const { resolve } = createRequire(file)
  let counter = 0
  let clearing = true
  const load = async (entry, mocks = {}) => {
    entry = resolve(entry)
    global[kMockalicious].clear()
    counter++
    global[kMockalicious]({ counter, file, entry, mocks, names: new Set(Object.keys(mocks)) })

    let module = null
    // counter busts cache
    module = await import(`${entry}?c=${counter}`)
    const def = module.default
    if (typeof def === 'function') {
      module = Object.assign((...args) => def(...args), module)
    }
    await module.default
    if (clearing) global[kMockalicious].clear()
    return module
  }
  load.preventClear = (prevent = true) => {
    clearing = !prevent
  }
  load.clear = () => global[kMockalicious].clear()
  return load
}

module.exports = mockalicious
