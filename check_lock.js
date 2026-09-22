const fs = require('fs');
const raw = fs.readFileSync('C:\\Users\\Usuario\\TMS\\apps\\web\\package-lock.json', 'utf8');
let json;
try {
  json = JSON.parse(raw);
} catch (e) {
  console.log('PARSE_ERROR:', e.message);
  process.exit(1);
}
const names = Object.keys(json.packages || {});
console.log('TOTAL_PACKAGES:', names.length);
console.log('HAS_SWC:', names.filter(n => n.includes('@swc')).length);
console.log('HAS_WEBPACK:', names.filter(n => n.includes('webpack')).length);
console.log('BYTES:', raw.length);
