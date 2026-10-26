const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadScript}=require('./script-helpers');

function application(){
    const context=vm.createContext({setTimeout,clearTimeout,ImageController:{data:{length:1024}}});
    loadScript(context,'js/ui/Workspaces.js');
    const app=context.Workspaces;
    app.info={images:[{start:0,end:1024,dimensions:{width:1920,height:1080}}]};
    app.ranges=()=>[{start:0,end:1024}];
    return {app,context};
}

test('Quick analyses run automatically below 4K; reconstruction and coefficients remain manual',()=>{
    const {app}=application();
    for(const key of ['strings','embedded','entropy','metadata','tables','ela','channels','levels','thumbnails']){
        app.tool=key;assert.equal(app.shouldAutoRun(),true,key);
    }
    for(const key of ['reconstruct','coefficients','overview']){
        app.tool=key;assert.equal(app.shouldAutoRun(),false,key);
    }
});

test('The automatic cutoff follows the longest image edge, including sequence image selection',()=>{
    const {app}=application();app.tool='ela';
    app.info.images[0].dimensions={width:4095,height:2160};assert.equal(app.shouldAutoRun(),true);
    app.info.images[0].dimensions={width:4096,height:2160};assert.equal(app.shouldAutoRun(),false);
    app.info.images[0].dimensions={width:1080,height:4096};assert.equal(app.shouldAutoRun(),false);
    app.info.images.push({start:1024,end:2048,dimensions:{width:320,height:240}});
    app.imageIndex=1;assert.equal(app.shouldAutoRun(),true);
    app.info.images[1].dimensions=null;assert.equal(app.shouldAutoRun(),false);
});

test('Byte analyses account for scope size so large trailers do not scan automatically',()=>{
    const {app,context}=application();app.tool='embedded';
    app.ranges=()=>[{start:0,end:8*1024*1024+1}];assert.equal(app.shouldAutoRun(),false);
    app.ranges=()=>[{start:9000000,end:9001024}];assert.equal(app.shouldAutoRun(),true);
    app.ranges=()=>[{start:0,end:5*1024*1024},{start:6000000,end:11000000}];assert.equal(app.shouldAutoRun(),false);
    app.ranges=()=>{throw new Error('No segment selected');};assert.equal(app.shouldAutoRun(),false);
    app.tool='metadata';context.ImageController.data.length=9000000;assert.equal(app.shouldAutoRun(),false);
});

test('A cancelled analysis cannot clear the busy state or replace results of a newer run',async()=>{
    const {app}=application(),pending=[];
    const output={dataset:{},attributes:{},setAttribute(key,value){this.attributes[key]=value;}},button={disabled:false};
    app.el=id=>id==='ja-run'?button:output;app.release=()=>{};app.tool='channels';
    app.visual=async(key,out,cancelled)=>{
        const index=pending.length;
        await new Promise(resolve=>pending.push(resolve));
        if(!cancelled())out.textContent='Result '+index;
    };
    const first=app.run();
    while(pending.length<1)await new Promise(resolve=>setTimeout(resolve,1));
    const second=app.run();
    while(pending.length<2)await new Promise(resolve=>setTimeout(resolve,1));
    pending[0]();await first;
    assert.equal(button.disabled,true);assert.equal(output.attributes['aria-busy'],'true');assert.equal(output.dataset.state,'running');
    pending[1]();await second;
    assert.equal(output.textContent,'Result 1');assert.equal(button.disabled,false);assert.equal(output.attributes['aria-busy'],'false');assert.equal(output.dataset.state,'complete');
});

test('The corruption shortcut chooses the damaged image and starts reconstruction immediately',async()=>{
    const {app,context}=application(),calls=[];
    app.info.images=[{valid:true},{valid:false},{valid:false}];
    context.Inspector={current:()=>({imageIndex:0})};
    app.el=()=>({setAttribute(){},focus(){calls.push('focus');}});
    app.show=view=>calls.push(view);app.renderTool=()=>calls.push('render');app.run=async()=>calls.push('run');
    await app.recoverImage();assert.equal(app.imageIndex,1);assert.equal(app.tool,'reconstruct');
    assert.deepEqual(calls,['analyze','render','focus','run']);
    context.Inspector.current=()=>({imageIndex:2});
    await app.recoverImage();assert.equal(app.imageIndex,2);
});

test('Strict mode disables codeword guesses and Recover mode restores the chosen setting',()=>{
    const {app}=application(),mode={value:'strict'},codewords={checked:true,disabled:false,dataset:{}};
    app.el=id=>id==='ja-mode'?mode:codewords;
    app.syncRecoveryMode();assert.equal(codewords.checked,false);assert.equal(codewords.disabled,true);
    mode.value='recover';app.syncRecoveryMode();assert.equal(codewords.checked,true);assert.equal(codewords.disabled,false);
    codewords.checked=false;mode.value='strict';app.syncRecoveryMode();
    mode.value='recover';app.syncRecoveryMode();assert.equal(codewords.checked,false);
});
