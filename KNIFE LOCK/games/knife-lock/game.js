// Knife Lock: A and D are the only gameplay keys.
// Game rules can be changed in this section.
const rules = {
  hitsToWin: 8,
  hitsPerColour: 4,
  allowedMisses: 3,
  contactCount: 6,
  hitWindow: 0.28,
  startSpeed: 1.3,
  speedPerHit: 0.10,
  mistakeMultiplier: 1.65,
  mistakeBonus: 0.22,
  maxSpeed: 4.8,
  shotCooldown: 270
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const TWO_PI = Math.PI * 2;
const BOTTOM = Math.PI / 2;
const core = { x: 290, y: 213, radius: 135 };
const colours = ['#ff6b60', '#76d5ed'];

let angle = 0;
let speed = rules.startSpeed;
let hits = 0;
let colourHits = [0, 0];
let missesLeft = rules.allowedMisses;
let state = 'ready';
let lastFrame = 0;
let lastThrow = -10000;
let knives = [];
let flyingKnives = [];
let flashUntil = 0;
let flashColour = '';
let shake = 0;
let finishAt = 0;
let hasWon = false;

function updateMessage(message, colour = '') {
  el('message').textContent = message;
  el('message').className = 'ds-message' + (colour ? ' ds-message--' + colour : '');
}

function updateStats() {
  el('score').textContent = `RED ${colourHits[0]}/${rules.hitsPerColour} | BLUE ${colourHits[1]}/${rules.hitsPerColour}`;
  el('lives').textContent = missesLeft;
  el('speed').textContent = state === 'ready' ? '—' : `${(speed / rules.startSpeed).toFixed(1)}×`;
}

function startGame() {
  angle = -0.38;
  speed = rules.startSpeed;
  hits = 0;
  colourHits = [0, 0];
  lastFrame = performance.now();
  missesLeft = rules.allowedMisses;
  state = 'playing';
  lastThrow = performance.now();
  knives = [];
  flyingKnives = [];
  flashUntil = 0;
  shake = 0;
  el('overlay').hidden = true;
  el('digitResult').hidden = true;
  el('red').disabled = false;
  el('blue').disabled = false;
  updateMessage('ALIGN COLOUR AT THE BOTTOM MARKER');
  updateStats();
}

function getPinDigit() {
  // The main game may choose the digit, for example: index.html?digit=7
  const assignedDigit = new URLSearchParams(location.search).get('digit');
  if (/^[0-9]$/.test(assignedDigit || '')) return Number(assignedDigit);
  return Math.floor(Math.random() * 10);
}

function finishGame(won) {
  state = 'finished';
  el('overlay').hidden = false;
  el('red').disabled = false;
  el('blue').disabled = false;
  el('dialogKicker').textContent = won ? 'TERMINAL REPAIRED' : 'SECURITY LOCK ENGAGED';
  el('dialogTitle').textContent = won ? 'ACCESS GRANTED' : 'REPAIR FAILED';
  el('startHint').textContent = won ? 'PRESS A OR D TO PLAY AGAIN' : 'PRESS A OR D TO RETRY';
  el('digitResult').hidden = !won;

  if (won) {
    const digit = getPinDigit();
    el('digit').textContent = digit;
    el('dialogText').textContent = 'Signal core restored. One PIN digit recovered.';
    updateMessage('ONE PIN DIGIT RECOVERED', 'success');
    document.dispatchEvent(new CustomEvent('dead-signal:digit-unlocked', {
      detail: { gameId: 'knife-lock', digit }
    }));
  } else {
    el('dialogText').textContent = 'Three mistakes triggered the terminal lock. Try again.';
    updateMessage('TERMINAL LOCKED — TRY AGAIN', 'danger');
  }
}

function angleDifference(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function throwKnife(type) {
  if (state !== 'playing') return;
  if (colourHits[type] >= rules.hitsPerColour) {
    updateMessage('THIS COLOUR IS COMPLETE — USE THE OTHER KNIFE');
    return;
  }
  const now = performance.now();
  if (now - lastThrow < rules.shotCooldown) return;
  lastThrow = now;

  let closestIndex = 0;
  let distance = Infinity;
  for (let i = 0; i < rules.contactCount; i++) {
    const contactAngle = angle + i * TWO_PI / rules.contactCount;
    const gap = Math.abs(angleDifference(contactAngle, BOTTOM));
    if (gap < distance) {
      distance = gap;
      closestIndex = i;
    }
  }

  const goodTiming = distance <= rules.hitWindow;
  const correctColour = closestIndex % 2 === type;
  const success = goodTiming && correctColour;
  flyingKnives.push({ type, time: now });
  flashUntil = now + 160;
  flashColour = success ? 'good' : 'bad';

  if (success) {
    hits += 1;
    colourHits[type] += 1;
    knives.push({ localAngle: BOTTOM - angle, type });
    speed = Math.min(rules.maxSpeed, speed + rules.speedPerHit);
    updateMessage('CONTACT RESTORED', 'success');
  } else {
    missesLeft -= 1;
    shake = 17;
    speed = Math.min(rules.maxSpeed, speed * rules.mistakeMultiplier + rules.mistakeBonus);
    updateMessage(goodTiming ? 'WRONG KNIFE — SPEED INCREASED' : 'MISALIGNED — SPEED INCREASED', 'danger');
  }

  updateStats();
  const complete = colourHits.every(count => count >= rules.hitsPerColour);
  if (complete || missesLeft <= 0) {
    state = 'ending';
    hasWon = complete;
    finishAt = now + 350;
    el('red').disabled = true;
    el('blue').disabled = true;
  }
}

function pressButton(type) {
  // Either button starts and restarts the game; during play it throws a knife.
  if (state === 'ready' || state === 'finished') {
    startGame();
    return; // This press only starts the wheel.
  } else if (state === 'playing') {
    throwKnife(type);
  }
}

el('red').addEventListener('click', () => pressButton(0));
el('blue').addEventListener('click', () => pressButton(1));
window.addEventListener('keydown', event => {
  if (event.code === 'Enter' || event.code === 'Space') {
    // Prevent keyboard activation of focused buttons through other keys.
    if (document.activeElement?.tagName === 'BUTTON') event.preventDefault();
    return;
  }
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.code === 'KeyA') { event.preventDefault(); pressButton(0); }
  if (event.code === 'KeyD') { event.preventDefault(); pressButton(1); }
});

// Canvas artwork
function rectangle(x, y, width, height, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width, height);
}
function line(x1, y1, x2, y2, colour, width = 1) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.stroke();
}
function circle(x, y, radius, fill, stroke = '', width = 1) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TWO_PI);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function rounded(x, y, width, height, radius, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }
  ctx.fill();
}
function text(label, x, y, colour, size = 12) {
  ctx.fillStyle = colour;
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y);
}
function drawKnife(x, y, rotation, colour, scale = 1, opacity = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.moveTo(0, -33);
  ctx.lineTo(7, -15);
  ctx.lineTo(6, 0);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-7, -15);
  ctx.closePath();
  ctx.fillStyle = '#bdd1ca';
  ctx.fill();
  line(0, -28, 0, -4, '#ffffff', 1.5);
  rounded(-10, -2, 20, 6, 2, '#233537');
  rounded(-6, 4, 12, 23, 3, colour);
  rounded(-7, 23, 14, 5, 2, '#233337');
  ctx.restore();
}

