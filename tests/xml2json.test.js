const assert = require('node:assert/strict');
const test = require('node:test');
const { NativeDOMParser, loadEXIF, readMetadata, xmpJPEG } = require('./metadata-helpers');
const xmlTest = process.platform === 'win32' ? test : test.skip;

xmlTest('Real XMP conversion escapes quotes, backslashes and controls exactly once', () => {
    const xml = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><item label="a &quot;quote&quot; C:\\photo&#9;&#10;">a &quot;quote&quot; C:\\photo&#9;&#10; &amp; text</item></x:xmpmeta>';
    const image = readMetadata(xmpJPEG(xml), { DOMParser: NativeDOMParser }, true);
    const data = JSON.parse(image.xmpdata['x:xmpmeta'])['x:xmpmeta'];
    assert.equal(data['item@label'], 'a "quote" C:\\photo\t\n');
    assert.equal(data.item, 'a "quote" C:\\photo\t\n & text');
});

xmlTest('CDATA controls round-trip through the real converter', () => {
    const xml = '<root><value><![CDATA[a "quote" \\ tab\t newline\n]]></value></root>';
    const context = loadEXIF({}, true);
    const doc = new NativeDOMParser().parseFromString(xml);
    assert.equal(JSON.parse(context.xml2json(doc)).root.value['#cdata'], 'a "quote" \\ tab\t newline\n');
});

test('JSON serialization does not mutate arrays and handles control characters', () => {
    const translator = loadEXIF({}, true).xml2json_translator();
    const data = { values: ['a\t"b"', 'C:\\photo', { text: '\r\n' }] };
    assert.deepEqual(JSON.parse(translator.toJson(data, '')), data);
    assert.deepEqual(JSON.parse(translator.toJson(data, '')), data);
});
