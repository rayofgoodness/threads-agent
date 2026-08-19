import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, normalize, extname } from 'node:path'
import type { ServerResponse } from 'node:http'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
}

/**
 * Serves the built dashboard.
 *
 * In development Vite does this and proxies `/api` here; in production there is
 * no Vite, so the same process serves both and the tunnel needs one origin.
 */
export function serveStatic(root: string, pathname: string, response: ServerResponse): boolean {
  if (!existsSync(root)) return false

  // Resolve inside the root and confirm it stayed there — `..` in a URL must
  // not reach the filesystem above `dist/`.
  const requested = normalize(join(root, decodeURIComponent(pathname)))
  const withinRoot = requested === root || requested.startsWith(root + '/')

  let file = withinRoot && existsSync(requested) && statSync(requested).isFile() ? requested : undefined
  // Anything else falls back to the app shell, which is a single page.
  file ??= join(root, 'index.html')
  if (!existsSync(file)) return false

  const extension = extname(file)
  response.writeHead(200, {
    'Content-Type': TYPES[extension] ?? 'application/octet-stream',
    // Hashed asset names may be cached hard; index.html must not be.
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  createReadStream(file).pipe(response)
  return true
}
