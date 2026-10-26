const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {projectRoot}=require('./script-helpers');
const {jpeg}=require('./metadata-helpers');

test('Corruption notices start recovery with codeword substitution enabled by default',{
    skip:!process.env.JPDUMP_PLAYWRIGHT||!process.env.JPDUMP_BROWSER,timeout:60000
},async()=>{
    const {chromium}=require(process.env.JPDUMP_PLAYWRIGHT);
    const browser=await chromium.launch({headless:true,executablePath:process.env.JPDUMP_BROWSER});
    try{
        const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto(pathToFileURL(path.join(projectRoot,'index.html')).href);
        async function upload(name,buffer){
            await page.locator('#upload').setInputFiles({name,mimeType:'image/jpeg',buffer});
            await page.locator('#jr-results').waitFor({state:'visible'});
        }
        async function recover(expected='complete'){
            await page.getByRole('button',{name:'Recover image',exact:true}).click();
            await page.waitForFunction(()=>['complete','error'].includes(document.getElementById('ja-output').dataset.state));
            assert.equal(await page.locator('#ja-output').getAttribute('data-state'),expected);
            assert.equal(await page.locator('#ja-codewords').isChecked(),true);
        }
        const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/reconstruction-reference.json'),'utf8'))[3];
        const healthy=Buffer.from(fixture.jpeg,'base64');
        await upload('healthy.jpg',healthy);assert.equal(await page.locator('#jr-recover-image').isVisible(),false);
        await upload('truncated.jpg',healthy.subarray(0,-2));
        const notice=await page.locator('#jr-warnings').boundingBox(),button=await page.locator('#jr-recover-image').boundingBox();
        assert.ok(button.x>notice.x+notice.width/2);
        await recover();assert.match(await page.locator('#ja-output').innerText(),/missing or damaged end marker/);
        const base=jpeg(),sof=base.indexOf(Buffer.from([255,192])),sos=base.indexOf(Buffer.from([255,218]));
        const prefix=Buffer.from(base.subarray(2,sos+10));prefix.writeUInt16BE(8,sof+3);prefix.writeUInt16BE(24,sof+5);
        const damaged=Buffer.concat([Buffer.from('fragment'),prefix,Buffer.from([0x23,255,217])]);
        await upload('codewords.jpg',damaged);await recover();
        assert.match(await page.locator('#ja-output').innerText(),/Guessed 1 codeword/);
        const download=page.waitForEvent('download');await page.getByRole('link',{name:'Recovery report JSON',exact:true}).click();
        const report=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
        assert.equal(report.codewordRecovery.enabled,true);assert.equal(report.codewordRecovery.count,1);
        await page.locator('#ja-mode').selectOption('strict');
        assert.equal(await page.locator('#ja-codewords').isChecked(),false);assert.equal(await page.locator('#ja-codewords').isDisabled(),true);
        await page.locator('#ja-mode').selectOption('recover');assert.equal(await page.locator('#ja-codewords').isChecked(),true);
        await upload('sequence.mjpg',Buffer.concat([healthy,healthy.subarray(0,-2)]));
        await page.locator('#jr-rows tr').first().click();await recover();assert.equal(await page.locator('#ja-image').inputValue(),'1');
        for(const file of ['t8nde0.jls','openjpeg-3x2.j2k']){
            const bytes=fs.readFileSync(path.join(__dirname,'fixtures',file));
            await upload(file,bytes.subarray(0,-1));await recover('error');
        }
        await page.setViewportSize({width:390,height:844});await upload('mobile.jpg',damaged);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
        await recover();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
        assert.deepEqual(errors,[]);
    }finally{await browser.close();}
});
