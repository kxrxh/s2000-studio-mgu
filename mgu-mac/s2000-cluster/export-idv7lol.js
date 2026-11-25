'use strict';

const { Canvas } = require('../apps/kit/runtime/canvas');
const { textures } = require('../apps/apps/s2000_cluster/art');
const labelOutlines = require('./label-outlines.json');

class TransparentCanvas extends Canvas {
    clear() { return super.clear(); }
}

const { face, mask } = textures(TransparentCanvas, { tachNumberStroke: 6, horizontalGaugeEnds: true });
const theme = {
    schemaVersion: 1,
    id: 's2000-g20',
    name: 'S2000 · G20',
    version: '0.1.0',
    description: 'Offline Studio development theme for the 2021 BMW G20 B48. Artwork adapted from the project’s authored S2000 geometry.',
    license: 'See project NOTICE',
    vehicleProfile: 'turbo-ice',
    target: { display: 'kombi-id7-12.3' },
    layout: { width: 1920, height: 720, background: '$background' },
    palettes: {
        amber: {
            name: 'Amber',
            colors: {
                background: '#000000', surface: '#100302', text: '#edf0ea', 'text-muted': '#ff6758',
                accent: '#ff6b11', track: '#291308', success: '#50c878', warning: '#ff5547', danger: '#ff2010'
            }
        }
    },
    palette: { default: 'amber' },
    fonts: { default: { family: 'display', file: 's2000-lcd.ttf' } },
    assets: {},
    components: []
};

function add(type, id, name, [x, y, width, height], props, extra = {}) {
    theme.components.push({ id, name, type, x, y, width, height, ...extra, props });
}

// Store only painted pixels' bounding rectangle, including transparent gaps between segments.
function artwork(id, name, source, [left, top, right, bottom], place, extra) {
    let x0 = right, y0 = bottom, x1 = left, y1 = top;
    for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
            if (!source.d[(y * source.w + x) * 4 + 3]) continue;
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x + 1);
            y1 = Math.max(y1, y + 1);
        }
    }
    if (x0 >= x1 || y0 >= y1) throw new Error(`No artwork found for ${id}`);
    const cropped = new Canvas(x1 - x0, y1 - y0);
    for (let y = y0; y < y1; y++) {
        const start = (y * source.w + x0) * 4;
        cropped.d.set(source.d.subarray(start, start + cropped.w * 4), (y - y0) * cropped.w * 4);
    }
    theme.assets[id] = {
        type: 'image', name, width: cropped.w, height: cropped.h,
        data: `data:image/png;base64,${cropped.png(9).toString('base64')}`
    };
    const [x, y] = place(x0, y0).map(Math.round);
    const [rightEdge, bottomEdge] = place(x1, y1).map(Math.round);
    add('image', id, name, [x, y, rightEdge - x, bottomEdge - y], { asset: id, fit: 'stretch' }, extra);
}

// The printed RPM legend uses the same outlines as the font, including its non-LCD 0 and 1.
function rpmCaption() {
    const caption = new Canvas(210, 24);
    const scale = 1.1, samples = 4;
    let cursor = 0;
    for (const char of '×1000r/min') {
        const contours = labelOutlines[char];
        const width = Math.max(...contours.flat().map(([x]) => x));
        const edges = contours.flatMap((contour) => contour.map((point, i) => [point, contour[(i + 1) % contour.length]]));
        for (let row = 0; row < caption.h * samples; row++) {
            const y = (row + 0.5) / (scale * samples);
            const crossings = edges.filter(([[, a], [, b]]) => (a > y) !== (b > y))
                .map(([[x0, y0], [x1, y1]]) => cursor + scale * (x0 + (y - y0) * (x1 - x0) / (y1 - y0)))
                .sort((a, b) => a - b);
            for (let i = 0; i < crossings.length; i += 2) {
                const start = Math.ceil(crossings[i] * samples - 0.5);
                const end = Math.ceil(crossings[i + 1] * samples - 0.5);
                for (let col = start; col < end; col++) {
                    const p = (Math.floor(row / samples) * caption.w + Math.floor(col / samples)) * 4;
                    caption.d.set([237, 240, 234, Math.min(255, caption.d[p + 3] + 16)], p);
                }
            }
        }
        cursor += (width + 2.8) * scale;
    }
    return caption;
}

