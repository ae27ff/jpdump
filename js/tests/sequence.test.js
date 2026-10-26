const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {loadJPEG,parseJPEG,jpeg,segment}=require('./jpeg-helpers');
const {loadScript,projectRoot}=require('./script-helpers');

function fixture(name){
    return fs.readFileSync(path.join(__dirname,'fixtures',name));
}

function loadModel(){
    const context=loadJPEG();
    loadScript(context,'js/jpeg/JPEGFileModel.js');
    return context;
}

function modelFor(bytes,context=loadModel()){
    return context.JPEGFileModel.build(context.JPEGParser.parse(bytes.toString('latin1'),{sequence:true}),bytes.toString('latin1'));
}

function parseSequence(bytes){
    return loadJPEG().JPEGParser.parse(bytes.toString('latin1'),{sequence:true});
}

function assertPartition(bytes,model){
    let end=0;
    for(const row of model.rows){
        assert.equal(row.start,end,'every byte belongs to exactly one region');
        assert.ok(row.end>row.start && row.end<=bytes.length);
        assert.ok(row.contentStart>=row.start && row.contentEnd<=row.end);
        end=row.end;
    }
    assert.equal(end,bytes.length);
    assert.equal(model.groups.reduce((sum,group)=>sum+group.size,0),bytes.length);
}

test('Raw MJPEG retains all images, absolute offsets and the exact final trailer',()=>{
    const frame=jpeg(), bytes=Buffer.concat([frame,frame,frame,Buffer.from('tail')]);
    const model=modelFor(bytes), info=model.info;
    assert.equal(info.valid,true);
    assert.equal(model.format,'MJPEG / JPEG sequence');
    assert.equal(info.images.length,3);
    assert.equal(info.nextp,frame.length*3);
    assert.equal(info.extraneous,'tail');
    assert.equal(model.confirmedEnd,true);
    assertPartition(bytes,model);
    for(let i=0;i<3;i++){
        const image=info.images[i];
        assert.equal(image.start,frame.length*i);
        assert.equal(image.end,frame.length*(i+1));
        assert.equal(image.filesize,frame.length);
        assert.equal(image.headers[0].p,image.start);
        assert.equal(image.headers.at(-1).nextp,image.end);
        assert.equal(image.extraneous,'','images do not retain the rest of the video');
        assert.ok(model.rows.filter(row=>row.imageIndex===i).every(row=>row.name.startsWith('Image '+(i+1)+' · ')));
    }
    assert.equal(model.rows.at(-1).group,'extra');
    assert.equal(model.rows.at(-1).size,4);
});

test('Raw JPEG-LS and JPEG 2000 sequences reset their per-image parser state',()=>{
    for(const [name,format] of [['t8nde0.jls','JPEG-LS sequence'],['openjpeg-3x2.j2k','JPEG 2000 codestream sequence']]){
        const frame=fixture(name), bytes=Buffer.concat([frame,frame]);
        const model=modelFor(bytes);
        assert.equal(model.info.valid,true,name);
        assert.equal(model.format,format);
        assert.equal(model.info.images.length,2);
        assert.equal(model.parsedSize,bytes.length);
        assert.equal(model.rows.some(row=>row.group==='extra'),false);
        assert.equal(model.ghosts.length,0);
        assertPartition(bytes,model);
        assert.deepEqual({...model.info.images[1].dimensions},{...model.info.images[0].dimensions});
    }
});

