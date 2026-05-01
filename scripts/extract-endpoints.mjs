import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = '/Users/danielpenin/whatsapp_saas/backend/src';
const OUT = '/Users/danielpenin/whatsapp_saas/scripts/extracted-endpoints.json';

function findAllControllers(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findAllControllers(full));
    } else if (entry.endsWith('.controller.ts')) {
      results.push(full);
    }
  }
  return results;
}

function extractControllerInfo(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const relPath = relative(SRC, filePath);

  // Extract @Controller prefix
  const ctrlMatch = content.match(/@Controller\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
  const routePrefix = ctrlMatch ? ctrlMatch[1] : '';

  // Extract class name
  const classMatch = content.match(/export\s+class\s+(\w+)/);
  const className = classMatch ? classMatch[1] : 'Unknown';

  // Extract imports (get DTO names)
  const imports = [];
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"`]([^'"`]+)['"`]/g;
  let impMatch;
  while ((impMatch = importRegex.exec(content)) !== null) {
    const names = impMatch[1]
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    imports.push({ names, from: impMatch[2] });
  }

  // Extract method decorators and endpoints
  const endpoints = [];
  const methodDecorators = [
    '@Get',
    '@Post',
    '@Put',
    '@Patch',
    '@Delete',
    '@Head',
    '@Options',
    '@All',
  ];

  // Find all method definitions with decorators
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this line is a method decorator
    const isMethodDec = methodDecorators.some((d) => trimmed.startsWith(d));
    if (isMethodDec) {
      const endpoint = {
        httpMethod: trimmed.match(/@(\w+)/)?.[1] || 'UNKNOWN',
        route: '',
        decorators: [],
        params: [],
        serviceCall: '',
        lineNumber: i + 1,
      };

      // Extract route from the method decorator
      const routeMatch = trimmed.match(/@\w+\s*\(\s*['"`]([^'"`]*)['"`]/);
      if (routeMatch) endpoint.route = routeMatch[1];

      // Also handle template literal or variable routes
      const templateMatch = trimmed.match(/@\w+\s*\(\s*`([^`]*)`/);
      if (templateMatch) endpoint.route = templateMatch[1];

      // Look back for other decorators on previous lines
      let j = i - 1;
      while (j >= 0) {
        const prevLine = lines[j].trim();
        if (prevLine.startsWith('@')) {
          const decMatch = prevLine.match(/@(\w+)\s*(\(.*?\))?$/);
          if (decMatch) {
            const decName = decMatch[1];
            // Skip method decorators
            if (
              ![
                'Get',
                'Post',
                'Put',
                'Patch',
                'Delete',
                'Head',
                'Options',
                'All',
                'Req',
                'Res',
                'Param',
                'Query',
                'Body',
                'Headers',
                'HttpCode',
                'Redirect',
                'HostParam',
                'Session',
                'Ip',
                'Next',
                'UploadedFile',
                'UploadedFiles',
                'UseGuards',
                'UseInterceptors',
                'UsePipes',
                'UseFilters',
                'SetMetadata',
                'Header',
                'Render',
                'Version',
                'ApiTags',
                'ApiOperation',
                'ApiResponse',
                'ApiBody',
                'ApiParam',
                'ApiQuery',
                'ApiBearerAuth',
                'ApiConsumes',
                'ApiProduces',
                'ApiExcludeEndpoint',
                'ApiExcludeController',
                'ApiOkResponse',
                'ApiCreatedResponse',
                'ApiNotFoundResponse',
                'ApiBadRequestResponse',
                'ApiForbiddenResponse',
                'ApiUnauthorizedResponse',
                'ApiConflictResponse',
                'ApiInternalServerErrorResponse',
                'ApiTooManyRequestsResponse',
                'ApiDefaultResponse',
              ].includes(decName)
            ) {
              endpoint.decorators.push(decMatch[0]);
            }
          }
          j--;
        } else {
          break;
        }
      }

      // Also capture @Public, @Roles, @Idempotent, @KycRequired from decorators
      const specificDecs = ['@Public', '@Roles', '@Idempotent', '@KycRequired'];

      // Also check the next lines for decorators placed between method decorator and method signature
      let k = i + 1;
      while (k < lines.length) {
        const nextLine = lines[k].trim();
        if (nextLine.startsWith('@')) {
          const decMatch = nextLine.match(/@(\w+)\s*(\(.*?\))?$/);
          if (decMatch) {
            const decName = decMatch[1];
            if (
              ![
                'Get',
                'Post',
                'Put',
                'Patch',
                'Delete',
                'Head',
                'Options',
                'All',
                'Req',
                'Res',
                'Param',
                'Query',
                'Body',
                'Headers',
                'HttpCode',
                'Redirect',
                'HostParam',
                'Session',
                'Ip',
                'Next',
                'UploadedFile',
                'UploadedFiles',
                'UseGuards',
                'UseInterceptors',
                'UsePipes',
                'UseFilters',
                'SetMetadata',
                'Header',
                'Render',
                'Version',
                'ApiTags',
                'ApiOperation',
                'ApiResponse',
                'ApiBody',
                'ApiParam',
                'ApiQuery',
                'ApiBearerAuth',
                'ApiConsumes',
                'ApiProduces',
                'ApiExcludeEndpoint',
                'ApiExcludeController',
                'ApiOkResponse',
                'ApiCreatedResponse',
                'ApiNotFoundResponse',
                'ApiBadRequestResponse',
                'ApiForbiddenResponse',
                'ApiUnauthorizedResponse',
                'ApiConflictResponse',
                'ApiInternalServerErrorResponse',
                'ApiTooManyRequestsResponse',
                'ApiDefaultResponse',
              ].includes(decName)
            ) {
              endpoint.decorators.push(decMatch[0]);
            }
          }
          k++;
        } else {
          break;
        }
      }

      // Find the method signature
      let methodLine = k;
      while (methodLine < lines.length) {
        const mLine = lines[methodLine].trim();
        if (mLine.includes('(') && mLine.includes(')')) {
          // Extract method name
          const methodNameMatch = mLine.match(/(?:async\s+)?(\w+)\s*\(/);
          if (methodNameMatch) {
            endpoint.methodName = methodNameMatch[1];
          }

          // Extract return type
          const returnTypeMatch = mLine.match(/\)\s*:\s*(.+?)\s*\{/);
          if (returnTypeMatch) endpoint.returnType = returnTypeMatch[1].trim();

          // Extract parameters
          const paramsStr = mLine.match(/\(([\s\S]*?)\)/)?.[1] || '';
          const paramParts = paramsStr
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
          for (const part of paramParts) {
            const paramInfo = { raw: part };

            // Check for @Body with DTO
            const bodyMatch = part.match(
              /@Body\s*\(\s*(?:new\s+ValidationPipe\s*\([^)]*\)\s*,\s*)?\s*(?:new\s+)?(\w+)\s*(?:\([^)]*\))?\s*\)\s*(\w+)/,
            );
            const bodyMatch2 = part.match(/@Body\s*\(\s*\)\s*(\w+)\s*:\s*(\w+)/);
            const bodyMatch3 = part.match(/@Body\s*\(\s*\)\s*(\w+)/);

            if (bodyMatch) {
              paramInfo.type = 'Body';
              paramInfo.dto = bodyMatch[1];
              paramInfo.name = bodyMatch[2];
            } else if (bodyMatch2) {
              paramInfo.type = 'Body';
              paramInfo.name = bodyMatch2[1];
              paramInfo.dto = bodyMatch2[2];
            } else if (bodyMatch3) {
              paramInfo.type = 'Body';
              paramInfo.name = bodyMatch3[1];
            }

            // Check for @Param
            const paramMatch = part.match(
              /@Param\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*(\w+)\s*)?\)\s*(\w+)/,
            );
            if (paramMatch) {
              paramInfo.type = 'Param';
              paramInfo.paramKey = paramMatch[1];
              paramInfo.name = paramMatch[3];
            }

            // Check for @Query
            const queryMatch = part.match(
              /@Query\s*\(\s*(?:new\s+ValidationPipe\s*\([^)]*\)\s*,\s*)?\s*(?:new\s+)?(\w+)/,
            );
            const queryMatch2 = part.match(/@Query\s*\(\s*\)\s*(\w+)\s*:\s*(\w+)/);
            const queryMatch3 = part.match(/@Query\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*(\w+)/);

            if (queryMatch) {
              paramInfo.type = 'Query';
              paramInfo.dto = queryMatch[1];
            } else if (queryMatch2) {
              paramInfo.type = 'Query';
              paramInfo.name = queryMatch2[1];
              paramInfo.dto = queryMatch2[2];
            } else if (queryMatch3) {
              paramInfo.type = 'Query';
              paramInfo.paramKey = queryMatch3[1];
              paramInfo.name = queryMatch3[2];
            }

            // Check for @Req
            if (part.includes('@Req()') || part.includes('@Req ')) {
              paramInfo.type = 'Req';
              const reqMatch = part.match(/@Req\s*\(\s*\)\s*(\w+)/);
              if (reqMatch) paramInfo.name = reqMatch[1];
            }

            // Check for @CurrentUser
            if (part.includes('@CurrentUser')) {
              paramInfo.type = 'CurrentUser';
              const cuMatch = part.match(/@CurrentUser\s*\(\s*\)\s*(\w+)/);
              if (cuMatch) paramInfo.name = cuMatch[1];
            }

            // Check for @Res
            if (part.includes('@Res()')) {
              paramInfo.type = 'Res';
            }

            // Check for @Headers
            const headerMatch = part.match(/@Headers\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
            if (headerMatch) {
              paramInfo.type = 'Headers';
              paramInfo.headerKey = headerMatch[1];
            }

            // Check for @UploadedFile
            if (part.includes('@UploadedFile')) {
              paramInfo.type = 'UploadedFile';
            }

            // Check for @UploadedFiles
            if (part.includes('@UploadedFiles')) {
              paramInfo.type = 'UploadedFiles';
            }

            endpoint.params.push(paramInfo);
          }

          break;
        }
        methodLine++;
      }

      // Scan the method body for service calls
      if (methodLine < lines.length) {
        let bodyStart = methodLine + 1;
        let braceCount = 0;
        let bodyEnd = bodyStart;
        for (let b = bodyStart; b < lines.length; b++) {
          const bline = lines[b];
          for (const ch of bline) {
            if (ch === '{') braceCount++;
            if (ch === '}') braceCount--;
          }
          if (braceCount < 0) {
            bodyEnd = b;
            break;
          }
        }

        // Extract service calls from the body
        const body = lines.slice(bodyStart, bodyEnd + 1).join('\n');

        // Common service call patterns
        const callPatterns = [/this\.(\w+)\.(\w+)\(/g, /await\s+this\.(\w+)\.(\w+)\(/g];

        const serviceCalls = new Set();
        for (const pattern of callPatterns) {
          let callMatch;
          while ((callMatch = pattern.exec(body)) !== null) {
            serviceCalls.add(`${callMatch[1]}.${callMatch[2]}`);
          }
        }
        endpoint.serviceCalls = [...serviceCalls];
      }

      endpoints.push(endpoint);
    }
    i++;
  }

  return {
    filePath: relPath,
    className,
    routePrefix,
    imports: imports.map((i) => ({
      names: i.names,
      from: i.from.startsWith('.') ? i.from : i.from,
    })),
    endpoints,
  };
}

console.log('Scanning controllers...');
const allFiles = findAllControllers(SRC);
console.log(`Found ${allFiles.length} controller files`);

const results = [];
for (const file of allFiles) {
  try {
    const info = extractControllerInfo(file);
    results.push(info);
  } catch (e) {
    console.error(`Error parsing ${file}:`, e.message);
  }
}

console.log(`Parsed ${results.length} controllers`);
console.log(`Total endpoints: ${results.reduce((sum, r) => sum + r.endpoints.length, 0)}`);

writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(`Written to ${OUT}`);
