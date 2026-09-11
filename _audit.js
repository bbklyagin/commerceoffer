// Headless-аудит вёрстки: переполнение, обрезка, наложение, схемы.
// Запускается в контексте страницы, возвращает JSON.
(function audit(){
  const R = {w: innerWidth, issues: []};
  const add = (type, sel, info) => R.issues.push(Object.assign({type, sel}, info));
  const name = el => {
    if (!el || !el.tagName) return '?';
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (typeof el.className === 'string' && el.className.trim())
      s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    return s;
  };
  const yOf = el => Math.round(el.getBoundingClientRect().top + scrollY);
  const all = [...document.querySelectorAll('body *')];

  // 1. Горизонтальное переполнение документа
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1)
    add('doc-h-overflow', 'html', {scrollW: de.scrollWidth, vw: innerWidth});

  // 2. Элементы, выходящие за пределы окна
  all.forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
    if (el.closest('svg')) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > innerWidth + 2 || r.left < -2)
      add('offscreen-x', name(el), {left: Math.round(r.left), right: Math.round(r.right), y: yOf(el)});
  });

  // 3. Обрезанный контент (overflow:hidden и содержимое не влезает)
  all.forEach(el => {
    const cs = getComputedStyle(el);
    if (el.closest('svg')) return;
    const hidX = cs.overflowX === 'hidden', hidY = cs.overflowY === 'hidden';
    if (hidX && el.scrollWidth > el.clientWidth + 3 && el.clientWidth > 0)
      add('clipped-x', name(el), {scrollW: el.scrollWidth, clientW: el.clientWidth, y: yOf(el)});
    if (hidY && el.scrollHeight > el.clientHeight + 3 && el.clientHeight > 0 && cs.textOverflow !== 'ellipsis')
      add('clipped-y', name(el), {scrollH: el.scrollHeight, clientH: el.clientHeight, y: yOf(el)});
  });

  // 4. Наложение соседних блоков (слипание/перекрытие)
  const blocks = all.filter(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') return false;
    if (el.closest('svg') || el.closest('details:not([open])')) return false;
    if (!/^(DIV|SECTION|LI|P|H1|H2|H3|H4|TD|TH|ARTICLE|FIGURE|DL|DT|DD)$/.test(el.tagName)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 12 && r.height > 8;
  });
  const byParent = new Map();
  blocks.forEach(el => {
    const p = el.parentElement;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(el);
  });
  byParent.forEach(sibs => {
    for (let i = 0; i < sibs.length; i++) for (let j = i + 1; j < sibs.length; j++) {
      const a = sibs[i].getBoundingClientRect(), b = sibs[j].getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 3 && oy > 3)
        add('overlap', name(sibs[i]) + ' ⨯ ' + name(sibs[j]), {ox: Math.round(ox), oy: Math.round(oy), y: yOf(sibs[i])});
    }
  });

  // 5. Схемы: SVG и его подписи
  [...document.querySelectorAll('svg')].forEach((s, i) => {
    const r = s.getBoundingClientRect();
    const vb = (s.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    let outside = 0, collide = 0;
    const texts = [...s.querySelectorAll('text')];
    texts.forEach(t => {
      const tr = t.getBoundingClientRect();
      if (tr.left < r.left - 1 || tr.right > r.right + 1 || tr.top < r.top - 1 || tr.bottom > r.bottom + 1) outside++;
    });
    for (let a = 0; a < texts.length; a++) for (let b = a + 1; b < texts.length; b++) {
      const ra = texts[a].getBoundingClientRect(), rb = texts[b].getBoundingClientRect();
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 2 && oy > 2) collide++;
    }
    if (outside || collide)
      add('svg', 'svg[' + i + ']', {outside, collide, y: yOf(s), viewBox: vb.join(' ')});
    // соотношение сторон viewBox не должно искажаться
    if (vb.length === 4 && r.width > 0) {
      const want = vb[2] / vb[3], got = r.width / r.height;
      if (Math.abs(want - got) / want > 0.03)
        add('svg-aspect', 'svg[' + i + ']', {want: want.toFixed(3), got: got.toFixed(3), y: yOf(s)});
    }
  });

  // 6. Таблицы: переполнение без скролл-обёртки
  [...document.querySelectorAll('table')].forEach((t, i) => {
    let wrap = t.parentElement, scrollable = false;
    for (let k = 0; k < 3 && wrap; k++, wrap = wrap.parentElement) {
      const ox = getComputedStyle(wrap).overflowX;
      if (ox === 'auto' || ox === 'scroll') { scrollable = true; break; }
    }
    const avail = (t.parentElement || de).clientWidth;
    if (t.scrollWidth > avail + 2 && !scrollable)
      add('table-overflow', 'table[' + i + ']', {tableW: t.scrollWidth, availW: avail, y: yOf(t)});
    // ячейки, сжатые до нечитаемого
    [...t.querySelectorAll('td,th')].forEach(c => {
      const r = c.getBoundingClientRect();
      if (r.width > 0 && r.width < 34 && c.textContent.trim().length > 3)
        add('cell-squeezed', 'table[' + i + '] ' + c.tagName.toLowerCase(), {w: Math.round(r.width), text: c.textContent.trim().slice(0, 24), y: yOf(c)});
    });
  });

  // 7. Слишком мелкий текст
  const sizes = {};
  all.forEach(el => {
    if (el.closest('svg') || !el.textContent.trim()) return;
    if (el.children.length) return;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs && fs < 11) { const k = fs.toFixed(1); sizes[k] = (sizes[k] || 0) + 1; }
  });
  if (Object.keys(sizes).length) add('tiny-text', 'various', {sizes});

  // 8. Битые ссылки-якоря
  const missing = [...document.querySelectorAll('a[href^="#"]')]
    .map(a => a.getAttribute('href')).filter(h => h.length > 1)
    .filter(h => { try { return !document.querySelector(h); } catch (e) { return true; } });
  if (missing.length) add('dead-anchor', 'a[href^="#"]', {missing: [...new Set(missing)]});

  R.counts = R.issues.reduce((m, x) => (m[x.type] = (m[x.type] || 0) + 1, m), {});
  return R;
})()
