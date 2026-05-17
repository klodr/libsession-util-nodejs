#!/usr/bin/env node
/**
 * Try to install a published prebuild for the current platform+arch
 * matching this package's version. On success, exits 0 — the .node
 * file is in build/Release/ and cmake-js can be skipped entirely.
 * On failure (no prebuild for platform, network down, integrity
 * mismatch), exits non-zero so the caller falls back to building
 * from source via cmake-js.
 *
 * Wiring in package.json:
 *
 *   "install": "node scripts/install-from-prebuild.mjs || cmake-js build ..."
 *
 * The `||` fallback chain means:
 *  - prebuild OK  -> exit 0, cmake-js never runs (~2s install vs ~15-25min)
 *  - prebuild KO  -> exit !=0, cmake-js compiles from source
 *
 * Integrity gate:
 *  - Every supported triple's .node is SHA256-checked against the
 *    SHA256SUMS manifest attached to the same GitHub Release.
 *  - A mismatch is a supply-chain red flag, so we hard-fail (exit 1).
 *    Falling back to cmake-js on a tampered download would silently
 *    hide the tamper — that path is reserved for legitimate misses.
 *
 * Supported triples (matches release.yml CI matrix):
 *   darwin-arm64, linux-x64
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PACKAGE_ROOT = join(__dirname, '..')

const SUPPORTED = new Set(['darwin-arm64', 'linux-x64'])

async function main() {
  const platform = process.platform
  const arch = process.arch
  const triple = `${platform}-${arch}`

  const target = join(PACKAGE_ROOT, 'build/Release/libsession_util_nodejs.node')

  if (await exists(target)) {
    console.log(`[install-from-prebuild] ${target} already present, skipping`)
    return
  }

  if (!SUPPORTED.has(triple)) {
    // No prebuild — exit non-zero so the install || chain falls back
    // to cmake-js. This is the normal path on, e.g., linux-arm64 or
    // windows-x64 today (until those land in the matrix).
    console.log(
      `[install-from-prebuild] no prebuild for ${triple}; falling back to cmake-js`,
    )
    process.exit(2)
  }

  const pkg = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8'))
  const version = pkg.version
  if (typeof version !== 'string' || !version) {
    throw new Error('[install-from-prebuild] package.json version missing')
  }
  const tag = `v${version}`

  const repo = pickRepoFromPackage(pkg)
  const baseUrl = `https://github.com/${repo}/releases/download/${tag}`
  const filename = `libsession_util_nodejs-${tag}-${triple}.node`
  const url = `${baseUrl}/${filename}`
  const sumsUrl = `${baseUrl}/SHA256SUMS`

  console.log(`[install-from-prebuild] fetching ${filename}`)
  let bin, sumsText
  try {
    ;[bin, sumsText] = await Promise.all([fetchBuffer(url), fetchText(sumsUrl)])
  } catch (err) {
    // Network class error (404, 5xx, DNS, etc.) — fall back to source build.
    console.log(`[install-from-prebuild] download failed: ${err.message}; falling back to cmake-js`)
    process.exit(3)
  }

  // SHA256SUMS line format: `<hex>  <filename>`.
  const expected = sumsText
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .find(([, name]) => name === filename)
  if (!expected) {
    // The release exists but doesn't list our binary — supply-chain
    // anomaly. Don't fall back to source build silently.
    throw new Error(`[install-from-prebuild] no SHA256 entry for ${filename} in SHA256SUMS`)
  }
  const actual = createHash('sha256').update(bin).digest('hex')
  if (actual !== expected[0]) {
    throw new Error(
      `[install-from-prebuild] checksum mismatch for ${filename}: expected ${expected[0]}, got ${actual}`,
    )
  }

  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, bin)
  console.log(`[install-from-prebuild] installed ${filename} (sha256 verified)`)
}

function pickRepoFromPackage(pkg) {
  // Prefer an explicit owner/repo extracted from the published
  // `repository.url` so a downstream re-fork (different owner) only
  // has to touch one place to redirect prebuild downloads.
  const url = pkg.repository?.url ?? pkg.repository ?? ''
  const m = String(url).match(/github\.com[/:]([^/]+\/[^/.]+)/)
  if (m) return m[1]
  return 'klodr/libsession-util-nodejs'
}

async function exists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`)
  return await res.text()
}

main().catch((err) => {
  const msg = err?.message ?? String(err)
  console.error(`[install-from-prebuild] ${msg}`)
  // Integrity failures MUST stop the install pipeline (don't fall
  // back to cmake-js after detecting tampering).
  if (
    msg.includes('checksum mismatch') ||
    msg.includes('no SHA256 entry') ||
    msg.includes('package.json version missing')
  ) {
    process.exit(1)
  }
  // Other unexpected errors (filesystem ENOSPC, etc.): fall back to
  // cmake-js so the consumer at least gets a chance to compile.
  process.exit(4)
})
