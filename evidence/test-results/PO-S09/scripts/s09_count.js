// AST counts per converted controller at a given commit (clone in cwd). usage: node s09_count.js <ts-module-dir> file...
const path=require('path'),fs=require('fs'); const ts=require(path.join(process.argv[2],'node_modules','typescript')); const K=ts.SyntaxKind
const out={}
for(const file of process.argv.slice(3)){
 const text=fs.readFileSync(file,'utf8'); const sf=ts.createSourceFile(file,text,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS)
 const c={cast:0,castUnknown:0,castErrorMsg:0,nonnull:0,indexsig:0,thisApiRouter:0,any:0,tsIgnore:0,declare:0,lines:0}
 c.lines=text.split(/\r?\n/).filter(l=>l.trim()).length
 const lineOf=n=>sf.getLineAndCharacterOfPosition(n.getStart()).line+1
 const rows=[]
 ;(function v(n){
  if(n.kind>=K.FirstJSDocNode&&n.kind<=K.LastJSDocNode) return
  if(n.kind===K.AnyKeyword) c.any++
  if(ts.isAsExpression(n)&&!(ts.isTypeReferenceNode(n.type)&&n.type.typeName.text==='const')){c.cast++; const t=n.type.getText(sf); const e=n.expression.getText(sf); rows.push(['cast',lineOf(n),e.slice(0,50)+' as '+t.slice(0,70)]); if(t==='unknown') c.castUnknown++}
  if(ts.isTypeAssertionExpression(n)) {c.cast++; rows.push(['cast<>',lineOf(n),n.getText(sf).slice(0,80)])}
  if(ts.isNonNullExpression(n)){c.nonnull++; rows.push(['nonnull',lineOf(n),n.getText(sf).slice(0,70)])}
  if(ts.isIndexSignatureDeclaration(n)){c.indexsig++; rows.push(['indexsig',lineOf(n),n.getText(sf).slice(0,70)])}
  if(ts.isParameter(n)&&n.name.getText(sf)==='this'&&n.type&&n.type.getText(sf)==='ApiRouter') c.thisApiRouter++
  if(ts.isPropertyDeclaration(n)&&n.modifiers&&n.modifiers.some(m=>m.kind===K.DeclareKeyword)) c.declare++
  ts.forEachChild(n,v)})(sf)
 c.tsIgnore=(text.match(/@ts-(ignore|expect-error|nocheck)/g)||[]).length
 out[file]={c,rows}
}
const tot={}; for(const f in out){ for(const k in out[f].c) tot[k]=(tot[k]||0)+out[f].c[k] }
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([f,v])=>[path.basename(f),v.c])),null,0)); console.log('TOTAL',JSON.stringify(tot))
if(process.env.ROWS){ for(const f in out){ console.log('##',path.basename(f)); out[f].rows.forEach(r=>console.log('  ',r[0],r[1],r[2])) } }
