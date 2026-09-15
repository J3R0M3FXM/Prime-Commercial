const fs = require('fs');
let code = fs.readFileSync('lib/charges.ts', 'utf8');

const titleCaseFn = `
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
`;

code = code.replace(
  'export function normalizeCharge(raw: any, fallbackId = \'\'): ChargeConfig {',
  titleCaseFn + '\nexport function normalizeCharge(raw: any, fallbackId = \'\'): ChargeConfig {'
);

code = code.replace(
  `name: String(raw.name || 'Additional Charge').trim(),`,
  `name: toTitleCase(String(raw.name || 'Additional Charge').trim()),`
);

fs.writeFileSync('lib/charges.ts', code);
