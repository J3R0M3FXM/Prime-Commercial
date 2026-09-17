const fs = require('fs');
const content = fs.readFileSync('app/components/checkout-modal.tsx', 'utf8');
const lines = content.split('\n');
let count = 0;
for(let i=0; i<lines.length; i++) {
  const line = lines[i];
  const opens = (line.match(/\{/g) || []).length;
  const closes = (line.match(/\}/g) || []).length;
  count += opens - closes;
  if (i > 1140 && i < 1160) console.log(i+1, line.substring(0, 50), opens, closes, count);
}
console.log("Final balance:", count);
