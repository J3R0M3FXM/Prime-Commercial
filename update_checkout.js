const fs = require('fs');
let code = fs.readFileSync('app/components/checkout-modal.tsx', 'utf8');

// 1. In Step 4 Financial Breakdown:
// Find `<div className="border border-gray-200 rounded-xl p-4 bg-white space-y-2.5">`
// Change `space-y-2.5` to `space-y-1.5`
code = code.replace(
  '<div className="border border-gray-200 rounded-xl p-4 bg-white space-y-2.5">',
  '<div className="border border-gray-200 rounded-xl p-4 bg-white space-y-1.5">'
);

// Find `<span className="text-gray-600 uppercase flex items-center gap-1">`
// Change `uppercase` to nothing
code = code.replace(
  '<span className="text-gray-600 uppercase flex items-center gap-1">',
  '<span className="text-gray-600 flex items-center gap-1">'
);

fs.writeFileSync('app/components/checkout-modal.tsx', code);
