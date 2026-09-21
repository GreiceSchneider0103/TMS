import fs from 'node:fs';
import path from 'node:path';
import { buildFreightWorkbookCompatibilityReport } from '../src/services/freightWorkbookCompatibility.js';

function usage() {
  console.error('Uso: node scripts/validateFreightWorkbook.mjs <arquivo.xlsx|arquivo.base64.txt>');
}

const inputPath = process.argv[2];
if (!inputPath) {
  usage();
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error(`Arquivo não encontrado: ${inputPath}`);
  process.exit(2);
}

const ext = path.extname(inputPath).toLowerCase();
const raw = fs.readFileSync(inputPath);
const base64Content = ext === '.xlsx' ? raw.toString('base64') : raw.toString('utf-8').trim();

const report = buildFreightWorkbookCompatibilityReport(base64Content);

console.log(JSON.stringify(report, null, 2));
