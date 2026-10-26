const {loadScript}=require('./script-helpers');
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadEXIF } = require('./metadata-helpers');
const { exifSegment } = require('./exif-helpers');
const { loadJPEG, jpeg } = require('./jpeg-helpers');

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
    const context = loadJPEG({
        btoa, Image, FileReader,
        console: { log() {} },
        Branding: { init() {} }, Accordion: {},
        window: { addEventListener() {} },
        document: { getElementById: () => preview },
        EXIF: {
            readFromBinaryFile(bytes) {
                metadataReads.push(bytes);
                return readTags ? readTags(bytes) : { source: Buffer.from(bytes).toString('latin1'), thumbnail: {} };
            }
        }
    });
    for (const file of ['js/ui/ContentView.js','js/ui/ResultView.js','js/ui/ImageController.js']) loadScript(context,file);
    context.ResultView.addPreviewEXIF = (parent, tags) => attached.push({ parent, tags });
    const select = file => context.ImageController.selectFile({ target: { files: file ? [file] : [] } });
    const completeRead = (reader, data) => reader.onload({ target: { result: data } });
    return { context, images, readers, metadataReads, attached, preview, select, completeRead };
}

test('EXIF panels receive metadata directly from bytes with one read per file', () => {
    const ui = loadFrontend();
    const first = {}, second = {};
    ui.context.ImageController.data = 'same image';
    ui.context.ImageController.getPreviewEXIF(first);
    ui.context.ImageController.getPreviewEXIF(second);
    assert.deepEqual(ui.attached.map(item => item.parent), [first, second]);
    assert.equal(ui.attached[0].tags.source, 'same image');
    assert.equal(ui.metadataReads.length, 1);
    assert.equal(ui.images.length, 0);
});

test('EXIF is extracted even when the file has no decodable image', () => {
    const exif = loadEXIF().EXIF;
    const ui = loadFrontend(bytes => exif.readFromBinaryFile(bytes));
    const bytes = Buffer.concat([Buffer.from([0xff,0xd8]), exifSegment(), Buffer.from([0xff,0xd9])]);
    ui.context.ImageController.data = bytes.toString('latin1');
    ui.context.ImageController.getPreviewEXIF({});
    assert.equal(ui.attached[0].tags.Make, 'A');
    assert.equal(ui.images.length, 0);
});

test('A new file selection invalidates cached EXIF', () => {
    const ui = loadFrontend();
    ui.select('first.jpg');
    ui.completeRead(ui.readers[0], 'first');
    ui.context.ImageController.getPreviewEXIF({});
    ui.select('second.jpg');
    assert.equal(ui.context.ImageController.exifCache, null);
    ui.completeRead(ui.readers[1], 'second');
    ui.context.ImageController.getPreviewEXIF({});
    assert.equal(ui.metadataReads.length, 2);
    assert.equal(ui.attached[1].tags.source, 'second');
});

test('Formatting EXIF does not mutate the cached data for another panel', () => {
    const ui = loadFrontend();
    const tags = { thumbnail: {}, object: { value: 1 } };
    const first = ui.context.ResultView.exifInfo(tags);
    assert.deepEqual(tags, { thumbnail: {}, object: { value: 1 } });
    assert.equal(ui.context.ResultView.exifInfo(tags), first);
});

test('An older FileReader cannot overwrite the current file or preview', () => {
    const ui = loadFrontend();
    ui.select('first.jpg');
    ui.select('second.jpg');
    ui.completeRead(ui.readers[1], 'second');
    ui.completeRead(ui.readers[0], 'first');
    assert.equal(ui.context.ImageController.data, 'second');
    assert.equal(ui.preview.src, 'data:application/jpeg;base64,' + btoa('second'));
});

test('An older preview event cannot render results after a new selection', () => {
    const ui = loadFrontend();
    let processed = 0;
    ui.context.ImageController.process = () => { processed++; };
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
    ui.context.ImageController.data = 'image';
    ui.context.ImageController.getPreviewEXIF({});
    const element = { appendChild() {}, children: [], style: {} };
    ui.context.document.getElementById = () => element;
    ui.context.Accordion.create = () => element;
    ui.context.ResultView.imageInfo = () => '';
    ui.context.ResultView.render({ headers: [] });
    const currentParent = {};
    ui.context.ImageController.getPreviewEXIF(currentParent);
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
    assert.equal(ui.context.ImageController.data,'\0\x80\xff');
    assert.equal(ui.context.window.g_debug_event,undefined);
});

