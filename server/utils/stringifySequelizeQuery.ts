type FindOptions = import('sequelize').FindOptions

function stringifySequelizeQuery(findOptions: FindOptions): string {
  function isClass(func: unknown): func is Function {
    return typeof func === 'function' && /^class\s/.test(func.toString())
  }

  function replacer(key: string, value: unknown): unknown {
    if (typeof value === 'object' && value !== null) {
      const symbols = Object.getOwnPropertySymbols(value).reduce<Record<string, unknown>>((acc, sym) => {
        acc[sym.toString()] = (value as Record<symbol, unknown>)[sym]
        return acc
      }, {})

      return { ...value, ...symbols }
    }

    if (isClass(value)) {
      return `${value.name}`
    }

    return value
  }

  return JSON.stringify(findOptions, replacer)
}
export = stringifySequelizeQuery
