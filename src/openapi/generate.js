import fs from 'node:fs';
import path from 'node:path';
import { generateOpenApiDocument } from './index.js';

const openApiDoc = generateOpenApiDocument();
const outputPath = path.join(process.cwd(), 'docs', 'openapi.json');

fs.writeFileSync(outputPath, JSON.stringify(openApiDoc, null, 2) + '\n');
console.log(`Generated OpenAPI spec at ${outputPath}`);
