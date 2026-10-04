// Node module customization hook (registered via `module.register` — see
// actions.test.js) that swaps `next/cache` for a no-op stub. Plain
// `node --test` can't resolve `next/cache` at all (the `next` package ships
// no `exports` map, so Node's ESM resolver can't find an extensionless
// subpath — only Next's own bundler can), and even if it could,
// `revalidatePath` throws outside a live Next.js request. This sidesteps
// both problems without touching any production code.

const STUB_SOURCE = `
export function revalidatePath() {}
export function revalidateTag() {}
export function unstable_cache(fn) { return fn }
`

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/cache') {
    return { url: 'stub:next/cache', shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url === 'stub:next/cache') {
    return { format: 'module', source: STUB_SOURCE, shortCircuit: true }
  }
  return nextLoad(url, context)
}