test('Mixed raw streams keep their own scan labels and final end-marker name',()=>{
    const classic=jpeg(), ls=fixture('t8nde0.jls'), j2k=fixture('openjpeg-3x2.j2k');
    for(const frames of [[classic,ls,j2k],[j2k,classic,ls]]){
        const bytes=Buffer.concat([...frames,Buffer.from('tail')]), model=modelFor(bytes);
        assert.equal(model.info.valid,true);
        assert.equal(model.format,'JPEG-family sequence');
        assert.equal(model.images.length,3);
        assert.equal(model.mixed,true);
        assertPartition(bytes,model);
        const lsIndex=frames.indexOf(ls), j2kIndex=frames.indexOf(j2k);
        assert.match(model.rows.find(row=>row.group==='image' && row.imageIndex===lsIndex).name,/JPEG-LS bit-stuffed data/);
        assert.equal(model.rows.find(row=>row.group==='image' && row.imageIndex===j2kIndex).code,'Coded data');
        assert.equal(model.endName,frames.at(-1)===j2k ? 'End of Codestream' : 'End of Image');
    }
});

test('Embedded SOI and EOI bytes in metadata do not split an image',()=>{
    const frame=jpeg(segment(0xef,Buffer.concat([Buffer.from('opaque'),jpeg(),Buffer.from([255,79,255,217])])));
    const result=parseSequence(Buffer.concat([frame,frame]));
    assert.equal(result.valid,true);
    assert.equal(result.images.length,2);
    assert.equal(result.images[1].start,frame.length);
    assert.equal(result.images[0].headers.filter(header=>header.type==='d8').length,1);
});

test('Only immediately adjacent signatures start another stream; containers stay unrecognized',()=>{
    const frame=jpeg();
    for(const separator of [Buffer.from([0]),Buffer.from('\r\n'),Buffer.from('--boundary\r\nContent-Type: image/jpeg\r\n\r\n')]){
        const tail=Buffer.concat([separator,frame]), result=parseSequence(Buffer.concat([frame,tail]));
        assert.equal(result.images.length,1);
        assert.equal(result.extraneous,tail.toString('latin1'));
    }
    for(const prefix of [Buffer.from('RIFFxxxxAVI '),Buffer.from('xxxxftypqt  '),Buffer.from([0,0,0,12,106,80,32,32,13,10,135,10]),Buffer.from('--boundary\r\n')]){
        const bytes=Buffer.concat([prefix,frame]), model=modelFor(bytes);
        assert.equal(model.recognized,false);
        assert.equal(model.info.valid,false);
        assert.equal(model.rows.some(row=>row.group==='extra'),false);
        assertPartition(bytes,model);
    }
});

test('Marker fill is accepted at the boundary and differing image dimensions are retained',()=>{
    const first=jpeg(), second=jpeg();
    second.writeUInt16BE(7,second.indexOf(Buffer.from([255,192]))+7);
    const result=parseSequence(Buffer.concat([first,Buffer.from([255,255]),second]));
    assert.equal(result.valid,true);
    assert.equal(result.images.length,2);
    assert.equal(result.images[1].start,first.length);
    assert.equal(result.images[1].headers[0].markerwidth,4);
    assert.equal(result.mixedDimensions,true);
    assert.equal(result.images[0].dimensions.width,1);
    assert.equal(result.images[1].dimensions.width,7);
});

test('Every truncated later stream stays recoverable without becoming a disposable trailer',()=>{
    const context=loadModel();
    for(const frame of [jpeg(),fixture('t8nde0.jls'),fixture('openjpeg-3x2.j2k')]){
        for(let length=2;length<frame.length;length++){
            const bytes=Buffer.concat([frame,frame.subarray(0,length)]), model=modelFor(bytes,context);
            assert.equal(model.info.images.length,2);
            assert.equal(model.info.images[0].valid,true);
            assert.equal(model.info.images[1].valid,false);
            assert.equal(model.info.valid,false);
            assert.equal(model.confirmedEnd,false);
            assert.equal(model.rows.some(row=>row.group==='extra'),false);
            assert.ok(model.info.warnings.some(warning=>warning.startsWith('Image 2: ')));
            assertPartition(bytes,model);
        }
    }
});

