#!/usr/bin/env node
// scripts/normalize-data.js
// Normalizes all date keys in data.json to YYYY-MM-DD format,
// removing duplicates created by zero-padded vs non-zero-padded formats.

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const dataPath = resolve(process.argv[2] || './public/data.json');
const data = JSON.parse(readFileSync(dataPath, 'utf-8'));

function normalizeDate(key) {
    // e.g. "2024-1-5" → "2024-01-05"
    const parts = key.split('-');
    if (parts.length !== 3) return key;
    const [y, m, d] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function normalizeDateObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const normalized = {};
    for (const [key, value] of Object.entries(obj)) {
        const normKey = normalizeDate(key);
        // Prefer the already-normalized key if duplicate exists
        if (normKey in normalized) {
            const existing = normalized[normKey];
            // Only replace if existing is null/0 and new is not
            if ((existing == null || existing === 0) && value != null && value !== 0) {
                normalized[normKey] = value;
            }
        } else {
            normalized[normKey] = value;
        }
    }
    // Sort by date key
    return Object.fromEntries(
        Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b))
    );
}

let duplicatesRemoved = 0;
let keysNormalized = 0;

function processObject(obj, path = '') {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // Check if this looks like a date-keyed object
            const keys = Object.keys(value);
            const isDateKeyed = keys.length > 0 && keys.some(k => /^\d{4}-\d{1,2}-\d{1,2}$/.test(k));
            if (isDateKeyed) {
                const before = Object.keys(value).length;
                result[key] = normalizeDateObject(value);
                const after = Object.keys(result[key]).length;
                duplicatesRemoved += (before - after);
                keysNormalized += before;
                if (before !== after) {
                    console.log(`  [${path}.${key}] ${before} keys → ${after} keys (removed ${before - after} duplicates)`);
                }
            } else {
                result[key] = processObject(value, `${path}.${key}`);
            }
        } else {
            result[key] = value;
        }
    }
    return result;
}

console.log(`Processing: ${dataPath}`);
const cleaned = processObject(data);
const output = JSON.stringify(cleaned, null, 2);
writeFileSync(dataPath, output + '\n');
console.log(`\nDone.`);
console.log(`  Keys scanned: ${keysNormalized}`);
console.log(`  Duplicates removed: ${duplicatesRemoved}`);
console.log(`  Output written to: ${dataPath}`);
