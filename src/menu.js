// A small menu system drawn with HTML buttons, driven by keyboard, gamepad, mouse or touch.
//
// A page is { title?, text?, items: [item], index? }. An item is
//   { label, note?, action?() }                       a button
//   { label, value(), adjust(d) }                      a setting changed with left / right
//   { label, header: true }                            a heading that can't be selected
// Labels, notes and values can be strings or functions.

const val = (v) => (typeof v === 'function' ? v() : v);

export class Menu {
  constructor(el, sound) {
    this.el = el;
    this.sound = sound;
    this.stack = [];
  }

  get page() { return this.stack[this.stack.length - 1]; }
  get depth() { return this.stack.length; }

  open(page) { this.stack = [page]; this.prepare(page); this.render(); }
  push(page) { this.stack.push(page); this.prepare(page); this.render(); this.sound.play('ui'); }
  // replace the current page, keeping the same place in the stack
  swap(page) { this.stack[this.stack.length - 1] = page; this.prepare(page); this.render(); }

  pop() {
    if (this.stack.length <= 1) return false;
    this.stack.pop();
    this.render();
    this.sound.play('ui');
    return true;
  }

  prepare(page) {
    if (page.index == null || !this.selectable(page.items[page.index])) {
      page.index = page.items.findIndex((it) => this.selectable(it));
    }
  }

  selectable(it) { return it && !it.header && !val(it.disabled); }

  render() {
    const page = this.page;
    const el = this.el;
    el.innerHTML = '';
    if (!page) return;
    if (page.title) {
      const h = document.createElement('div');
      h.className = 'menu-title';
      h.textContent = val(page.title);
      el.appendChild(h);
    }
    if (page.text) {
      for (const line of [].concat(val(page.text))) {
        const p = document.createElement('div');
        p.className = 'menu-text';
        p.textContent = line;
        el.appendChild(p);
      }
    }
    const list = document.createElement('div');
    list.className = 'menu-list';
    el.appendChild(list);
    this.buttons = page.items.map((it, i) => {
      if (it.header) {
        const h = document.createElement('div');
        h.className = 'menu-header';
        h.textContent = val(it.label);
        list.appendChild(h);
        return h;
      }
      const b = document.createElement('button');
      b.className = 'menu-item';
      if (val(it.disabled)) b.disabled = true;
      if (it.adjust) {
        b.classList.add('setting');
        const minus = document.createElement('span');
        minus.className = 'arrow';
        minus.textContent = '◀';
        minus.addEventListener('click', (e) => { e.stopPropagation(); this.select(i); this.adjust(-1); });
        const plus = document.createElement('span');
        plus.className = 'arrow';
        plus.textContent = '▶';
        plus.addEventListener('click', (e) => { e.stopPropagation(); this.select(i); this.adjust(1); });
        const label = document.createElement('span');
        label.className = 'label';
        const value = document.createElement('span');
        value.className = 'value';
        b.append(label, minus, value, plus);
      } else {
        const label = document.createElement('span');
        label.className = 'label';
        b.appendChild(label);
        if (it.note) {
          const note = document.createElement('span');
          note.className = 'note';
          b.appendChild(note);
        }
      }
      b.addEventListener('click', (e) => { e.stopPropagation(); this.select(i); this.choose(); });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      list.appendChild(b);
      return b;
    });
    this.refresh();
    if (this.onRender) this.onRender();
  }

  // Update labels and values in place (after a setting changes).
  refresh() {
    const page = this.page;
    if (!page || !this.buttons) return;
    page.items.forEach((it, i) => {
      const b = this.buttons[i];
      if (it.header) return;
      b.querySelector('.label').textContent = val(it.label);
      const v = b.querySelector('.value');
      if (v) v.textContent = val(it.value);
      const n = b.querySelector('.note');
      if (n) n.textContent = val(it.note) || '';
      b.classList.toggle('sel', i === page.index);
    });
    const sel = this.buttons[page.index];
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }

  select(i) {
    if (!this.selectable(this.page.items[i])) return;
    this.page.index = i;
    this.refresh();
  }

  move(d) {
    const page = this.page;
    const n = page.items.length;
    let i = page.index;
    for (let k = 0; k < n; k++) {
      i = (i + d + n) % n;
      if (this.selectable(page.items[i])) break;
    }
    if (i !== page.index) this.sound.play('ui');
    page.index = i;
    this.refresh();
  }

  adjust(d) {
    const it = this.page.items[this.page.index];
    if (!it || !it.adjust) return;
    it.adjust(d);
    this.sound.play('ui');
    this.refresh();
  }

  choose() {
    const it = this.page.items[this.page.index];
    if (!this.selectable(it)) return;
    if (it.adjust && !it.action) { this.adjust(1); return; }
    if (it.action) it.action();
  }

  // Returns true if the player asked to go back from the top page.
  handle(input) {
    if (!this.page) return false;
    if (input.pressed('up')) this.move(-1);
    if (input.pressed('down')) this.move(1);
    if (input.pressed('left')) this.adjust(-1);
    if (input.pressed('right')) this.adjust(1);
    if (input.anyPressed('jump', 'interact')) this.choose();
    if (input.anyPressed('pause', 'hook')) {
      const page = this.page;
      if (page.onBack) { page.onBack(); return false; }
      if (!this.pop()) return true;
    }
    return false;
  }
}
