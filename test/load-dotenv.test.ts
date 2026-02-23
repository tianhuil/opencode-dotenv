import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { loadDotEnvFiles } from "../src/load-dotenv"
import { tmpdir } from "os"
import { join } from "path"
import { mkdir, writeFile, rm } from "fs/promises"

async function createTestDirectory(dir: string, files: Record<string, string> = {}) {
  await mkdir(dir, { recursive: true })
  for (const [filename, content] of Object.entries(files)) {
    await writeFile(join(dir, filename), content)
  }
}

async function removeDirectory(dir: string) {
  try {
    await rm(dir, { recursive: true, force: true })
  } catch {
    // Ignore errors if directory doesn't exist
  }
}

describe("loadDotEnvFiles", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `dotenv-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  })

  afterEach(async () => {
    await removeDirectory(testDir)
  })

  test("loads .env file", async () => {
    await createTestDirectory(testDir, {
      ".env": "APP_NAME=TestApp\nDATABASE_HOST=localhost",
    })

    const result = await loadDotEnvFiles(testDir)
    expect(result.APP_NAME).toBe("TestApp")
    expect(result.DATABASE_HOST).toBe("localhost")
  })

  test("respects flow convention with NODE_ENV=development", async () => {
    await createTestDirectory(testDir, {
      ".env": "APP_NAME=TestApp\nLOG_LEVEL=info",
      ".env.development": "DEBUG=true\nLOG_LEVEL=debug\nAPP_NAME=TestApp (Development)",
    })

    const result = await loadDotEnvFiles(testDir, { nodeEnv: "development" })
    expect(result.DEBUG).toBe("true")
    expect(result.APP_NAME).toBe("TestApp (Development)")
    expect(result.LOG_LEVEL).toBe("debug")
  })

  test("respects flow convention with NODE_ENV=production", async () => {
    await createTestDirectory(testDir, {
      ".env": "APP_NAME=TestApp\nLOG_LEVEL=info",
      ".env.production": "LOG_LEVEL=warn\nAPP_NAME=TestApp (Production)",
    })

    const result = await loadDotEnvFiles(testDir, { nodeEnv: "production" })
    expect(result.APP_NAME).toBe("TestApp (Production)")
    expect(result.LOG_LEVEL).toBe("warn")
  })

  test("respects flow convention with NODE_ENV=test", async () => {
    await createTestDirectory(testDir, {
      ".env": "APP_NAME=TestApp\nLOG_LEVEL=info",
      ".env.test": "TEST_MODE=true\nLOG_LEVEL=test\nAPP_NAME=TestApp (Test)",
    })

    const result = await loadDotEnvFiles(testDir, { nodeEnv: "test" })
    expect(result.TEST_MODE).toBe("true")
    expect(result.APP_NAME).toBe("TestApp (Test)")
    expect(result.LOG_LEVEL).toBe("test")
  })

  test("handles missing files gracefully", async () => {
    await createTestDirectory(testDir)

    const result = await loadDotEnvFiles(testDir)
    expect(Object.keys(result).length).toBe(0)
  })

  test("supports variable expansion", async () => {
    await createTestDirectory(testDir, {
      ".env": "HOST=localhost\nPORT=5432\nDATABASE_URL=postgres://${HOST}:${PORT}/db",
    })

    const result = await loadDotEnvFiles(testDir)
    expect(result.HOST).toBe("localhost")
    expect(result.PORT).toBe("5432")
    expect(result.DATABASE_URL).toBe("postgres://localhost:5432/db")
  })

  test("non-overriding merge by default", async () => {
    await createTestDirectory(testDir, {
      ".env": "VAR1=value1\nVAR2=value2",
    })

    const result = await loadDotEnvFiles(testDir, { overload: false })
    expect(result.VAR1).toBe("value1")
    expect(result.VAR2).toBe("value2")
  })

  test("overriding mode when enabled", async () => {
    await createTestDirectory(testDir, {
      ".env": "VAR1=value1",
    })

    const result = await loadDotEnvFiles(testDir, { overload: true })
    expect(result.VAR1).toBe("value1")
  })

  test("defaults NODE_ENV to development", async () => {
    await createTestDirectory(testDir, {
      ".env": "APP_NAME=TestApp",
    })

    const originalNodeEnv = process.env.NODE_ENV
    delete process.env.NODE_ENV

    const result = await loadDotEnvFiles(testDir)
    expect(result.APP_NAME).toBe("TestApp")

    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv
    }
  })
})

describe("loadDotEnvFiles with fixtures", () => {
  const fixturesDir = join(import.meta.dir, "fixtures", "env-loading")

  test("loads from fixture directory - default", async () => {
    const result = await loadDotEnvFiles(fixturesDir, { nodeEnv: "development" })
    expect(result.APP_NAME).toBe("TestApp (Development)")
    expect(result.DEBUG).toBe("true")
    expect(result.LOG_LEVEL).toBe("debug")
  })

  test("loads from fixture directory - production", async () => {
    const result = await loadDotEnvFiles(fixturesDir, { nodeEnv: "production" })
    expect(result.APP_NAME).toBe("TestApp (Production)")
    expect(result.LOG_LEVEL).toBe("warn")
    expect(result.API_URL).toBe("https://api.example.com")
  })

  test("loads from fixture directory - test", async () => {
    const result = await loadDotEnvFiles(fixturesDir, { nodeEnv: "test" })
    expect(result.APP_NAME).toBe("TestApp (Test)")
    expect(result.TEST_MODE).toBe("true")
    expect(result.LOG_LEVEL).toBe("test")
  })
})

describe("loadDotEnvFiles with encryption", () => {
  const encryptedFixturesDir = join(import.meta.dir, "fixtures", "encrypted-env")

  test("loads unencrypted values from env file with encryption keys present", async () => {
    const result = await loadDotEnvFiles(encryptedFixturesDir, { nodeEnv: "development" })
    expect(result.APP_NAME).toBe("EncryptedApp")
    expect(result.LOG_LEVEL).toBe("debug")
  })
})