function drawBunker(now) {
  rectangle(0, 0, 580, 480, '#081311');
  for (let y = 12; y <= 480; y += 43) line(0, y, 580, y, '#27413d');
  for (let y = 0; y < 480; y += 86) {
    for (let x = ((y / 86) % 2 ? 40 : -10); x < 580; x += 105) {
      line(x, y, x, y + 43, '#223733');
    }
  }
  line(26, 0, 26, 480, '#516761', 11);
  line(554, 0, 554, 480, '#516761', 11);
  line(26, 0, 26, 480, '#152724', 5);
  line(554, 0, 554, 480, '#152724', 5);
  const pulse = 0.52 + 0.32 * Math.sin(now / 410);
  rectangle(46, 23, 62, 8, `rgba(255,91,70,${pulse})`);
  rectangle(472, 23, 62, 8, `rgba(255,91,70,${pulse})`);
  rectangle(182, 10, 216, 30, '#16312c');
  text('CORE-04  //  REPAIR MODE', 290, 30, '#9fc3b3', 13);
}

function drawWheel() {
  circle(core.x, core.y, core.radius + 28, '#0b1010', '#60746e', 12);
  circle(core.x, core.y, core.radius + 16, '', '#87948b', 3);
  for (let i = 0; i < 12; i++) {
    const a = i * TWO_PI / 12;
    circle(core.x + Math.cos(a) * (core.radius + 27), core.y + Math.sin(a) * (core.radius + 27), 4, '#182b26', '#81908a');
  }

  ctx.save();
  ctx.translate(core.x, core.y);
  ctx.rotate(angle);
  const gradient = ctx.createRadialGradient(-35, -52, 9, 0, 0, core.radius);
  gradient.addColorStop(0, '#3c6258');
  gradient.addColorStop(0.56, '#203934');
  gradient.addColorStop(1, '#122320');
  circle(0, 0, core.radius, gradient, '#70897b', 7);
  for (let i = 0; i < 18; i++) {
    const a = i * TWO_PI / 18;
    const colour = i % 3 ? '#1a302b' : '#778f7c6b';
    line(Math.cos(a) * 35, Math.sin(a) * 35, Math.cos(a) * 118, Math.sin(a) * 118, colour, i % 3 ? 2 : 4);
  }
  circle(0, 0, 106, '', '#74957c66', 2);
  for (let i = 0; i < rules.contactCount; i++) {
    const a = i * TWO_PI / rules.contactCount;
    const x = Math.cos(a) * core.radius;
    const y = Math.sin(a) * core.radius;
    const colour = colours[i % 2];
    circle(x, y, 22, '#0b1212', '#87928c', 3);
    ctx.save();
    ctx.shadowColor = colour;
    ctx.shadowBlur = 18;
    circle(x, y, 11, colour);
    ctx.restore();
    circle(x - 3, y - 4, 3, '#ffffffaa');
  }
  circle(0, 0, 44, '#061310', '#9ab4a3', 7);
  circle(0, 0, 26, '#25483e');
  text('04', 0, 9, '#d5e2cb', 28);
  ctx.restore();
}

