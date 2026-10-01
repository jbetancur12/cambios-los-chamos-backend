// Reporte de pruebas en español para el ejecutor de Node (node --test --test-reporter).
// Muestra cada prueba agrupada por su suite, marca aparte los bugs conocidos (todo) y cierra con un resumen.

const COLORS = process.stdout.isTTY || process.env.FORCE_COLOR
const paint = (code, text) => (COLORS ? `\u001b[${code}m${text}\u001b[0m` : text)
const green = (t) => paint(32, t)
const red = (t) => paint(31, t)
const yellow = (t) => paint(33, t)
const gray = (t) => paint(90, t)
const bold = (t) => paint(1, t)

const indent = (level) => '  '.repeat(level)
const ms = (value) => `${Math.round(value)} ms`
const seconds = (value) => `${(value / 1000).toFixed(1)} s`

const describeError = (error) => {
  if (!error) return []
  const cause = error.cause && typeof error.cause === 'object' ? error.cause : error
  const lines = []
  lines.push(String(cause.message || error.message || error).split('\n')[0])
  if ('expected' in cause || 'actual' in cause) {
    const show = (v) => {
      try {
        return typeof v === 'string' ? v : JSON.stringify(v)
      } catch {
        return String(v)
      }
    }
    lines.push(`esperado: ${show(cause.expected)}`)
    lines.push(`recibido: ${show(cause.actual)}`)
  }
  return lines
}

module.exports = async function* reporterEs(source) {
  const startedAt = Date.now()
  const counts = { pasaron: 0, fallaron: 0, conocidos: 0, arreglados: 0, omitidas: 0 }
  const failures = []
  const stack = [] // names of the suites currently open
  let printedPath = []

  const printHeadings = function* (path) {
    // Print only the suite levels that changed since the last printed test
    let common = 0
    while (common < path.length && common < printedPath.length && path[common] === printedPath[common]) common++
    for (let level = common; level < path.length; level++) {
      yield `${indent(level)}${bold(path[level])}\n`
    }
    printedPath = path
  }

  for await (const event of source) {
    if (event.type === 'test:start') {
      stack.length = event.data.nesting
      stack.push(event.data.name)
      continue
    }

    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue

    const data = event.data
    if (data.details && data.details.type === 'suite') continue // suites are shown as headings

    const path = stack.slice(0, data.nesting)
    yield* printHeadings(path)
    const pad = indent(path.length)
    const time = gray(`(${ms(data.details ? data.details.duration_ms : 0)})`)
    const todo = data.todo

    if (event.type === 'test:pass') {
      if (todo) {
        counts.arreglados++
        yield `${pad}${yellow('✔')} ${data.name} ${yellow('— ya pasa: quitar la marca de bug conocido')} ${time}\n`
      } else if (data.skip) {
        counts.omitidas++
        yield `${pad}${gray('○')} ${gray(data.name)} ${gray('(omitida)')}\n`
      } else {
        counts.pasaron++
        yield `${pad}${green('✔')} ${data.name} ${time}\n`
      }
    } else if (todo) {
      counts.conocidos++
      const reason = typeof todo === 'string' ? todo : ''
      yield `${pad}${yellow('◌')} ${data.name} ${yellow('— bug conocido')}\n`
      if (reason) yield `${pad}  ${gray(reason)}\n`
    } else {
      counts.fallaron++
      failures.push({ path: [...path, data.name], error: data.details && data.details.error })
      yield `${pad}${red('✖')} ${red(data.name)} ${time}\n`
      for (const line of describeError(data.details && data.details.error)) yield `${pad}  ${red(line)}\n`
    }
  }

  const total = counts.pasaron + counts.fallaron + counts.conocidos + counts.arreglados + counts.omitidas
  const row = (label, value, color = (t) => t, note = '') =>
    `  ${color(label.padEnd(22))}${value}${note ? '  ' + gray(note) : ''}
`
  yield `
${bold('Resumen de pruebas')}
`
  yield row('Total:', total)
  yield row('Pasaron:', counts.pasaron, green)
  yield row('Fallaron:', counts.fallaron, red)
  yield row('Bugs conocidos:', counts.conocidos, yellow, '(fallan a propósito: documentan un problema del informe)')
  if (counts.arreglados > 0)
    yield row('Bugs ya arreglados:', counts.arreglados, yellow, '(pasan: quitar la marca todo)')
  if (counts.omitidas > 0) yield row('Omitidas:', counts.omitidas)
  yield row('Tiempo:', seconds(Date.now() - startedAt))

  if (failures.length > 0) {
    yield `\n${red(bold('Pruebas que fallaron'))}\n`
    for (const failure of failures) yield `  ${red('✖')} ${failure.path.join(' › ')}\n`
    yield `\n${red(bold('RESULTADO: FALLÓ'))}\n`
  } else {
    yield `\n${green(bold('RESULTADO: TODO EN ORDEN'))}\n`
  }
}
