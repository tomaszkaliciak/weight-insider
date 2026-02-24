const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, 'js');

function processDir(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.js')) {
            processFile(fullPath);
        }
    }
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Use a regex to find console statements that aren't already commented
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (!line.trim().startsWith('//') && /console\.(warn|error|log)\s*\(/.test(line)) {
            // Replace console.X( with // console.X(
            lines[i] = line.replace(/(console\.(?:warn|error|log)\s*\()/, '// $1');
            modified = true;
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        console.log(`Cleaned: ${filePath}`);
    }
}

processDir(jsDir);
console.log('Finished cleaning console statements.');
