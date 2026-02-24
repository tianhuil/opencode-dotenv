# OpenCode DotEnv Plugin

![CI](https://github.com/tianhuil/opencode-dotenv/actions/workflows/ci.yml/badge.svg)

An OpenCode plugin that automatically loads `.env` files into shell environments before every bash command execution.

## Features

- **Automatic environment injection** - Loads `.env` files before AI-triggered bash commands and interactive terminals
- **Multi-environment support** - Follows [dotenv-flow convention](https://dotenvx.com/docs/advanced/config-convention#flow-convention) for `.env.development`, `.env.production`, etc.
- **Encrypted secrets** - Supports encrypted values using [dotenvx](https://dotenvx.com/)
- **Variable expansion** - Reference other variables: `DATABASE_URL=postgres://${USER}@localhost`
- **Safe merging** - Doesn't override existing environment variables

## Installation

### Install from npm (Recommended)

Add to your `opencode.json` config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@tianhuil/opencode-dotenv"]
}
```

OpenCode automatically installs npm plugins using Bun at startup. Packages are cached in `~/.cache/opencode/node_modules/`.

---

### Option 1: Project-level Plugin (Development)

The plugin files are already in place. OpenCode will automatically load it:

```bash
# Plugin is located at:
.opencode/plugins/load-dotenv.ts
```

Restart OpenCode to pick up the plugin.

### Option 2: Global Plugin (Development)

To use this plugin across all projects:

```bash
# Copy plugin to global plugins directory
mkdir -p ~/.config/opencode/plugins
cp .opencode/plugins/load-dotenv.ts ~/.config/opencode/plugins/

# Copy dependencies package.json
mkdir -p ~/.config/opencode
cp .opencode/package.json ~/.config/opencode/package.json
```

## Usage

Create `.env` files in your project root:

```bash
# Global defaults
echo "APP_NAME=MyApp" > .env
echo "DATABASE_HOST=localhost" >> .env

# Development overrides
echo "DEBUG=true" > .env.development
echo "LOG_LEVEL=debug" >> .env.development

# Production overrides
echo "LOG_LEVEL=warn" > .env.production
echo "API_URL=https://api.example.com" >> .env.production
```

The plugin automatically loads environment variables based on `NODE_ENV`:

| NODE_ENV | Files loaded (in priority order) |
|-----------|-------------------------------|
| `development` | `.env.development.local`, `.env.development`, `.env.local`, `.env` |
| `production` | `.env.production.local`, `.env.production`, `.env.local`, `.env` |
| `test` | `.env.test.local`, `.env.test`, `.env.local`, `.env` |
| not set | Defaults to `development` |

## Encryption

Encrypt secrets in your `.env` files:

```bash
# Install dotenvx CLI
bun install -g @dotenvx/dotenvx

# Generate encryption keys
dotenvx encrypt

# Set encrypted value
dotenvx set API_KEY "my-secret-key"
```

Create `.env.keys` with your private keys:

```env
DOTENV_PRIVATE_KEY="your-private-key-here"
DOTENV_PRIVATE_KEY_PRODUCTION="your-production-key"
```

**Important:** Add `.env.keys` to `.gitignore` - never commit private keys.

## Environment Files

### File Loading Order

When `NODE_ENV=development`:

```
1. .env.development.local  (highest priority - never commit)
2. .env.development        (dev defaults - safe to commit)
3. .env.local            (local overrides - never commit)
4. .env                  (global defaults - safe to commit)
```

### What to Commit

```gitignore
# ✅ Safe to commit (no secrets)
.env
.env.development
.env.production
.env.test

# ❌ Never commit (contains secrets)
.env.keys
.env.local
.env.*.local
```

## Testing

### Run Unit Tests

```bash
bun test test/load-dotenv.test.ts
```

### Run E2E Tests

```bash
# Requires OpenCode CLI to be installed
bun test test/e2e-cli.test.ts
```

### Run All Tests

```bash
bun test
```

## Development

### Project Structure

```
opencode-dotenv/
├── src/
│   └── load-dotenv.ts          # Main implementation
├── .opencode/
│   ├── package.json             # Plugin dependencies
│   └── plugins/
│       └── load-dotenv.ts      # Shim (loads plugin)
├── test/
│   ├── load-dotenv.test.ts     # Unit tests
│   ├── e2e-cli.test.ts        # E2E tests
│   └── fixtures/
│       ├── env-loading/         # Unit test fixtures
│       ├── encrypted-env/       # Encryption test fixtures
│       └── e2e/               # E2E test workspace
└── notes/
    └── opencode-dotenv-plugin.md # Implementation docs
```

### Edit Plugin

1. Edit `src/load-dotenv.ts`
2. Run tests: `bun test`
3. Restart OpenCode

The shim in `.opencode/plugins/load-dotenv.ts` automatically reloads changes.

## Troubleshooting

**Environment variables not loading:**
- Check `.env` files exist in project root
- Verify plugin is in `.opencode/plugins/`
- Run `bun install` in `.opencode/` to install dependencies

**Wrong environment loaded:**
- Check `NODE_ENV`: `echo $NODE_ENV`
- Verify file names: `.env.production` not `.env.prod`

**Encrypted values not decrypting:**
- Ensure `.env.keys` exists or `DOTENV_PRIVATE_KEY` is set
- Check public/private key pair match

## References

- [OpenCode Plugins Documentation](https://opencode.ai/docs/plugins/)
- [Dotenvx Documentation](https://dotenvx.com/docs/)
- [Dotenvx Flow Convention](https://dotenvx.com/docs/advanced/config-convention#flow-convention)
- [Dotenvx Encryption Guide](https://dotenvx.com/docs/quickstart/encryption)
