const pad = document.getElementById('door-pad');
const find = (selector) => pad.querySelector(selector);
const morse = ['-----', '.----', '..---', '...--', '....-', '.....', '-....', '--...', '---..', '----.'];

// Replace this with the four digits collected from the minigames.
const doorPin = '7319';

let digits = [];
let symbols = '';
let attempts = 3;
let state = 'entry';
const left = find('#dp-left');
const right = find('#dp-right');

function marks(code) {
  return code.replaceAll('.', '▪').replaceAll('-', '━');
}

function message(text, type = '') {
  find('#dp-message').textContent = text;
  find('#dp-message').className = 'ds-message' + (type ? ' ds-message--' + type : '');
}

function draw() {
  find('#dp-slots').replaceChildren();
  for (let i = 0; i < 4; i++) {
    const slot = document.createElement('div');
    slot.className = 'pin-slot';
    if (state === 'open') slot.classList.add('good');
    else if (i === digits.length) slot.classList.add('active');
    slot.textContent = digits[i] ?? '_';
    find('#dp-slots').append(slot);
  }
  find('#dp-input').textContent = marks(symbols) + ' _'.repeat(5 - symbols.length);
  find('#dp-progress').textContent = digits.length + ' / 4';
  find('#dp-lives').textContent = attempts;
  find('#dp-current').textContent = state === 'entry'
    ? 'TRANSMIT DIGIT ' + (digits.length + 1) + ' / 4'
    : state === 'open' ? 'ALL FOUR DIGITS VERIFIED' : 'OVERRIDE FAILED';
}

function reset() {
  digits = [];
  symbols = '';
  attempts = 3;
  state = 'entry';
  find('#dp-system').textContent = 'ARMED';
  find('#dp-state').textContent = '● LOCKED';
  message('ENTER THE FOUR RECOVERED DIGITS IN MORSE');
  draw();
}

function reject(reason) {
  attempts--;
  digits = [];
  symbols = '';
  message(reason + ' — RE-ENTER ALL FOUR DIGITS.', 'danger');
  if (attempts === 0) {
    state = 'failed';
    find('#dp-system').textContent = 'FAILED';
    find('#dp-state').textContent = '● LOCKOUT';
    message('TERMINAL BURNED OUT — PRESS EITHER BUTTON TO RETRY', 'danger');
  }
  draw();
}

function enter(symbol) {
  if (state === 'open') return;
  if (state === 'failed') return reset();
  symbols += symbol;
  message('RECEIVING SIGNAL');
  if (symbols.length === 5) {
    const number = morse.indexOf(symbols);
    if (number === -1) return reject('INVALID MORSE DIGIT');
    digits.push(String(number));
    symbols = '';
    if (digits.length === 4) {
      if (digits.join('') !== doorPin) return reject('INCORRECT PIN');
      state = 'open';
      pad.classList.add('unlocked');
      find('#dp-lock').textContent = 'DOOR OPEN';
      find('#dp-state').textContent = '● UNLOCKED';
      find('#dp-system').textContent = 'OPEN';
      left.disabled = right.disabled = true;
      message('ACCESS GRANTED — THE TUNNEL IS OPEN', 'success');
      // Listen for this event in the main game to start the tunnel scene.
      pad.dispatchEvent(new CustomEvent('door-unlocked', { bubbles: true }));
    }
  }
  draw();
}

function undo() {
  if (state !== 'entry') return;
  if (!symbols && digits.length) symbols = morse[Number(digits.pop())];
  symbols = symbols.slice(0, -1);
  message('LAST SYMBOL REMOVED');
  draw();
}

// A short press enters a symbol; a long press removes one.
function wireButton(button, symbol) {
  let timer;
  let held = false;
  button.addEventListener('pointerdown', (event) => {
    held = false;
    button.setPointerCapture(event.pointerId);
    timer = setTimeout(() => { held = true; undo(); }, 700);
  });
  button.addEventListener('pointerup', () => clearTimeout(timer));
  button.addEventListener('pointercancel', () => {
    clearTimeout(timer);
    held = true;
  });
  button.addEventListener('click', () => {
    if (!held) enter(symbol);
    held = false;
  });
}
wireButton(left, '-');
wireButton(right, '.');

const keys = new Map();
function keySymbol(key) {
  if (['ArrowLeft', 'a', 'A'].includes(key)) return '-';
  if (['ArrowRight', 'd', 'D'].includes(key)) return '.';
  return null;
}
document.addEventListener('keydown', (event) => {
  const symbol = keySymbol(event.key);
  if (!symbol) return;
  event.preventDefault();
  if (event.repeat || keys.has(event.code)) return;
  const press = { held: false, timer: null };
  press.timer = setTimeout(() => { press.held = true; undo(); }, 700);
  keys.set(event.code, press);
});
document.addEventListener('keyup', (event) => {
  const press = keys.get(event.code);
  if (!press) return;
  event.preventDefault();
  clearTimeout(press.timer);
  keys.delete(event.code);
  if (!press.held) enter(keySymbol(event.key));
});
window.addEventListener('blur', () => {
  for (const press of keys.values()) clearTimeout(press.timer);
  keys.clear();
});

for (let i = 0; i < 5; i++) {
  for (const number of [i, i + 5]) {
    const row = document.createElement('div');
    row.className = 'reference';
    const label = document.createElement('span');
    label.textContent = number;
    const code = document.createElement('code');
    code.textContent = marks(morse[number]);
    row.append(label, code);
    find('#dp-guide').append(row);
  }
}
find('.collected strong').textContent = doorPin.split('').join(' · ');
reset();