function drawScene(now) {
  ctx.clearRect(0, 0, 580, 480);
  ctx.save();
  drawBunker(now);
  if (shake > 0) ctx.translate(Math.sin(now / 20) * shake * 0.25, Math.cos(now / 30) * shake * 0.12);
  drawWheel();

  for (const knife of knives) {
    const a = angle + knife.localAngle;
    drawKnife(core.x + Math.cos(a) * (core.radius + 31), core.y + Math.sin(a) * (core.radius + 31), a - Math.PI / 2, colours[knife.type], 0.83);
  }

  ctx.save();
  ctx.shadowColor = '#efbd72';
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.moveTo(core.x, core.y + core.radius + 7);
  ctx.lineTo(core.x - 15, core.y + core.radius + 33);
  ctx.lineTo(core.x + 15, core.y + core.radius + 33);
  ctx.closePath();
  ctx.fillStyle = '#efbd72';
  ctx.fill();
  ctx.restore();
  text('THROW WHEN CONTACT IS HERE', 290, 405, '#f0c88c');
  rounded(252, 423, 76, 40, 3, '#1b302d');
  rounded(260, 430, 60, 27, 2, '#071513');
  text('LAUNCH', 290, 448, '#a8c5b0', 11);

  flyingKnives = flyingKnives.filter(knife => now - knife.time < 240);
  for (const knife of flyingKnives) {
    const progress = Math.min(1, (now - knife.time) / 210);
    const eased = 1 - Math.pow(1 - progress, 3);
    drawKnife(290, 423 - 49 * eased, 0, colours[knife.type], 0.89, 1 - eased * 0.18);
  }
  if (flashUntil > now) rectangle(0, 0, 580, 480, flashColour === 'good' ? '#a9ffaf15' : '#ff65553c');
  ctx.restore();
}

function gameLoop(now) {
  if (!lastFrame) lastFrame = now;
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state === 'playing') angle = (angle + speed * dt) % TWO_PI;
  if (state === 'ending' && now >= finishAt) finishGame(hasWon);
  shake = Math.max(0, shake - dt * 40);
  drawScene(now);
  requestAnimationFrame(gameLoop);
}

updateStats();
requestAnimationFrame(gameLoop);