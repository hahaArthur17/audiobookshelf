// usage: node chkstatics.js <repo-dir>
// Checks that every name declared in server/utils/sequelizeStatics.d.ts exists on the Sequelize class at runtime,
// and that each data type constant is the same object as DataTypes[name].
const fs = require('fs')
const root = process.argv[2]
const S = require(root + '/node_modules/sequelize')
const Sequelize = S.Sequelize || S
const src = fs.readFileSync(root + '/server/utils/sequelizeStatics.d.ts', 'utf8')
const names = [...src.matchAll(/export const (\w+):/g)].map((m) => m[1])
const problems = []
for (const n of names) {
  const v = Sequelize[n]
  if (v === undefined) {
    problems.push(n + ': missing on Sequelize')
    continue
  }
  if (!['Op', 'QueryTypes', 'DataTypes'].includes(n) && v !== Sequelize.DataTypes[n]) problems.push(n + ': not the same object as DataTypes.' + n)
}
if (Sequelize.prototype.QueryTypes === undefined) problems.push('prototype.QueryTypes: missing')
else if (Sequelize.prototype.QueryTypes !== Sequelize.QueryTypes) problems.push('prototype.QueryTypes differs from Sequelize.QueryTypes')
console.log('declared names:', names.length)
console.log('Op defined:', Sequelize.Op !== undefined, ' QueryTypes defined:', Sequelize.QueryTypes !== undefined, ' DataTypes defined:', Sequelize.DataTypes !== undefined)
console.log('problems:', problems.length)
for (const p of problems) console.log(' -', p)
// data types that sequelize puts on the class but the d.ts does not list
const listed = new Set(names)
const extra = Object.keys(Sequelize.DataTypes).filter((k) => Sequelize[k] === Sequelize.DataTypes[k] && !listed.has(k))
console.log('data types on the class but not declared:', extra.length ? extra.join(', ') : 'none')
