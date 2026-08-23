// Quick CSS brace-balance checker (ignores comments & strings)
const fs = require('fs');
const css = fs.readFileSync('css/style.css', 'utf8');
let depth = 0, line = 1, inComment = false, inString = null;
const events = [];
for (let i = 0; i < css.length; i++) {
    const ch = css[i], next = css[i + 1];
    if (ch === '\n') line++;
    if (inComment) { if (ch === '*' && next === '/') { inComment = false; i++; } continue; }
    if (inString) { if (ch === inString && css[i - 1] !== '\\') inString = null; continue; }
    if (ch === '/' && next === '*') { inComment = true; i++; continue; }
    if (ch === '"' || ch === "'") { inString = ch; continue; }
    if (ch === '{') { depth++; events.push({ line, type: 'open', depth }); }
    if (ch === '}') { depth--; events.push({ line, type: 'close', depth }); if (depth < 0) { console.log(`EXTRA } at line ${line}`); depth = 0; } }
}
console.log('Final depth:', depth);
if (depth !== 0) {
    // find where it drifted: show last 10 events
    console.log(events.slice(-12));
}
