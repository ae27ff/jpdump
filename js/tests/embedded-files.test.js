const test = require('node:test');
const assert = require('node:assert/strict');
const {loadJPEG, jpeg, segment} = require('./jpeg-helpers');
const {loadScript} = require('./script-helpers');

function workspace(bytes){
    const context = loadJPEG({setTimeout, clearTimeout, Blob});
    for(const file of ['js/jpeg/JPEGFileModel.js','js/analysis/FileAnalysis.js','js/ui/ResultView.js','js/ui/Workspaces.js']) loadScript(context,file);
    const data = bytes.toString('latin1'), app = context.Workspaces;
    context.ImageController = {data};
    app.info = context.JPEGParser.parse(data,{sequence:true});
    context.Inspector = {model:context.JPEGFileModel.build(app.info,data)};
    const controls = {'ja-scope':{value:'embedded',selectedOptions:[{textContent:'Metadata, comments and trailing / unparsed data'}]}};
    app.el = id => controls[id];
    return {app, context, controls, data};
}

test('Embedded-file finder defaults to searching metadata and comments as well as trailers',()=>{
    const {app, context, controls} = workspace(jpeg());
    context.document = {querySelectorAll:()=>[]};
    controls['jr-analysis-tool'] = {querySelectorAll:()=>[]}; controls['ja-form'] = {};
    app.scheduleAnalysis = ()=>{}; app.tool = 'embedded'; app.renderTool();
    assert.match(controls['jr-analysis-tool'].innerHTML,/<option value="embedded" selected>/);
    app.tool = 'strings'; app.renderTool();
    assert.match(controls['jr-analysis-tool'].innerHTML,/<option value="metadata" selected>/);
});

test('Default embedded scope finds RAR inside COM, other signatures in APP segments, and trailers',()=>{
    const bytes = Buffer.concat([jpeg(
        segment(254,Buffer.from('text\0Rar!\x1a\x07\x00payload','latin1')),
        segment(0xe3,Buffer.from('unknown\0PK\x03\x04payload','latin1'))
    ),Buffer.from('%PDF-1.4 test %%EOF')]);
    const {app, context, data, controls} = workspace(bytes);
    const ranges = app.ranges(), found = ranges.flatMap(r=>context.FileAnalysis.signatures(data,r.start,r.end).found);
    assert.deepEqual(Array.from(found,m=>m.type),['RAR','ZIP','PDF']);
    assert.equal(found[0].start,bytes.indexOf(Buffer.from('Rar!')));
    const comment = context.Inspector.model.rows.find(r=>r.code==='COM');
    assert.ok(ranges.some(r=>r.start===comment.contentStart && r.end===comment.contentEnd));
    assert.equal(ranges.some(r=>r.start===0),false);
    controls['ja-scope'].value='trailing';
    assert.deepEqual(Array.from(app.ranges().flatMap(r=>context.FileAnalysis.signatures(data,r.start,r.end).found),m=>m.type),['PDF']);
    controls['ja-scope'].value='metadata';
    assert.deepEqual(Array.from(app.ranges().flatMap(r=>context.FileAnalysis.signatures(data,r.start,r.end).found),m=>m.type),['RAR','ZIP']);
});

test('Combined scope keeps metadata image selection, includes unparsed bytes, and does not duplicate ranges',()=>{
    const {app, context} = workspace(Buffer.concat([
        jpeg(segment(254,Buffer.from('first'))),jpeg(segment(254,Buffer.from('second'))),Buffer.from('tail')
    ]));
    app.imageIndex=1;
    const rows=context.Inspector.model.rows;
    const comment=rows.find(r=>r.code==='COM' && r.imageIndex===1);
    // An invalid metadata segment can also be classified as unparsed.
    comment.group='unparsed';
    const ranges=app.ranges();
    assert.equal(ranges.length,2);
    assert.equal(ranges[0].start,comment.contentStart);
    assert.equal(ranges[1].end,context.ImageController.data.length);
});

test('Signature searches do not join separate segments or validate PDF endings outside a comment',()=>{
    const {app, context, data} = workspace(jpeg(
        segment(254,Buffer.from('Rar!\x1a','latin1')),
        segment(254,Buffer.from('\x07\x00','latin1')),
        segment(254,Buffer.from('%PDF-1.4')),
        segment(254,Buffer.from('%%EOF'))
    ));
    const found=app.ranges().flatMap(r=>context.FileAnalysis.signatures(data,r.start,r.end).found);
    assert.equal(found.length,1); assert.equal(found[0].type,'PDF'); assert.equal(found[0].end,null);
});

test('Embedded results identify COM, export original offsets, and download only to the comment end',async()=>{
    const payload=Buffer.from('Rar!\x1a\x07\x00archive bytes','latin1');
    const {app, context, controls, data}=workspace(jpeg(segment(254,Buffer.concat([Buffer.from('prefix\0'),payload]))));
    const buttons=[],downloads=[],exports=[];
    context.document={createElement:()=>({})};
    controls['ja-candidate-0']={appendChild:button=>buttons.push(button)};
    app.integer=()=>200; app.bindOffsets=()=>{};
    app.download=(label,bytes)=>{exports.push(JSON.parse(bytes)); return {};};
    app.saveBlob=(blob,name)=>downloads.push({blob,name});
    const out={innerHTML:'',insertAdjacentHTML(position,html){this.innerHTML+=html;},appendChild(){}};
    await app.byteAnalysis('embedded',out,()=>false);
    assert.match(out.innerHTML,/COM · Comment/);
    assert.equal(exports[0].results[0].start,data.indexOf('Rar!'));
    assert.match(exports[0].results[0].source,/COM/);
    buttons[0].onclick();
    assert.deepEqual(Buffer.from(await downloads[0].blob.arrayBuffer()),payload);
    assert.equal(downloads[0].name,'candidate-'+data.indexOf('Rar!')+'.bin');
});
