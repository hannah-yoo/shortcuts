const STORAGE_KEY = 'dial-studio-shortcuts-v1';
const actions = [
  { id: 'left', title: 'Turn left', description: 'A little turn counter-clockwise.', icon: '↶', keys: ['Ctrl', 'Z'] },
  { id: 'right', title: 'Turn right', description: 'A little turn clockwise.', icon: '↷', keys: ['Ctrl', 'Shift', 'Z'] },
  { id: 'press', title: 'Press down', description: 'A satisfying little click.', icon: '◎', keys: ['Space'] }
];

function loadShortcuts() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') {
      for (const action of actions) {
        const keys = saved[action.id];
        if (Array.isArray(keys) && keys.length > 0 && keys.length <= 5 && keys.every(key => typeof key === 'string' && key.length > 0 && key.length <= 30)) {
          action.keys = keys;
        }
      }
    }
  } catch {
    // The editor remains usable when storage is unavailable or invalid.
  }
}

function mappings() {
  return Object.fromEntries(actions.map(action => [action.id, action.keys]));
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings()));
    return true;
  } catch {
    return false;
  }
}

const grid = document.querySelector('#action-grid');
const dialog = document.querySelector('#shortcut-dialog');
const captureBox = document.querySelector('#capture-box');
const captureText = document.querySelector('#capture-text');
const saveButton = document.querySelector('#save-shortcut');
const announcement = document.querySelector('#announcement');
let currentAction;
let capturedKeys;

function render() {
  grid.replaceChildren();
  actions.forEach((action, index) => {
    const card = document.createElement('article');
    card.className = 'action-card';
    const top = document.createElement('div');
    top.className = 'action-top';
    const icon = document.createElement('div');
    icon.className = 'action-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = action.icon;
    const number = document.createElement('span');
    number.className = 'action-number';
    number.textContent = `0${index + 1} / 03`;
    top.append(icon, number);
    const title = document.createElement('h3');
    title.textContent = action.title;
    const description = document.createElement('p');
    description.textContent = action.description;
    const display = document.createElement('div');
    display.className = 'shortcut-display';
    display.setAttribute('aria-label', `Current shortcut: ${action.keys.join(' + ')}`);
    action.keys.forEach((key, keyIndex) => {
      if (keyIndex) {
        const plus = document.createElement('span');
        plus.className = 'key-plus';
        plus.textContent = '+';
        plus.setAttribute('aria-hidden', 'true');
        display.append(plus);
      }
      const keyElement = document.createElement('kbd');
      keyElement.textContent = key;
      display.append(keyElement);
    });
    const edit = document.createElement('button');
    edit.className = 'edit-button';
    edit.type = 'button';
    edit.setAttribute('aria-label', `Edit ${action.title} shortcut`);
    edit.textContent = 'Edit shortcut  →';
    edit.addEventListener('click', () => openEditor(action));
    card.append(top, title, description, display, edit);
    grid.append(card);
  });
}

function openEditor(action) {
  currentAction = action;
  capturedKeys = null;
  captureText.textContent = 'Press a key combination';
  saveButton.disabled = true;
  document.querySelector('#dialog-description').textContent = `Press the keys you want to use for ${action.title.toLowerCase()}.`;
  dialog.showModal();
  captureBox.focus();
}

captureBox.addEventListener('keydown', event => {
  if (event.key === 'Escape' || (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey)) return;
  event.preventDefault();
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key) || event.repeat || event.isComposing) return;
  const keys = [];
  if (event.ctrlKey) keys.push('Ctrl');
  if (event.altKey) keys.push('Alt');
  if (event.shiftKey) keys.push('Shift');
  if (event.metaKey) keys.push('⌘');
  const names = { ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
  const key = names[event.key] || (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  if (key.length > 30 || key === 'Unidentified') return;
  keys.push(key);
  capturedKeys = keys;
  captureText.textContent = keys.join(' + ');
  saveButton.disabled = false;
});

saveButton.addEventListener('click', () => {
  if (!currentAction || !capturedKeys) return;
  currentAction.keys = capturedKeys;
  const saved = persist();
  render();
  dialog.close();
  grid.querySelectorAll('.edit-button')[actions.indexOf(currentAction)].focus();
  announcement.textContent = saved ? `${currentAction.title} shortcut saved.` : 'Shortcut updated, but browser storage is unavailable.';
  document.querySelector('.saved-label').lastChild.textContent = saved ? ' Saved locally' : ' Not saved';
});

document.querySelector('#reset-button').addEventListener('click', () => {
  actions[0].keys = ['Ctrl', 'Z'];
  actions[1].keys = ['Ctrl', 'Shift', 'Z'];
  actions[2].keys = ['Space'];
  const saved = persist();
  render();
  announcement.textContent = saved ? 'Default shortcuts restored.' : 'Defaults restored, but browser storage is unavailable.';
  document.querySelector('.saved-label').lastChild.textContent = saved ? ' Saved locally' : ' Not saved';
});

document.querySelector('#export-button').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ shortcuts: mappings() }, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'dial-studio-shortcuts.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

loadShortcuts();
render();
