const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {projectRoot,loadScript}=require('./script-helpers');
const {jpeg}=require('./metadata-helpers');
const {exifSegment}=require('./exif-helpers');

function loadApplication(){
    const events=[],bindings=[];
    const upload={value:'old selection',addEventListener(...args){bindings.push(args);}};
    const branding={innerHTML:''};
    const context=vm.createContext({
        window:{addEventListener(...args){events.push(args);}},
        document:{
            getElementById(id){return id==='upload' ? upload : id==='branding-bottom' ? branding : null;},
            getElementsByClassName(){return [];}
        }
    });
    const nativeReplaceAll=vm.runInContext('String.prototype.replaceAll',context);
    const html=fs.readFileSync(path.join(projectRoot,'index.html'),'utf8');
    const scripts=Array.from(html.matchAll(/<script src="(js\/[^"?]+)\?/g),match=>match[1]);
    for(const file of scripts) loadScript(context,file);
    return {context,events,bindings,upload,branding,scripts,nativeReplaceAll};
}

test('The entry page loads every application class from its topic folder in dependency order',()=>{
    const app=loadApplication();
    const files=fs.readdirSync(path.join(projectRoot,'js'),{recursive:true})
        .filter(file=>file.endsWith('.js') && !file.startsWith('tests'))
        .map(file=>'js/'+file.replaceAll('\\','/')).sort();
    assert.deepEqual(app.scripts.slice().sort(),files);
    assert.ok(app.scripts.every(file=>/^js\/[^/]+\/[^/]+\.js$/.test(file)));
    assert.equal(vm.runInContext('String.prototype.replaceAll',app.context),app.nativeReplaceAll);
    assert.equal(vm.runInContext('Array.prototype.last',app.context),undefined);
    assert.equal(app.context.processJPEG,undefined);
    assert.equal(app.context.g_ImageData,undefined);
});

test('The load event binds file selection to the controller and prepares the existing page',()=>{
    const app=loadApplication();
    assert.equal(app.events.length,1);
    assert.equal(app.events[0][0],'load');
    app.events[0][1]();
    assert.equal(app.bindings.length,1);
    assert.equal(app.bindings[0][0],'change');
    assert.equal(app.bindings[0][1],app.context.ImageController.selectFile);
    assert.equal(app.upload.value,'');
    assert.match(app.branding.innerHTML,/branding\.html/);
});

test('Browser script dependencies still decode metadata in the entry page load order',()=>{
    const app=loadApplication();
    const bytes=jpeg(exifSegment());
    const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length);
    assert.equal(app.context.EXIF.readFromBinaryFile(buffer).Make,'A');
    assert.equal(app.context.XMPReader.XMLConverter,app.context.XMLConverter);
    assert.equal(app.context.TIFFReader.debug,app.context.EXIF.debug);
});
