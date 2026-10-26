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
    assert.equal(JSON.parse(context.XMLConverter.stringify(doc)).root.value['#cdata'], 'a "quote" \\ tab\t newline\n');
});

test('JSON serialization does not mutate arrays and handles control characters', () => {
    const translator = loadEXIF({}, true).XMLConverter;
    const data = { values: ['a\t"b"', 'C:\\photo', { text: '\r\n' }] };
    assert.deepEqual(JSON.parse(translator.toJson(data, '')), data);
    assert.deepEqual(JSON.parse(translator.toJson(data, '')), data);
});

xmlTest('Comments and processing instructions produce no fake metadata or alerts', () => {
    const alerts = [];
    const context = loadEXIF({ alert: message => alerts.push(message) });
    for (const xml of [
        '<root><!-- comment --><?instruction data?><a>first</a><b>second</b></root>',
        '<root><item>first</item><!-- comment --><?instruction data?><item>second</item></root>',
        '<root><value><!-- comment --><?instruction data?><![CDATA[actual]]></value></root>'
    ]) {
        const data = context.XMLConverter.stringify(new NativeDOMParser().parseFromString(xml));
        assert.doesNotThrow(() => JSON.parse(data));
        assert.equal(data.includes('#comment'), false);
        assert.equal(data.includes('instruction'), false);
        assert.ok(data.includes(xml.includes('actual') ? 'actual' : 'second'));
    }
    assert.deepEqual(alerts, []);
});

xmlTest('Element names matching Object properties survive XMP conversion', () => {
    const context=loadEXIF();
    const xml='<root><__proto__>proto</__proto__><constructor>ctor</constructor><toString>text</toString></root>';
    const json=JSON.parse(context.XMLConverter.stringify(new NativeDOMParser().parseFromString(xml)));
    assert.equal(json.root.__proto__,'proto');
    assert.equal(json.root.constructor,'ctor');
    assert.equal(json.root.toString,'text');
});

xmlTest('Whitespace-only literals and inherited xml:space are preserved', () => {
    const context=loadEXIF();
    const literal=JSON.parse(context.XMLConverter.stringify(new NativeDOMParser().parseFromString('<root><value> \t </value></root>')));
    assert.equal(literal.root.value,' \t ');
    const preserved=JSON.parse(context.XMLConverter.stringify(new NativeDOMParser().parseFromString('<root xml:space="preserve"> <a>A</a> <b>B</b> </root>')));
    assert.equal(preserved.root[0],' ');
    assert.equal(preserved.root[2],' ');
    assert.equal(preserved.root[4],' ');
});