// The mask encodes the centre of each of the original 140 tach segments in red.
const unlit = new Canvas(face.w, face.h);
unlit.d.set(face.d);
const litBands = Array.from({ length: 13 }, () => new Canvas(face.w, face.h));
for (let i = 0; i < mask.d.length; i += 4) {
    const alpha = mask.d[i + 3];
    if (alpha === 0) continue;
    const position = mask.d[i];
    const kind = mask.d[i + 1];
    if (kind !== 64) {
        const red = kind === 128 ? position / 255 > 0.89 : position / 255 < 0.11;
        unlit.d.set(red ? [22, 4, 2, alpha] : [32, 13, 4, alpha], i);
        continue;
    }
    const segment = Math.round(position * 140 / 255 - 0.5);
    const band = Math.min(12, Math.floor(segment / 10));
    const red = band === 12;
    unlit.d.set(red ? [22, 4, 2, alpha] : [32, 13, 4, alpha], i);
    litBands[band].d.set(red ? [255, 32, 16, alpha] : [255, 107, 17, alpha], i);
}

const tachPosition = (x, y) => [x, 76 + y * 0.84];
// Split between numerals so resizing adjacent crops cannot split a letter stroke.
const tachSections = [[0, 0, 322, 646], [322, 0, 615, 637], [615, 0, 965, 507], [965, 0, 1310, 462]];
tachSections.forEach((section, i) => {
    artwork(`tach-face-${i + 1}`, `Tachometer face ${i + 1}`, unlit, section, tachPosition);
});
const caption = rpmCaption();
artwork('rpm-caption', 'RPM scale caption', caption, [0, 0, caption.w, caption.h], (x, y) => [x + 219, y + 594]);

for (let i = 0; i < litBands.length; i++) {
    const red = i === 12;
    const threshold = red ? 6000 : (i + 0.5) * 500;
    const visibleWhen = { all: [
        { not: { signal: 'engine.rpm', op: 'stale' } },
        { signal: 'engine.rpm', op: 'gte', value: threshold }
    ] };
    artwork(red ? 'red-zone' : `rpm-band-${i + 1}`, red ? 'Red zone' : `Tachometer band ${i + 1}`,
        litBands[i], [0, 0, 1310, 646], tachPosition, { visibleWhen });
}

function gauge(id, name, [originalX, originalY], [cx, cy, radius], binding, zone) {
    const box = [cx - radius, cy - radius, radius * 2, radius * 2];
    const width = Math.round(36 * radius / 175);
    const scale = radius / 175;
    artwork(`${id}-face`, `${name} face`, unlit,
        [originalX - 175, originalY - 175, originalX + 175, originalY + 18],
        (x, y) => [cx + (x - originalX) * scale, cy + (y - originalY) * scale]);
    add('gauge.arc', id, name, box, {
        startAngle: 180, sweepAngle: 180,
        track: { show: false },
        fill: { color: '$accent', width, mode: 'segments', segments: 28, segmentGap: 1.1, zones: [zone] },
        ticks: { major: 0 }, labels: { show: false }, needle: { show: false }
    }, { binding });
}

// Keep the upper-right gauge outside the factory gear bracket, which ends at x=1662.
gauge('coolant', 'Coolant', [1485, 388], [1780, 399, 110],
    { signal: 'engine.coolant.temp', min: 60, max: 120, fallback: 'zero' },
    { from: 113.4, to: 120, color: '$danger' });
gauge('fuel', 'Fuel', [1682, 594], [1676, 621, 160],
    { signal: 'fuel.volume', min: 0, max: 59, fallback: 'zero' },
    { from: 0, to: 6.5, color: '$danger' });

const readoutStyle = (size) => ({ size, color: '$warning', align: 'center', baseline: 'middle' });
function digital(id, name, box, signal, size, unitSize, format = '0') {
    add('value.digital', id, name, box, {
        format, layout: 'inline', showUnit: unitSize > 0,
        valueStyle: readoutStyle(size), unitStyle: readoutStyle(unitSize || 24)
    }, { binding: { signal, fallback: 'dash' } });
}

digital('speed', 'Speed', [645, 325, 612, 198], 'vehicle.speed', 202, 0);
add('text', 'speed-unit', 'Speed unit', [1164, 472, 122, 38], { text: 'km/h', style: readoutStyle(32) });
add('rect', 'lcd-panel', 'LCD panel', [688, 516, 526, 114], { radius: 9, fill: '$surface' });
add('clock', 'clock', 'Clock', [847, 519, 208, 48], { style: readoutStyle(43) });
digital('odometer', 'Odometer', [690, 568, 248, 54], 'vehicle.odometer', 41, 18, '000000');
add('text', 'oil-label', 'Oil label', [931, 568, 68, 54], { text: 'OIL', style: readoutStyle(21) });
digital('oil', 'Oil temperature', [1004, 568, 200, 54], 'engine.oil.temp', 41, 18);

process.stdout.write(JSON.stringify(theme, null, 2) + '\n');
