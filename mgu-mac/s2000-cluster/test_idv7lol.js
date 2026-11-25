'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const file = join(__dirname, 's2000.idv7theme');
assert.ok(existsSync(file), 'S2000 is available as a Studio theme');
const source = readFileSync(file, 'utf8');
const theme = JSON.parse(source);
const component = (id) => theme.components.find((item) => item.id === id);

assert.equal(theme.fonts.default.file, 's2000-lcd.ttf', 'numeric readouts request the S2000 LCD face');
assert.ok(existsSync(join(__dirname, theme.fonts.default.file)), 'the LCD font ships beside the theme');
assert.equal(component('red-zone').visibleWhen.all[1].value, 6000);
assert.equal(component('speed').binding.fallback, 'dash');
assert.deepEqual(component('fuel').binding, { signal: 'fuel.volume', min: 0, max: 59, fallback: 'zero' });
const coolant = component('coolant');
const fuel = component('fuel');
assert.ok(coolant.x > 1662, 'the coolant gauge clears the BMW gear bracket on the right');
assert.ok(fuel.y >= 454, 'the fuel gauge starts below the BMW gear bracket');
assert.ok(fuel.y + fuel.height / 2 < 646, 'the top semicircle ends before the BMW bottom strip');
assert.equal(component('odometer').y, component('oil').y, 'odometer and oil share a baseline');
for (const face of theme.components.filter((item) => item.id.startsWith('tach-face-'))) {
    for (const [left, right] of [[671, 724], [1025, 1078]]) {
        const edge = face.x + face.width;
        assert.ok(edge <= left || edge >= right, `${face.id} keeps each scale numeral in one image`);
    }
}
for (const item of theme.components) {
    if (item.type === 'image') {
        assert.match(theme.assets[item.props.asset].data, /^data:image\/png;base64,/);
        assert.ok(item.y + item.height <= 646, `${item.id} ends above the factory bottom strip`);
    }
}
assert.equal(execFileSync(process.execPath, [join(__dirname, 'export-idv7lol.js')], { encoding: 'utf8' }), source);
console.log('S2000 Studio theme regenerates with embedded artwork and a companion LCD font');
