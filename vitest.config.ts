import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Everything under test is server-side: the queue touches the filesystem
    // and the client speaks HTTP, so there is no DOM to emulate.
    environment: 'node',
    include: ['{agent,server,src}/**/*.test.ts'],
  },
})
