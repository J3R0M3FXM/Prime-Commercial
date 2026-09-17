const fs = require('fs');
const content = fs.readFileSync('app/components/checkout-modal.tsx', 'utf8');
const lines = content.split('\n');
let count = 0;
for(let i=0; i<lines.length; i++) {
  const line = lines[i];
  const opens = (line.match(/<div(\s|>)/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  count += opens - closes;
  if(i > 745 && i < 760) console.log(i+1, opens, closes, count);
}
console.log("Final balance:", count);
