# Whitelabel Source Patches

This directory contains source code patches for white-label/local development customizations.

## Current Patches

| ID | Name | Target | Description |
|----|------|--------|-------------|
| 002 | dockerfile-build-fix | `Dockerfile.source` | Fixes turbo dependency ordering by using `--concurrency=1` |
| 003 | ask-ai-local-anthropic | `packages/cli/src/services/ai.service.ts` | Enables Ask AI with direct Anthropic API when `N8N_AI_ANTHROPIC_KEY` is set |
| 004 | multi-agent-canvas-fix | `packages/@n8n/ai-workflow-builder.ee/` | **✅ FIXES** multi-agent workflow builder canvas update issue |

## Additional Files

| File | Location | Purpose |
|------|----------|---------|
| `eslint-plugin-community-nodes.d.ts` | `packages/@n8n/node-cli/src/types/` | Type stub for Docker builds |

## Usage

### Apply All Patches

```powershell
Get-ChildItem patches\custom-extensions\*.patch | ForEach-Object { git apply $_.FullName }
```

### Verify

```powershell
docker compose build n8n
docker compose up -d
```

## Environment Variables

```bash
N8N_AI_ANTHROPIC_KEY=sk-ant-...  # Required for local Ask AI
N8N_AI_ASSISTANT_BASE_URL=       # Leave empty for local mode
```
