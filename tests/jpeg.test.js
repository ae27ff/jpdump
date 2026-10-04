const assert = require('node:assert/strict');
const test = require('node:test');
const { loadJPEG, parseJPEG, jpeg, segment } = require('./jpeg-helpers');

test('Empty and non-JPEG inputs have a nonnegative parsed size', () => {
    const empty = parseJPEG(Buffer.alloc(0));
    assert.equal(empty.valid, false);
    assert.equal(empty.nextp, 0);
    assert.equal(empty.hasextraneous, false);
    const invalid = parseJPEG(Buffer.from('invalid'));
    assert.equal(invalid.valid, false);
    assert.equal(invalid.nextp, 0);
    assert.equal(invalid.extraneous, 'invalid');
});

test('The parsed size and trailer boundary of a valid JPEG are unchanged', () => {
    const bytes = jpeg();
    const result = parseJPEG(Buffer.concat([bytes, Buffer.from('trailer')]));
    assert.equal(result.valid, true);
    assert.equal(result.nextp, bytes.length);
    assert.equal(result.extraneous, 'trailer');
});

test('APP1 metadata has the correct application marker label', () => {
    const result = parseJPEG(jpeg(segment(0xe1, Buffer.from('metadata'))));
    assert.equal(result.headers.find(header => header.type === 'e1').desc.shortname, 'APP1');
});

test('Parsing does not log binary image data or retain header objects in the console', () => {
    const logged = [];
    const result = parseJPEG(jpeg(), { console: { log: (...args) => logged.push(args), error() {} } });
    assert.equal(result.valid, true);
    assert.deepEqual(logged, []);
});

test('Truncated Adobe APP14 headers are invalid without fabricated numeric fields', () => {
    for (let length = 5; length < 12; length++) {
        const payload = Buffer.alloc(length);
        payload.write('Adobe');
        const result = parseJPEG(jpeg(segment(0xee, payload)));
        assert.equal(result.valid, false);
        const header = result.headers.find(header => header.type === 'ee');
        assert.equal(header.valid, false);
        assert.equal(header.hasextendeddata, false);
    }
});

test('Complete Adobe APP14 metadata and unknown application payloads still parse', () => {
    const payload = Buffer.alloc(12);
    payload.write('Adobe');
    payload.writeUInt16BE(100, 5);
    payload.writeUInt16BE(1, 7);
    payload.writeUInt16BE(2, 9);
    payload[11] = 2;
    const result = parseJPEG(jpeg(segment(0xee, payload)));
    assert.equal(result.valid, true);
    const adobe = result.headers.find(header => header.type === 'ee').extendeddata;
    assert.equal(adobe.DCTEncodeVersion, 100);
    assert.equal(adobe.flags0, 1);
    assert.equal(adobe.flags1, 2);
    assert.equal(adobe.colorTransform, '2 (YCCK)');
    assert.equal(parseJPEG(jpeg(segment(0xee, Buffer.from('other')))).valid, true);
});
