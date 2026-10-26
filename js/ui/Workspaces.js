/** Inspect, Analyze and Compare share a file, but never share a results surface. */
class Workspaces{
    static el(id){ return document.getElementById(id); }
    static esc(value){ return ResultView.escapeHTML(String(value)); }
    static init(){
        Workspaces.initialized = true;
        document.addEventListener('keydown', event => {
            if(event.key !== 'Escape') return;
            document.querySelectorAll('.jr-chart-tooltip').forEach(tooltip => { tooltip.hidden = true; });
            document.querySelectorAll('.jr-bars>.jr-bar-active').forEach(bar => bar.classList.remove('jr-bar-active'));
        });
        document.querySelectorAll('[data-workspace]').forEach(button => {
            button.onclick = () => Workspaces.show(button.dataset.workspace);
        });
        Workspaces.el('jr-tool-selector').innerHTML = Workspaces.groups.map(([title, tools]) => '<div class="jr-tool-group"><h2>' + title + '</h2>' + tools.map(key => '<button type="button" data-tool="' + key + '">' + Workspaces.tools[key][0] + '</button>').join('') + '</div>').join('');
        document.querySelectorAll('[data-tool]').forEach(button => {
            button.onclick = () => { Workspaces.tool = button.dataset.tool; Workspaces.renderTool(); };
        });
        Workspaces.el('jr-recover-image').onclick = () => Workspaces.recoverImage();
    }

    static async recoverImage(){
        if(!Workspaces.info || !Workspaces.info.images.length) return;
        const selected = Inspector.current(), images = Workspaces.info.images;
        const selectedImage = selected && images[selected.imageIndex];
        const damaged = selectedImage && selectedImage.valid === false && !selectedImage.tableOnly ? selected.imageIndex :
            images.findIndex(image => image.valid === false && !image.tableOnly);
        Workspaces.imageIndex = damaged >= 0 ? damaged : 0;
        Workspaces.tool = 'reconstruct';
        Workspaces.show('analyze'); Workspaces.renderTool();
        const output = Workspaces.el('ja-output');
        output.setAttribute('tabindex','-1'); output.focus();
        await Workspaces.run();
    }

    static syncRecoveryMode(){
        const mode = Workspaces.el('ja-mode'), codewords = Workspaces.el('ja-codewords');
        if(!mode || !codewords) return;
        if(mode.value === 'strict'){
            if(!codewords.disabled) codewords.dataset.recoverChecked = String(codewords.checked);
            codewords.checked = false; codewords.disabled = true;
        }else if(codewords.disabled){
            codewords.checked = codewords.dataset.recoverChecked !== 'false'; codewords.disabled = false;
        }
    }

    static release(owner = Workspaces.view){
        Workspaces.urls = Workspaces.urls.filter(entry => {
            if(owner === 'all' || entry.owner === owner){ URL.revokeObjectURL(entry.url); return false; }
            return true;
        });
    }

    static reset(){
        clearTimeout(Workspaces.autoTimer);
        ++Workspaces.request; ++Workspaces.compareRequest; ++Workspaces.fileGeneration; Workspaces.release('all');
        Workspaces.renderedBitmap=null;
        Workspaces.info = null; Workspaces.other = null; Workspaces.cache = null; Workspaces.imageIndex = 0;
        Workspaces.tool = 'overview'; Workspaces.view = 'inspect';
        Workspaces.el('jr-analysis-tool').innerHTML = ''; Workspaces.el('jr-compare').innerHTML = '';
        Workspaces.show('inspect');
    }

    static setFile(info){
        Workspaces.info = info;
        Workspaces.renderTool(); Workspaces.renderCompare(); Workspaces.show('inspect');
    }

