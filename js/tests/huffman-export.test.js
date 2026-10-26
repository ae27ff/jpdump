const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const {loadScript} = require('./script-helpers');

function table(descriptor, counts, values){
    return Buffer.from([descriptor, ...Array.from({length:16}, (_, i) => counts[i + 1] || 0), ...values]).toString('latin1');
}

const payload = table(0, {1:1, 3:1}, [7, 2]) + table(0x12, {2:2, 3:1, 16:1}, [0xf0, 0, 0x21, 0xfa]);
const expected = [
    'Table index,Table class,Table ID,Symbol decimal,Symbol hex,Code length,Codeword',
    '1,DC,0,7,0x07,1,0',
    '1,DC,0,2,0x02,3,100',
    '2,AC,2,240,0xF0,2,00',
    '2,AC,2,0,0x00,2,01',
    '2,AC,2,33,0x21,3,100',
    '2,AC,2,250,0xFA,16,1010000000000000',
    ''
].join('\r\n');

function application(){
    const elements = {}, blobs = [], revoked = [];
    const element = () => ({hidden:false, href:'#', setAttribute(){}, removeAttribute(){}, querySelector:() => ({}), querySelectorAll:() => []});
    const context = vm.createContext({
        Blob, navigator:{}, ImageController:{data:payload},
        document:{getElementById:id => elements[id] || (elements[id] = element())},
        window:{URL:{createObjectURL(blob){blobs.push(blob);return 'blob:export-' + blobs.length;}, revokeObjectURL:url => revoked.push(url)}},
        ResultView:{escapeHTML:String}, Icons:{get:() => ''}
    });
    for(const file of ['js/jpeg/JPEGTable.js','js/ui/ContentView.js','js/ui/Inspector.js']) loadScript(context, file);
    const inspector = context.Inspector;
    const row = {id:'dht', start:42, code:'DHT', header:{type:'c4',content:payload}, contentStart:0, contentEnd:payload.length};
    inspector.root = {querySelectorAll:() => []};
    inspector.model = {rows:[row]}; inspector.selected = row.id; inspector.file = {name:'example.jpg'};
    return {context, inspector, row, elements, blobs, revoked};
}

test('DHT CSV preserves symbol order, multiple table identities, leading zeros and 16-bit codes', () => {
    const {inspector, row} = application();
    assert.equal(inspector.huffmanCSV(row), expected);
});

test('DHT CSV rejects incomplete, oversubscribed and reserved-code tables', () => {
    const {inspector} = application();
    for(const content of ['', payload.slice(0,-1), table(0,{1:2},[0,1]), table(0,{1:3},[0,1,2]), table(0x14,{2:1},[0])]){
        assert.equal(inspector.huffmanCSV({header:{type:'c4',content}}), null);
    }
    for(const flag of ['truncated','incompleteLength']) assert.equal(inspector.huffmanCSV({header:{type:'c4',content:payload,[flag]:true}}), null);
    assert.equal(inspector.huffmanCSV({header:{type:'db',content:payload}}), null);
    assert.equal(inspector.huffmanCSV(null), null);
});

test('Selecting DHT exposes a lazy CSV download; switching rows and replacing files cannot reuse it', async () => {
    const {context, inspector, row, elements, blobs, revoked} = application();
    inspector.renderContent();
    const link = elements['jr-download-huffman'];
    assert.equal(link.hidden, false);
    assert.equal(link.download, 'example.jpg-DHT-42-mappings.csv');
    assert.equal(blobs.length, 0);
    assert.equal(inspector.downloadHuffman(link), true);
    assert.equal(inspector.downloadHuffman(link), true);
    assert.equal(blobs.length, 1);
    assert.equal(blobs[0].type, 'text/csv;charset=utf-8');
    assert.equal(await blobs[0].text(), expected);
    assert.equal(link.href, 'blob:export-1');

    const other = {...row, id:'other', start:99, header:{type:'c4',content:table(0,{1:1},[3])}, huffmanCSV:undefined, huffmanURL:undefined};
    inspector.model.rows.push(other); inspector.selected = other.id;
    inspector.renderContent();
    assert.equal(link.href, '#');
    assert.equal(inspector.downloadHuffman(link), true);
    assert.match(await blobs[1].text(), /1,DC,0,3,0x03,1,0\r\n$/);
    assert.equal(link.download, 'example.jpg-DHT-99-mappings.csv');

    const nonDHT = {...row, id:'quant', header:{type:'db'}, decodedHTML:'quantization table'};
    inspector.model.rows.push(nonDHT); inspector.selected = nonDHT.id;
    inspector.renderContent();
    assert.equal(link.hidden, true);
    assert.equal(inspector.downloadHuffman(link), false);
    inspector.selected = row.id; inspector.renderContent();
    assert.equal(link.href, 'blob:export-1');
    context.ContentView.hideOverlay = () => {};
    context.ContentView.release(); inspector.model = null;
    assert.deepEqual(revoked, ['blob:export-1','blob:export-2']);
    assert.equal(inspector.downloadHuffman(link), false);
});

test('Legacy browser CSV downloads receive the CSV blob and selected filename', async () => {
    const {context, inspector, elements, blobs} = application();
    const saved = [];
    context.navigator.msSaveBlob = (blob, filename) => saved.push({blob,filename});
    inspector.renderContent();
    assert.equal(inspector.downloadHuffman(elements['jr-download-huffman']), false);
    assert.equal(blobs.length, 0);
    assert.equal(saved[0].filename, 'example.jpg-DHT-42-mappings.csv');
    assert.equal(await saved[0].blob.text(), expected);
});
