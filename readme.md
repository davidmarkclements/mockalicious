# mockalicious

> Keep on mocking in the free world

Module mocking for both native ESM and CJS environments

## Install

```sh
npm i mockalicious
```

## API

### `mockalicious(fileUrlOrPath) => loader`

Initialize a module loader that can load a module with defined mocks. 

ESM:

```js
const load = mockalicious(import.meta.url)
```

CJS:

```js
const load = mockalicious(__filename)
```

**Always initialize before any tests**


### `loader(entry, mocks) => Promise => entry module`

Pass the loader an entry point to load and supply mocks
for any modules in its dependency tree.

Example:

```js
await loader('path/to/file/being/tested.js', {
  fs: {
    ...(await import('fs')), // copy original fs
    readFile() {
      // mock readFile function
    }
  },
  open () {
    // mock default exported function of ecosystem module `open`
  },
  './path/to/file.js'() {
    default () {
      // mock default exported function of local module  
    },
    bar: 1 // mock other exports
  }
})
```

## Modes

Mocking native ESM modules demands the use of a loader, currently via Node's `--experimental-loader`
flag. However in order to support running `node` directly without fiddling with flags, if the loader
is not set `mockalicious` will use a worker thread to reload a test file with the loader. This comes
with some trade offs.

### Autoload Mode

Not setting the `--experimental-loader` flag will cause `mockalicious` to pause the main thread,
run the tests in a worker with the `--experimental-loader` flag set and then exit the process.

This will work in most cases, based on what worker threads support. The following functionality
in tests or tested code will fail in autoload mode:

* `process.chdir`
* any process methods for setting groups or ids
* capturing signals
* input from STDIN

### Loader Mode

To use `mockalicious` in loader mode, set the `--experimental-loader` flag like so:

```sh
node --experimental-loader=mockalicious/loader.mjs my-test.js
```

## Support

* Node 12.4/14+

# License

ISC