    static show(view){
        if(!['inspect', 'analyze', 'compare'].includes(view)) return;
        if(Workspaces.view !== view){
            clearTimeout(Workspaces.autoTimer);
            ++Workspaces.request;
            for(const id of ['ja-output','jc-output']){
                const output = Workspaces.el(id);
                if(output && output.getAttribute('aria-busy') === 'true'){
                    output.textContent = 'Stopped when changing workspace. Run again to update the result.';
                    output.setAttribute('aria-busy','false');
                    output.dataset.state = 'idle';
                    if(id === 'ja-output') Workspaces.needsRun = true;
                }
            }
        }
        Workspaces.view = view;
        Workspaces.el('jr-results').hidden = view !== 'inspect' || !Inspector.model;
        Workspaces.el('jr-empty').hidden = view !== 'inspect' || !!Inspector.model;
        Workspaces.el('jr-analyze').hidden = view !== 'analyze'; Workspaces.el('jr-compare').hidden = view !== 'compare';
        document.querySelectorAll('[data-workspace]').forEach(button => {
            const active = button.dataset.workspace === view;
            button.classList.toggle('jr-nav-active', active);
            if(active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
        });
        if(view === 'analyze' && !Workspaces.el('jr-analysis-tool').children.length) Workspaces.renderTool();
        else if(view === 'analyze' && Workspaces.needsRun && Workspaces.shouldAutoRun()) Workspaces.scheduleAnalysis();
        if(view === 'compare' && !Workspaces.el('jr-compare').children.length) Workspaces.renderCompare();
    }

    static inspectOffset(offset){
        const row = Inspector.model.rows.find(row => offset >= row.start && offset < row.end);
        Workspaces.show('inspect');
        if(row){ Inspector.select(row.id, true); Inspector.el('jr-close-detail').focus(); }
    }

    static imageOptions(){
        return Workspaces.info.images.map((image, index) => '<option value="' + index + '"' + (index === Workspaces.imageIndex ? ' selected' : '') + '>Image ' + (index + 1) + ' · ' + Workspaces.esc(image.format) + (image.dimensions ? ' · ' + image.dimensions.width + ' × ' + image.dimensions.height : '') + '</option>').join('');
    }

    static field(label, control){ return '<label class="jr-field"><span>' + label + '</span>' + control + '</label>'; }
    static select(id, entries, selected){
        return '<select id="' + id + '">' + entries.map(([value, label]) => '<option value="' + value + '"' + (String(value) === String(selected) ? ' selected' : '') + '>' + label + '</option>').join('') + '</select>';
    }
    static number(id, value, min, max){ return '<input id="' + id + '" type="number" value="' + value + '" min="' + min + '" max="' + max + '" step="1" required>'; }

    static renderTool(scope){
        clearTimeout(Workspaces.autoTimer);
        ++Workspaces.request; Workspaces.release('analyze');
        Workspaces.needsRun = false;
        Workspaces.renderedBitmap=null;
        const key = Workspaces.tool, [title, description] = Workspaces.tools[key], root = Workspaces.el('jr-analysis-tool');
        document.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === key)));
        const heading = '<header class="jr-tool-heading"><span class="jr-eyebrow">ANALYZE' + (key === 'reconstruct' ? ' / RECOVERY' : '') + '</span><h2>' + title + '</h2><p>' + description + '</p></header>';
        if(!Workspaces.info){ root.innerHTML = heading + '<p class="jr-tool-message">Open an image to use this tool.</p>'; return; }
        const byteTool = ['strings', 'embedded', 'entropy'].includes(key);
        let fields = '', advanced = '';
        if(key !== 'overview' && key !== 'metadata') fields += Workspaces.field(byteTool ? 'Image for image-scoped searches' : 'Image', '<select id="ja-image">' + Workspaces.imageOptions() + '</select>');
        if(byteTool){
            fields += Workspaces.field('Search scope', Workspaces.select('ja-scope', [['embedded','Metadata, comments and trailing / unparsed data'],['file','Whole file'],['image','Selected image'],['metadata','Metadata and comments'],['trailing','Trailing / unparsed data'],['segment','Selected Inspect segment']], scope || (key === 'embedded' ? 'embedded' : 'metadata')));
            advanced += Workspaces.field('Maximum results', Workspaces.number('ja-limit', 200, 1, 1000));
            if(key === 'strings') advanced += Workspaces.field('Minimum string length', Workspaces.number('ja-minimum', 6, 3, 256));
            if(key === 'entropy') advanced += Workspaces.field('Chart windows', Workspaces.number('ja-windows', 128, 8, 512));
        }
        if(key === 'metadata'){
            fields += '<fieldset class="jr-metadata-mode"><legend>Report</legend><label class="jr-check"><input type="radio" name="ja-metadata-mode" id="ja-metadata-retrieve" value="retrieve" checked> Retrieve metadata</label><label class="jr-check"><input type="radio" name="ja-metadata-mode" id="ja-metadata-locations" value="locations"> See Locations</label></fieldset>';
            advanced += Workspaces.field('Large segment threshold (bytes)', Workspaces.number('ja-threshold', 16384, 256, 65535));
        }
        if(key === 'ela'){
            fields += Workspaces.field('JPEG quality (%)', Workspaces.number('ja-quality', 90, 1, 100));
            fields += Workspaces.field('Difference amplification', Workspaces.number('ja-gain', 15, 1, 100));
            advanced += Workspaces.field('Difference display', Workspaces.select('ja-difference', [['color','RGB differences'],['gray','Grayscale differences']], 'color'));
            advanced += Workspaces.field('Difference overlay opacity (%)', Workspaces.number('ja-opacity', 100, 0, 100));
        }
        if(key === 'levels'){
            fields += Workspaces.field('Brightness center', Workspaces.number('ja-level',128,0,255));
            fields += Workspaces.field('Brightness window', Workspaces.number('ja-width',32,1,256));
            advanced += Workspaces.field('Channel', Workspaces.select('ja-channel',[['all','RGB'],['luma','Luminance'],['red','Red'],['green','Green'],['blue','Blue']],'all'));
        }
        if(key === 'channels'){
            fields += Workspaces.field('View', Workspaces.select('ja-channel', [['all','RGB'],['red','Red'],['green','Green'],['blue','Blue'],['luma','Luminance']], 'red'));
            fields += Workspaces.field('Bit plane', Workspaces.select('ja-bit', [[-1,'All bits'], ...Array.from({length:8}, (_, i) => [i,'Bit ' + i + (i ? '' : ' (least significant)')])], -1));
            advanced += '<label class="jr-check"><input type="checkbox" id="ja-invert"> Invert</label><label class="jr-check"><input type="checkbox" id="ja-stretch"> Stretch channel contrast</label>';
        }
        if(key === 'coefficients' || key === 'reconstruct'){
            advanced += '<div class="jr-recovery-options"><div class="jr-recovery-fields">';
            fields += Workspaces.field('Components', Workspaces.select('ja-component', [...(key === 'reconstruct' ? [[-1,'Full color / grayscale']] : []),[0,'Component 1 · usually Y'],[1,'Component 2 · usually Cb'],[2,'Component 3 · usually Cr']], key === 'coefficients' ? 0 : -1));
            fields += Workspaces.field('Decoding', Workspaces.select('ja-mode', [['recover','Recover available data'],['strict','Strict · stop on errors']], 'recover'));
            if(key === 'reconstruct'){
                fields += '<label class="jr-check"><input type="checkbox" id="ja-overlay"> Show damage overlay</label>';
                advanced += Workspaces.field('Missing pixels', Workspaces.select('ja-fill', [['checker','Checkerboard'],['neutral','Neutral gray']], 'checker'));
                advanced += Workspaces.field('Color interpretation', Workspaces.select('ja-color', [['auto','Automatic'],['ycbcr','YCbCr'],['rgb','RGB']], 'auto'));
            }else{
                advanced += Workspaces.field('Natural-order frequency (−1 = all AC)', Workspaces.number('ja-frequency', -1, -1, 63));
                advanced += Workspaces.field('Block column (0-based)', Workspaces.number('ja-block-x', 0, 0, 8191));
                advanced += Workspaces.field('Block row (0-based)', Workspaces.number('ja-block-y', 0, 0, 8191));
            }
            advanced += Workspaces.field('Maximum decoded pixels', Workspaces.select('ja-max-pixels', [[2000000,'2 megapixels'],[8000000,'8 megapixels'],[16000000,'16 megapixels']], 8000000));
            advanced += '</div><div class="jr-recovery-cards"><fieldset class="jr-recovery-option"><legend>Codeword recovery</legend>';
            advanced += '<label class="jr-check"><input type="checkbox" id="ja-codewords" checked aria-describedby="ja-codewords-help"> Substitute invalid codewords</label><p class="jr-help" id="ja-codewords-help">Enabled in Recover mode by default. Tries valid codewords within two bit changes. Guessed output is uncertain, and later decoding may be misaligned.</p>';
            advanced += Workspaces.field('Substitution limit', Workspaces.number('ja-codeword-limit',256,1,4096));
            advanced += '</fieldset><fieldset class="jr-recovery-option"><legend>Missing headers</legend>';
            if(key==='reconstruct') advanced += '<label class="jr-check"><input type="checkbox" id="ja-header-recovery" aria-describedby="ja-header-help"> Use comparison image for missing headers</label><p class="jr-help" id="ja-header-help">Recover mode automatically restores a missing start marker when the frame and coding tables survive. Enable this to assume missing frame or table values from image 1 in Compare, including its dimensions and sampling. Guessed output is uncertain.</p>';
            advanced += '<label class="jr-check"><input type="checkbox" id="ja-donor" aria-describedby="ja-donor-help"' + (Workspaces.other ? '' : ' disabled') + '> Use comparison image tables</label><p class="jr-help" id="ja-donor-help">Load a known matching image in Compare to enable this option. Missing tables are assumed from image 1; existing tables are never replaced.</p></fieldset></div></div>';
        }
        if(['ela', 'channels', 'levels', 'thumbnails'].includes(key)) advanced += Workspaces.field('Maximum preview dimension', Workspaces.select('ja-size', [[1024,'1,024 pixels'],[2048,'2,048 pixels'],[4096,'4,096 pixels']], 4096));
        const form = key === 'overview' ? '' : '<form id="ja-form"><div class="jr-tool-controls">' + fields + '</div>' + (advanced ? '<details class="jr-advanced"><summary>Advanced options</summary><div class="jr-tool-controls">' + advanced + '</div></details>' : '') + '<button class="jr-primary" type="submit" id="ja-run">' + (key === 'reconstruct' ? 'Reconstruct image' : 'Run analysis') + '</button></form>';
        root.innerHTML = heading + form + '<p id="ja-execution" class="jr-help" hidden></p>' + (form ? '<hr class="jr-tool-divider">' : '') + '<div id="ja-output" class="jr-tool-output" role="region" aria-label="Analysis result" aria-live="polite"></div>';
        if(key === 'overview') Workspaces.overview();
        else{
            Workspaces.el('ja-form').onsubmit = event => { event.preventDefault(); Workspaces.run(); };
            if(key === 'metadata') Workspaces.syncMetadataMode();
            root.querySelectorAll('input, select').forEach(control => control.addEventListener(control.type === 'number' ? 'input' : 'change', () => {
                if(control.id === 'ja-overlay' && Workspaces.renderedBitmap && Workspaces.el('ja-bitmap')){
                    Workspaces.drawBitmap(Workspaces.el('ja-bitmap'),Workspaces.renderedBitmap,control.checked); return;
                }
                if(control.id === 'ja-image'){ Workspaces.imageIndex = Number(control.value); Workspaces.cache = null; }
                if(control.id === 'ja-mode') Workspaces.syncRecoveryMode();
                if(control.name === 'ja-metadata-mode') Workspaces.syncMetadataMode();
                ++Workspaces.request;
                Workspaces.renderedBitmap=null;
                Workspaces.release('analyze'); Workspaces.scheduleAnalysis(150);
            }));
            Workspaces.scheduleAnalysis();
        }
    }

    static shouldAutoRun(){
        if(!Workspaces.info || !Workspaces.autoTools.includes(Workspaces.tool)) return false;
        const image = Workspaces.info.images[Workspaces.imageIndex], dims = image && image.dimensions;
        if(!dims || !(dims.width > 0 && dims.height > 0) || Math.max(dims.width,dims.height) >= Workspaces.AUTO_MAX_DIMENSION) return false;
        if(['strings','embedded','entropy'].includes(Workspaces.tool)){
            try{ return Workspaces.ranges().reduce((size,range) => size + range.end - range.start,0) <= Workspaces.AUTO_MAX_BYTES; }
            catch(error){ return false; }
        }
        if(Workspaces.tool === 'metadata') return ImageController.data.length <= Workspaces.AUTO_MAX_BYTES;
        if(Workspaces.tool === 'tables') return image.end - image.start <= Workspaces.AUTO_MAX_BYTES;
        return true;
    }

    static scheduleAnalysis(delay = 0){
        clearTimeout(Workspaces.autoTimer);
        const form = Workspaces.el('ja-form'), button = Workspaces.el('ja-run'), out = Workspaces.el('ja-output');
        if(!form || !button) return;
        const automatic = Workspaces.shouldAutoRun(), valid = form.checkValidity(), request = Workspaces.request;
        button.hidden = automatic; button.disabled = false;
        Workspaces.needsRun = true;
        out.dataset.request = String(request); out.dataset.state = automatic && valid ? 'scheduled' : 'idle';
        out.setAttribute('aria-busy',String(automatic && valid));
        const help = Workspaces.el('ja-execution');
        help.hidden = !automatic;
        help.textContent = 'Change an option to re-run the analysis.';
        out.textContent = !valid ? 'Enter valid options to update the analysis.' : automatic ? 'Analyzing…' : 'Choose your options, then ' + (Workspaces.tool === 'reconstruct' ? 'reconstruct the selected image.' : 'run the analysis.');
        if(!automatic || !valid) return;
        Workspaces.autoTimer = setTimeout(() => {
            if(request === Workspaces.request && form === Workspaces.el('ja-form') && Workspaces.view === 'analyze') Workspaces.run();
        },delay);
    }

    static overview(){
        const findings = FileAnalysis.observations(Workspaces.info, Inspector.model);
        Workspaces.el('ja-output').innerHTML = '<h3>File observations</h3><p class="jr-help">These observations describe structure, not a verdict about hidden data. Visual and statistical tools are available on the left.</p>' + Workspaces.findingList(findings) + '<div class="jr-tool-shortcuts"><button type="button" class="jr-button" data-open-tool="embedded">Find embedded files</button><button type="button" class="jr-button" data-open-tool="reconstruct">Reconstruct image</button><button type="button" class="jr-button" data-open-tool="ela">Error level analysis</button></div>';
        Workspaces.el('ja-output').querySelectorAll('[data-open-tool]').forEach(button => button.onclick = () => { Workspaces.tool = button.dataset.openTool; Workspaces.renderTool(); });
        Workspaces.bindOffsets();
    }

    static findingList(findings){
        return findings.length ? '<ul class="jr-findings">' + findings.map(f => '<li>' + Workspaces.esc(f.message) + (f.start === null ? '' : ' <button type="button" class="jr-inline" data-offset="' + f.start + '">Inspect byte ' + f.start + '</button>') + '</li>').join('') + '</ul>' : '<p>No observations met the current checks. This does not establish absence of hidden data.</p>';
    }

    static bindOffsets(){
        Workspaces.el('ja-output').querySelectorAll('[data-offset]').forEach(button => button.onclick = () => Workspaces.inspectOffset(Number(button.dataset.offset)));
    }

    static syncMetadataMode(){
        const locations = Workspaces.el('ja-metadata-locations').checked;
        Workspaces.el('ja-threshold').disabled = !locations;
        Workspaces.el('ja-threshold').closest('details').hidden = !locations;
    }

    static metadata(out){
        if(Workspaces.el('ja-metadata-locations').checked){
            out.innerHTML = Workspaces.findingList(FileAnalysis.observations(Workspaces.info, Inspector.model, Workspaces.integer('ja-threshold',16384)));
            Workspaces.bindOffsets();
            return;
        }
        const rows = Workspaces.metadataRows();
        out.innerHTML = Workspaces.table(['Source','Detail','Value'], rows.map(([source, name, value]) => [Workspaces.esc(source), Workspaces.esc(name), '<code>' + Workspaces.esc(value) + '</code>']));
        const csv = [['Source','Detail','Value'], ...rows].map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(',')).join('\r\n') + '\r\n';
        out.appendChild(Workspaces.download('Export metadata CSV', csv, 'text/csv;charset=utf-8', (Inspector.file && Inspector.file.name || 'image') + '-metadata.csv'));
    }

    static metadataRows(){
        const info = Workspaces.info, rows = [];
        const add = (source, name, value) => rows.push([source, name, String(value)]);
        const fields = (source, object, prefix = '') => {
            for(const [key, value] of Object.entries(object || {})){
                const name = prefix + key;
                if(typeof Blob !== 'undefined' && value instanceof Blob) add(source, name, value.size + ' bytes · ' + value.type);
                else if(value instanceof Number) add(source, name, String(value) + (value.denominator ? ' (' + value.numerator + '/' + value.denominator + ')' : ''));
                else if(value && typeof value === 'object' && !Array.isArray(value)) fields(source, value, name + '.');
                else add(source, name, Array.isArray(value) ? JSON.stringify(value) : value);
            }
        };
        const file = Inspector.file;
        if(file){
            add('File', 'Name', file.name);
            if(file.type) add('File', 'MIME type', file.type);
            if(Number.isFinite(file.lastModified)) add('File', 'Last modified', new Date(file.lastModified).toISOString());
        }
        add('File', 'Size', ImageController.data.length + ' bytes');
        add('File', 'Format', info.format);
        add('File', 'Images / streams', info.images.length);
        add('File', 'Structure', info.valid ? 'Valid' : 'Invalid or incomplete');
        for(const warning of info.warnings || []) add('File', 'Warning', warning);
        info.images.forEach((image, index) => {
            const source = 'Image ' + (index + 1);
            add(source, 'Format', image.format);
            add(source, 'Dimensions', image.dimensions ? image.dimensions.width + ' × ' + image.dimensions.height : 'Unavailable');
            const frame = image.headers.find(h => h.extendedtype === 'SOF');
            if(frame){
                add(source, 'Coding', frame.desc.longname);
                add(source, 'Precision', frame.extendeddata.dataprec + ' bits per sample');
                add(source, 'Components', frame.extendeddata.ncomponents);
                frame.extendeddata.components.forEach((component, i) => add(source, 'Component ' + (i + 1) + ' sampling', component.samplingstr));
            }
            const counts = {};
            for(const header of image.headers){
                if(header.type !== 'fe' && !/^e[0-9a-f]$/.test(header.type)) continue;
                const content = header.content || '';
                const kind = header.type === 'fe' ? 'Comment' : header.extendedtype ||
                    (content.startsWith('http://ns.adobe.com/xap/1.0/\0') ? 'XMP' : content.startsWith('Photoshop 3.0\0') ? 'IPTC' : header.desc.shortname);
                const label = source + ' · ' + kind + ' ' + (counts[kind] = (counts[kind] || 0) + 1);
                if(header.truncated || !header.valid) add(label, 'Status', header.truncated ? 'Truncated; available metadata shown' : 'Invalid structure; available metadata shown');
                if(header.type === 'fe'){ add(label, 'Text', content); continue; }
                if(kind === 'JFIF'){
                    const jfif = header.extendeddata;
                    fields(label, {Version:jfif.version, Units:jfif.units, 'X density':jfif.xdensity, 'Y density':jfif.ydensity,
                        'Thumbnail dimensions':jfif.xthumbpixels + ' × ' + jfif.ythumbpixels, 'Thumbnail size':jfif.thumb.length + ' bytes'});
                }else if(kind === 'Adobe') fields(label, header.extendeddata);
                else{
                    // Read each bounded segment independently so repeated packets and later images survive.
                    const reader = kind === 'EXIF' ? EXIF.readFromBinaryFile : kind === 'IPTC' ? IPTCReader.findInJPEG : kind === 'XMP' ? XMPReader.findInJPEG : null;
                    let metadata;
                    if(reader){
                        const length = content.length + 2;
                        const segment = '\xff\xd8\xff' + String.fromCharCode(parseInt(header.type,16), length >> 8, length & 255) + content + '\xff\xd9';
                        try{ metadata = reader(BinaryUtils.stringToBuffer(segment)); }catch(error){ /* Keep other optional metadata readable. */ }
                    }
                    if(metadata && Object.keys(metadata).length){
                        if(kind === 'XMP'){
                            for(const key of Object.keys(metadata)){
                                // The existing XMP reader serializes the root tree as JSON.
                                if(typeof metadata[key] === 'string' && metadata[key].startsWith('{')){
                                    try{ metadata[key] = JSON.parse(metadata[key]); }catch(error){ /* Retain literal text. */ }
                                }
                            }
                        }
                        fields(label, metadata);
                    }else add(label, 'Payload', content.length + ' bytes · ' + (reader ? 'No readable metadata fields' : 'No structured decoder'));
                }
            }
        });
        return rows;
    }

    static integer(id, fallback){
        const el = Workspaces.el(id); if(!el) return fallback;
        const value = Number(el.value);
        if(!Number.isInteger(value) || value < Number(el.min) || value > Number(el.max)) throw new Error('Enter a valid value for ' + el.closest('label').textContent.trim() + '.');
        return value;
    }

    static ranges(){
        const scope = Workspaces.el('ja-scope').value, image = Workspaces.info.images[Workspaces.imageIndex];
        if(scope === 'file') return [{start:0,end:ImageController.data.length}];
        if(scope === 'image') return [{start:image.start,end:image.end}];
        if(scope === 'segment'){
            const row = Inspector.current();
            if(!row) throw new Error('Select a segment in Inspect first, or choose another search scope.');
            return [{start:row.contentStart,end:row.contentEnd}];
        }
        const rows = Inspector.model.rows.filter(row => {
            const trailing = ['extra','unparsed'].includes(row.group);
            const metadata = row.header && (/^e[0-9a-f]$/.test(row.header.type) || row.header.type === 'fe') && row.imageIndex === Workspaces.imageIndex;
            return scope === 'embedded' ? trailing || metadata : scope === 'trailing' ? trailing : metadata;
        });
        return rows.map(row => ({start:row.contentStart,end:row.contentEnd}));
    }

    static download(label, bytes, type, filename){
        const url = URL.createObjectURL(new Blob([bytes], {type})); Workspaces.urls.push({url,owner:Workspaces.view});
        const link = document.createElement('a'); link.className = 'jr-button'; link.textContent = label; link.href = url; link.download = filename;
        return link;
    }

    static table(headings, rows){
        return '<div class="jr-analysis-table-wrap"><table class="jr-analysis-table"><thead><tr>' + headings.map(h => '<th scope="col">' + Workspaces.esc(h) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(cells => '<tr>' + cells.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    }

    static chartTooltip(chart, labels){
        if(!labels.length) return;
        const bars = Array.from(chart.children), tooltip = document.createElement('div');
        tooltip.className = 'jr-chart-tooltip'; tooltip.id = 'jr-chart-tooltip-' + (++Workspaces.tooltipSequence);
        tooltip.setAttribute('role','tooltip'); tooltip.hidden = true; chart.appendChild(tooltip);
        let selected = 0;
        const hide = () => {
            tooltip.hidden = true;
            bars[selected].classList.remove('jr-bar-active');
        };
        const show = (index, x, y) => {
            bars[selected].classList.remove('jr-bar-active'); selected = index;
            bars[selected].classList.add('jr-bar-active');
            tooltip.textContent = labels[index]; tooltip.hidden = false;
            const rect = chart.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
            const left = Math.max(8, Math.min(x + 12, window.innerWidth - box.width - 8));
            const top = y + 12 + box.height <= window.innerHeight - 8 ? y + 12 : Math.max(8, y - box.height - 12);
            tooltip.style.left = (left - rect.left) + 'px'; tooltip.style.top = (top - rect.top) + 'px';
        };
        chart.onpointermove = event => {
            const rect = chart.getBoundingClientRect();
            if(!rect.width) return;
            const index = Math.max(0, Math.min(labels.length - 1, Math.floor((event.clientX - rect.left) / rect.width * labels.length)));
            show(index, event.clientX, event.clientY);
        };
        chart.onpointerleave = () => { if(!chart.contains(document.activeElement)) hide(); };
        chart.addEventListener('focusin', event => {
            const index = bars.indexOf(event.target), rect = (index < 0 ? bars[selected] : event.target).getBoundingClientRect();
            event.target.setAttribute('aria-describedby',tooltip.id);
            show(index < 0 ? selected : index, rect.left + rect.width / 2, rect.top);
        });
        chart.addEventListener('focusout', event => { event.target.removeAttribute('aria-describedby'); hide(); });
        chart.onkeydown = event => {
            if(event.key === 'Escape'){ event.preventDefault(); hide(); }
            if(event.target !== chart || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
            event.preventDefault();
            const index = event.key === 'Home' ? 0 : event.key === 'End' ? labels.length - 1 : Math.max(0, Math.min(labels.length - 1, selected + (event.key === 'ArrowRight' ? 1 : -1)));
            const rect = bars[index].getBoundingClientRect();
            show(index, rect.left + rect.width / 2, rect.top);
        };
    }

    static async run(){
        clearTimeout(Workspaces.autoTimer);
        const request = ++Workspaces.request, out = Workspaces.el('ja-output'), button = Workspaces.el('ja-run');
        const cancelled = () => request !== Workspaces.request;
        out.dataset.request = String(request); out.dataset.state = 'running';
        button.disabled = true; out.setAttribute('aria-busy','true'); out.textContent = 'Working…'; Workspaces.release();
        try{
            await new Promise(resolve => setTimeout(resolve, 0));
            if(cancelled()) return;
            const key = Workspaces.tool;
            if(['strings','embedded','entropy'].includes(key)) await Workspaces.byteAnalysis(key, out, cancelled);
            else if(key === 'metadata') Workspaces.metadata(out);
            else if(key === 'tables') Workspaces.tables(out);
            else if(key === 'reconstruct' || key === 'coefficients') await Workspaces.reconstruct(key, out, request, cancelled);
            else await Workspaces.visual(key, out, cancelled);
            if(!cancelled()) out.dataset.state = 'complete';
        }catch(error){ if(!cancelled()){ out.textContent = error.message; out.dataset.state = 'error'; } }
        finally{
            // An older cancelled run must not clear a newer run's busy state.
            if(out.dataset.request === String(request)){ button.disabled = false; out.setAttribute('aria-busy','false'); }
            if(!cancelled()) Workspaces.needsRun = false;
        }
    }

    static async byteAnalysis(key, out, cancelled){
        const ranges = Workspaces.ranges(), size = ranges.reduce((n,r) => n + r.end - r.start,0);
        if(!size){ out.textContent = 'No bytes in this scope. Choose another search scope.'; return; }
        // Bound work per task and yield between ranges; no uploads or dependencies.
        if(size > 64000000) throw new Error('Choose a smaller scope (64 MB maximum per byte analysis).');
        const limit = Workspaces.integer('ja-limit',200), results = [], analyses = [];
        let limited = false;
        for(const range of ranges){
            await new Promise(resolve => setTimeout(resolve, 0)); if(cancelled()) return;
            if(key === 'entropy'){
                if(analyses.length >= limit){ limited = true; break; }
                analyses.push({...range, ...FileAnalysis.entropy(ImageController.data,range.start,range.end,Workspaces.integer('ja-windows',128))});
            }
            else{
                const remaining = limit - results.length;
                if(remaining <= 0){ limited = true; break; }
                const result = key === 'strings' ? FileAnalysis.strings(ImageController.data,range.start,range.end,Workspaces.integer('ja-minimum',6),remaining) : FileAnalysis.signatures(ImageController.data,range.start,range.end,remaining);
                if(key === 'embedded') result.found.forEach(match => {
                    const row = Inspector.model.rows.find(row => match.start >= row.start && match.start < row.end);
                    match.source = row ? row.code + ' · ' + row.name : 'Original file';
                });
                results.push(...result.found); limited ||= result.limited;
            }
        }
        const scope = Workspaces.el('ja-scope').selectedOptions[0].textContent;
        out.innerHTML = '<p class="jr-scope">' + Workspaces.esc(scope) + ' · ' + size.toLocaleString('en-US') + ' bytes · offsets in original file</p>';
        if(key === 'entropy'){
            if(limited) out.insertAdjacentHTML('beforeend','<p>Range limit reached. Narrow the scope or raise the maximum results in Advanced options.</p>');
            out.insertAdjacentHTML('beforeend','<p class="jr-help">Entropy ranges from 0 to 8 bits per byte. Compressed scans naturally have high entropy; this is not a hidden-data test.</p>');
            for(const a of analyses){
                const section = document.createElement('section'); section.className = 'jr-analysis-chart';
                section.innerHTML = '<h3>Bytes ' + a.start + '–' + (a.end - 1) + ' · ' + a.entropy.toFixed(3) + ' bits/byte</h3><p class="jr-help">Entropy by window (0–8); click a bar to inspect its bytes.</p><div class="jr-bars" aria-label="Byte entropy"></div><p class="jr-help">Byte frequencies (0–255)</p><div class="jr-bars jr-histogram" aria-label="Byte histogram"></div>';
                const bars = section.querySelector('.jr-bars');
                const entropyLabels = [];
                for(const point of a.points){
                    const label = 'Bytes ' + point.start + '–' + (point.end - 1) + '\nEntropy: ' + point.entropy.toFixed(3) + ' bits/byte';
                    entropyLabels.push(label);
                    const bar = document.createElement('button'); bar.type = 'button'; bar.style.height = Math.max(2,point.entropy / 8 * 100) + '%'; bar.setAttribute('aria-label',label); bar.onclick = () => Workspaces.inspectOffset(point.start); bars.appendChild(bar);
                }
                const max = Math.max(1,...a.histogram), histogram = section.querySelector('.jr-histogram');
                const frequencyLabels = [];
                a.histogram.forEach((count,value) => {
                    const label = 'Byte value: 0x' + value.toString(16).padStart(2,'0').toUpperCase() + ' (' + value + ')\nCount: ' + count.toLocaleString('en-US') + '\nFrequency: ' + (count / (a.end - a.start) * 100).toFixed(3) + '%';
                    frequencyLabels.push(label);
                    const bar = document.createElement('span'); bar.style.height = Math.max(1,count/max*100)+'%'; bar.setAttribute('aria-label',label); histogram.appendChild(bar);
                });
                histogram.tabIndex = 0;
                histogram.setAttribute('aria-label','Byte histogram; use Left and Right arrow keys to explore byte values');
                Workspaces.chartTooltip(bars,entropyLabels); Workspaces.chartTooltip(histogram,frequencyLabels);
                out.appendChild(section);
            }
            return;
        }
        if(!results.length){ out.insertAdjacentHTML('beforeend','<p>No matches in this scope. This does not establish absence of hidden data.</p>'); return; }
        out.insertAdjacentHTML('beforeend','<p class="jr-help">' + results.length + ' matches' + (limited ? ' · result limit reached; narrow the scope or raise the advanced limit' : '') + (key === 'embedded' ? '. Signatures are candidates, not proof of an embedded file. JPEG headers can also describe the main image or a legitimate thumbnail.' : '. Encoding labels are heuristic; text previews stop at 512 characters.') + '</p>');
        out.insertAdjacentHTML('beforeend',Workspaces.table(['Offset','Type',...(key === 'embedded' ? ['Source'] : []),key === 'strings' ? 'Text' : 'Validation','Bytes'],results.map((r,i) => [
            '<button type="button" class="jr-inline" data-offset="'+r.start+'">'+r.start+'</button>',Workspaces.esc(r.kind || r.type),
            ...(key === 'embedded' ? [Workspaces.esc(r.source)] : []),
            key === 'strings' ? '<code>'+Workspaces.esc(r.value)+(r.end-r.start>512?'…':'')+'</code>' : Workspaces.esc(r.status),
            key === 'strings' ? String(r.end-r.start) : '<span id="ja-candidate-'+i+'"></span>'
        ])));
        if(key === 'embedded') results.forEach((r,i) => {
            const end = r.end || ranges.find(range => r.start >= range.start && r.start < range.end).end;
            const button = document.createElement('button'); button.type='button'; button.className='jr-button';
            button.textContent=r.end?'Extract bounded candidate':'Download from signature to range end';
            button.onclick=()=>Workspaces.saveBlob(new Blob([BinaryUtils.stringToBuffer(ImageController.data.substring(r.start,end))],{type:'application/octet-stream'}),'candidate-'+r.start+'.bin');
            Workspaces.el('ja-candidate-'+i).appendChild(button);
        });
        out.appendChild(Workspaces.download('Export matches JSON',JSON.stringify({scope,ranges,limited,results},null,2),'application/json',key+'-matches.json')); Workspaces.bindOffsets();
    }

    static tables(out){
        const image = Workspaces.info.images[Workspaces.imageIndex];
        const headers = image.headers.filter(h => h.type === 'db');
        out.innerHTML = '<p class="jr-scope">Image ' + (Workspaces.imageIndex+1) + ' · stored quantization tables</p><p class="jr-help">Each grid uses natural 8×8 frequency order, from low frequencies at top left. Values alone do not identify an encoder or prove modification.</p>';
        if(!headers.length) out.insertAdjacentHTML('beforeend','<p>No JPEG DQT segments found in this image.</p>');
        for(const header of headers){
            const tables = JPEGTable.read(header);
            if(!tables){ out.insertAdjacentHTML('beforeend','<p>Incomplete table at byte '+header.p+'.</p>'); continue; }
            for(const table of tables){
                const values = new Array(64); table.values.forEach((value,i) => {values[JPEGDecoder.zigzag[i]]=value;});
                out.insertAdjacentHTML('beforeend','<h3>Table '+table.id+' · '+table.precision+' bits · byte '+header.p+'</h3>'+Workspaces.grid(values));
            }
        }
    }

    static grid(values){
        return '<table class="jr-frequency-grid" aria-label="8 by 8 values"><tbody>'+Array.from({length:8},(_,y)=>'<tr>'+values.slice(y*8,y*8+8).map(v=>'<td>'+Workspaces.esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
    }

    static async decodeSelected(cancelled, progress){
        const image = Workspaces.info.images[Workspaces.imageIndex], mode = Workspaces.el('ja-mode').value;
        const donorEnabled = Workspaces.el('ja-donor').checked;
        const recoverHeaders = Workspaces.el('ja-header-recovery') && Workspaces.el('ja-header-recovery').checked;
        const substituteCodewords = Workspaces.el('ja-codewords').checked;
        if(mode === 'strict' && donorEnabled) throw new Error('Turn off donor tables for strict decoding.');
        if(mode === 'strict' && substituteCodewords) throw new Error('Turn off codeword substitution for strict decoding.');
        let donor;
        if(donorEnabled || recoverHeaders && Workspaces.other){
            if(!Workspaces.other) throw new Error('Load a comparison image before selecting donor tables.');
            const first = Workspaces.other.info.images[0];
            donor = JPEGDecoder.headers(Workspaces.other.data.substring(first.start, first.end));
        }
        if(mode==='strict'&&recoverHeaders) throw new Error('Turn off missing-header recovery for strict decoding.');
        const assumedFrame = recoverHeaders && donor ? {width:donor.width,height:donor.height,progressive:donor.progressive,components:donor.components.map(c=>({id:c.id,h:c.h,v:c.v,q:c.q}))} : undefined;
        const maxCodewordSubstitutions = Workspaces.integer('ja-codeword-limit',256);
        const maxPixels = Number(Workspaces.el('ja-max-pixels').value), cacheKey = [Workspaces.imageIndex,mode,donorEnabled,recoverHeaders,maxPixels,substituteCodewords,maxCodewordSubstitutions].join(':');
        if(Workspaces.cache && Workspaces.cache.key === cacheKey) return Workspaces.cache.state;
        const state = await JPEGDecoder.decode(ImageController.data.substring(image.start,image.end),{mode,donor,recoverHeaders,assumedFrame,maxPixels,cancelled,progress,substituteCodewords,maxCodewordSubstitutions});
        if(cancelled()) throw new Error('Cancelled');
        Workspaces.cache = {key:cacheKey,state}; return state;
    }

    static async reconstruct(key, out, request, cancelled){
        const state = await Workspaces.decodeSelected(cancelled, percent => { if(!cancelled()) out.textContent = 'Decoding image… '+Math.floor(percent)+'%'; });
        if(cancelled()) return;
        const selected = Number(Workspaces.el('ja-component').value);
        if(key === 'coefficients'){
            const component = selected < 0 ? 0 : selected;
            if(!state.components[component]) throw new Error('This image does not contain the selected component.');
            const frequency = Workspaces.integer('ja-frequency',-1), stats = FileAnalysis.coefficients(state,component,frequency), c = state.components[component];
            const bx = Workspaces.integer('ja-block-x',0), by = Workspaces.integer('ja-block-y',0);
            if(bx >= c.cols || by >= c.rows) throw new Error('Block is outside component '+(component+1)+' ('+c.cols+' columns × '+c.rows+' rows).');
            const index = by*c.cols+bx, histogram = Array.from(stats.histogram).sort((a,b)=>a[0]-b[0]);
            out.innerHTML = '<p class="jr-scope">Image '+(Workspaces.imageIndex+1)+' · component '+(component+1)+' (ID '+c.id+') · '+(frequency<0?'AC coefficients':'frequency '+frequency)+'</p><p>'+stats.count.toLocaleString('en-US')+' coefficients · '+stats.zero+' zero · nonzero parity: '+stats.even+' even / '+stats.odd+' odd.</p><p class="jr-help">Missing, uncertain and wholly padded blocks are excluded from statistics. Parity is descriptive, not a steganography detector. '+stats.uncertain+' uncertain blocks excluded.</p><h3>Block '+bx+', '+by+' · '+(['missing','decoded','uncertain'][c.available[index]])+'</h3>'+(c.available[index] ? Workspaces.grid(Array.from(c.coefficients.subarray(index*64,index*64+64))) : '<p>No coefficients available for this block.</p>')+'<h3>Coefficient histogram</h3>'+Workspaces.table(['Value','Count'],histogram.slice(0,200).map(([v,n])=>[String(v),String(n)]))+(histogram.length>200?'<p>First 200 values shown; export includes all.</p>':'');
            out.appendChild(Workspaces.download('Export histogram JSON',JSON.stringify({component,frequency,count:stats.count,zero:stats.zero,even:stats.even,odd:stats.odd,histogram},null,2),'application/json','coefficient-histogram.json'));
            const csv = document.createElement('button'); csv.type='button'; csv.className='jr-button'; csv.textContent='Export coefficient CSV';
            csv.onclick=async()=>{
                const exportRequest=Workspaces.request, exportCancelled=()=>exportRequest!==Workspaces.request;
                csv.disabled=true;
                try{
                    const parts=['block_x,block_y,status,'+Array.from({length:64},(_,i)=>'c'+i).join(',')+'\r\n'];
                    let rows=[];
                    for(let b=0;b<c.available.length;b++){
                        if(b%2048===0){ await JPEGDecoder.pause({cancelled:exportCancelled}); if(rows.length) parts.push(rows.join('\r\n')+'\r\n'); rows=[]; }
                        if(c.available[b]) rows.push([b%c.cols,Math.floor(b/c.cols),state.assumed?'assumed':c.available[b]===2?'uncertain':'decoded',...c.coefficients.subarray(b*64,b*64+64)].join(','));
                    }
                    if(rows.length) parts.push(rows.join('\r\n')+'\r\n');
                    if(!exportCancelled()) Workspaces.saveBlob(new Blob(parts,{type:'text/csv'}),'coefficients.csv');
                }catch(error){if(!exportCancelled())out.insertAdjacentText('beforeend',error.message);}
                finally{csv.disabled=false;}
            };
            out.appendChild(csv); return;
        }
        const bitmap = await JPEGDecoder.bitmap(state,{component:selected,fill:Workspaces.el('ja-fill').value,color:Workspaces.el('ja-color').value,cancelled});
        if(cancelled()) return;
        const count = [0,0,0]; bitmap.mask.forEach(status => count[status]++);
        const image = Workspaces.info.images[Workspaces.imageIndex];
        const sourceOffset = offset => { const original = JPEGDecoder.sourceOffset(state,offset); return original === null ? null : original + image.start; };
        const headerRecoveryEnabled = !!(Workspaces.el('ja-header-recovery') && Workspaces.el('ja-header-recovery').checked);
        const report = {
            file:Inspector.file && Inspector.file.name,
            image:Workspaces.imageIndex+1,
            sourceRange:[image.start,image.end],
            width:state.width,height:state.height,
            coding:state.progressive?'SOF2':'SOF0',
            scans:state.scans||1,
            component:selected,
            color:Workspaces.el('ja-color').value,
            mode:Workspaces.el('ja-mode').value,
            fill:Workspaces.el('ja-fill').value,
            donorFile:(Workspaces.el('ja-donor').checked||headerRecoveryEnabled)&&Workspaces.other?Workspaces.other.name:null,
            missingHeaderRecovery:{
                enabled:headerRecoveryEnabled||!!state.recovery,automatic:!!(state.recovery&&state.recovery.automatic),prefixRecovered:!!Workspaces.info.prefixRecovered,
                missingSOI:!!(state.recovery&&state.recovery.missingSOI),assumedFrame:!!(state.recovery&&state.recovery.assumedFrame),
                assumptions:[...new Set([...(state.recovery?state.recovery.assumptions:[]),...state.log.filter(line=>line.startsWith('Assumed'))])],
                discarded:state.recovery?state.recovery.discarded.map(r=>({...r,start:r.start+image.start,end:r.end+image.start})):[],
                inserted:state.recovery?state.recovery.inserted.map(r=>({...r,beforeSourceOffset:r.beforeSourceOffset+image.start})):[],
                unparsedPrefixRange:Workspaces.info.prefixRange||null
            },
            codewordRecovery:{enabled:Workspaces.el('ja-codewords').checked,limit:state.codewordSubstitutionLimit,count:state.codewordSubstitutions.length,substitutions:state.codewordSubstitutions.map(s=>({...s,offset:sourceOffset(s.offset)}))},
            pixels:{decoded:count[1],uncertain:count[2],missing:count[0]},
            damageMaskPNG:{0:'missing',127:'uncertain or donor tables assumed',255:'decoded, not proof of integrity'},
            notes:[
                (state.progressive ? 'Progressive' : 'Baseline') + ' Huffman decoder; nearest-neighbor chroma upsampling, no ICC color management or EXIF orientation. Exports use stored raster orientation.',
                'Decoded regions can contain undetected corruption. Missing pixels are replacements, not recovered information.'
            ],
            repairs:state.log,
            events:state.events.map(e=>({...e,offset:sourceOffset(e.offset),...(Number.isInteger(e.endOffset)?{endOffset:sourceOffset(e.endOffset)}:{})}))
        };
        out.innerHTML = '<p class="jr-scope">Image '+(Workspaces.imageIndex+1)+' · '+state.width+' × '+state.height+' · '+(selected<0?'all components ('+state.color+')':'component '+(selected+1)+' (ID '+state.components[selected].id+')')+'</p><p>'+count[1].toLocaleString('en-US')+' decoded pixels · '+count[2].toLocaleString('en-US')+' uncertain · '+count[0].toLocaleString('en-US')+' missing</p><p class="jr-help">Overlay: pink = missing, amber = uncertain. Exports omit the overlay and retain your missing-pixel fill. Decoding does not certify pixel integrity; no orientation or color-profile correction is applied.</p><div class="jr-raster-stage"><canvas id="ja-bitmap" aria-label="Reconstructed image"></canvas></div><div class="jr-tool-actions" id="ja-exports"></div><h3>Recovery log</h3><div id="ja-log"></div>';
        const display = Workspaces.el('ja-bitmap'), overlay = Workspaces.el('ja-overlay').checked;
        Workspaces.drawBitmap(display, bitmap, overlay);
        Workspaces.renderedBitmap=bitmap; Workspaces.zoom(display.parentElement,display);
        const exports = Workspaces.el('ja-exports');
        const plain = document.createElement('canvas'); Workspaces.drawBitmap(plain,bitmap,false);
        Workspaces.pngButton(exports,'Download PNG',plain,'reconstructed.png',request);
        // BMP is built only when requested, to avoid retaining another full raster.
        const bmp = document.createElement('button'); bmp.type='button'; bmp.className='jr-button'; bmp.textContent='Download BMP';
        bmp.onclick=()=>Workspaces.saveBlob(new Blob([JPEGDecoder.bmp(bitmap)],{type:'image/bmp'}),'reconstructed.bmp'); exports.appendChild(bmp);
        const mask = document.createElement('canvas'); mask.width=bitmap.width; mask.height=bitmap.height;
        const maskContext = mask.getContext('2d'), maskPixels = maskContext.createImageData(mask.width,mask.height);
        for(let i=0;i<bitmap.mask.length;i++){ const value=bitmap.mask[i]===1?255:bitmap.mask[i]===2?127:0; maskPixels.data.set([value,value,value,255],i*4); }
        maskContext.putImageData(maskPixels,0,0); Workspaces.pngButton(exports,'Damage mask PNG',mask,'damage-mask.png',request);
        exports.appendChild(Workspaces.download('Recovery report JSON',JSON.stringify(report,null,2),'application/json','recovery-report.json'));
        const notes = [...state.log,...state.events.map(e=>e.message+(sourceOffset(e.offset)===null?' Inferred header position.':' Source byte '+sourceOffset(e.offset)+'.'))];
        Workspaces.el('ja-log').innerHTML = notes.length ? '<ul class="jr-findings">'+notes.map(line=>'<li>'+Workspaces.esc(line)+'</li>').join('')+'</ul>' : '<p>No repairs were needed for the supported coding structure.</p>';
    }

    static drawBitmap(canvas, bitmap, overlay = false){
        canvas.width=bitmap.width; canvas.height=bitmap.height;
        const context=canvas.getContext('2d'), pixels=context.createImageData(bitmap.width,bitmap.height); pixels.data.set(bitmap.pixels);
        if(overlay) for(let i=0;i<bitmap.mask.length;i++) if(bitmap.mask[i]!==1){
            const tint=bitmap.mask[i]?[255,175,35]:[225,55,100];
            for(let c=0;c<3;c++) pixels.data[i*4+c]=Math.round(pixels.data[i*4+c]*0.7+tint[c]*0.3);
        }
        context.putImageData(pixels,0,0);
    }

    static zoom(stage,canvas){
        const label=document.createElement('label'); label.className='jr-raster-toolbar';
        const text=document.createElement('span'); text.textContent='Zoom'; label.appendChild(text);
        const select=document.createElement('select'); select.setAttribute('aria-label','Image zoom');
        for(const [value,name] of [['fit','Fit'],[1,'100%'],[2,'200%'],[4,'400%'],[8,'800%'],[16,'1600%']]){
            const option=document.createElement('option');option.value=value;option.textContent=name;select.appendChild(option);
        }
        const change=()=>{canvas.style.maxWidth='none';canvas.style.width=select.value==='fit'?'min(100%, '+Math.max(256,canvas.width)+'px)':canvas.width*Number(select.value)+'px';};
        select.onchange=change;label.appendChild(select);stage.insertBefore(label,canvas);change();
    }

    static pngButton(parent,label,canvas,filename,request){
        const generation=Workspaces.fileGeneration;
        const button=document.createElement('button'); button.type='button'; button.className='jr-button'; button.textContent=label;
        button.onclick=()=>canvas.toBlob(blob=>{ if(blob && generation===Workspaces.fileGeneration && button.isConnected) Workspaces.saveBlob(blob,filename); },'image/png'); parent.appendChild(button);
    }

    static saveBlob(blob,filename){
        const link=document.createElement('a'), url=URL.createObjectURL(blob); Workspaces.urls.push({url,owner:Workspaces.view});
        link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove();
    }

    static async imageCanvas(data, maximum, cancelled){
        const image=new Image(), url=URL.createObjectURL(new Blob([BinaryUtils.stringToBuffer(data)],{type:'image/jpeg'}));
        try{
            await new Promise((resolve,reject)=>{ image.onload=resolve; image.onerror=()=>reject(new Error('The browser cannot decode this image. Try Reconstruct image for supported damaged baseline or progressive JPEGs.')); image.src=url; });
            if(cancelled()) throw new Error('Cancelled');
            if(image.naturalWidth*image.naturalHeight>32000000) throw new Error('Browser-decoded image exceeds the 32-megapixel visual analysis limit.');
            const scale=Math.min(1,maximum/image.naturalWidth,maximum/image.naturalHeight), canvas=document.createElement('canvas');
            canvas.width=Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
            canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height); return {canvas,scale};
        }finally{ URL.revokeObjectURL(url); }
    }

    static async visual(key,out,cancelled){
        const image=Workspaces.info.images[Workspaces.imageIndex], bytes=ImageController.data.substring(image.start,image.end), maximum=Number(Workspaces.el('ja-size').value);
        if(key==='thumbnails'){
            const thumbnails=[];
            for(const h of image.headers){
                if(h.extendedtype==='JFIF' && h.extendeddata.thumb.length){
                    const ext=h.extendeddata, canvas=document.createElement('canvas'); canvas.width=ext.xthumbpixels; canvas.height=ext.ythumbpixels;
                    if(!canvas.width || !canvas.height || ext.thumb.length<canvas.width*canvas.height*3) continue;
                    const ctx=canvas.getContext('2d'), pixels=ctx.createImageData(canvas.width,canvas.height);
                    for(let i=0;i<canvas.width*canvas.height;i++){ for(let c=0;c<3;c++) pixels.data[i*4+c]=ext.thumb.charCodeAt(i*3+c); pixels.data[i*4+3]=255; }
                    ctx.putImageData(pixels,0,0); thumbnails.push({canvas,label:'JFIF RGB thumbnail at byte '+h.p});
                }
                if(h.extendedtype==='EXIF'){
                    // Walk the TIFF IFD1 pointer explicitly; bounds are relative to this APP1 only.
                    const data=h.content, base=6, little=data.substring(base,base+2)==='II';
                    const u16=p=>p>=base&&p+2<=data.length ? little?data.charCodeAt(p)+data.charCodeAt(p+1)*256:data.charCodeAt(p)*256+data.charCodeAt(p+1):NaN;
                    const u32=p=>p>=base&&p+4<=data.length ? little?u16(p)+u16(p+2)*65536:u16(p)*65536+u16(p+2):NaN;
                    if(data.substring(0,6)!=='Exif\0\0' || !['II','MM'].includes(data.substring(base,base+2)) || u16(base+2)!==42) continue;
                    const ifd0=base+u32(base+4), count=u16(ifd0), next=u32(ifd0+2+count*12);
                    if(!next) continue;
                    const ifd=base+next, n=u16(ifd); if(!Number.isInteger(n)||n>1024||ifd+2+n*12+4>data.length) continue;
                    let start, length;
                    for(let i=0;i<n;i++){ const p=ifd+2+i*12, tag=u16(p); if(u16(p+2)===4&&u32(p+4)===1){ if(tag===513) start=base+u32(p+8); if(tag===514) length=u32(p+8); } }
                    if(start>=base&&length>0&&start+length<=data.length){
                        try{ const thumb=await Workspaces.imageCanvas(data.substring(start,start+length),maximum,cancelled); thumbnails.push({canvas:thumb.canvas,label:'EXIF JPEG thumbnail from APP1 at byte '+h.p}); }catch(error){ if(cancelled()) return; }
                    }
                }
            }
            if(cancelled()) return;
            out.innerHTML='<p class="jr-scope">Image '+(Workspaces.imageIndex+1)+' · embedded thumbnails</p>';
            if(!thumbnails.length){ out.insertAdjacentHTML('beforeend','<p>No supported, decodable JFIF RGB or EXIF JPEG thumbnails were found.</p>'); return; }
            for(const thumb of thumbnails){ const figure=document.createElement('figure'); figure.className='jr-raster-stage'; const caption=document.createElement('figcaption'); caption.textContent=thumb.label; figure.appendChild(caption); figure.appendChild(thumb.canvas); Workspaces.zoom(figure,thumb.canvas); out.appendChild(figure); Workspaces.pngButton(out,'Download thumbnail PNG',thumb.canvas,'thumbnail.png',Workspaces.request); }
            try{ const original=await Workspaces.imageCanvas(bytes,maximum,cancelled); if(cancelled()) return; out.insertAdjacentHTML('beforeend','<h3>Selected image for comparison</h3>'); const stage=document.createElement('div'); stage.className='jr-raster-stage'; stage.appendChild(original.canvas); out.appendChild(stage); }catch(error){ if(!cancelled()) out.insertAdjacentHTML('beforeend','<p>Full image preview unavailable.</p>'); }
            return;
        }
        const {canvas,scale}=await Workspaces.imageCanvas(bytes,maximum,cancelled);
        if(key==='ela' && scale<1) throw new Error('ELA needs native pixels to avoid resize artifacts. Choose a maximum preview dimension at least as large as this image (up to 4,096), or use a smaller image.');
        const ctx=canvas.getContext('2d'), pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
        if(key==='ela'){
            const quality=Workspaces.integer('ja-quality',90), gain=Workspaces.integer('ja-gain',15);
            const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality/100));
            if(!blob || blob.type!=='image/jpeg') throw new Error('This browser did not provide a JPEG encoder.');
            const buffer=await blob.arrayBuffer(); if(cancelled()) return;
            const recompressed=await Workspaces.imageCanvas(BinaryUtils.arrayToString(new Uint8Array(buffer)),maximum,cancelled);
            const other=recompressed.canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
            const gray=Workspaces.el('ja-difference').value==='gray', opacity=Workspaces.integer('ja-opacity',100)/100;
            for(let i=0;i<pixels.data.length;i+=4){
                const differences=[0,1,2].map(c=>Math.abs(pixels.data[i+c]-other[i+c]));
                const avg=(differences[0]+differences[1]+differences[2])/3;
                for(let c=0;c<3;c++) pixels.data[i+c]=Math.min(255,(gray?avg:differences[c])*gain)*opacity+pixels.data[i+c]*(1-opacity);
            }
        }else if(key==='levels'){
            const center=Workspaces.integer('ja-level',128),width=Workspaces.integer('ja-width',32),channel=Workspaces.el('ja-channel').value;
            for(let i=0;i<pixels.data.length;i+=4){
                const value=channel==='luma'?.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2]:pixels.data[i+({red:0,green:1,blue:2}[channel]||0)];
                for(let c=0;c<3;c++) pixels.data[i+c]=JPEGDecoder.clamp(((channel==='all'?pixels.data[i+c]:value)-(center-width/2))/width*255);
            }
        }else{
            const channel=Workspaces.el('ja-channel').value, bit=Number(Workspaces.el('ja-bit').value), stretch=Workspaces.el('ja-stretch').checked;
            let min=255,max=0;
            const value=i=>channel==='luma' ? Math.round(.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2]) : pixels.data[i+({red:0,green:1,blue:2}[channel]||0)];
            if(stretch && channel!=='all') for(let i=0;i<pixels.data.length;i+=4){ const v=value(i); min=Math.min(min,v); max=Math.max(max,v); }
            for(let i=0;i<pixels.data.length;i+=4){
                const v=value(i);
                for(let c=0;c<3;c++){
                    let n=channel==='all'?pixels.data[i+c]:v;
                    if(bit>=0) n=((n>>bit)&1)*255; else if(stretch&&channel!=='all'&&max>min) n=(n-min)/(max-min)*255;
                    pixels.data[i+c]=Workspaces.el('ja-invert').checked?255-n:n;
                }
            }
        }
        if(cancelled()) return;
        ctx.putImageData(pixels,0,0);
        out.innerHTML='<p class="jr-scope">Image '+(Workspaces.imageIndex+1)+' · decoded browser pixels · '+canvas.width+' × '+canvas.height+(scale<1?' · resized for analysis':' · native resolution')+'</p><p class="jr-help">'+(key==='ela'?'Bright differences can result from normal texture and compression. ELA does not prove editing or steganography. Browser encoder and color handling affect results.':'Decoded pixel bits differ from stored JPEG coefficient bits. Resizing and browser color/orientation handling can change these pixels.')+'</p>';
        const stage=document.createElement('div'); stage.className='jr-raster-stage'; stage.appendChild(canvas); out.appendChild(stage);
        Workspaces.zoom(stage,canvas);
        Workspaces.pngButton(out,'Download analysis PNG',canvas,key+'.png',Workspaces.request);
    }

    static renderCompare(){
        const out=Workspaces.el('jr-compare');
        out.innerHTML='<header class="jr-tool-heading"><span class="jr-eyebrow">COMPARE</span><h2>Compare files</h2><p>Choose a second file to compare structure, metadata, pixels or baseline/progressive JPEG coefficients. Both files stay in your browser.</p></header>'+(Workspaces.info?'<form id="jc-form"><div class="jr-tool-controls">'+Workspaces.field('Comparison file','<input type="file" id="jc-file" accept=".jpg,.jpeg,.jfif,.mjpg,.mjpeg,.jls,.j2k,.j2c,.jpc">')+Workspaces.field('Compare',Workspaces.select('jc-mode',[['structure','Segments and structure'],['metadata','Metadata bytes'],['pixels','Pixel differences'],['coefficients','DCT coefficient differences']],'structure'))+'</div><details class="jr-advanced"><summary>Advanced options</summary><div class="jr-tool-controls">'+Workspaces.field('Current file image','<select id="jc-left">'+Workspaces.imageOptions()+'</select>')+Workspaces.field('Comparison image','<select id="jc-right"><option value="0">Image 1</option></select>')+Workspaces.field('Difference amplification',Workspaces.number('jc-gain',8,1,100))+'</div></details><p id="jc-file-status" class="jr-help">'+(Workspaces.other?Workspaces.esc(Workspaces.other.name):'No comparison file selected.')+'</p><button type="submit" class="jr-primary" id="jc-run"'+(Workspaces.other?'':' disabled')+'>Compare files</button></form><div id="jc-output" class="jr-tool-output" role="region" aria-label="Comparison result" aria-live="polite"></div>':'<p class="jr-tool-message">Open an image first, then choose a comparison file.</p>');
        if(!Workspaces.info) return;
        Workspaces.el('jc-file').onchange=()=>Workspaces.readComparison();
        Workspaces.el('jc-form').onsubmit=event=>{event.preventDefault();Workspaces.compare();};
        out.querySelectorAll('select,input[type=number]').forEach(control=>control.addEventListener('change',()=>{++Workspaces.request;Workspaces.release();Workspaces.el('jc-output').textContent='Options changed. Compare again to update the result.';}));
        Workspaces.updateComparisonImages();
    }

    static updateComparisonImages(){
        if(!Workspaces.other) return;
        Workspaces.el('jc-right').innerHTML=Workspaces.other.info.images.map((image,i)=>'<option value="'+i+'">Image '+(i+1)+' · '+Workspaces.esc(image.format)+'</option>').join('');
    }

    static async readComparison(){
        const file=Workspaces.el('jc-file').files[0]; if(!file) return;
        const request=++Workspaces.compareRequest; ++Workspaces.request; Workspaces.cache=null; Workspaces.other=null; Workspaces.release();
        const donor=Workspaces.el('ja-donor');
        if(donor){
            if(donor.checked || Workspaces.el('ja-header-recovery')&&Workspaces.el('ja-header-recovery').checked) Workspaces.el('ja-output').textContent='Comparison donor changed. Run again to update the result.';
            Workspaces.renderedBitmap=null;
            donor.checked=false; donor.disabled=true;
        }
        Workspaces.el('jc-run').disabled=true; Workspaces.el('jc-output').textContent=''; Workspaces.el('jc-file-status').textContent='Reading comparison file…';
        try{
            const data=BinaryUtils.arrayToString(new Uint8Array(await file.arrayBuffer()));
            if(request!==Workspaces.compareRequest) return;
            const info=JPEGParser.parse(data,{sequence:JPEGSequence.isSequenceFile(file.name)}), model=JPEGFileModel.build(info,data);
            if(!model.recognized && !model.recoverable) throw new Error('Comparison file is not a recognized JPEG-family stream.');
            Workspaces.other={data,info,model,name:file.name};
            Workspaces.el('jc-file-status').textContent=file.name+' · '+model.format+(info.valid?'':' · incomplete or invalid structure');
            Workspaces.el('jc-run').disabled=false; Workspaces.updateComparisonImages();
            if(Workspaces.el('ja-donor')) Workspaces.el('ja-donor').disabled=false;
        }catch(error){if(request===Workspaces.compareRequest) Workspaces.el('jc-file-status').textContent=error.message;}
    }

    static async compare(){
        if(!Workspaces.other) return;
        const request=++Workspaces.request,cancelled=()=>request!==Workspaces.request,out=Workspaces.el('jc-output'),button=Workspaces.el('jc-run');
        button.disabled=true; out.textContent='Comparing…'; out.setAttribute('aria-busy','true'); Workspaces.release();
        try{
            await new Promise(resolve=>setTimeout(resolve,0)); if(cancelled()) return;
            const mode=Workspaces.el('jc-mode').value,other=Workspaces.other;
            if(mode==='structure'||mode==='metadata'){
                const result=FileAnalysis.compare(Inspector.model,other.model,ImageController.data,other.data,mode==='metadata');
                out.innerHTML='<p class="jr-scope">Whole files · '+Workspaces.esc(Inspector.file&&Inspector.file.name||'Current file')+' ↔ '+Workspaces.esc(other.name)+'</p><p>'+ImageController.data.length.toLocaleString('en-US')+' ↔ '+other.data.length.toLocaleString('en-US')+' bytes · '+result.rows.filter(row=>!row.same).length+' differing positions'+(result.limited?' in first 1,000 rows':'')+'</p><p class="jr-help">Segments are paired by their order. Added or removed segments can shift subsequent pairs. Metadata comparison uses exact segment bytes, not normalized tag values.</p>'+Workspaces.table(['#','Current file','Comparison file','Result'],result.rows.map((r,i)=>[String(i+1),r.left?Workspaces.esc(r.left.code)+' · byte '+r.left.start+' · '+r.left.size+' B':'—',r.right?Workspaces.esc(r.right.code)+' · byte '+r.right.start+' · '+r.right.size+' B':'—',r.same?'Identical stored bytes':'Different / absent']));
                out.appendChild(Workspaces.download('Export comparison JSON',JSON.stringify({left:Inspector.file&&Inspector.file.name,right:other.name,mode,limited:result.limited,rows:result.rows.map(r=>({left:r.left?{code:r.left.code,start:r.left.start,size:r.left.size}:null,right:r.right?{code:r.right.code,start:r.right.start,size:r.right.size}:null,same:r.same}))},null,2),'application/json','comparison.json')); return;
            }
            const left=Workspaces.info.images[Number(Workspaces.el('jc-left').value)],right=other.info.images[Number(Workspaces.el('jc-right').value)];
            const a=ImageController.data.substring(left.start,left.end),b=other.data.substring(right.start,right.end);
            if(mode==='coefficients'){
                const l=await JPEGDecoder.decode(a,{mode:'strict',cancelled}),r=await JPEGDecoder.decode(b,{mode:'strict',cancelled});
                if(cancelled()) return;
                if(l.width!==r.width||l.height!==r.height||l.components.length!==r.components.length) throw new Error('Coefficient comparison requires matching dimensions and component layouts.');
                const results=[];
                for(let i=0;i<l.components.length;i++){
                    const lc=l.components[i],rc=r.components[i];
                    if(lc.id!==rc.id||lc.h!==rc.h||lc.v!==rc.v) throw new Error('Component IDs and sampling must match for coefficient comparison.');
                    let changed=0,total=0,maximum=0;
                    for(let block=0;block<lc.available.length;block++){
                        if((block%lc.cols)*8>=Math.ceil(l.width*lc.h/l.maxH)||Math.floor(block/lc.cols)*8>=Math.ceil(l.height*lc.v/l.maxV)) continue;
                        if(lc.available[block]!==1||rc.available[block]!==1) throw new Error('Coefficient comparison requires fully decoded blocks. A selected image contains unfinished progressive detail.');
                        for(let k=0;k<64;k++){const d=Math.abs(lc.coefficients[block*64+k]-rc.coefficients[block*64+k]);if(d)changed++;maximum=Math.max(maximum,d);total++;}
                    }
                    const sameQuant=JSON.stringify(l.quant[lc.q])===JSON.stringify(r.quant[rc.q]);
                    results.push([String(i+1),String(total),String(changed),String(maximum),sameQuant?'Identical':'Different']);
                }
                out.innerHTML='<p class="jr-scope">Selected images · strict Huffman coefficient decoding</p><p class="jr-help">Counts compare quantized coefficients, excluding wholly padded edge blocks. Encoder differences and editing can both change coefficients; this does not identify steganography.</p>'+Workspaces.table(['Component','Coefficients','Changed','Max absolute difference','Quantization tables'],results);return;
            }
            const l=await Workspaces.imageCanvas(a,4096,cancelled),r=await Workspaces.imageCanvas(b,4096,cancelled);
            if(cancelled()) return;
            if(l.scale!==1||r.scale!==1) throw new Error('Pixel comparison requires native resolution; maximum dimension is 4,096 pixels.');
            const canvas=l.canvas;
            if(canvas.width!==r.canvas.width||canvas.height!==r.canvas.height) throw new Error('Pixel comparison requires matching decoded dimensions. Images are not resized or aligned automatically.');
            const ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,canvas.width,canvas.height),rhs=r.canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
            const gain=Workspaces.integer('jc-gain',8); let changed=0,error=0;
            for(let i=0;i<pixels.data.length;i+=4){let differs=false;for(let c=0;c<3;c++){const d=Math.abs(pixels.data[i+c]-rhs[i+c]);error+=d;differs ||= !!d;pixels.data[i+c]=Math.min(255,d*gain);}if(differs)changed++;}
            ctx.putImageData(pixels,0,0); out.innerHTML='<p class="jr-scope">Selected images · native browser pixels · '+canvas.width+' × '+canvas.height+'</p><p>'+changed.toLocaleString('en-US')+' differing pixels · mean absolute RGB difference '+(error/(canvas.width*canvas.height*3)).toFixed(4)+'</p><p class="jr-help">Browser color management and EXIF orientation affect pixel decoding.</p>';
            const stage=document.createElement('div');stage.className='jr-raster-stage';stage.appendChild(canvas);out.appendChild(stage);Workspaces.pngButton(out,'Download difference PNG',canvas,'pixel-difference.png',request);
        }catch(error){if(!cancelled())out.textContent=error.message;}
        finally{button.disabled=!Workspaces.other;out.setAttribute('aria-busy','false');}
    }
}

