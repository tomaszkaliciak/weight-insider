const fs = require('fs');
const path = require('path');

const dir = './js/ui/renderers';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

let missingCount = 0;
files.forEach(file => {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    if (content.includes('document.getElementById')) {
        // Simple heuristic: does it have a null check?
        if (!content.includes('if (!this._container)') && !content.includes('if (!this._container ')) {
            console.log(`[Missing Null Check]: ${file}`);
            missingCount++;
        }
    }
});

if (missingCount === 0) {
    console.log('All renderers have null checks!');
}
