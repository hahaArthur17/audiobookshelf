const ts=require(process.argv[2]+'/typescript');const fs=require('fs')
const src=fs.readFileSync(process.argv[3],'utf8')
const sf=ts.createSourceFile('x.js',src,ts.ScriptTarget.ES2022,false,ts.ScriptKind.JS)
process.stdout.write(ts.createPrinter({removeComments:true}).printFile(sf).split('\n').filter(l=>l.trim()!=='').join('\n')+'\n')
