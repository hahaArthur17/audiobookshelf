// Compare compiled dbMigration JavaScript after removing only the TypeScript
// source's outer scope block and its added four-space indentation.
const fs = require('node:fs')
const path = require('node:path')

const [baselineRoot, candidateRoot] = process.argv.slice(2)
if (!baselineRoot || !candidateRoot) throw new Error('Provide baseline and candidate checkout paths')
const relativePath = 'dist-server/server/utils/migrations/dbMigration.js'
const baseline = fs.readFileSync(path.resolve(baselineRoot, relativePath), 'utf8')
const candidate = fs.readFileSync(path.resolve(candidateRoot, relativePath), 'utf8')
const lines = candidate.split('\n')
if (lines[0] !== '"use strict";' || lines[1] !== '{' || lines.at(-2) !== '}') {
  throw new Error('Candidate does not have the expected single outer scope block')
}
const normalized = [lines[0], ...lines.slice(2, -2).map((line) => line.startsWith('    ') ? line.slice(4) : line)].join('\n') + '\n'
if (normalized !== baseline) {
  throw new Error('Compiled JavaScript differs after outer block normalization')
}
process.stdout.write('compiled dbMigration JavaScript matches Phase 2 byte-for-byte after outer block normalization\n')
