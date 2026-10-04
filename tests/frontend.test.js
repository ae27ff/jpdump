const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { projectRoot, loadEXIF } = require('./metadata-helpers');
const { exifSegment } = require('./exif-helpers');

function loadFrontend(readTags) {
    const images = [], readers = [], metadataReads = [], attached = [];
    const preview = {};
    class Image {
        constructor() { images.push(this); }
    }
    class FileReader {
        constructor() { readers.push(this); }
        readAsBinaryString(file) { this.file = file; }
        readAsArrayBuffer(file) { this.file = file; }
    }
    const context = vm.createContext({
        btoa, Image, FileReader,
        console: { log() {} },
        branding: { init() {} },
        window: { addEventListener() {} },
        document: { getElementById: () => preview },
        EXIF: {
            readFromBinaryFile(bytes) {
                metadataReads.push(bytes);
                return readTags ? readTags(bytes) : { source: Buffer.from(bytes).toString('latin1'), thumbnail: {} };
            }
        }
    });
    for (const file of ['jpeg_util.js','frontend.js']) vm.runInContext(fs.readFileSync(path.join(projectRoot, file), 'utf8'), context);
    context.addPreviewEXIF = (parent, tags) => attached.push({ parent, tags });
    const select = file => context.handleFileSelect({ target: { files: file ? [file] : [] } });
    const completeRead = (reader, data) => reader.onload({ target: { result: data } });
    return { context, images, readers, metadataReads, attached, preview, select, completeRead };
}

test('EXIF panels receive metadata directly from bytes with one read per file', () => {
    const ui = loadFrontend();
    const first = {}, second = {};
    ui.context.g_ImageData = 'same image';
    ui.context.getPreviewEXIF(first);
    ui.context.getPreviewEXIF(second);
    assert.deepEqual(ui.attached.map(item => item.parent), [first, second]);
    assert.equal(ui.attached[0].tags.source, 'same image');
    assert.equal(ui.metadataReads.length, 1);
    assert.equal(ui.images.length, 0);
});

test('EXIF is extracted even when the file has no decodable image', () => {
    const exif = loadEXIF().EXIF;
    const ui = loadFrontend(bytes => exif.readFromBinaryFile(bytes));
    const bytes = Buffer.concat([Buffer.from([0xff,0xd8]), exifSegment(), Buffer.from([0xff,0xd9])]);
    ui.context.g_ImageData = bytes.toString('latin1');
    ui.context.getPreviewEXIF({});
    assert.equal(ui.attached[0].tags.Make, 'A');
    assert.equal(ui.images.length, 0);
});

test('A new file selection invalidates cached EXIF', () => {
    const ui = loadFrontend();
    ui.select('first.jpg');
    ui.completeRead(ui.readers[0], 'first');
    ui.context.getPreviewEXIF({});
    ui.select('second.jpg');
    assert.equal(ui.context.g_ExifCache, null);
    ui.completeRead(ui.readers[1], 'second');
    ui.context.getPreviewEXIF({});
    assert.equal(ui.metadataReads.length, 2);
    assert.equal(ui.attached[1].tags.source, 'second');
});

test('Formatting EXIF does not mutate the cached data for another panel', () => {
    const ui = loadFrontend();
    const tags = { thumbnail: {}, object: { value: 1 } };
    const first = ui.context.displayEXIFInfo(tags);
    assert.deepEqual(tags, { thumbnail: {}, object: { value: 1 } });
    assert.equal(ui.context.displayEXIFInfo(tags), first);
});

test('An older FileReader cannot overwrite the current file or preview', () => {
    const ui = loadFrontend();
    ui.select('first.jpg');
    ui.select('second.jpg');
    ui.completeRead(ui.readers[1], 'second');
    ui.completeRead(ui.readers[0], 'first');
    assert.equal(ui.context.g_ImageData, 'second');
    assert.equal(ui.preview.src, 'data:application/jpeg;base64,' + btoa('second'));
});

test('An older preview event cannot render results after a new selection', () => {
    const ui = loadFrontend();
    let processed = 0;
    ui.context.processData = () => { processed++; };
    ui.select('first.jpg');
    ui.completeRead(ui.readers[0], 'first');
    const oldLoad = ui.preview.onload;
    ui.select('second.jpg');
    oldLoad();
    assert.equal(processed, 0);
    ui.completeRead(ui.readers[1], 'second');
    ui.preview.onload();
    assert.equal(processed, 1);
});

test('A second results render reuses EXIF parsed from the same bytes', () => {
    const ui = loadFrontend();
    ui.context.g_ImageData = 'image';
    ui.context.getPreviewEXIF({});
    const element = { appendChild() {}, children: [], style: {} };
    ui.context.document.getElementById = () => element;
    ui.context.accordion_create = () => element;
    ui.context.displayImageInfo = () => '';
    ui.context.displayResults({ headers: [] });
    const currentParent = {};
    ui.context.getPreviewEXIF(currentParent);
    assert.equal(ui.attached[1].parent, currentParent);
    assert.equal(ui.metadataReads.length, 1);
});

test('An empty file selection does not start a read', () => {
    const ui = loadFrontend();
    ui.select();
    assert.equal(ui.readers.length, 0);
});

test('ArrayBuffer upload conversion preserves binary bytes without leaking debug references', () => {
    const ui=loadFrontend();
    ui.select('binary.jpg');
    const bytes=Uint8Array.from([0,128,255]);
    ui.completeRead(ui.readers[0],bytes.buffer);
    assert.equal(ui.context.g_ImageData,'\0\x80\xff');
    assert.equal(ui.context.window.g_debug_event,undefined);
});

test('A read failure clears stale results while an older failure cannot replace a newer selection', () => {
    const ui=loadFrontend(), elements={image:{},preview:{removeAttribute(name){this.removed=name;}}};
    let released=0;
    ui.context.releaseResultContent=()=>{released++;};
    ui.context.document.getElementById=id=>elements[id];
    ui.context.g_ImageData='old image';
    ui.select('first.jpg'); ui.select('second.jpg');
    ui.readers[0].onerror();
    assert.equal(released,0);
    assert.equal(ui.context.g_ImageData,'old image');
    ui.readers[1].onerror();
    assert.equal(released,1);
    assert.equal(ui.context.g_ImageData,'');
    assert.equal(elements.preview.removed,'src');
    assert.match(elements.image.innerHTML,/Unable to read/);
});
