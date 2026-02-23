import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { $ } from "bun"
import { join } from "path"
import { mkdir, writeFile, rm } from "fs/promises"

const e2eDir = join(import.meta.dir)

async function setupE2EDir() {
  await mkdir(e2eDir, { recursive: true })
}

async function cleanupE2EDir() {
  try {
    await rm(join(e2eDir, ".env"), { force: true })
  } catch {
    // Ignore errors
  }
}

describe("E2E: OpenCode CLI", () => {
  beforeEach(async () => {
    await setupE2EDir()
  })

  afterEach(async () => {
    await cleanupE2EDir()
  })

  test("loads multiple environment variables", async () => {
    const apiKey = `test-api-key-${Date.now()}`
    const dbHost = "test-db-host"
    
    await writeFile(join(e2eDir, ".env"), `API_KEY=${apiKey}\nDB_HOST=${dbHost}`)
    
    try {
      const result = await $`opencode run 'print API_KEY and DB_HOST environment variables'`
        .cwd(e2eDir)
        .quiet()
      
      expect(result.stdout.includes(apiKey)).toBe(true)
      expect(result.stdout.includes(dbHost)).toBe(true)
      expect(Number(result.exitCode)).toBe(0)
    } catch (error) {
      if (error instanceof Error && error.message.includes("ENOENT")) {
        console.log("Skipping E2E test: opencode CLI not found")
        return
      }
      throw error
    }
  }, {timeout: 30_000})
})
