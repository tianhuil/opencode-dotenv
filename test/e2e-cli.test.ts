import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { $ } from "bun"
import { join } from "path"
import { writeFile, unlink } from "fs/promises"

describe("E2E: OpenCode CLI", () => {
  const testEnvFile = join(process.cwd(), ".env.test")

  beforeEach(() => {
    process.env.NODE_ENV = "test"
  })

  afterEach(async () => {
    try {
      await unlink(testEnvFile)
    } catch {
      // File might not exist
    }
  })

  test("loads environment variable and makes it available to OpenCode", async () => {
    const randomString = `test-value-${Date.now()}-${Math.random().toString(36).slice(2)}`
    
    await writeFile(testEnvFile, `TEST_VAR=${randomString}`)
    
    try {
      const result = await $`opencode run 'print the value of TEST_VAR environment variable'`.quiet()
      
      expect(result.stdout.includes(randomString)).toBe(true)
      expect(Number(result.exitCode)).toBe(0)
    } catch (error) {
      // If opencode CLI is not available, skip the test
      if (error instanceof Error && error.message.includes("ENOENT")) {
        console.log("Skipping E2E test: opencode CLI not found")
        return
      }
      throw error
    }
  })

  test("loads multiple environment variables", async () => {
    const apiKey = `test-api-key-${Date.now()}`
    const dbHost = "test-db-host"
    
    await writeFile(testEnvFile, `API_KEY=${apiKey}\nDB_HOST=${dbHost}`)
    
    try {
      const result = await $`opencode run 'print API_KEY and DB_HOST environment variables'`.quiet()
      
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
  })

  test("respects flow convention with NODE_ENV", async () => {
    const prodValue = `production-value-${Date.now()}`
    const devValue = `development-value-${Date.now()}`
    
    await writeFile(join(process.cwd(), ".env.development"), `ENV_VALUE=${devValue}`)
    await writeFile(join(process.cwd(), ".env.production"), `ENV_VALUE=${prodValue}`)
    
    try {
      const prodResult = await $`NODE_ENV=production opencode run 'print ENV_VALUE'`.quiet()
      expect(prodResult.stdout.includes(prodValue)).toBe(true)
      
      const devResult = await $`NODE_ENV=development opencode run 'print ENV_VALUE'`.quiet()
      expect(devResult.stdout.includes(devValue)).toBe(true)
    } catch (error) {
      if (error instanceof Error && error.message.includes("ENOENT")) {
        console.log("Skipping E2E test: opencode CLI not found")
        return
      }
      throw error
    } finally {
      try {
        await unlink(join(process.cwd(), ".env.development"))
        await unlink(join(process.cwd(), ".env.production"))
      } catch {
        // Files might not exist
      }
    }
  })
})
