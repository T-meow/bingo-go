const key = 'counter-save'
let save = load()
const output = document.getElementById('count')
document.getElementById('increment').addEventListener('click', () => { save.count += 1; persist() })
document.getElementById('reset').addEventListener('click', () => { save = { schemaVersion: 1, count: 0 }; persist() })
render()

function load() {
  try { const value = JSON.parse(localStorage.getItem(key) ?? 'null'); if (value?.schemaVersion === 1 && Number.isInteger(value.count) && value.count >= 0) return value } catch { /* reset only this package */ }
  return { schemaVersion: 1, count: 0 }
}
function persist() { localStorage.setItem(key, JSON.stringify(save)); render() }
function render() { output.value = String(save.count) }
