#!/usr/bin/env node
// scripts/strip-console-logs.js
// Removes or comments out console.log() calls from all JS files.
// Preserves console.warn() and console.error() which are useful for production.
// Only touches single-line console.log statements for safety.

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'fs/promises';
import { resolve } from 'path';

const jsDir = resolve('./js');

// Collect all .js files recursively
const files = [];
async function collectFiles(dir) {
    const { readdirSync, statSync } = await import('fs');
    const entries = readdirSync(dir);
    for (const entry of entries) {
        const full = `${dir}/${entry}`;
        const st = statSync(full);
        if (st.isDirectory()) await collectFiles(full);
        else if (entry.endsWith('.js')) files.push(full);
    }
}
await collectFiles(jsDir);

let totalRemoved = 0;
let filesChanged = 0;

for (const file of files) {
    const original = readFileSync(file, 'utf-8');
    const lines = original.split('\n');
    const cleaned = lines.map(line => {
        // Match lines that are ONLY a console.log call (possibly with leading spaces)
        // Doesn't touch console.warn, console.error, console.group, etc.
        const trimmed = line.trim();
        if (/^console\.log\(/.test(trimmed) && trimmed.endsWith(');')) {
            totalRemoved++;
            return null; // Remove line
        }
        return line;
    }).filter(l => l !== null).join('\n');

    if (cleaned !== original) {
        writeFileSync(file, cleaned);
        filesChanged++;
        const removed = original.split('\n').length - cleaned.split('\n').length;
        console.log(`  ${file.replace(jsDir + '/', '')}: removed ${removed} console.log call(s)`);
    }
}

console.log(`\nDone: removed ${totalRemoved} console.log calls across ${filesChanged} files`);
