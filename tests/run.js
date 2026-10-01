// Test runner: sets the environment before anything loads and runs Node's built-in test runner
// through ts-node, the same runtime the app uses (decorators + MikroORM need it).
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const root = path.resolve(__dirname, '..')

const findTests = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'helpers' ? [] : findTests(full)
    return entry.name.endsWith('.test.ts') ? [full] : []
  })

const filter = process.argv[2]
const files = findTests(__dirname).filter((f) => !filter || f.includes(filter))

if (files.length === 0) {
  console.error('No test files found' + (filter ? ` matching "${filter}"` : ''))
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [
    '--require',
    'ts-node/register',
    '--require',
    'tsconfig-paths/register',
    '--require',
    path.join(__dirname, 'helpers', 'env.ts'),
    // The tests share one database, so test files must not run in parallel
    '--test-concurrency=1',
    '--test-reporter',
    pathToFileURL(path.join(__dirname, 'helpers', 'reporter-es.js')).href,
    '--test',
    ...files,
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
  }
)

process.exit(result.status ?? 1)
