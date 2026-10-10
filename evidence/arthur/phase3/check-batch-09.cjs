// Fixed-input equivalence sample against compiled checkout.
const path = require('path')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const equal = require(path.join(root, 'dist-server', 'server', 'utils', 'areEquivalent'))
const safe = (left, right, coerce = false, stack) => {
  try { return { value: equal(left, right, coerce, stack) } }
  catch (error) { return { error: error.message } }
}
const sameFunctionA = function calc(x) { return x + 1 }
const sameFunctionB = function calc(x) { return x + 1 }
const circleA = { value: 1 }
circleA.self = circleA
const circleB = { value: 1 }
circleB.self = circleB
const stack = []
const sample = {
  export: { type: typeof equal, name: equal.name, length: equal.length, prototype: Object.hasOwn(equal, 'prototype') },
  primitives: [safe(1, 1), safe(1, '1'), safe(1, '1', true), safe(NaN, NaN), safe(null, {}), safe(false, 0)],
  functions: [safe(sameFunctionA, sameFunctionB), safe(sameFunctionA, (x) => x + 1)],
  dates: [safe(new Date('2020-01-01'), new Date('2020-01-01')), safe(new Date('invalid'), new Date('invalid')), safe(new Date('2020-01-01'), {})],
  arrays: [safe([1, { a: 2 }], [1, { a: 2 }]), safe([1], [1, 2]), safe([1, 2], { 0: 1, 1: 2 })],
  objects: [safe({ b: 2, a: 1 }, { a: 1, b: 2 }), safe({ a: { b: 2 } }, { a: { b: 3 } }), safe({}, {})],
  circular: safe(circleA, circleB),
  customStack: { result: safe({ a: 1 }, { a: 1 }, false, stack), remaining: stack.length }
}
console.log('BEHAVIOR_JSON=' + JSON.stringify(sample))
