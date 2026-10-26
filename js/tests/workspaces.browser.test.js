// Optional integration checks against an existing Playwright and browser install.
// No dependencies are installed. See README.txt for the environment variables.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {projectRoot}=require('./script-helpers');
const {segment}=require('./metadata-helpers');

test('Browser workspaces, analyses, recovery, comparisons and stale work remain functional',{
    skip:!process.env.JPDUMP_PLAYWRIGHT || !process.env.JPDUMP_BROWSER,
    timeout:120000
},async()=>{
    const {chromium}=require(process.env.JPDUMP_PLAYWRIGHT);
    const server=http.createServer((request,response)=>{
        const url=new URL(request.url,'http://localhost'),relative=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
        const file=path.resolve(projectRoot,relative);
        if(!file.startsWith(projectRoot+path.sep)||relative==='ga.js'){response.writeHead(404);response.end();return;}
        try{const bytes=fs.readFileSync(file),type={'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(file)]||'application/octet-stream';response.writeHead(200,{'Content-Type':type});response.end(bytes);}
        catch{response.writeHead(404);response.end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let browser;
    try{
        browser=await chromium.launch({headless:true,executablePath:process.env.JPDUMP_BROWSER});
        const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto('http://127.0.0.1:'+server.address().port);
        await page.locator('[data-workspace="analyze"]').click();
        assert.equal(await page.locator('#jr-results').isVisible(),false);
        assert.match(await page.locator('#jr-analysis-tool').innerText(),/Open an image/);
        const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/reconstruction-reference.json'),'utf8'))[3];
        const base=Buffer.from(fixture.jpeg,'base64');
        const rar=Buffer.from('Rar!\x1a\x07\x00archive bytes','latin1');
        const bytes=Buffer.concat([base.subarray(0,2),segment(254,Buffer.concat([Buffer.from('hello hidden example https://example.test\0'),rar])),base.subarray(2),Buffer.from('%PDF-1.4 test %%EOF')]);
        await page.locator('#upload').setInputFiles({name:'sample<&>.jpg',mimeType:'image/jpeg',buffer:bytes});
        await page.locator('#jr-results').waitFor({state:'visible'});
        assert.equal(await page.locator('#jr-recover-image').isVisible(),false);
        await page.locator('[data-segment]').first().click();
        const selected=await page.locator('#jr-code').innerText();
        await page.locator('[data-workspace="analyze"]').click();
        assert.equal(await page.locator('#jr-results').isVisible(),false);
        assert.equal(await page.locator('#jr-workspace').isVisible(),false);
        assert.match(await page.locator('#ja-output').innerText(),/Comment segment/);
        async function tool(key){await page.locator('[data-tool="'+key+'"]').click();}
        async function run(){if(await page.locator('#ja-run').isVisible())await page.locator('#ja-run').click();await page.waitForFunction(()=>['complete','error'].includes(document.getElementById('ja-output').dataset.state));}
        await tool('strings');assert.equal(await page.locator('#ja-run').isVisible(),false);await run();assert.match(await page.locator('#ja-output').innerText(),/hello hidden/);
        await page.locator('#ja-form .jr-advanced summary').click();await page.locator('#ja-minimum').fill('128');await run();assert.match(await page.locator('#ja-output').innerText(),/No matches/);
        await page.locator('#ja-minimum').fill('6');await run();assert.match(await page.locator('#ja-output').innerText(),/hello hidden/);
        await page.locator('#ja-output [data-offset]').first().click();assert.equal(await page.locator('#jr-results').isVisible(),true);assert.match(await page.locator('#jr-code').innerText(),/COM/);
        await page.locator('[data-workspace="analyze"]').click();await page.locator('#ja-scope').selectOption('segment');await run();assert.match(await page.locator('#ja-output').innerText(),/hello hidden/);
        // Leaving while an update is debounced cancels it; returning automatically refreshes it.
        await page.locator('#ja-scope').selectOption('trailing');await page.locator('[data-workspace="inspect"]').click();await page.locator('[data-workspace="analyze"]').click();await run();assert.match(await page.locator('#ja-output').innerText(),/PDF-1.4/);
        await page.locator('[data-workspace="inspect"]').click();await page.locator('[data-workspace="analyze"]').click();await tool('reconstruct');assert.equal(await page.locator('#ja-image').inputValue(),'0');
        await tool('embedded');await run();assert.match(await page.locator('#ja-output').innerText(),/PDF/);
        assert.equal(await page.locator('#ja-scope').inputValue(),'embedded');
        assert.match(await page.locator('#ja-output').innerText(),/RAR/);
        const rarRow=page.locator('#ja-output tbody tr').filter({hasText:'RAR'});
        assert.match(await rarRow.innerText(),/COM/);
        const rarPending=page.waitForEvent('download');await rarRow.getByRole('button',{name:'Download from signature to range end',exact:true}).click();
        assert.deepEqual(fs.readFileSync(await (await rarPending).path()),rar);
        await tool('entropy');await run();assert.ok(await page.locator('.jr-bars button').count()>0);
        // Hovering anywhere in a chart column reports its data, even above a short or empty bar.
        await page.locator('#ja-scope').selectOption('file');await run();
        const histogram=page.locator('.jr-histogram'),frequencyTip=histogram.getByRole('tooltip');
        const counts=Array(256).fill(0);for(const value of bytes)counts[value]++;
        async function hoverValue(value){
            await histogram.scrollIntoViewIfNeeded();const box=await histogram.boundingBox();
            await page.mouse.move(box.x+box.width*(value+0.5)/256,box.y+4);
            assert.equal(await frequencyTip.isVisible(),true);
            assert.equal(await frequencyTip.innerText(),'Byte value: 0x'+value.toString(16).padStart(2,'0').toUpperCase()+' ('+value+')\nCount: '+counts[value].toLocaleString('en-US')+'\nFrequency: '+(counts[value]/bytes.length*100).toFixed(3)+'%');
            const tip=await frequencyTip.boundingBox(),viewport=page.viewportSize();
            assert.ok(tip.x>=0&&tip.x+tip.width<=viewport.width&&tip.y>=0&&tip.y+tip.height<=viewport.height);
        }
        await hoverValue(0);await hoverValue(255);await hoverValue(counts.indexOf(0));
        await page.keyboard.press('Escape');await frequencyTip.waitFor({state:'hidden'});
        await histogram.focus();await histogram.press('Home');assert.match(await frequencyTip.innerText(),/0x00 \(0\)/);
        await histogram.press('ArrowRight');assert.match(await frequencyTip.innerText(),/0x01 \(1\)/);
        await histogram.press('End');assert.match(await frequencyTip.innerText(),/0xFF \(255\)/);
        const entropyChart=page.locator('.jr-bars').first(),entropyTip=entropyChart.getByRole('tooltip');
        await page.mouse.move(0,0);
        await entropyChart.locator('button').first().focus();
        const step=Math.ceil(bytes.length/128),local=Array(256).fill(0);for(const value of bytes.subarray(0,step))local[value]++;
        const entropy=-local.reduce((sum,count)=>count?sum+count/step*Math.log2(count/step):sum,0);
        assert.equal(await entropyTip.innerText(),'Bytes 0–'+(step-1)+'\nEntropy: '+entropy.toFixed(3)+' bits/byte');
        await page.mouse.move(0,0);await page.locator('#ja-scope').focus();
        assert.equal(await frequencyTip.isVisible(),false);assert.equal(await entropyTip.isVisible(),false);
        await page.setViewportSize({width:390,height:844});await hoverValue(0);await hoverValue(255);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
        await page.setViewportSize({width:1280,height:900});
        await entropyChart.locator('button').first().click();assert.equal(await page.locator('#jr-results').isVisible(),true);
        await page.locator('[data-workspace="analyze"]').click();
        await tool('metadata');await run();
        assert.equal(await page.getByRole('radio',{name:'Retrieve metadata',exact:true}).isChecked(),true);
        assert.equal(await page.locator('#ja-form .jr-advanced').isVisible(),false);
        assert.equal(await page.locator('#ja-metadata-retrieve').evaluate(input=>!!input.closest('details')),false);
        assert.match(await page.locator('#ja-output table').innerText(),/hello hidden example/);
        assert.match(await page.locator('#ja-output table').innerText(),/sample<&>\.jpg/);
        await page.getByRole('radio',{name:'See Locations',exact:true}).check();await run();
        assert.match(await page.locator('#ja-output').innerText(),/Comment segment/);
        assert.equal(await page.locator('#ja-form .jr-advanced').isVisible(),true);
        await page.locator('#ja-output [data-offset]').first().click();
        assert.equal(await page.locator('#jr-results').isVisible(),true);assert.match(await page.locator('#jr-code').innerText(),/COM/);
        await page.locator('[data-workspace="analyze"]').click();
        await page.getByRole('radio',{name:'Retrieve metadata',exact:true}).check();await run();
        assert.match(await page.locator('#ja-output table').innerText(),/hello hidden example/);
        await tool('tables');await run();assert.ok(await page.locator('.jr-frequency-grid').count()>0);
        await tool('ela');await run();assert.ok(await page.locator('#ja-output canvas').count()>0);
        await tool('channels');await page.locator('#ja-bit').selectOption('0');await run();assert.ok(await page.locator('#ja-output canvas').count()>0);
        await tool('levels');await run();assert.ok(await page.locator('#ja-output canvas').count()>0);
        await tool('thumbnails');await run();assert.match(await page.locator('#ja-output').innerText(),/No supported/);
        await tool('coefficients');assert.equal(await page.locator('#ja-run').isVisible(),true);await run();assert.match(await page.locator('#ja-output').innerText(),/coefficients ·/);
        await tool('reconstruct');assert.equal(await page.locator('#ja-codewords').isChecked(),true);await run();assert.match(await page.locator('#ja-output').innerText(),/0 uncertain · 0 missing/);
        await page.locator('#ja-overlay').uncheck();assert.ok(await page.locator('#ja-bitmap').isVisible());
        assert.equal(await page.locator('#ja-bitmap').getAttribute('width'),'17');
        if(process.env.JPDUMP_SCREENSHOT) await page.screenshot({path:process.env.JPDUMP_SCREENSHOT,fullPage:true});
        // Downloads must work after leaving and returning to the analysis.
        await page.locator('[data-workspace="inspect"]').click();assert.equal(await page.locator('#jr-detail').isVisible(),true);
        await page.locator('[data-workspace="analyze"]').click();
        let pngPending=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();assert.equal((await pngPending).suggestedFilename(),'reconstructed.png');
        await tool('coefficients');await run();await page.locator('[data-workspace="inspect"]').click();await page.locator('[data-workspace="analyze"]').click();
        let csvPending=page.waitForEvent('download');await page.getByRole('button',{name:'Export coefficient CSV',exact:true}).click();assert.equal((await csvPending).suggestedFilename(),'coefficients.csv');
        await tool('reconstruct');await run();
        let pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();let download=await pending;assert.equal(download.suggestedFilename(),'reconstructed.png');
        pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download BMP',exact:true}).click();download=await pending;assert.equal(download.suggestedFilename(),'reconstructed.bmp');
        // Component-only output has equal RGB values.
        await page.locator('#ja-component').selectOption('1');await run();
        assert.equal(await page.locator('#ja-bitmap').evaluate(canvas=>{const p=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;for(let i=0;i<p.length;i+=4)if(p[i]!==p[i+1]||p[i]!==p[i+2])return false;return true;}),true);
        // Compare uses its own surface and does not destroy the inspector selection.
        await page.locator('[data-workspace="compare"]').click();
        assert.equal(await page.locator('#jr-results').isVisible(),false);assert.equal(await page.locator('#jr-analyze').isVisible(),false);
        await page.locator('#jc-file').setInputFiles({name:'reference.jpg',mimeType:'image/jpeg',buffer:bytes});
        await page.waitForFunction(()=>document.getElementById('jc-run').disabled===false);
        async function compare(mode){await page.locator('#jc-mode').selectOption(mode);await page.locator('#jc-run').click();await page.waitForFunction(()=>document.getElementById('jc-run').disabled===false);}
        await compare('structure');assert.match(await page.locator('#jc-output').innerText(),/0 differing positions/);
        await compare('metadata');assert.match(await page.locator('#jc-output').innerText(),/Identical stored bytes/);
        await compare('pixels');assert.match(await page.locator('#jc-output').innerText(),/0 differing pixels/);
        await compare('coefficients');assert.match(await page.locator('#jc-output').innerText(),/strict Huffman/);
        // Conservative repair operates on the selected image and reports missing EOI.
        await page.locator('#upload').setInputFiles({name:'truncated.jpg',mimeType:'image/jpeg',buffer:base.subarray(0,-2)});
        await page.locator('#jr-results').waitFor({state:'visible'});
        const warningBox=await page.locator('#jr-warnings').boundingBox(),recoveryBox=await page.locator('#jr-recover-image').boundingBox();
        assert.ok(recoveryBox.x>warningBox.x+warningBox.width/2);
        await page.getByRole('button',{name:'Recover image',exact:true}).click();
        await page.waitForFunction(()=>['complete','error'].includes(document.getElementById('ja-output').dataset.state));
        assert.match(await page.locator('#ja-output').innerText(),/missing or damaged end marker/);
        await page.locator('#ja-mode').selectOption('strict');await run();assert.match(await page.locator('#ja-output').innerText(),/end marker/);
        // A new file invalidates results, donor files, and previous exports.
        await page.locator('#upload').setInputFiles({name:'fresh.jpg',mimeType:'image/jpeg',buffer:base});await page.locator('#jr-results').waitFor({state:'visible'});
        await page.locator('[data-workspace="compare"]').click();assert.match(await page.locator('#jc-file-status').innerText(),/No comparison/);
        // Progressive recovery exports the same report/mask contract and compares to baseline coefficients.
        const progressive=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/reconstruction-reference.json'),'utf8')).find(f=>f.name==='progressive-420-17x13');
        const progressiveBytes=Buffer.from(progressive.jpeg,'base64');
        await page.locator('#upload').setInputFiles({name:'progressive.jpg',mimeType:'image/jpeg',buffer:progressiveBytes});
        await page.locator('#jr-results').waitFor({state:'visible'});await page.locator('[data-workspace="analyze"]').click();await tool('reconstruct');await run();
        assert.match(await page.locator('#ja-output').innerText(),/0 uncertain · 0 missing/);
        const reportDownload=page.waitForEvent('download');await page.getByRole('link',{name:'Recovery report JSON',exact:true}).click();
        const progressiveReport=JSON.parse(fs.readFileSync(await (await reportDownload).path(),'utf8'));
        assert.equal(progressiveReport.coding,'SOF2');assert.equal(progressiveReport.scans,10);
        await page.locator('[data-workspace="compare"]').click();
        await page.locator('#jc-file').setInputFiles({name:'baseline.jpg',mimeType:'image/jpeg',buffer:Buffer.from(progressive.baselineJPEG,'base64')});
        await page.waitForFunction(()=>document.getElementById('jc-run').disabled===false);await compare('coefficients');
        assert.match(await page.locator('#jc-output').innerText(),/strict Huffman/);
        const differences=await page.locator('#jc-output tbody tr').evaluateAll(rows=>rows.map(row=>row.cells[2].textContent));
        assert.deepEqual(differences,['0','0','0']);
        await page.locator('#upload').setInputFiles({name:'progressive-truncated.jpg',mimeType:'image/jpeg',buffer:progressiveBytes.subarray(0,-2)});
        await page.locator('#jr-results').waitFor({state:'visible'});await page.locator('[data-workspace="analyze"]').click();await tool('reconstruct');await run();
        assert.match(await page.locator('#ja-output').innerText(),/progressive image is incomplete/);
        // Codeword substitution is enabled by default, remains configurable and audits the guessed bits.
        const brokenBase=require('./metadata-helpers').jpeg(),brokenSOF=brokenBase.indexOf(Buffer.from([255,192])),brokenSOS=brokenBase.indexOf(Buffer.from([255,218]));
        const brokenPrefix=Buffer.from(brokenBase.subarray(0,brokenSOS+10));brokenPrefix.writeUInt16BE(8,brokenSOF+5);brokenPrefix.writeUInt16BE(24,brokenSOF+7);
        await page.locator('#upload').setInputFiles({name:'invalid-codeword.jpg',mimeType:'image/jpeg',buffer:Buffer.concat([brokenPrefix,Buffer.from([0x23,255,217])])});
        await page.locator('#jr-results').waitFor({state:'visible'});await page.locator('[data-workspace="analyze"]').click();await tool('reconstruct');await run();
        assert.equal(await page.locator('#ja-codewords').isChecked(),true);
        assert.match(await page.locator('#ja-output').innerText(),/64 decoded pixels · 128 uncertain · 0 missing/);
        await page.locator('#ja-form .jr-advanced summary').click();await page.locator('#ja-codewords').uncheck();await run();
        assert.match(await page.locator('#ja-output').innerText(),/128 missing/);
        await page.locator('#ja-codewords').check();await run();
        assert.match(await page.locator('#ja-output').innerText(),/64 decoded pixels · 128 uncertain · 0 missing/);
        assert.match(await page.locator('#ja-output').innerText(),/Guessed 1 codeword/);
        const guessedDownload=page.waitForEvent('download');await page.getByRole('link',{name:'Recovery report JSON',exact:true}).click();
        const guessedReport=JSON.parse(fs.readFileSync(await (await guessedDownload).path(),'utf8'));
        assert.equal(guessedReport.codewordRecovery.enabled,true);assert.equal(guessedReport.codewordRecovery.count,1);
        assert.equal(guessedReport.codewordRecovery.substitutions[0].bit,2);
        assert.equal(guessedReport.codewordRecovery.substitutions[0].originalBits,'1');assert.equal(guessedReport.codewordRecovery.substitutions[0].replacementBits,'0');
        await page.locator('#ja-codewords').uncheck();await run();assert.match(await page.locator('#ja-output').innerText(),/128 missing/);
        await page.locator('#ja-codewords').check();await page.locator('#ja-codeword-limit').fill('1');await run();
        const limitedDownload=page.waitForEvent('download');await page.getByRole('link',{name:'Recovery report JSON',exact:true}).click();
        assert.equal(JSON.parse(fs.readFileSync(await (await limitedDownload).path(),'utf8')).codewordRecovery.limit,1);
        await page.locator('#ja-mode').selectOption('strict');assert.equal(await page.locator('#ja-codewords').isChecked(),false);assert.equal(await page.locator('#ja-codewords').isDisabled(),true);
        await run();assert.match(await page.locator('#ja-output').innerText(),/Invalid Huffman|Marker encountered/);
        await page.locator('#ja-mode').selectOption('recover');assert.equal(await page.locator('#ja-codewords').isChecked(),true);
        // Multi-image reconstruction operates on the selected stream, rather than the first preview.
        const grayFixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/reconstruction-reference.json'),'utf8'))[0];
        await page.locator('#upload').setInputFiles({name:'sequence.mjpg',mimeType:'image/jpeg',buffer:Buffer.concat([base,Buffer.from(grayFixture.jpeg,'base64')])});
        await page.locator('#jr-results').waitFor({state:'visible'});await page.locator('[data-workspace="analyze"]').click();await tool('reconstruct');await page.locator('#ja-image').selectOption('1');await run();assert.match(await page.locator('#ja-output').innerText(),/Image 2.*gray/);
        await page.locator('#upload').setInputFiles({name:'damaged-sequence.mjpg',mimeType:'image/jpeg',buffer:Buffer.concat([base,Buffer.from(grayFixture.jpeg,'base64').subarray(0,-2)])});
        await page.locator('#jr-results').waitFor({state:'visible'});await page.locator('#jr-rows tr').first().click();
        await page.getByRole('button',{name:'Recover image',exact:true}).click();
        await page.waitForFunction(()=>document.getElementById('ja-output').dataset.state==='complete');
        assert.equal(await page.locator('#ja-image').inputValue(),'1');assert.match(await page.locator('#ja-output').innerText(),/Image 2.*gray/);
        // Every corruption notice offers recovery, including codecs the decoder reports as unsupported.
        for(const file of ['t8nde0.jls','openjpeg-3x2.j2k']){
            const bytes=fs.readFileSync(path.join(__dirname,'fixtures',file));
            await page.locator('#upload').setInputFiles({name:file,mimeType:'image/jpeg',buffer:bytes.subarray(0,-1)});
            await page.locator('#jr-results').waitFor({state:'visible'});assert.equal(await page.locator('#jr-recover-image').isVisible(),true);
            await page.getByRole('button',{name:'Recover image',exact:true}).click();
            await page.waitForFunction(()=>document.getElementById('ja-output').dataset.state==='error');
            assert.equal(await page.locator('#ja-run').isEnabled(),true);
        }
        // A long reconstruction yields to navigation and cannot replace another view's results.
        const simple=require('./metadata-helpers').jpeg(),sof=simple.indexOf(Buffer.from([255,192])),sos=simple.indexOf(Buffer.from([255,218]));
        const prefix=Buffer.from(simple.subarray(0,sos+10));prefix.writeUInt16BE(1024,sof+5);prefix.writeUInt16BE(1024,sof+7);
        const large=Buffer.concat([prefix,Buffer.alloc(4096),Buffer.from([255,217])]);
        await page.locator('#upload').setInputFiles({name:'large.jpg',mimeType:'image/jpeg',buffer:large});await page.locator('#jr-results').waitFor({state:'visible'});
        await page.locator('[data-workspace="analyze"]').click();await tool('reconstruct');await page.locator('#ja-run').click();await page.locator('[data-workspace="compare"]').click();await page.locator('[data-workspace="analyze"]').click();
        await page.waitForFunction(()=>document.getElementById('ja-run').disabled===false);assert.match(await page.locator('#ja-output').innerText(),/Stopped when changing/);
        await page.locator('#upload').setInputFiles({name:'fresh.jpg',mimeType:'image/jpeg',buffer:base});await page.locator('#jr-results').waitFor({state:'visible'});
        // Quick tools become manual at 4K, then automatic when a smaller sequence image is selected.
        const widePrefix=Buffer.from(simple.subarray(0,sos+10));widePrefix.writeUInt16BE(8,sof+5);widePrefix.writeUInt16BE(4096,sof+7);
        const wide=Buffer.concat([widePrefix,Buffer.alloc(128),Buffer.from([255,217])]);
        await page.locator('#upload').setInputFiles({name:'wide.mjpg',mimeType:'image/jpeg',buffer:Buffer.concat([wide,base])});await page.locator('#jr-results').waitFor({state:'visible'});
        await page.locator('[data-workspace="analyze"]').click();await tool('channels');assert.equal(await page.locator('#ja-run').isVisible(),true);
        await page.locator('#ja-image').selectOption('1');assert.equal(await page.locator('#ja-run').isVisible(),false);await run();assert.ok(await page.locator('#ja-output canvas').count()>0);
        // Prefix truncation preserves stored ranges and exposes explicit header assumptions.
        const lostPrefix=Buffer.from('partial header'),cutBytes=Buffer.concat([lostPrefix,base.subarray(2)]);
        await page.locator('#upload').setInputFiles({name:'missing-prefix.jpg',mimeType:'image/jpeg',buffer:cutBytes});
        await page.locator('#jr-results').waitFor({state:'visible'});
        assert.match(await page.locator('#jr-rows tr').first().innerText(),/Unparsed data/);
        assert.equal(await page.locator('[data-region="missing-prefix"]').count(),1);
        assert.match(await page.locator('[data-region="unparsed"]').innerText(),/14 B/);
        if(process.env.JPDUMP_PREFIX_SCREENSHOT)await page.screenshot({path:process.env.JPDUMP_PREFIX_SCREENSHOT,fullPage:true});
        await page.locator('[data-workspace="analyze"]').click();await tool('reconstruct');await run();
        assert.match(await page.locator('#ja-output').innerText(),/221 uncertain · 0 missing/);
        assert.equal(await page.locator('#ja-header-recovery').isChecked(),false);
        const prefixReportPending=page.waitForEvent('download');await page.getByRole('link',{name:'Recovery report JSON',exact:true}).click();
        const prefixReport=JSON.parse(fs.readFileSync(await (await prefixReportPending).path(),'utf8'));
        assert.equal(prefixReport.missingHeaderRecovery.missingSOI,true);
        assert.equal(prefixReport.missingHeaderRecovery.enabled,true);assert.equal(prefixReport.missingHeaderRecovery.automatic,true);
        assert.equal(prefixReport.missingHeaderRecovery.assumedFrame,false);
        assert.deepEqual(prefixReport.missingHeaderRecovery.unparsedPrefixRange,[0,lostPrefix.length]);
        assert.deepEqual(prefixReport.missingHeaderRecovery.inserted,[{marker:'SOI',beforeSourceOffset:lostPrefix.length,hex:'FFD8'}]);
        // A lost frame needs a matching donor; its assumptions and source positions are exported.
        const cutOffset=base.indexOf(Buffer.from([255,196])),noFrame=base.subarray(cutOffset);
        await page.locator('#upload').setInputFiles({name:'missing-frame.jpg',mimeType:'image/jpeg',buffer:noFrame});
        await page.locator('#jr-results').waitFor({state:'visible'});await page.locator('[data-workspace="analyze"]').click();await tool('reconstruct');
        await page.locator('#ja-form .jr-advanced summary').click();await page.locator('#ja-header-recovery').check();await run();
        assert.match(await page.locator('#ja-output').innerText(),/frame header is missing/);
        await page.locator('[data-workspace="compare"]').click();
        await page.locator('#jc-file').setInputFiles({name:'frame-reference.jpg',mimeType:'image/jpeg',buffer:base});
        await page.waitForFunction(()=>document.getElementById('jc-run').disabled===false);
        await page.locator('[data-workspace="analyze"]').click();assert.match(await page.locator('#ja-output').innerText(),/Comparison donor changed/);await run();
        assert.match(await page.locator('#ja-output').innerText(),/221 uncertain · 0 missing/);
        const frameReportPending=page.waitForEvent('download');await page.getByRole('link',{name:'Recovery report JSON',exact:true}).click();
        const frameReport=JSON.parse(fs.readFileSync(await (await frameReportPending).path(),'utf8'));
        assert.equal(frameReport.donorFile,'frame-reference.jpg');assert.equal(frameReport.missingHeaderRecovery.assumedFrame,true);
        assert.equal(frameReport.missingHeaderRecovery.inserted.find(h=>h.marker==='SOF0').beforeSourceOffset,noFrame.indexOf(Buffer.from([255,218])));
        await page.locator('#ja-header-recovery').uncheck();await run();assert.match(await page.locator('#ja-output').innerText(),/frame header is missing/);
        await page.locator('#ja-header-recovery').check();await page.locator('#ja-mode').selectOption('strict');await run();
        assert.match(await page.locator('#ja-output').innerText(),/Turn off missing-header recovery/);
        await page.locator('#ja-mode').selectOption('recover');await run();
        await page.setViewportSize({width:390,height:844});
        await page.locator('[data-workspace="analyze"]').click();await tool('reconstruct');await run();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
        await page.locator('[data-workspace="inspect"]').click();assert.equal(await page.locator('#jr-recover-image').isVisible(),true);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
        await page.getByRole('button',{name:'Recover image',exact:true}).click();
        await page.waitForFunction(()=>['complete','error'].includes(document.getElementById('ja-output').dataset.state));
        assert.equal(await page.locator('#ja-codewords').isChecked(),true);
        assert.deepEqual(errors,[]);
        assert.ok(selected);
    }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});
