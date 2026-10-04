const assert = require('node:assert/strict');
const test = require('node:test');
const { jpeg, segment, readMetadata } = require('./metadata-helpers');

function dataset(record, type, value, lengthOctets = 0) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'latin1');
    const header = Buffer.from([0x1c, record, type, 0, 0]);
    header.writeUInt16BE(lengthOctets ? 0x8000 | lengthOctets : bytes.length, 3);
    if (!lengthOctets) return Buffer.concat([header, bytes]);
    const length = Buffer.alloc(lengthOctets);
    let size = bytes.length;
    for (let i = lengthOctets - 1; i >= 0; i--) {
        length[i] = size % 256;
        size = Math.floor(size / 256);
    }
    return Buffer.concat([header, length, bytes]);
}

function readIPTC(...datasets) {
    const data = Buffer.concat(datasets);
    const resource = Buffer.from([0x38, 0x42, 0x49, 0x4d, 0x04, 0x04, 0, 0, 0, 0, 0, 0]);
    resource.writeUInt32BE(data.length, 8);
    const payload = Buffer.concat([
        Buffer.from('Photoshop 3.0\0', 'ascii'), resource, data,
        data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)
    ]);
    return readMetadata(jpeg(segment(0xed, payload))).iptcdata;
}

test('IPTC ignores record signatures inside a binary JPEG preview', () => {
    const preview = jpeg(segment(0xfe, dataset(2, 25, 'FAKE')));
    const data = readIPTC(
        dataset(2, 0, Buffer.from([0, 4])),
        dataset(2, 200, Buffer.from([0, 11])),
        dataset(2, 201, Buffer.from([0, 1])),
        dataset(2, 202, preview), dataset(2, 25, 'REAL')
    );
    assert.equal(data.keywords, 'REAL');
});

test('IPTC skips embedded signatures in recognized fields and other records', () => {
    const fake = dataset(2, 25, 'FAKE');
    const data = readIPTC(dataset(1, 90, fake), dataset(2, 120, fake), dataset(2, 25, 'REAL'));
    assert.equal(data.caption, fake.toString('latin1'));
    assert.equal(data.keywords, 'REAL');
});

test('IPTC skips extended binary datasets and reads the following metadata', () => {
    const preview = Buffer.alloc(33000);
    dataset(2, 25, 'FAKE').copy(preview, 20);
    const data = readIPTC(dataset(2, 202, preview, 4), dataset(2, 25, 'REAL'));
    assert.equal(data.keywords, 'REAL');
});

test('IPTC handles extended length descriptors with leading zero octets', () => {
    const preview = Buffer.alloc(33000);
    dataset(2, 25, 'FAKE').copy(preview);
    assert.equal(readIPTC(dataset(2, 202, preview, 5), dataset(2, 25, 'REAL')).keywords, 'REAL');
});

test('IPTC retains repeated keywords and advances past empty unknown datasets', () => {
    const data = readIPTC(dataset(2, 25, 'first'), dataset(2, 250, ''), dataset(2, 25, 'second'));
    assert.deepEqual(Array.from(data.keywords), ['first', 'second']);
});

test('IPTC stops at truncated datasets without scanning their contents', () => {
    for (const type of [25, 202]) {
        const truncated = Buffer.concat([Buffer.from([0x1c, 2, type, 0, 100]), dataset(2, 25, 'FAKE')]);
        assert.equal(readIPTC(dataset(2, 25, 'REAL'), truncated).keywords, 'REAL');
    }
});

test('IPTC rejects empty, truncated, and oversized extended lengths', () => {
    const malformed = [
        Buffer.from([0x1c, 2, 202, 0x80, 0]),
        Buffer.from([0x1c, 2, 202, 0x80, 20]),
        Buffer.from([0x1c, 2, 202, 0x80, 4, 0xff, 0xff, 0xff, 0xff])
    ];
    for (const header of malformed) {
        assert.equal(readIPTC(dataset(2, 25, 'REAL'), header, dataset(2, 25, 'FAKE')).keywords, 'REAL');
    }
});

test('IPTC does not resynchronize inside a malformed dataset boundary', () => {
    assert.equal(readIPTC(dataset(2, 25, 'REAL'), Buffer.from([0]), dataset(2, 25, 'FAKE')).keywords, 'REAL');
});
