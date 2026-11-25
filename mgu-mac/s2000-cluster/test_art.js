'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Canvas } = require('../apps/kit/runtime/canvas');
const file = path.resolve(__dirname, '../apps/apps/s2000_cluster/art.js');
const scope = { module: { exports: {} }, require() { throw Error('artwork must render without reference images or raster assets'); } };
assert.doesNotThrow(()=>vm.runInNewContext(fs.readFileSync(file, 'utf8'), scope, { filename: file }),
    'the production artwork renders independently of every reference image');
const artwork = scope.module.exports.textures(Canvas);
assert.deepStrictEqual(Object.keys(artwork).sort(), ['face', 'mask'], 'no sampled photograph or digit atlas is uploaded');
for (const texture of Object.values(artwork)) {
    assert.strictEqual(texture.w, 1920);
    assert.strictEqual(texture.h, 720);
    assert.strictEqual(texture.d.length, 1920*720*4);
}
const { face, mask } = artwork;
const regionHasInk = (x,y,w,h) => {
    for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(face.d[(yy*1920+xx)*4]>30)return true;
    return false;
};
assert(regionHasInk(150,550,300,125), 'the low RPM labels and scale caption are legible');
assert(regionHasInk(1370,300,300,115), 'coolant labels and symbol are present');
assert(regionHasInk(1500,490,330,130), 'fuel labels and symbol are present');
assert(regionHasInk(930,580,240,60), 'the former Trip area identifies oil temperature');
assert(!regionHasInk(0,0,1920,70), 'no photographic background or housing');
for(const kind of [64,128,192]) {
    let pixels=0;
    for(let i=0;i<mask.d.length;i+=4)if(mask.d[i+1]===kind&&mask.d[i+3]>200)pixels++;
    assert(pixels>1000,'each gauge has its own complete native-resolution mask: '+kind);
}
let tail=0;
for(let i=0;i<mask.d.length;i+=4)if(mask.d[i+1]===64&&mask.d[i]>218&&mask.d[i+3]>200)tail++;
assert(tail>3000, 'the entire 6000–7000 RPM range contains small segments, not a truncated tail');
const studio = scope.module.exports.textures(Canvas, { tachNumberStroke: 6 });
const oneStrokeAtCenter = Array.from({ length: 32 }, (_, i) => 250 + i)
    .reduce((width, x) => width + studio.face.d[(511 * 1920 + x) * 4] / 237, 0);
assert(Math.abs(oneStrokeAtCenter - 6) < 0.1, 'the Studio tachometer numeral uses the heavier reference stroke');
assert.deepStrictEqual(studio.mask.d, mask.d, 'changing numeral weight does not change the gauge fill');
const withEnds = scope.module.exports.textures(Canvas, { horizontalGaugeEnds: true });
const faceAt = (x, y) => [...withEnds.face.d.subarray((y * 1920 + x) * 4, (y * 1920 + x) * 4 + 3)];
for (const [y, outer, inner, gap, color] of [
    [393, 1328, 1359, 1349, [237, 240, 234]],
    [393, 1642, 1611, 1620, [255, 32, 16]],
    [599, 1525, 1556, 1546, [255, 32, 16]],
    [599, 1839, 1808, 1818, [237, 240, 234]],
]) {
    assert.deepStrictEqual(faceAt(outer, y), color, 'the wide end segment follows the bottom line');
    assert.deepStrictEqual(faceAt(inner, y), color, 'the short tick matches the outer segment on the same line');
    assert.deepStrictEqual(faceAt(gap, y), [0, 0, 0], 'a short gap separates the two end marks');
}
assert.deepStrictEqual(withEnds.mask.d, mask.d, 'decorative gauge ends preserve the live fill mask');
console.log('art: standalone vector drawing, native resolution, labels and complete red-zone geometry pass');
