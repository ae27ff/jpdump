const assert = require('node:assert/strict');
const test = require('node:test');
const { NativeDOMParser, readMetadata, xmpJPEG, jpeg, segment } = require('./metadata-helpers');

const xmlTest = process.platform === 'win32' ? test : test.skip;

xmlTest('XMP namespace repair keeps attributes separated and produces valid XML', () => {
    const xml = '<x:xmpmeta xmlns:x="adobe:ns:meta/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:RDF><rdf:Description><exif:UserComment>test</exif:UserComment></rdf:Description></rdf:RDF></x:xmpmeta>';
    const image = readMetadata(xmpJPEG(xml), { DOMParser: NativeDOMParser });
    assert.equal(JSON.parse(image.xmpdata['x:xmpmeta']).text, 'test');
    assert.equal(image.xmpdata['xmlns:x'], 'adobe:ns:meta/');
});

xmlTest('XMP namespace repair preserves an existing declaration', () => {
    const xml = '<x:xmpmeta xmlns:x="adobe:ns:meta/" xmlns:exif="http://ns.adobe.com/exif/1.0/"><exif:UserComment>existing</exif:UserComment></x:xmpmeta>';
    const image = readMetadata(xmpJPEG(xml), { DOMParser: NativeDOMParser });
    assert.equal(JSON.parse(image.xmpdata['x:xmpmeta']).text, 'existing');
    assert.equal(image.xmpdata['xmlns:exif'], 'http://ns.adobe.com/exif/1.0/');
});

xmlTest('XMP accepts whitespace in a legal closing tag', () => {
    const xml = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><title>closing whitespace</title></x:xmpmeta >';
    const image = readMetadata(xmpJPEG(xml), { DOMParser: NativeDOMParser });
    assert.equal(JSON.parse(image.xmpdata['x:xmpmeta']).text, 'closing whitespace');
});

xmlTest('XMP comments and CDATA cannot truncate the XML packet', () => {
    const xml = '<!-- xmpmeta> before root --><x:xmpmeta xmlns:x="adobe:ns:meta/"><!-- xmpmeta> in root --><title><![CDATA[xmpmeta> text]]></title><after> complete</after></x:xmpmeta>';
    const image = readMetadata(xmpJPEG(xml), { DOMParser: NativeDOMParser });
    assert.equal(JSON.parse(image.xmpdata['x:xmpmeta']).text, 'xmpmeta> text complete');
});

xmlTest('XMP parses complete packet processing instructions and padding', () => {
    const xml = '<?xml version="1.0"?><?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><title>packet</title></x:xmpmeta>   \n<?xpacket end="w"?>';
    const image = readMetadata(xmpJPEG(xml), { DOMParser: NativeDOMParser });
    assert.equal(JSON.parse(image.xmpdata['x:xmpmeta']).text, 'packet');
});

xmlTest('XMP accepts equivalent alternate and default namespace prefixes', () => {
    for (const xml of [
        '<meta:xmpmeta xmlns:meta="adobe:ns:meta/"><title>alternate</title></meta:xmpmeta>',
        '<xmpmeta xmlns="adobe:ns:meta/"><title>alternate</title></xmpmeta>'
    ]) {
        const image = readMetadata(xmpJPEG(xml), { DOMParser: NativeDOMParser });
        const root = image.xmpdata['meta:xmpmeta'] || image.xmpdata.xmpmeta;
        assert.equal(JSON.parse(root).text, 'alternate');
    }
});

xmlTest('XMP namespace fallback skips prolog comments and quoted greater-than characters', () => {
    const xml = '<?xpacket begin=""?><!-- <x:xmpmeta xmpmeta> --><x:xmpmeta xmlns:x="adobe:ns:meta/" note="a > b xmlns:exif=pretend"><exif:UserComment>repaired</exif:UserComment></x:xmpmeta >';
    const image = readMetadata(xmpJPEG(xml), { DOMParser: NativeDOMParser });
    assert.equal(JSON.parse(image.xmpdata['x:xmpmeta']).text, 'repaired');
    assert.equal(image.xmpdata.note, 'a > b xmlns:exif=pretend');
});

xmlTest('Valid XMP keeps its scoped namespace declarations and attribute values', () => {
    const xml = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><item xmlns:exif="urn:custom"><exif:UserComment>scoped</exif:UserComment></item></x:xmpmeta>';
    const image = readMetadata(xmpJPEG(xml), { DOMParser: NativeDOMParser });
    assert.equal(JSON.parse(image.xmpdata['x:xmpmeta']).text, 'scoped');
    assert.equal(image.xmpdata['xmlns:exif'], undefined);
});

xmlTest('Malformed XMP is skipped and a later valid APP1 packet can be read', () => {
    const signature = Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'ascii');
    const malformed = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><title>broken</x:xmpmeta>';
    const valid = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><title>later</title></x:xmpmeta>';
    const image = readMetadata(jpeg(
        segment(0xe1, Buffer.concat([signature, Buffer.from(malformed)])),
        segment(0xe1, Buffer.concat([signature, Buffer.from(valid)]))
    ), { DOMParser: NativeDOMParser });
    assert.equal(JSON.parse(image.xmpdata['x:xmpmeta']).text, 'later');
    const invalid = readMetadata(xmpJPEG(malformed), { DOMParser: NativeDOMParser });
    assert.deepEqual(Object.keys(invalid.xmpdata), []);
});

test('A throwing XML parser does not prevent the metadata callback', () => {
    class ThrowingDOMParser {
        parseFromString() { throw new Error('Invalid XML'); }
    }
    const image = readMetadata(xmpJPEG('<x:xmpmeta xmlns:x="adobe:ns:meta/"/>'), { DOMParser: ThrowingDOMParser });
    assert.deepEqual(Object.keys(image.xmpdata), []);
});
