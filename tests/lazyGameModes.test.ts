import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src')

// Matches `import x from 'y'`, `export { x } from 'y'` and `import 'y'`, but not
// `import type`, `export type` or `lazy(() => import('y'))`.
const STATIC_IMPORT = /^(?:(?:import|export)\s+(?!type\b)[^'"]*?from\s+|import\s+)'([^']+)'/gm

function resolveLocal(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier)
  return (
    [base, `${base}.ts`, `${base}.tsx`].find((path) => existsSync(path) && statSync(path).isFile()) ??
    null
  )
}

/** Every source file and bare package a browser downloads in the entry chunk's static graph. */
function staticGraph(entry: string) {
  const files = new Set<string>()
  const packages = new Set<string>()
  const pending = [entry]

  while (pending.length > 0) {
    const file = pending.pop() as string
    if (files.has(file)) continue
    files.add(file)
    if (!/\.tsx?$/.test(file)) continue

    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
      if (!specifier.startsWith('.')) {
        packages.add(specifier)
        continue
      }
      const local = resolveLocal(file, specifier)
      if (local) pending.push(local)
    }
  }

  return { packages, files: [...files].map((file) => relative(srcDir, file).replaceAll('\\', '/')) }
}

test('the walker follows static imports into peerjs', () => {
  const { packages } = staticGraph(join(srcDir, 'multiplayer', 'shared.ts'))
  assert.ok(packages.has('peerjs'))
})

test('the entry chunk reaches the app but not peerjs or any game mode', () => {
  const { files, packages } = staticGraph(join(srcDir, 'main.tsx'))

  assert.ok(files.includes('App.tsx'))
  assert.ok(packages.has('react'))
  assert.ok(!packages.has('peerjs'), 'peerjs must stay out of the entry chunk')
  assert.deepEqual(
    files.filter((file) =>
      /^(multiplayer|components\/(card-guesser|higher-or-lower|card-categories|codenames|connections|chameleon|charades|wordle|trivia))\//.test(
        file,
      ),
    ),
    [],
  )
})
