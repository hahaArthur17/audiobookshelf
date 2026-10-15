// usage: node typeinfo.js <repo root> <casts.json> <out.json>
// For every counted cast, with the program of tsconfig.server.json:
//  - `as T` / `as unknown as T`: the operand type, and whether operand and target are
//    identical (each assignable to the other): such a cast changes no type and is a
//    removal candidate (it may still steer inference, so it is only a candidate).
//  - `x!`: whether the type of x includes null or undefined; if not, the `!` is a
//    removal candidate.
const fs = require('fs')
const path = require('path')
const [root, json, outFile] = process.argv.slice(2)
const ts = require(path.join(root, 'node_modules/typescript'))
const cfgPath = path.join(root, 'tsconfig.server.json')
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, root)
const program = ts.createProgram({ rootNames: cfg.fileNames, options: { ...cfg.options, noEmit: true } })
const checker = program.getTypeChecker()
const casts = require(path.resolve(json))
const want = new Map()
for (const c of casts) want.set(`${c.file}:${c.line}:${c.kind}:${c.text}`, c)
const res = []
for (const sf of program.getSourceFiles()) {
  const rel = path.relative(root, sf.fileName)
  if (rel.startsWith('node_modules') || rel.startsWith('..')) continue
  const visit = (n) => {
    let kind = null
    if (ts.isAsExpression(n)) {
      const t = n.type
      const isConst = ts.isTypeReferenceNode(t) && t.typeName.getText(sf) === 'const'
      const isInner = t.kind === ts.SyntaxKind.UnknownKeyword && ts.isAsExpression(n.parent) && n.parent.expression === n
      if (!isConst && !isInner) kind = ts.isAsExpression(n.expression) && n.expression.type.kind === ts.SyntaxKind.UnknownKeyword ? 'unk' : 'as'
    } else if (ts.isNonNullExpression(n)) kind = 'nn'
    if (kind) {
      const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
      const key = `${rel}:${line}:${kind}:${n.getText(sf).replace(/\s+/g, ' ').slice(0, 160)}`
      const c = want.get(key)
      if (c) {
        const info = { file: rel, line, kind, text: c.text, tag: c.tag }
        if (kind === 'nn') {
          const t = checker.getTypeAtLocation(n.expression)
          const parts = t.isUnion() ? t.types : [t]
          info.operand = checker.typeToString(t)
          info.nullable = parts.some((p) => p.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Void))
          info.candidate = !info.nullable
        } else {
          const inner = kind === 'unk' ? n.expression.expression : n.expression
          const s = checker.getTypeAtLocation(inner)
          const t = checker.getTypeFromTypeNode(n.type)
          info.operand = checker.typeToString(s).slice(0, 200)
          info.identical = checker.isTypeAssignableTo(s, t) && checker.isTypeAssignableTo(t, s)
          info.assignable = checker.isTypeAssignableTo(s, t)
          info.candidate = info.identical || (kind === 'unk' && info.assignable)
        }
        res.push(info)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}
fs.writeFileSync(outFile, JSON.stringify(res, null, 1))
console.log('casts', casts.length, 'matched', res.length, 'candidates', res.filter((r) => r.candidate).length)