test('A malformed later stream stops traversal without claiming a third image is verified',()=>{
    const first=jpeg(), bad=jpeg(segment(0xdb,Buffer.from([0,1])));
    const bytes=Buffer.concat([first,bad,first]), model=modelFor(bytes);
    assert.equal(model.info.valid,false);
    assert.equal(model.images.length,2);
    assert.equal(model.images[0].valid,true);
    assert.equal(model.images[1].valid,false);
    assert.equal(model.info.extraneous,first.toString('latin1'));
    assert.equal(model.rows.at(-1).group,'unparsed');
    assertPartition(bytes,model);
});

test('Tables-only abbreviated streams are not advertised as MJPEG images',()=>{
    const tables=Buffer.concat([Buffer.from([255,216]),segment(0xfe,Buffer.from('tables')),Buffer.from([255,217])]);
    const result=parseSequence(Buffer.concat([tables,jpeg()]));
    assert.equal(result.valid,true);
    assert.equal(result.tableOnly,false);
    assert.equal(result.images[0].tableOnly,true);
    assert.equal(result.images[1].tableOnly,false);
    assert.equal(result.format,'JPEG abbreviated stream sequence');
});

test('Many adjacent images do not recurse or exceed argument-count limits',()=>{
    const frame=jpeg(), count=2000, result=parseSequence(Buffer.concat(Array(count).fill(frame)));
    assert.equal(result.valid,true);
    assert.equal(result.images.length,count);
    assert.equal(result.nextp,count*frame.length);
    assert.equal(result.extraneous,'');
});

test('The file picker includes raw aliases without advertising container formats',()=>{
    const html=fs.readFileSync(path.join(projectRoot,'index.html'),'utf8');
    const accept=html.match(/accept="([^"]+)"/)[1].split(',');
    for(const extension of ['.mjpg','.mjpeg','.jfif','.jif','.jfi','.jpe','.jpc']) assert.ok(accept.includes(extension));
    for(const extension of ['.avi','.mov','.mp4','.jp2','.mj2','.mpo']) assert.equal(accept.includes(extension),false);
});

test('Single-image parsing preserves appended JPEG-family streams as extraneous by default',()=>{
    const first=jpeg();
    for(const appended of [jpeg(),fixture('t8nde0.jls'),fixture('openjpeg-3x2.j2k'),jpeg().subarray(0,10)]){
        const bytes=Buffer.concat([first,appended]), info=parseJPEG(bytes), context=loadModel();
        const model=context.JPEGFileModel.build(info,bytes.toString('latin1'));
        assert.equal(info.valid,true);
        assert.equal(info.images.length,1);
        assert.equal(info.format,'JPEG');
        assert.equal(info.nextp,first.length);
        assert.equal(info.extraneous,appended.toString('latin1'));
        assert.equal(model.rows.at(-1).group,'extra');
        assert.equal(model.rows.at(-1).size,appended.length);
        assertPartition(bytes,model);
    }
});

test('Comparison uploads use the same filename opt-in as the main upload',async()=>{
    const context=loadModel(), frame=jpeg(), bytes=Buffer.concat([frame,frame]);
    const elements={};
    for(const id of ['jc-file','jc-run','jc-output','jc-file-status','jc-right']) elements[id]={};
    context.document={getElementById:id=>elements[id]};
    loadScript(context,'js/ui/ResultView.js');
    loadScript(context,'js/ui/Workspaces.js');
    for(const name of ['comparison.jpg','comparison.mjpg','comparison.JPEG','comparison.MJPEG']){
        elements['jc-file'].files=[{name,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)}];
        await context.Workspaces.readComparison();
        const sequence=/\.(mjpg|mjpeg)$/i.test(name);
        const other=context.Workspaces.other;
        assert.ok(other,elements['jc-file-status'].textContent);
        assert.equal(other.info.images.length,sequence?2:1,name);
        assert.equal(other.info.extraneous,sequence?'':frame.toString('latin1'),name);
        assert.equal(other.model.rows.at(-1).group,sequence?'eoi':'extra',name);
    }
});
