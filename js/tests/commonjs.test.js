const assert=require('node:assert/strict');
const test=require('node:test');
const {execFileSync}=require('node:child_process');
const {projectRoot,jpeg,NativeDOMParser}=require('./metadata-helpers');
const {exifSegment}=require('./exif-helpers');

test('CommonJS imports work in a fresh Node process without browser globals',()=>{
    execFileSync(process.execPath,['-e',`
        const assert=require('node:assert/strict');
        const TIFFReader=require('./js/metadata/TIFFReader');
        const XMPReader=require('./js/metadata/XMPReader');
        const EXIF=require('./js/metadata/EXIF');
        assert.equal(EXIF.EXIF,EXIF);
        assert.equal(EXIF.Tags[0xA404],'DigitalZoomRatio');
        assert.deepEqual(EXIF.readFromBinaryFile(new ArrayBuffer(0)),undefined);
        assert.equal(XMPReader.findInJPEG(new ArrayBuffer(0)),undefined);
        assert.equal(TIFFReader.debug,EXIF.debug);
        EXIF.debug=true;
        assert.equal(TIFFReader.debug,true);
        assert.equal(XMPReader.debug,true);
        for(const name of ['EXIF','EXIFTags','TIFFReader','IPTCReader','XMPReader','BinaryUtils']){
            assert.equal(globalThis[name],undefined);
        }
    `],{cwd:projectRoot,windowsHide:true});
});

test('CommonJS EXIF reads binary metadata through its extracted dependencies',()=>{
    const EXIF=require('../metadata/EXIF');
    for(const bigEndian of [false,true]){
        const bytes=jpeg(exifSegment(bigEndian));
        const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length);
        const tags=EXIF.readFromBinaryFile(buffer);
        assert.equal(tags.Make,'A');
        assert.deepEqual(tags.thumbnail,{});
        assert.equal(tags.undefined,undefined);
    }
});

test('CommonJS data URI reads invoke metadata callbacks without a DOM parser',()=>{
    const EXIF=require('../metadata/EXIF');
    const bytes=jpeg(exifSegment());
    const image={src:'data:image/jpeg;base64,'+bytes.toString('base64')};
    let called=0;
    assert.equal(EXIF.getData(image,function(){
        assert.equal(this,image);
        called++;
    }),true);
    assert.equal(called,1);
    assert.equal(image.exifdata.Make,'A');
    assert.deepEqual(image.iptcdata,{});
    assert.deepEqual(image.xmpdata,{});
});

test('CommonJS IPTC reads use the extracted segment walker and binary utilities',()=>{
    const IPTCReader=require('../metadata/IPTCReader');
    const {segment}=require('./metadata-helpers');
    const dataset=Buffer.from([0x1c,2,120,0,2,79,75]);
    const resource=Buffer.from([0x38,0x42,0x49,0x4d,4,4,0,0,0,0,0,7]);
    const bytes=jpeg(segment(0xed,Buffer.concat([
        Buffer.from('Photoshop 3.0\0'),resource,dataset,Buffer.from([0])
    ])));
    const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length);
    assert.deepEqual(IPTCReader.findInJPEG(buffer),{caption:'OK'});
});

(process.platform==='win32' ? test : test.skip)('CommonJS XMP conversion loads the XML converter dependency',()=>{
    const XMPReader=require('../metadata/XMPReader');
    const xml=new NativeDOMParser().parseFromString('<root><value>text</value></root>');
    const result=XMPReader.toObject(xml);
    assert.equal(JSON.parse(result.root).root.value,'text');
});
