#!/usr/bin/env node
/**
 * Single entry point for installing the native addon. Owns both the
 * prebuild-download path and the cmake-js-from-source fallback so the
 * exit code semantics are unambiguous:
 *
 *   exit 0   prebuild OR cmake-js succeeded
 *   exit 1   supply-chain anomaly (checksum mismatch, manifest miss,
 *            missing package.json version) — DO NOT FALL BACK
 *
 * Wiring in package.json:
 *
 *   "install": "node scripts/install-from-prebuild.mjs"
 *
 * The previous wiring `node ... || cmake-js build ...` collapsed
 * every non-zero exit into "fall back to source build", which meant
 * a tampered prebuild's checksum mismatch was silently masked by a
 * subsequent successful cmake-js build. Owning the fallback inside
 * the script prevents that.
 *
 * Decision tree (current platform-arch):
 *  - supported AND prebuild OK   -> place .node, exit 0
 *  - supported AND integrity bad -> exit 1 (hard fail, supply-chain)
 *  - supported AND download miss -> spawn cmake-js, exit its code
 *  - unsupported                 -> spawn cmake-js, exit its code
 *
 * Supported triples (matches release.yml CI matrix):
 *   darwin-arm64, linux-x64
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PACKAGE_ROOT = join(__dirname, '..')

const SUPPORTED = new Set(['darwin-arm64', 'linux-x64'])

// cmake-js argv kept in sync with the legacy `install:from-source`
// script. Centralised here so the prebuild path and the source-build
// path share one source of truth.
const CMAKE_JS_ARGS = [
  'cmake-js',
  'build',
  '--runtime=node',
  '--runtime-version=22.22.2',
  '--CDSUBMODULE_CHECK=OFF',
  '--CDLOCAL_MIRROR=https://oxen.rocks/deps',
  '--CDENABLE_NETWORKING=OFF',
  '--CDWITH_TESTS=OFF',
]

function runCmakeJsFallback(reason) {
  console.log(`[install-from-prebuild] ${reason}; building from source via cmake-js`)
  const result = spawnSync('npx', CMAKE_JS_ARGS, {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
    shell: false,
  })
  process.exit(result.status ?? 1)
}

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
    runCmakeJsFallback(`no prebuild for ${triple}`)
    return // unreachable; runCmakeJsFallback exits
  }

  const pkg = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8'))
  const version = pkg.version
  if (typeof version !== 'string' || !version) {
    // Supply-chain anomaly: a tampered or malformed package.json
    // can't be silently papered over by a source build either.
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
    runCmakeJsFallback(`download failed: ${err.message}`)
    return // unreachable; runCmakeJsFallback exits
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
  // Hard fail. Integrity errors (checksum mismatch, missing SHA256
  // entry, malformed package.json) MUST stop the install — falling
  // back to cmake-js would silently hide a supply-chain anomaly.
  // Filesystem-class errors (ENOSPC, EACCES) are also non-recoverable
  // here; surfacing them is more useful than silently switching paths.
  process.exit(1)
})
