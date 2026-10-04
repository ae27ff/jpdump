const assert = require('node:assert/strict');
const test = require('node:test');
const { jpeg, readMetadata } = require('./metadata-helpers');
const { exifSegment } = require('./exif-helpers');

test('Unknown TIFF tags do not create an undefined metadata property', () => {
    for (const bigEndian of [false, true]) {
        const tags = readMetadata(jpeg(exifSegment(bigEndian))).exifdata;
        assert.equal(tags.Make, 'A');
        assert.equal(Object.hasOwn(tags, 'undefined'), false);
        assert.deepEqual(Object.keys(tags).sort(), ['Make', 'thumbnail']);
    }
});

test('Unknown private tag values are skipped without dereferencing invalid offsets', () => {
    const tags = readMetadata(jpeg(exifSegment(false, true))).exifdata;
    assert.equal(tags.Make, 'A');
    assert.equal(Object.hasOwn(tags, 'undefined'), false);
});
