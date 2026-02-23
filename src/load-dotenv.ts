import { config } from "@dotenvx/dotenvx"
import { join } from "path"
import { access } from "fs/promises"

export interface LoadDotEnvOptions {
  nodeEnv?: string
  overload?: boolean
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function loadDotEnvFiles(
  basePath: string,
  options: LoadDotEnvOptions = {}
): Promise<Record<string, string>> {
  const processEnv: Record<string, string> = {}
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV || "development"

  const files = [
    join(basePath, `.env.${nodeEnv}.local`),
    join(basePath, `.env.${nodeEnv}`),
    join(basePath, ".env.local"),
    join(basePath, ".env"),
  ]

  for (const file of files) {
    if (await fileExists(file)) {
      const result = config({
        path: file,
        processEnv,
        quiet: true,
        overload: false,
      })

      if (result.error && (result.error as { code?: string }).code !== "MISSING_ENV_FILE") {
        console.error(`Error loading ${file}:`, result.error)
      }
    }
  }

  if (options.overload) {
    const overloadedEnv: Record<string, string> = {}
    for (const file of [...files].reverse()) {
      if (await fileExists(file)) {
        config({
          path: file,
          processEnv: overloadedEnv,
          quiet: true,
          overload: true,
        })
      }
    }
    for (const [key, value] of Object.entries(overloadedEnv)) {
      processEnv[key] = value
    }
  }

  return processEnv
}

export const LoadDotEnv = async ({ directory }: { directory: string }) => {
  return {
    "shell.env": async (input: { cwd?: string }, output: { env: Record<string, string> }) => {
      const basePath = input.cwd ?? directory
      const nodeEnv = process.env.NODE_ENV || "development"

      const loaded = await loadDotEnvFiles(basePath, { nodeEnv })

      for (const [key, value] of Object.entries(loaded)) {
        if (!(key in output.env)) {
          output.env[key] = value
        }
      }

      if (!("NODE_ENV" in output.env)) {
        output.env.NODE_ENV = nodeEnv
      }
    },
  }
}
