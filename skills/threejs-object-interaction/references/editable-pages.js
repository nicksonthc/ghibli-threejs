// Visitor-written pages: kept in this browser only (localStorage), refused when they'd overflow the painted page.
// Adapt: STORE key, MAX_PAGES, and `wrapEntry` / `citeFits` (must use the SAME canvas font + width the page paints with).
export const STORE = '{{app}}.book.v1', MAX_PAGES = 3, MAX_LINES = 9

export function loadStoredPages(){
  try { const j = JSON.parse(localStorage.getItem(STORE) || 'null')
    if (!j || !Array.isArray(j.pages) || !j.pages.length) return null
    return j.pages.slice(0, MAX_PAGES).map(p => ({ text:String(p?.text ?? ''), cite:String(p?.cite ?? '') })) }
  catch { return null }                                     // private window / blocked storage: fall back to the defaults
}
export function storePages(pages){                          // null = reset to the JSON defaults
  try { pages ? localStorage.setItem(STORE, JSON.stringify({ pages, savedAt:new Date().toISOString() })) : localStorage.removeItem(STORE); return true }
  catch (e){ console.warn('this browser will not keep the pages:', e.message); return false }
}

// One card per page: <textarea> for the text (Enter = new line), <input> for a one-line cite, a live "n / 9 lines" counter.
// el = { text, cite, count, ok:{ text:'', cite:'' } }  — `ok` is the last value that fitted.
export function onEditInput(el, { wrapEntry, citeFits, preview }){
  if (wrapEntry(el.text.value).length > MAX_LINES){
    const at = el.text.selectionStart - (el.text.value.length - el.ok.text.length)   // keep the caret where it was
    el.text.value = el.ok.text; el.text.setSelectionRange(at, at); flash(el)
  } else el.ok.text = el.text.value
  if (el.cite.value.includes('\n') || !citeFits(el.cite.value)){ el.cite.value = el.ok.cite; flash(el) }
  else el.ok.cite = el.cite.value
  const n = el.text.value.trim() ? wrapEntry(el.text.value).length : 0
  el.count.textContent = `${n} / ${MAX_LINES} lines`; el.count.classList.toggle('over', n >= MAX_LINES)
  preview()                                                 // repaint the 3D page every keystroke
}
const flash = el => { el.count.classList.add('over'); setTimeout(() => el.count.classList.remove('over'), 350) }

// Reading keys must stand down while the panel is open, or typing turns pages.
export function readingKeys({ isReading, isEditing, closeEditor, closeBook, nextPage }){
  addEventListener('keydown', e => {
    if (!isReading()) return
    if (isEditing()){ if (e.key === 'Escape') closeEditor(); return }
    if (e.key === 'Escape') closeBook()
    else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); nextPage() }
  })
}