Workspaces.initialized=false;
Workspaces.info=null;
Workspaces.other=null;
Workspaces.cache=null;
Workspaces.renderedBitmap=null;
Workspaces.request=0;
Workspaces.fileGeneration=0;
Workspaces.compareRequest=0;
Workspaces.urls=[];
Workspaces.imageIndex=0;
Workspaces.view='inspect';
Workspaces.tool='overview';
Workspaces.autoTimer=undefined;
Workspaces.needsRun=false;
Workspaces.tooltipSequence=0;
Workspaces.AUTO_MAX_DIMENSION=4096;
Workspaces.AUTO_MAX_BYTES=8*1024*1024;
Workspaces.autoTools=['strings','embedded','entropy','metadata','ela','channels','levels','thumbnails','tables'];
Workspaces.tools={
    overview:['Findings overview','Start with structural observations, then choose a byte, visual or coefficient tool.'],
    embedded:['Embedded-file finder','Search comments, application metadata and trailing / unparsed bytes for recognizable file signatures and extract candidate ranges. Choose Whole file to include encoded image data.'],
    strings:['Strings & encodings','Find readable ASCII strings, URLs and possible hex or Base64 text with original byte offsets.'],
    entropy:['Entropy & byte histogram','Explore byte distributions across the selected scope.'],
    metadata:['Metadata','Retrieve image details and metadata, or see their locations in the image.'],
    ela:['Error level analysis','Explore amplified differences between decoded pixels and a JPEG recompression.'],
    channels:['Channels & bit planes','Separate pixel channels and inspect individual bits in the browser-decoded image.'],
    levels:['Contrast & level sweep','Expand a narrow brightness window to explore faint patterns and tonal boundaries.'],
    thumbnails:['Embedded thumbnails','Extract supported JFIF and EXIF thumbnails and view them alongside the selected image.'],
    tables:['Quantization tables','Explore JPEG quantization values as frequency grids.'],
    coefficients:['Coefficient explorer','Inspect stored quantized DCT coefficients, histograms and nonzero parity in baseline and progressive JPEGs.'],
    reconstruct:['Reconstruct image','Recover a baseline or progressive Huffman JPEG image, retain available blocks and scan detail, and inspect components independently.']
};
Workspaces.groups=[['Start',['overview']],['File & embedded data',['embedded','strings','entropy','metadata']],['Image views',['ela','channels','levels','thumbnails']],['JPEG coefficients',['tables','coefficients']],['Recovery',['reconstruct']]];
