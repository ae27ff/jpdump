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
