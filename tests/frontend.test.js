const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { projectRoot } = require('./metadata-helpers');

function loadFrontend() {
    const images = [], readers = [], metadataCallbacks = [], attached = [];
    const preview = {};
    class Image {
        constructor() { images.push(this); }
    }
    class FileReader {
        constructor() { readers.push(this); }
        readAsBinaryString(file) { this.file = file; }
    }
    const context = vm.createContext({
        btoa, Image, FileReader,
        console: { log() {} },
        branding: { init() {} },
        window: { addEventListener() {} },
        document: { getElementById: () => preview },
        EXIF: {
            getData(image, callback) { metadataCallbacks.push(() => callback.call(image)); },
            getAllTags(image) { return { source: image.src }; }
        }
    });
    vm.runInContext(fs.readFileSync(path.join(projectRoot, 'frontend.js'), 'utf8'), context);
    context.addPreviewEXIF = (parent, tags) => attached.push({ parent, tags });
    const select = file => context.handleFileSelect({ target: { files: file ? [file] : [] } });
    const completeRead = (reader, data) => reader.onload({ target: { result: data } });
    return { context, images, readers, metadataCallbacks, attached, preview, select, completeRead };
}

test('EXIF callbacks retain their own panel when images finish in reverse order', () => {
    const ui = loadFrontend();
    const first = {}, second = {};
    ui.context.g_ImageData = 'same image';
    ui.context.getPreviewEXIF(first);
    ui.context.getPreviewEXIF(second);
    ui.images[1].onload();
    ui.images[0].onload();
    ui.metadataCallbacks.forEach(callback => callback());
    assert.deepEqual(ui.attached.map(item => item.parent), [second, first]);
    assert.equal(ui.attached[0].tags.source, 'data:application/jpeg;base64,' + btoa('same image'));
});

test('EXIF image load callbacks from an older selection are discarded', () => {
    const ui = loadFrontend();
    ui.select('first.jpg');
    ui.completeRead(ui.readers[0], 'first');
    ui.context.getPreviewEXIF({});
    ui.select('second.jpg');
    ui.images[0].onload();
    assert.equal(ui.metadataCallbacks.length, 0);
    assert.equal(ui.attached.length, 0);
});

test('EXIF metadata completion after a newer selection cannot update either panel', () => {
    const ui = loadFrontend();
    const oldParent = {}, currentParent = {};
    ui.select('first.jpg');
    ui.completeRead(ui.readers[0], 'first');
    ui.context.getPreviewEXIF(oldParent);
    ui.images[0].onload();
    ui.select('second.jpg');
    ui.completeRead(ui.readers[1], 'second');
    ui.context.getPreviewEXIF(currentParent);
    ui.images[1].onload();
    ui.metadataCallbacks[1]();
    ui.metadataCallbacks[0]();
    assert.equal(ui.attached.length, 1);
    assert.equal(ui.attached[0].parent, currentParent);
    assert.equal(ui.attached[0].tags.source, 'data:application/jpeg;base64,' + btoa('second'));
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

test('EXIF callbacks cannot update a panel replaced by a later results render', () => {
    const ui = loadFrontend();
    ui.context.g_ImageData = 'image';
    ui.context.getPreviewEXIF({});
    ui.images[0].onload();
    const element = { appendChild() {}, children: [] };
    ui.context.document.getElementById = () => element;
    ui.context.accordion_create = () => element;
    ui.context.displayImageInfo = () => '';
    ui.context.displayResults({ headers: [] });
    ui.metadataCallbacks[0]();
    assert.equal(ui.attached.length, 0);
});

test('An empty file selection does not start a read', () => {
    const ui = loadFrontend();
    ui.select();
    assert.equal(ui.readers.length, 0);
});
