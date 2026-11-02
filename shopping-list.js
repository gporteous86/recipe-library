/* Shopping list for the Meal Planner. This version is stored on this device only. */
(() => {
  'use strict';
  const plannerScreen = document.getElementById('plannerScreen');
  if (!plannerScreen) return;

  const style = document.createElement('style');
  style.textContent = `
    .shopping-panel{margin:28px 0 12px}
    .shopping-panel .section{margin-bottom:8px}
    .shopping-add{display:flex;gap:8px}
    .shopping-add .field{min-width:0;flex:1}
    .shopping-add .btn{white-space:nowrap}
    .shopping-items{list-style:none;padding:0;margin:12px 0;display:grid;gap:8px}
    .shopping-item{display:flex;align-items:center;gap:6px;min-height:52px;padding:6px 10px;background:var(--card);border:1px solid var(--line);border-radius:14px}
    .shopping-item label{display:flex;align-items:center;gap:12px;flex:1;min-width:0;margin:0;font-weight:400;cursor:pointer}
    .shopping-item input{width:21px;height:21px;accent-color:var(--purple);flex-shrink:0}
    .shopping-item span{overflow-wrap:anywhere}
    .shopping-item.checked span{text-decoration:line-through;color:var(--muted)}
    .shopping-remove{border:0;background:transparent;color:var(--danger);font-size:22px;padding:8px 10px;cursor:pointer;border-radius:8px}
    .shopping-remove:focus-visible{outline:2px solid var(--purple)}
    .shopping-actions{display:flex;justify-content:flex-end;margin-top:12px}
    .shopping-empty{padding:16px 0}
    .shopping-status{min-height:18px}
  `;
  document.head.appendChild(style);

  const panel = document.createElement('section');
  panel.className = 'shopping-panel';
  panel.setAttribute('aria-label', 'Shopping list');
  panel.innerHTML = `
    <div class="section"><h2>Shopping list</h2><span class="meta" id="shoppingCount"></span></div>
    <p class="meta">Add what you need to buy. Saved on this device (not shared between phones).</p>
    <form id="shoppingForm" class="shopping-add">
      <input id="shoppingInput" class="field" type="text" maxlength="120" autocomplete="off" placeholder="e.g. Milk, bread, eggs" aria-label="Item to buy" required>
      <button type="submit" class="btn primary">Add</button>
    </form>
    <ul class="shopping-items" id="shoppingItems"></ul>
    <p class="meta shopping-empty" id="shoppingEmpty">Your shopping list is empty.</p>
    <div class="shopping-actions">
      <button type="button" class="btn secondary" id="shoppingClearDone">Clear ticked items</button>
    </div>
    <p id="shoppingStatus" class="meta shopping-status" aria-live="polite"></p>
  `;
  plannerScreen.appendChild(panel);

  const form = panel.querySelector('#shoppingForm');
  const input = panel.querySelector('#shoppingInput');
  const list = panel.querySelector('#shoppingItems');
  const empty = panel.querySelector('#shoppingEmpty');
  const count = panel.querySelector('#shoppingCount');
  const clearDone = panel.querySelector('#shoppingClearDone');
  const status = panel.querySelector('#shoppingStatus');

  const prefix = 'our-recipes-shopping-v1:';
  let currentKey = null;
  let items = [];

  function householdKey() {
    return prefix + (typeof household !== 'undefined' && household && household.id ? household.id : 'unassigned');
  }

  function load() {
    const nextKey = householdKey();
    if (nextKey === currentKey) return;
    currentKey = nextKey;
    try {
      const parsed = JSON.parse(localStorage.getItem(currentKey) || '[]');
      items = Array.isArray(parsed) ? parsed.filter(item =>
        item && typeof item.id === 'string' && typeof item.text === 'string'
      ).map(item => ({id: item.id, text: item.text.slice(0, 120), done: item.done === true})) : [];
      status.textContent = '';
    } catch {
      items = [];
      status.textContent = 'Shopping list storage is unavailable in this browser.';
    }
  }

  function save() {
    try {
      localStorage.setItem(currentKey, JSON.stringify(items));
      status.textContent = '';
    } catch {
      status.textContent = 'Could not save the shopping list. Check your browser storage settings.';
    }
    render();
  }

  function render() {
    load();
    list.replaceChildren();
    const pending = items.filter(item => !item.done);
    const complete = items.filter(item => item.done);
    count.textContent = pending.length + ' to buy';
    empty.hidden = items.length > 0;
    clearDone.disabled = complete.length === 0;

    for (const item of [...pending, ...complete]) {
      const li = document.createElement('li');
      li.className = 'shopping-item' + (item.done ? ' checked' : '');
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.done;
      checkbox.setAttribute('aria-label', 'Bought ' + item.text);
      const description = document.createElement('span');
      description.textContent = item.text;
      label.append(checkbox, description);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'shopping-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove ' + item.text);

      checkbox.addEventListener('change', () => {
        item.done = checkbox.checked;
        save();
      });
      remove.addEventListener('click', () => {
        items = items.filter(entry => entry.id !== item.id);
        save();
      });
      li.append(label, remove);
      list.appendChild(li);
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    load();
    const name = input.value.replace(/\s+/g, ' ').trim();
    if (!name) return;
    items.push({id: crypto.randomUUID(), text: name.slice(0, 120), done: false});
    input.value = '';
    save();
    input.focus();
  });

  clearDone.addEventListener('click', () => {
    items = items.filter(item => !item.done);
    save();
  });

  new MutationObserver(() => {
    if (!plannerScreen.classList.contains('hidden')) render();
  }).observe(plannerScreen, {attributes: true, attributeFilter: ['class']});

  window.addEventListener('storage', event => {
    if (event.key === currentKey) {
      currentKey = null;
      render();
    }
  });

  if (!plannerScreen.classList.contains('hidden')) render();
})();
