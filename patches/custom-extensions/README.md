# Custom Extensions Patches

This directory contains source code patches for custom extensions.

## Current Patches

| ID | Name | Target | Description |
|----|------|--------|-------------|
| 001 | eslint-plugin-type-stub | `packages/@n8n/node-cli/src/types/` | Type declaration stub for `@n8n/eslint-plugin-community-nodes` to fix Docker build TS errors |
| 002 | dockerfile-build-fix | `Dockerfile.source` | Fixes turbo dependency ordering by using `--concurrency=1` |
| 003 | ask-ai-local-anthropic | `packages/cli/src/services/ai.service.ts` | Enables Ask AI with direct Anthropic API when `N8N_AI_ANTHROPIC_KEY` is set |
| 004 | multi-agent-canvas-fix | `packages/@n8n/ai-workflow-builder.ee/` | **✅ FIXES** multi-agent workflow builder canvas update issue |

## Usage

### Automatic Application (Docker Build)

✅ **Patches are automatically applied** during `docker compose up -d --build`

The `Dockerfile.source` includes a step that automatically applies all `.patch` files in this directory before building n8n. You don't need to do anything manually!

### Manual Application (Local Development)

If you're developing locally without Docker, apply patches manually:

```powershell
# Apply all patches
Get-ChildItem patches\custom-extensions\*.patch | ForEach-Object { 
    Write-Host "Applying $($_.Name)..."
    git apply $_.FullName 
}

# Or apply a specific patch
git apply patches\custom-extensions\004-multi-agent-canvas-fix.patch
```

### Verify Patches Were Applied (Docker)

```powershell
# Check build logs for patch application
docker compose build n8n 2>&1 | Select-String "Applying"

# Expected output:
# Applying custom extension patches...
# Applying patches/custom-extensions/001-eslint-plugin-type-stub.patch
# Applying patches/custom-extensions/002-dockerfile-build-fix.patch
# Applying patches/custom-extensions/003-ask-ai-local-anthropic.patch
# Applying patches/custom-extensions/004-multi-agent-canvas-fix.patch
```

### Start Services

```powershell
docker compose up -d
```

## Environment Variables

```bash
N8N_AI_ANTHROPIC_KEY=sk-ant-...  # Required for local Ask AI
N8N_AI_ASSISTANT_BASE_URL=       # Leave empty for local mode
```
