import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { PLUGINS_DIR } from './constants.mjs';

export function catE_mcpDoorway() {
  const checks = [];
  const restApiDir = join(PLUGINS_DIR, 'obsidian-local-rest-api');

  checks.push({
    label: 'REST API plugin folder exists',
    pass: existsSync(restApiDir),
    detail: existsSync(restApiDir) ? 'exists' : 'missing',
  });

  const manifestPath = join(restApiDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    checks.push({
      label: 'REST API manifest exists',
      pass: false,
      detail: 'manifest.json missing',
    });
  } else {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const idOk = manifest.id === 'obsidian-local-rest-api';
      checks.push({
        label: 'REST API manifest.id == "obsidian-local-rest-api"',
        pass: idOk,
        detail: idOk ? 'id matches' : `got "${manifest.id}"`,
      });
    } catch (e) {
      checks.push({
        label: 'REST API manifest',
        pass: false,
        detail: `parse error: ${e.message.slice(0, 80)}`,
      });
    }
  }

  checks.push({
    label: 'REST API main.js exists',
    pass: existsSync(join(restApiDir, 'main.js')),
    detail: existsSync(join(restApiDir, 'main.js')) ? 'exists' : 'missing',
  });

  const claudeConfigPath = join(process.env.HOME || '~', '.claude.json');
  let mcpFound = false;
  if (existsSync(claudeConfigPath)) {
    try {
      const claudeCfg = JSON.parse(readFileSync(claudeConfigPath, 'utf8'));
      if (claudeCfg.mcpServers?.obsidian) {
        mcpFound = true;
      }
      if (!mcpFound && claudeCfg.projects) {
        for (const proj of Object.values(claudeCfg.projects)) {
          if (proj?.mcpServers?.obsidian) {
            mcpFound = true;
            break;
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }
  checks.push({
    label: 'MCP obsidian entry in claude config',
    pass: mcpFound,
    detail: mcpFound ? 'found' : 'not found in ~/.claude.json',
  });

  const dataJsonPath = join(restApiDir, 'data.json');
  let apiKeyValid = false;
  if (existsSync(dataJsonPath)) {
    try {
      const data = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
      const key = data.apiKey || '';
      apiKeyValid = key.length > 10 && !key.includes('placeholder') && !key.includes('change-me');
    } catch {
      // ignore
    }
  }
  checks.push({
    label: 'REST API key set (not placeholder)',
    pass: apiKeyValid,
    detail: apiKeyValid ? 'valid key' : 'missing or placeholder',
  });

  const port = (() => {
    try {
      if (existsSync(dataJsonPath)) {
        const data = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
        return data.port || 27124;
      }
    } catch {
      // ignore
    }
    return 27124;
  })();

  const portKey = (() => {
    try {
      if (existsSync(dataJsonPath)) {
        const data = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
        return data.apiKey || '';
      }
    } catch {
      // ignore
    }
    return '';
  })();

  try {
    const curlResult = execSync(
      `curl -sk -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${portKey}" https://localhost:${port}/vault/`,
      { encoding: 'utf8', timeout: 5000 },
    ).trim();
    checks.push({
      label: `REST API healthcheck (port ${port})`,
      pass: curlResult === '200',
      detail: `HTTP ${curlResult}`,
    });
  } catch (e) {
    checks.push({
      label: `REST API healthcheck (port ${port})`,
      pass: false,
      detail: `curl failed: ${(e.stderr || e.message || '').toString().slice(0, 80)}`,
    });
  }

  return { name: 'E. mcp-doorway', checks };
}
