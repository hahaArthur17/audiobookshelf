// Fixed-input personal-name parser sample against a compiled checkout.
const path = require('path')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const parse = require(path.join(root, 'dist-server/server/utils/parsers/parseFullName'))
const inputs = [
  [],
  [null],
  [42],
  [''],
  ['John Doe'],
  ['JOHN DOE'],
  ['john doe'],
  ['  Dr. Jane van der Meer, Jr.  '],
  ['Doe, Jane Q.'],
  ['Mr. John "Jack" Doe'],
  ["Ms. Anne 'Annie' Smith, Ph.D."],
  ['John (Jack) [Johnny] Doe'],
  ['John (Jack) [Johnny] Doe', 'all', true, true],
  ['Dr. Prof. John Doe, Jr., Ph.D.'],
  ['Dr. Prof. John Doe, Jr., Ph.D.', 'error', false, true],
  ['JOHN DOE', 'first', false],
  ['JOHN DOE', 'last', true],
  ['JOHN DOE', 'all', 0],
  ['JOHN DOE', 'all', 1],
  ['JOHN DOE', 'all', 'undefined'],
  ['Jane Mary Sue Ellen Doe', 'middle'],
  ['Jane Mary Sue Ellen Doe', 'error', false, true],
  ['Dr. Jane Doe', 'title'],
  ['Dr. Jane Doe', 'nick'],
  ['Dr. Jane Doe', 'suffix'],
  ['Dr. Jane Doe', 'ERROR'],
  ['John Doe', 42],
  ['John & Jane Doe'],
  ['Jean de la Fontaine'],
  ['Lady Ada Lovelace', 'all', undefined, undefined, true],
  ['Sultan Ahmad Shah', 'all', undefined, undefined, true],
  ['McDONALD, JOHN'],
  ['李 小龙'],
  ['John,'],
  ['Dr.'],
  [false, 'error'],
  [{ name: 'John' }, 'all']
]
const run = (args) => {
  try { return { value: parse(...args) } }
  catch (error) { return { thrownType: typeof error, thrown: String(error) } }
}
console.log('BEHAVIOR_JSON=' + JSON.stringify({
  callable: { type: typeof parse, name: parse.name, length: parse.length, prototype: Object.hasOwn(parse, 'prototype') },
  cases: inputs.map((args) => ({ args, result: run(args) }))
}))