test('A read failure clears stale results while an older failure cannot replace a newer selection', () => {
    const ui=loadFrontend(), elements={image:{},preview:{removeAttribute(name){this.removed=name;}}};
    let released=0;
    ui.context.ContentView.release=()=>{released++;};
    ui.context.document.getElementById=id=>elements[id];
    ui.context.ImageController.data='old image';
    ui.select('first.jpg'); ui.select('second.jpg');
    ui.readers[0].onerror();
    assert.equal(released,0);
    assert.equal(ui.context.ImageController.data,'old image');
    ui.readers[1].onerror();
    assert.equal(released,1);
    assert.equal(ui.context.ImageController.data,'');
    assert.equal(elements.preview.removed,'src');
    assert.match(elements.image.innerHTML,/Unable to read/);
});

test('MJPEG previews only the first image and renders the already parsed sequence',()=>{
    const ui=loadFrontend(), frame=jpeg(), bytes=Buffer.concat([frame,frame,Buffer.from('tail')]);
    let rendered;
    ui.context.ResultView.render=info=>{rendered=info;};
    ui.select({name:'video.mjpeg'});
    ui.completeRead(ui.readers[0],bytes.toString('latin1'));
    assert.equal(ui.context.ImageController.data,bytes.toString('latin1'));
    assert.equal(ui.preview.src,'data:application/jpeg;base64,'+frame.toString('base64'));
    ui.context.JPEGParser.parse=()=>{throw new Error('sequence must not be parsed twice');};
    ui.preview.onload();
    assert.equal(rendered.images.length,2);
    assert.equal(rendered.extraneous,'tail');
});

test('Sequence EXIF reads are bounded and cached separately for each image',()=>{
    const exif=loadEXIF().EXIF, ui=loadFrontend(bytes=>exif.readFromBinaryFile(bytes));
    const first=jpeg(exifSegment()), second=Buffer.from(first);
    second[second.indexOf(Buffer.from([65,0]))]=66;
    const bytes=Buffer.concat([first,second]), info=ui.context.JPEGParser.parse(bytes.toString('latin1'),{sequence:true});
    ui.context.ImageController.data=bytes.toString('latin1');
    const tags=info.images.map(image=>ui.context.ImageController.getEXIF(image));
    assert.equal(tags[0].Make,'A');
    assert.equal(tags[1].Make,'B');
    assert.equal(ui.metadataReads.length,2);
    assert.equal(ui.metadataReads[0].byteLength,first.length);
    assert.equal(ui.metadataReads[1].byteLength,second.length);
    assert.equal(ui.context.ImageController.getEXIF(info.images[1]),tags[1]);
    assert.equal(ui.metadataReads.length,2);
});

test('Only MJPG and MJPEG filenames opt uploads into sequence parsing, including reprocessing',()=>{
    const ui=loadFrontend(), frame=jpeg(), bytes=Buffer.concat([frame,frame]);
    let rendered;
    ui.context.ResultView.render=info=>{rendered=info;};
    for(const name of ['video.mjpg','photo.jpg','video.MJPEG','photo.JPEG','photo.jfif','photo.jls','photo.j2k','photo.jpg.mjpeg.jpg','unnamed',undefined]){
        ui.select({name,type:'video/x-motion-jpeg'});
        ui.completeRead(ui.readers.at(-1),bytes.toString('latin1'));
        ui.preview.onload();
        const sequence=/\.(mjpg|mjpeg)$/i.test(name || '');
        assert.equal(rendered.images.length,sequence?2:1,name);
        assert.equal(rendered.extraneous,sequence?'':frame.toString('latin1'),name);
        ui.context.ImageController.process();
        assert.equal(rendered.images.length,sequence?2:1,'reprocess '+name);
        assert.equal(rendered.hasextraneous,!sequence,name);
    }
});
