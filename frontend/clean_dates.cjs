const fs = require('fs');

const dataFile = 'data.json';
const rawData = fs.readFileSync(dataFile, 'utf8');
const data = JSON.parse(rawData);

function normalizeDate(dateStr) {
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) return dateStr;
    const parts = dateStr.split('-');
    const year = parts[0];
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    return `${year}-${month}-${day}`;
}

let changesCount = 0;

for (const section in data) {
    if (typeof data[section] === 'object' && data[section] !== null) {
        const newSection = {};
        for (const [key, value] of Object.entries(data[section])) {
            const normalizedKey = normalizeDate(key);
            if (key !== normalizedKey) {
                changesCount++;
            }
            newSection[normalizedKey] = value;
        }
        data[section] = newSection;
    }
}

console.log(`Normalized ${changesCount} date keys.`);

fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
console.log('data.json cleaned and saved.');
