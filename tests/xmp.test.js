const assert = require('node:assert/strict');
const test = require('node:test');
const { NativeDOMParser, readMetadata, xmpJPEG } = require('./metadata-helpers');

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
