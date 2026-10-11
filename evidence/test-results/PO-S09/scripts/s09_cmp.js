// usage: node s09_cmp.js <dirA> <dirB>  -> compares two dist-server trees after removing comments and normalising quotes in require() calls
const ts=require(process.env.HOME+'/work/audit/node_modules/typescript'); const fs=require('fs'), path=require('path'), cp=require('child_process');
const [A,B]=process.argv.slice(2);
function walk(d,b=d,o=[]){for(const f of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,f.name); if(f.isDirectory()) walk(p,b,o); else if(f.name.endsWith('.js')) o.push(path.relative(b,p));} return o}
function norm(file){let t=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'); const sf=ts.createSourceFile(file,t,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
 const pr=ts.createPrinter({removeComments:true,newLine:ts.NewLineKind.LineFeed}); let out=pr.printFile(sf);
 out=out.replace(/require\((["'])(.*?)\1\)/g,'require("$2")').replace(/\n\s*\n/g,'\n').replace(/"use strict";\n/,''); return out}
const fa=new Set(walk(A)), fb=new Set(walk(B)); let same=0, bytes=0, norm_same=0; const diffs=[]; const only=[];
for(const f of new Set([...fa,...fb])){ if(!fa.has(f)||!fb.has(f)){only.push((fa.has(f)?'only in A: ':'only in B: ')+f);continue}
 const a=fs.readFileSync(path.join(A,f)), b=fs.readFileSync(path.join(B,f)); if(a.equals(b)){bytes++;continue}
 const na=norm(path.join(A,f)), nb=norm(path.join(B,f)); if(na===nb){norm_same++; diffs.push(f+'  (raw different; same after removing comments and require quote style)'); continue}
 fs.writeFileSync('/tmp/na.js',na); fs.writeFileSync('/tmp/nb.js',nb); const d=cp.spawnSync('diff',['/tmp/na.js','/tmp/nb.js']).stdout.toString().split('\n').filter(l=>/^[<>]/.test(l));
 diffs.push(f+'  CODE DIFFERENCE: '+d.length+' lines'); if(process.env.SHOW) console.log(d.slice(0,30).join('\n'))}
console.log('files A',fa.size,'B',fb.size,'byte-identical',bytes,'raw-different but same code',norm_same,'code differences',diffs.filter(x=>/CODE DIFF/.test(x)).length);
diffs.forEach(x=>console.log('  '+x)); only.forEach(x=>console.log('  '+x));
