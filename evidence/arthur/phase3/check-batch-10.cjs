// Fixed-input name parser sample against a compiled checkout.
const path = require('path')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const parser = require(path.join(root, 'dist-server', 'server', 'utils', 'parsers', 'parseNameString'))
const safe = (fn, input) => {
  try { return { value: fn(input) } }
  catch (error) { return { error: error.message || String(error) } }
}
const inputs = [
  null, '', 0, {}, 'John Smith', 'Smith, John', 'John Middle Smith',
  'John Smith & Jane Doe', 'Smith, John, Doe, Jane', 'Jones; John Smith',
  'John Smith and Jane Doe', 'John Smith, Jane Doe and John Doe',
  'John Smith, Jones, James Doe, Ludwig von Mises', 'von Mises, Ludwig',
  '张三, 李四', 'John Smith & John Smith', 'John Smith,', 'Smith, John Jr.',
  'Dr. Mary Ann OBrien', 'A'
]
console.log('BEHAVIOR_JSON=' + JSON.stringify({
  exports: Object.keys(parser),
  hiddenDefault: Object.hasOwn(parser, 'default'),
  callable: Object.fromEntries(Object.entries(parser).map(([key, fn]) => [key, {
    name: fn.name, length: fn.length, prototype: Object.hasOwn(fn, 'prototype')
  }])),
  parsed: inputs.map((input) => safe(parser.parse, input)),
  lastFirst: ['John Smith', 'Smith', 'John Middle Smith', 'von Mises, Ludwig', '张三', ''].map((input) => safe(parser.nameToLastFirst, input))
}))
