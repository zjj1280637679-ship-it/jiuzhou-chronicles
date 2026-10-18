const fs = require('fs');

const code = fs.readFileSync('app.js', 'utf8');
const lines = code.split('\n');

console.log('--- Click Listeners in app.js ---');
lines.forEach((line, idx) => {
  if (line.includes('click') || line.includes('Click')) {
    if (line.includes('addEventListener') || line.includes('onclick') || line.includes('pointerdown')) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  }
});
