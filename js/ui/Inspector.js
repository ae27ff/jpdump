/**
 * Display file regions, decoded values, raw previews and inspector controls.
 */
class Inspector{
    static mounted(){
        return !!document.getElementById('inspector-app');
    }

    static el(id){
        return document.getElementById(id);
    }

    static esc(value){
        return ResultView.escapeHTML(value);
    }

    static number(value){
        return Number(value).toLocaleString('en-US');
    }

    static binary(value){
        return value < 1024 ? Inspector.number(value) + ' B' : value < 1048576 ? (value / 1024).toFixed(2) + ' KiB' : (value / 1048576).toFixed(2) + ' MiB';
    }

    static text(selector,value){
        Inspector.root.querySelector(selector).textContent = value;
    }

    static current(){
        return Inspector.model && Inspector.model.rows.filter(function(r){ return r.id === Inspector.selected; })[0];
    }

    static content(row){
        return ImageController.data.substring(row.contentStart, row.contentEnd);
    }

    static fieldHint(label){
        var key = label.replace(/:\s*$/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
        if(Object.prototype.hasOwnProperty.call(Inspector.FIELD_HINTS, key)) return Inspector.FIELD_HINTS[key];
        if(/rawbytes$/.test(key)) return 'The original stored bytes for this metadata field, before interpretation. Hex shows byte values; Text shows characters; Download Raw saves the bytes.';
        if(/ifdpointer$/.test(key)) return 'A byte position pointing to another group of metadata entries (an Image File Directory), rather than a picture value.';
        if(/^gps/.test(key)) return 'GPS (Global Positioning System) metadata recorded by the device: ' + label.replace(/^GPS/, '').replace(/([a-z])([A-Z])/g, '$1 $2') + '. Ref fields specify direction, reference or units for the matching value. Recorded location data may be absent or inaccurate.';
        var name = label.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
        return 'Recorded metadata field: ' + name + '. The displayed value comes from the file; its units and interpretation depend on the device or format that wrote it.';
    }

    static rowHint(row){
        var purposes = {
            image:'Compressed picture bytes, which need decoding before they become visible pixels.',
            extra:'Bytes after the confirmed end of the image stream. Their purpose is unknown.',
            unparsed:'Bytes whose role could not be verified. They may include damaged or unsupported image data.'
        };
        var h = row.header, type = h && h.type, purpose = purposes[row.group];
        if(h){
            purpose = Inspector.MARKER_HINTS[type];
            if(!purpose && /^e[0-9a-f]$/.test(type)) purpose = 'An application segment holds metadata or information written by software, such as camera details, a thumbnail or color instructions.';
            if(!purpose && /^d[0-7]$/.test(type)) purpose = 'A restart marker separates compressed picture sections so decoding can restart at known points.';
            if(!purpose && typeof JPEGFrame !== 'undefined' && JPEGFrame.isMarker(type)) purpose = 'Describes the image dimensions, number of bits per sample and layout of its color or brightness channels.' + (h.desc && /DCT/.test(h.desc.longname) ? ' DCT (discrete cosine transform) represents image blocks as patterns of varying detail.' : '');
            if(!purpose) purpose = 'A marker is a special byte sequence identifying a section of the image file.';
        }
        var name = h && h.desc && h.desc.longname || row.name;
        return row.code + ' — ' + name + '\n' + purpose + (row.status ? '\nStatus: ' + row.status + '; only available bytes are shown.' : '');
    }

    static contentHints(container, row){
        // Put explanations on the pair, so both its label and value share a tooltip.
        container.querySelectorAll('.jr-info-table tr').forEach(function(pair){ pair.title = Inspector.fieldHint(pair.querySelector('th').textContent); });
        container.querySelectorAll('li > .detailname').forEach(function(label){ label.parentElement.title = Inspector.fieldHint(label.textContent); });
        container.querySelectorAll('.jr-component').forEach(function(detail){
            var quant = row.header && row.header.type === 'db', huffman = row.header && row.header.type === 'c4';
            detail.title = quant ? 'The 64 compression divisors in their stored zigzag order, moving from broad image patterns toward finer detail. Larger values discard more detail.' : huffman ? 'The stored symbol numbers, in the order used to assign variable-length Huffman bit codes for decoding.' : 'A component is one brightness or color channel, such as Y (brightness), Cb/Cr (color differences), or red, green and blue. Expand to see how this channel is stored.';
        });
        container.querySelectorAll('.jr-decoded-card h3').forEach(function(heading){
            if(heading.closest('.jr-meaning')) return;
            heading.title = /^Table /.test(heading.textContent) ? 'The identifier of a decoding table. Other headers use this number to select the table.' : Inspector.rowHint(row);
        });
        var links = {'View Hex':'Show these bytes as hexadecimal numbers (base 16, using 0–9 and A–F).', 'View Text':'Show a character preview of these bytes. Binary data may not form readable text.', 'Download Raw':'Save these bytes to a binary file without converting them.'};
        container.querySelectorAll('a').forEach(function(link){ if(links[link.textContent]) link.title = links[link.textContent]; });
        container.querySelectorAll('.jr-text-raw').forEach(function(pre){ pre.title = Inspector.view === 'hex' ? 'Each pair of hexadecimal digits represents one byte. Bytes appear in stored order, with up to 16 bytes per line.' : 'ASCII character preview of the stored bytes. Dots stand for bytes outside the displayed character set; this is not a decoded picture.'; });
    }

    static icons(){
        Inspector.root.querySelectorAll('[data-icon]').forEach(function(node){ node.outerHTML = Icons.get(node.getAttribute('data-icon')); });
    }

    static reset(){
        if(typeof Workspaces !== 'undefined' && Workspaces.initialized) Workspaces.reset();
        clearTimeout(Inspector.highlightTimer); Inspector.model = null; Inspector.selected = null; Inspector.hovered = null; Inspector.highlighted = null; Inspector.csvURL = null; Inspector.view = 'decoded';
        Inspector.el('jr-rows').innerHTML = ''; Inspector.el('jr-content').innerHTML = ''; Inspector.el('jr-copy-text').value = '';
        Inspector.el('jr-detail').hidden = true; Inspector.el('jr-workspace').dataset.open = 'false';
        Inspector.el('jr-results').hidden = true;
        Inspector.root.querySelector('.jr-file-stats').hidden = true;
        Inspector.el('jr-copy-fallback').hidden = true;
        Inspector.el('jr-selection-hint').hidden = false; Inspector.el('jr-table-status').textContent = Inspector.DEFAULT_STATUS;
    }

    static beginFile(nextFile){
        ++Inspector.dropRequestId;
        Inspector.el('jr-drop-feedback').hidden = true; Inspector.el('jr-drop-feedback').textContent = '';
        ++ContentView.requestId; ContentView.release(); Inspector.reset(); Inspector.file = nextFile;
        Inspector.root.setAttribute('aria-busy', 'true'); Inspector.el('jr-empty').hidden = false;
        Inspector.text('.jr-file-title h2', nextFile.name || 'Selected file');
        Inspector.text('.jr-file-title p', 'Reading file…'); Inspector.text('.jr-file-title small', '');
        Inspector.el('jr-empty').innerHTML = '<h2>Reading image…</h2><p>The file is being analyzed in your browser.</p>';
        Inspector.previewReady(false);
    }

    static failFile(message){
        Inspector.reset(); Inspector.root.setAttribute('aria-busy', 'false'); Inspector.el('jr-empty').hidden = false;
        Inspector.text('.jr-file-title p', 'Unable to read this file');
        Inspector.el('jr-empty').innerHTML = '<h2>Unable to read image</h2><p>' + Inspector.esc(message) + '</p>';
        Inspector.previewReady(false);
    }

    static previewReady(available){
        Inspector.el('preview').hidden = !available;
        Inspector.root.querySelector('.jr-preview-placeholder').hidden = available;
    }

    static groupHint(group){
        if(group.ghost) return group.hint;
        var ranges = group.contiguous ? 'bytes ' + Inspector.number(group.rows[0].start) + '–' + Inspector.number(group.rows[group.rows.length - 1].end - 1) : group.rows.length + ' ranges across the file';
        return group.name + ' · ' + ranges + ' · ' + Inspector.number(group.size) + ' bytes · ' + group.rows.length + (group.rows.length === 1 ? ' region' : ' regions');
    }

    static updateHint(id){
        var group = Inspector.model && Inspector.model.groups.concat(Inspector.model.ghosts).filter(function(g){ return g.id === id; })[0];
        Inspector.el('jr-region-hint').textContent = group ? Inspector.groupHint(group) : Inspector.DEFAULT_HINT;
    }

    static renderLinks(){
        if(!Inspector.model) return;
        Inspector.root.querySelectorAll('[data-segment]').forEach(function(row){
            row.classList.toggle('is-selected', row.dataset.segment === Inspector.selected);
            row.classList.toggle('is-hovered', row.dataset.group === Inspector.hovered);
            row.classList.toggle('is-highlighted', row.dataset.group === Inspector.highlighted);
            row.querySelector('button').setAttribute('aria-pressed', String(row.dataset.segment === Inspector.selected));
        });
        var row = Inspector.current();
        Inspector.root.querySelectorAll('[data-region]').forEach(function(button){ button.classList.toggle('is-linked', button.dataset.region === (Inspector.highlighted || Inspector.hovered || (row && row.group))); });
    }

    static highlight(id){
        if(!Inspector.model) return;
        clearTimeout(Inspector.highlightTimer); Inspector.highlighted = id; Inspector.renderLinks(); Inspector.updateHint(id);
        var group = Inspector.model.groups.filter(function(g){ return g.id === id; })[0];
        Inspector.el('jr-table-status').textContent = group.rows.length + ' matching regions highlighted temporarily.';
        Inspector.el('jr-status').textContent = Inspector.el('jr-table-status').textContent;
        Inspector.highlightTimer = setTimeout(function(){ Inspector.highlighted = null; Inspector.renderLinks(); Inspector.el('jr-table-status').textContent = Inspector.DEFAULT_STATUS; Inspector.updateHint(Inspector.hovered); }, 3600);
    }

    static renderGraph(){
        var map = Inspector.el('jr-map'); map.innerHTML = '';
        var regions = Inspector.model.ghosts.filter(function(g){ return g.leading; }).concat(Inspector.model.groups,Inspector.model.ghosts.filter(function(g){ return !g.leading; }));
        map.classList.toggle('has-missing', Inspector.model.ghosts.length > 0);
        map.classList.toggle('no-image', !regions.some(function(g){ return (g.group || g.id) === 'image'; }));
        Inspector.root.querySelector('.jr-structure-subtitle').textContent = (Inspector.model.interleaved ? 'Grouped by type · regions are interleaved · not to scale' : 'In file order · small regions expanded, not to scale') +
            (Inspector.model.ghosts.length ? ' · dashed regions are missing or expected' : '');
        regions.forEach(function(group){
            var kind = group.group || group.id;
            var button = document.createElement('button'); button.type = 'button';
            button.className = 'jr-region jr-region-' + kind + (group.ghost ? ' jr-region-ghost' : ''); button.dataset.region = group.id;
            var label = kind === 'eoi' ? (Inspector.model.mixed ? 'EOI / EOC' : Inspector.model.j2k ? 'EOC' : 'EOI') : kind === 'extra' ? 'Extra' : group.name;
            var amount = group.ghost ? (group.expected ? 'Expected' : group.size === null ? 'Length unknown' : Inspector.number(group.size) + ' B missing') : Inspector.number(group.size) + ' B';
            if(group.ghost) button.title = group.hint.replace(/ · /g, '\n');
            else {
                var ranges = group.contiguous ? 'Bytes ' + Inspector.number(group.rows[0].start) + '–' + Inspector.number(group.rows[group.rows.length - 1].end - 1) : 'Ranges are separated across the file';
                button.title = [kind === 'eoi' ? label + ' — ' + group.name : group.name, ranges,
                    Inspector.number(group.size) + ' bytes · ' + group.rows.length + (group.rows.length === 1 ? ' region' : ' regions'),
                    '', Inspector.GROUP_HINTS[kind] || '', 'Click to highlight matching segments.'].join('\n');
            }
            button.setAttribute('aria-label', button.title);
            button.innerHTML = '<strong>' + Inspector.esc(label) + '</strong><span>' + Inspector.esc(amount) + '</span>';
            button.onmouseenter = button.onfocus = function(){ Inspector.hovered = group.id; Inspector.renderLinks(); Inspector.updateHint(group.id); };
            button.onmouseleave = button.onblur = function(){ Inspector.hovered = null; Inspector.renderLinks(); Inspector.updateHint(Inspector.highlighted); };
            button.onclick = function(){ if(group.ghost) Inspector.updateHint(group.id); else Inspector.highlight(group.id); };
            map.appendChild(button);
        });
        if(!Inspector.model.size) map.textContent = 'This file contains no bytes.';
        Inspector.updateHint(null);
    }

    static render(info){
        Inspector.reset(); Inspector.model = JPEGFileModel.build(info, ImageController.data);
        Inspector.root.setAttribute('aria-busy', 'false'); Inspector.el('jr-empty').hidden = true; Inspector.el('jr-results').hidden = false;
        Inspector.text('.jr-file-title h2', Inspector.file && Inspector.file.name || 'Selected file');
        var dims = Inspector.model.dimensions;
        if(!dims && Inspector.el('preview').naturalWidth) dims = {width: Inspector.el('preview').naturalWidth, height: Inspector.el('preview').naturalHeight};
        Inspector.text('.jr-file-title p', Inspector.model.format + (Inspector.model.sequence ? ' · ' + Inspector.number(Inspector.model.images.length) + (Inspector.model.images.some(function(image){ return image.tableOnly; }) ? ' streams' : ' images') : '') + (dims ? ' · ' + Inspector.number(dims.width) + ' × ' + Inspector.number(dims.height) + (info.mixedDimensions ? ' (first image; sizes vary)' : '') : info.tableOnly ? ' · Abbreviated table stream' : ' · Dimensions unavailable'));
        Inspector.root.querySelector('.jr-file-title p').title = 'Detected image format and width × height in pixels. JPEG compresses pictures; JPEG-LS supports exact or near-exact reconstruction; JPEG 2000 uses a different compression format. DCT means discrete cosine transform, which describes image blocks as patterns of varying detail. A scan is one pass of compressed picture data; progressive scans add detail in stages. A table-only stream supplies decoding settings without a picture. Sequences contain multiple adjacent image streams.';
        var precision = [];
        if(dims && dims.width && dims.height) precision.push((dims.width * dims.height / 1000000).toFixed(1) + ' MP');
        if(Inspector.model.precision !== '' && typeof Inspector.model.precision === 'number') precision.push(Inspector.model.precision + '-bit precision');
        if(Inspector.el('preview').hidden) precision.push('Browser preview unavailable');
        else if(Inspector.model.sequence) precision.push('Preview: first image');
        Inspector.text('.jr-file-title small', precision.join(' · '));
        Inspector.root.querySelector('.jr-file-title small').title = 'MP means megapixels (one million pixels). Bit precision is the number of bits per brightness or color sample, rather than per complete pixel. The preview uses the browser decoder and may show only the first image in a sequence.';
        var stats = Inspector.root.querySelector('.jr-file-stats'); stats.hidden = false;
        stats.querySelectorAll('strong')[0].textContent = Inspector.number(Inspector.model.size);
        stats.querySelectorAll('small')[0].textContent = Inspector.binary(Inspector.model.size);
        stats.querySelectorAll('dt')[1].textContent = Inspector.model.confirmedEnd ? (Inspector.model.sequence ? 'Sequence data' : Inspector.model.j2k ? 'Codestream (SOC → EOC)' : 'JPEG data (SOI → EOI)') : 'Parsed / recovered data';
        stats.querySelectorAll('strong')[1].textContent = Inspector.number(Inspector.model.parsedSize);
        stats.querySelectorAll('small')[1].textContent = Inspector.binary(Inspector.model.parsedSize);
        stats.querySelectorAll('div')[1].title = (Inspector.model.confirmedEnd ? 'Bytes belonging to the identified image stream or sequence, including its start and end markers. SOI/SOC mean Start of Image/Codestream; EOI/EOC mean End of Image/Codestream. Bytes after the confirmed end are counted separately.' : 'Bytes assigned to parsed or recovered regions. The image structure is incomplete or unverified, so this is not a confirmed complete image size.') + ' KiB means 1,024 bytes; MiB means 1,048,576 bytes.';
        Inspector.text('.jr-section-header .jr-numeric', Inspector.number(Inspector.model.size));
        Inspector.el('jr-marker-count').textContent = Inspector.model.markerCount + ' markers · ' + Inspector.model.rows.length + ' regions';
        Inspector.el('jr-rows').innerHTML = Inspector.model.rows.map(function(row, index){
            var classes = row.group === 'extra' || row.group === 'unparsed' ? 'jr-extra-row' : '';
            return '<tr class="' + classes + '" data-segment="' + row.id + '" data-group="' + row.group + '" title="' + Inspector.esc(Inspector.rowHint(row)) + '"><td title="Position of this region in file order, starting at 1.">' + (index + 1) + '</td><td><button type="button" class="jr-row-button" title="' + Inspector.esc(Inspector.rowHint(row) + ' Click to open its details.') + '" aria-pressed="false" aria-controls="jr-detail"><strong>' + Inspector.esc(row.code) + '</strong><span class="jr-row-name">' + Inspector.esc(row.name) + (row.status ? '<span class="warning">' + Inspector.esc(row.status) + '</span>' : '') + '</span></button></td><td title="Byte position where this region begins, counted from zero at the start of the file.">' + Inspector.number(row.start) + '</td><td title="Number of stored bytes in this region, including its marker and length field when present.">' + Inspector.number(row.size) + '</td></tr>';
        }).join('');
        Inspector.root.querySelectorAll('[data-segment]').forEach(function(node){ node.onclick = function(){ Inspector.select(node.dataset.segment, true); }; });
        Inspector.renderGraph();
        var warnings = [];
        if(!Inspector.model.recognized) warnings.push(info.prefixRecovered ? 'Surviving JPEG segments were found after a missing or unverified prefix. The complete file format and original header sequence are unverified.' : 'This file does not start with a supported JPEG, JPEG-LS or raw JPEG 2000 signature. Available bytes are shown as unparsed data.');
        if(!info.valid) warnings.push('Invalid or incomplete structure. Recovered regions are not verified image data.');
        warnings = warnings.concat(info.warnings || []);
        Inspector.el('jr-warnings').hidden = !warnings.length;
        Inspector.el('jr-warning-messages').innerHTML = warnings.map(function(warning){ return '<p>' + Inspector.esc(warning) + '</p>'; }).join('');
        var tail = Inspector.model.rows.filter(function(r){ return r.group === 'extra' || r.group === 'unparsed'; });
        Inspector.el('jr-finding').hidden = !tail.length;
        if(tail.length) {
            var unknownSize = tail.reduce(function(sum, row){ return sum + row.size; }, 0);
            Inspector.el('jr-finding-description').textContent = tail[0].group === 'extra' ? Inspector.number(unknownSize) + ' bytes after ' + Inspector.model.endName + ' · These bytes are outside the stream. Their purpose is unknown.' : Inspector.number(unknownSize) + ' unparsed bytes · Their role could not be verified.';
        }
        Inspector.el('jr-export').removeAttribute('data-blob-url'); Inspector.el('jr-export').href = '#';
        Inspector.el('jr-export').download = (Inspector.file && Inspector.file.name || 'image') + '-segments.csv';
        if(typeof Workspaces !== 'undefined' && Workspaces.initialized) Workspaces.setFile(info);
    }

    static facts(rows){
        return '<table class="jr-info-table"><tbody>' + rows.map(function(entry){ return '<tr><th scope="row">' + Inspector.esc(entry[0]) + '</th><td>' + Inspector.esc(entry[1]) + '</td></tr>'; }).join('') + '</tbody></table>';
    }

    static huffmanCSV(row){
        if(!row || !row.header || row.header.type !== 'c4') return null;
        if(typeof row.huffmanCSV !== 'undefined') return row.huffmanCSV;
        var h = row.header;
        row.huffmanCSV = null;
        if(h.truncated || h.incompleteLength || !JPEGTable.isValid('c4', h.content)) return null;
        var lines = ['Table index,Table class,Table ID,Symbol decimal,Symbol hex,Code length,Codeword'];
        JPEGTable.read(h).forEach(function(table, index){
            JPEGTable.huffmanCodes(table).forEach(function(entry){
                var bits = ('0000000000000000' + entry.code.toString(2)).slice(-entry.length);
                var hex = '0x' + ('0' + entry.value.toString(16)).slice(-2).toUpperCase();
                lines.push([index + 1, table.coding, table.id, entry.value, hex, entry.length, bits].join(','));
            });
        });
        row.huffmanCSV = lines.join('\r\n') + '\r\n';
        return row.huffmanCSV;
    }

    static downloadHuffman(link){
        var row = Inspector.current(), csv = Inspector.huffmanCSV(row);
        if(!csv) return false;
        if(!row.huffmanURL){
            var blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
            if(navigator.msSaveBlob) { navigator.msSaveBlob(blob, link.download); return false; }
            row.huffmanURL = window.URL.createObjectURL(blob);
            ContentView.downloadURLs.push(row.huffmanURL);
        }
        link.href = row.huffmanURL;
        return true;
    }

    static scanExport(row){
        if(!Inspector.model || !row || !(row.header && row.header.type === 'da') && row.group !== 'image') return null;
        var rows = Inspector.model.rows, index = rows.indexOf(row), scan, frame, start;
        for(var i = index; i >= 0; i--){
            var h = rows[i].header;
            if(!h) continue;
            if(!scan && h.type === 'da') scan = rows[i];
            if(!frame && JPEGFrame.isMarker(h.type)) frame = h;
            if(h.type === 'd8') { start = rows[i].start; break; }
            if(h.type === '4f') return null;
        }
        if(!scan || !frame || typeof start === 'undefined' || !['c0','c2'].includes(frame.type) ||
            !frame.extendeddata || frame.extendeddata.dataprec !== 8 || ![1,3].includes(frame.extendeddata.ncomponents) ||
            !scan.header.valid || scan.header.truncated) return null;
        var end = ImageController.data.length;
        for(i = index + 1; i < rows.length; i++) if(rows[i].header && ['d8','4f'].includes(rows[i].header.type)) { end = rows[i].start; break; }
        return {row:scan, start:start, end:end, offset:scan.header.nextp - start};
    }

    static async downloadScanSymbols(){
        var row = Inspector.current(), plan = Inspector.scanExport(row);
        if(!plan) return;
        var button = Inspector.el('jr-download-symbols'), generation = ContentView.requestId;
        var request = ++Inspector.symbolRequest;
        function active(){ return generation === ContentView.requestId && Inspector.current() === row && request === Inspector.symbolRequest; }
        var filename = (Inspector.file && Inspector.file.name || 'image') + '-scan-' + plan.row.start + '-huffman-values.bin';
        button.disabled = true; button.textContent = 'Decoding Huffman values…';
        try{
            var url = plan.row.symbolURL;
            if(!url){
                var bytes = await JPEGDecoder.scanSymbols(ImageController.data.substring(plan.start,plan.end), plan.offset, {cancelled:function(){ return !active(); }});
                if(!active()) return;
                var blob = new Blob([bytes], {type:'application/octet-stream'});
                if(navigator.msSaveBlob) { navigator.msSaveBlob(blob, filename); return; }
                url = plan.row.symbolURL = window.URL.createObjectURL(blob); ContentView.downloadURLs.push(url);
            }
            if(!active()) return;
            var link = document.createElement('a'); link.href = url; link.download = filename;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            Inspector.el('jr-status').textContent = 'Downloaded Huffman symbol values for the selected scan.';
        }catch(error){
            if(active()){
                var message = 'Unable to export Huffman values: ' + error.message;
                Inspector.el('jr-status').textContent = message; Inspector.el('jr-content-note').textContent = message;
            }
        }finally{
            if(active()) { button.disabled = false; button.textContent = 'Download Huffman values'; }
        }
    }

    static explainAbbreviations(row, details, meaning){
        var h = row.header, intro = [], name = h && h.desc && h.desc.longname;
        // Some legacy marker names omit the verb represented by the abbreviation.
        var names = {DHT:'Define Huffman Table', DQT:'Define Quantization Table', DAC:'Define Arithmetic Coding Conditioning',
            DNL:'Define Number of Lines', DRI:'Define Restart Interval', DHP:'Define Hierarchical Progression',
            LSE:'JPEG-LS Extension'};
        name = names[row.code] || name;
        if(/^SOF\d+$/.test(row.code)) name = 'Start of Frame ' + row.code.substring(3);
        if(h && name && name !== 'Unknown' && name !== 'Unrecognized marker') intro.push(row.code + ' means ' + name + '.');

        // Include only terms used in this selection, including collapsed component details.
        var text = [row.code, row.name || '', h && h.desc && h.desc.longname || '', details.replace(/<[^>]*>/g, ' '), meaning].join(' ');
        var terms = [
            ['J2K', 'J2K identifies the JPEG 2000 image format.'],
            ['JPEG-LS', 'JPEG-LS is the lossless and near-lossless JPEG format.'],
            ['JFIF', 'JFIF means JPEG File Interchange Format.'],
            ['EXIF', 'EXIF means Exchangeable Image File Format, which stores camera and image metadata.'],
            ['DCT', 'DCT means discrete cosine transform, which expresses image blocks as frequency coefficients.'],
            ['DC', 'DC is the zero-frequency DCT coefficient, representing the block average. DC tables code coefficient differences, or prediction differences for lossless images.'],
            ['AC', 'AC refers to the nonzero spatial-frequency DCT coefficients, which describe variation within a block.'],
            ['RGB', 'RGB means red, green, and blue color channels.'],
            ['CMYK', 'CMYK means cyan, magenta, yellow, and black color channels.'],
            ['YCbCr', 'YCbCr separates brightness (Y) from blue-difference (Cb) and red-difference (Cr) color channels.'],
            ['YCCK', 'YCCK uses brightness and two color-difference channels together with a black (K) channel.'],
            ['TIFF', 'TIFF means Tagged Image File Format.'],
            ['IFD', 'IFD means Image File Directory, a group of metadata entries.'],
            ['XMP', 'XMP means Extensible Metadata Platform.'],
            ['ICC', 'ICC means International Color Consortium; its profiles describe how to interpret colors.'],
            ['IPTC', 'IPTC means International Press Telecommunications Council; its metadata describes image content and attribution.'],
            ['ID', 'ID means identifier, a number used to refer to a component or table.']
        ];
        terms.forEach(function(term){
            // Match labels such as DCTEncodeVersion and EXIF tag names as well as standalone terms.
            if(new RegExp('\\b' + term[0] + '(?=\\b|[A-Z][a-z])').test(text)) intro.push(term[1]);
        });
        return intro.concat(meaning).join(' ');
    }

    static decoded(row){
        if(row.decodedHTML) return row.decodedHTML;
        var h = row.header, title = row.code, html = '', meaning = '';
        if((row.group === 'extra' || row.group === 'unparsed') && !h) {
            title = row.group === 'extra' ? 'Trailing data' : 'Unparsed data';
            html = Inspector.facts([['Starts at byte', Inspector.number(row.start)], ['Size', Inspector.number(row.size) + ' bytes'], ['Identified purpose', 'Unknown']]);
            meaning = row.group === 'extra' ? 'These bytes follow the confirmed end of the image stream. Finding them does not identify their purpose or establish whether they can be discarded.' : 'The parser could not verify the role of these bytes. They are not classified as disposable or as a confirmed part of the image.';
        } else if(row.group === 'image') {
            title = 'Stored encoded data'; html = Inspector.facts([['Offset', Inspector.number(row.start)], ['Size', Inspector.number(row.size) + ' bytes']]);
            meaning = 'These are the exact encoded bytes in the file. Stuffing bytes are retained in Hex, Text, and raw downloads. Restart markers, when present, are listed separately.';
        } else if(h && h.hasextendeddata) {
            var ext = h.extendeddata; title = h.extendedtype + ' Information';
            if(h.extendedtype === 'JFIF') {
                html = Inspector.facts([['Version', ext.version], ['Units', ext.units], ['X Density', ext.xdensity], ['Y Density', ext.ydensity], ['Thumbnail Pixels', ext.xthumbpixels + ' × ' + ext.ythumbpixels], ['Thumbnail Size', ext.thumblen + ' bytes'], ['Thumbnail', ext.thumb.length ? 'Available' : 'None']]);
                if(ext.thumb.length) html += '<h3>Thumbnail bytes</h3><ul>' + ResultView.detail('Packed RGB thumbnail', ContentView.links(ext.thumb)) + '</ul>';
                if(ext.extraneous.length) html += '<h3 class="warning">Extra bytes inside this JFIF segment</h3><ul>' + ResultView.detail('Available bytes', ContentView.links(ext.extraneous)) + '</ul>';
                meaning = 'JFIF describes JPEG format information. Density units are shown exactly as recorded; values without physical units describe pixel aspect ratio.';
            } else if(h.extendedtype === 'EXIF') {
                html = ResultView.exifInfo(ImageController.getEXIF(Inspector.model.sequence ? Inspector.model.images[row.imageIndex] : null)); meaning = 'EXIF metadata belongs to this image. Raw bytes remain available even if a field cannot be decoded.';
            } else if(h.extendedtype === 'SOF') {
                html = ResultView.frameInfo(ext);
                (ext.components || []).forEach(function(comp){ html += '<details class="jr-component"><summary>' + Inspector.esc(comp.idstr) + ' component</summary>' + ResultView.frameComponentInfo(comp) + '</details>'; });
                meaning = 'This frame describes dimensions, sample precision, and component layout. Image data size is not the decoded memory size.';
            } else if(h.extendedtype === 'Scan') {
                html = ResultView.scanInfo(ext);
                (ext.components || []).forEach(function(comp){ html += '<details class="jr-component"><summary>' + Inspector.esc(comp.idstr) + ' component</summary>' + ResultView.scanComponentInfo(comp, ext.scanCoding) + '</details>'; });
                meaning = 'The SOS length field covers the scan header only. ' + (ext.scanCoding === 'jpeg-ls' ? 'JPEG-LS bit stuffing is retained in both the separate stored-data rows and the labeled coded-data view.' : 'Its stored encoded bytes have their own rows. The separately labeled destuffed view is derived data, not a byte-for-byte copy of the file.');
            } else { html = ResultView.objectInfo(ext); meaning = 'Recognized fields are shown below. Hex and raw downloads expose the original bytes.'; }
        } else if(h && (h.type === 'db' || h.type === 'c4')) {
            var tables = JPEGTable.read(h);
            if(tables) tables.forEach(function(table){
                    html += '<h3>Table ' + table.id + '</h3>' + Inspector.facts(h.type === 'db' ? [['Precision', table.precision + ' bits'], ['Entries', table.values.length]] : [['Table class', table.coding], ['Symbols', table.values.length], ['Codes per length (1–16)', table.counts.join(', ')]]);
                    html += '<details class="jr-component"><summary>' + (h.type === 'db' ? 'Values (stored zigzag order)' : 'Symbol values (stored order)') + '</summary><p class="jr-table-values">' + table.values.join(', ') + '</p></details>';
                });
            else html = '<p>Table data is incomplete. Inspect Hex or download the available content.</p>';
            meaning = 'These tables are used to decode the compressed picture. They are part of the JPEG structure.';
        } else if(!row.size || row.contentEnd === row.contentStart) { html = '<p>This marker has no content.</p>'; meaning = h && h.type === 'd9' ? 'This marker identifies the end of the stream. Any later bytes are accounted for separately.' : 'This marker has no length field or content.'; }
        else { html = '<p>No structured details are available for this marker. Use Hex or Text to inspect it, or download the original content.</p>'; meaning = h && h.desc.uses || 'The original available bytes are preserved.'; }
        meaning = Inspector.explainAbbreviations(row, html, meaning);
        row.decodedHTML = '<section class="jr-decoded-card"><h3>' + Icons.get('file-code-2') + Inspector.esc(title) + '</h3><div class="jr-decoded-grid"><div class="jr-decoded-fields">' + (row.status ? '<p class="warning">' + Inspector.esc(row.status) + '. Available bytes are shown.</p>' : '') + html + '</div><aside class="jr-meaning"><h3>' + Icons.get('lightbulb') + 'What this means</h3><p>' + Inspector.esc(meaning) + '</p></aside></div></section>';
        return row.decodedHTML;
    }

    static renderContent(){
        var row = Inspector.current(); if(!row) return;
        var length = row.contentEnd - row.contentStart, container = Inspector.el('jr-content');
        Inspector.root.querySelectorAll('[data-view]').forEach(function(button){ var active = button.dataset.view === Inspector.view; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
        container.setAttribute('aria-labelledby', 'jr-tab-' + Inspector.view);
        if(Inspector.view === 'decoded') {
            try { container.innerHTML = Inspector.decoded(row); }
            catch(error){ container.innerHTML = '<p class="warning">Details are unavailable. Hex, Text and raw downloads still contain the available bytes.</p>'; }
        } else {
            var preview = ImageController.data.substring(row.contentStart, Math.min(row.contentEnd, row.contentStart + ContentView.MAX_PREVIEW));
            container.innerHTML = '<div class="jr-raw"><pre class="jr-text-raw"></pre></div><p class="jr-raw-note"></p>';
            container.querySelector('pre').textContent = Inspector.view === 'hex' ? BinaryUtils.hexDump(preview, 16).toUpperCase() : preview.replace(/[^\x20-\x7e\r\n\t]/g, '·');
            container.querySelector('.jr-raw-note').textContent = (preview.length < length ? 'First ' + Inspector.number(preview.length) + ' of ' + Inspector.number(length) + ' content bytes. Download raw for the complete content.' : 'All ' + Inspector.number(length) + ' content bytes.') + (Inspector.view === 'text' ? ' Text is an ASCII preview; dots represent other bytes.' : '');
        }
        Inspector.contentHints(container, row);
        Inspector.el('jr-copy-fallback').hidden = true; Inspector.el('jr-copy-text').value = '';
        var download = Inspector.el('jr-download'); download.hidden = !length; download.href = row.downloadURL || '#';
        download.removeAttribute('data-blob-url'); if(row.downloadURL) download.setAttribute('data-blob-url', row.downloadURL);
        download.download = (Inspector.file && Inspector.file.name || 'image') + '-' + row.code.replace(/[^a-z0-9-]/gi, '-') + '-' + row.start + '.bin';
        var huffman = Inspector.el('jr-download-huffman');
        huffman.hidden = !Inspector.huffmanCSV(row); huffman.href = row.huffmanURL || '#';
        huffman.download = (Inspector.file && Inspector.file.name || 'image') + '-DHT-' + row.start + '-mappings.csv';
        var symbols = Inspector.el('jr-download-symbols'); symbols.hidden = !Inspector.scanExport(row);
        symbols.disabled = false; symbols.textContent = 'Download Huffman values';
        Inspector.el('jr-copy').hidden = !length; Inspector.el('jr-copy').querySelector('span').textContent = length > ContentView.MAX_PREVIEW ? 'Copy preview' : 'Copy bytes';
        Inspector.el('jr-payload-label').textContent = 'Content: ' + Inspector.number(length) + ' bytes';
        Inspector.el('jr-content-note').textContent = row.header ? row.header.incompleteLength ? 'Includes available incomplete length bytes.' : 'Excludes marker and complete length fields.' : 'Original bytes as stored in the file.';
    }

    static renderSelection(){
        var row = Inspector.current(); Inspector.el('jr-workspace').dataset.open = String(!!row); Inspector.el('jr-detail').hidden = !row; Inspector.el('jr-selection-hint').hidden = !!row; Inspector.renderLinks();
        if(!row) return;
        var h = row.header, index = Inspector.model.rows.indexOf(row);
        Inspector.el('jr-kind').textContent = row.status || (row.group === 'image' ? 'ENCODED IMAGE DATA' : row.group === 'extra' ? 'TRAILING DATA' : row.group === 'unparsed' ? 'UNPARSED DATA' : h && /^e[0-9a-f]$/.test(h.type) ? 'APPLICATION SEGMENT' : 'IMAGE MARKER');
        Inspector.el('jr-code').textContent = row.code; Inspector.el('jr-name').textContent = row.name;
        Inspector.el('jr-code').parentElement.title = Inspector.rowHint(row);
        Inspector.el('jr-kind').title = Inspector.rowHint(row);
        Inspector.el('jr-marker-badge').hidden = !h; Inspector.el('jr-marker-badge').textContent = h ? 'Marker 0x' + (h.magic + h.type).toUpperCase() : '';
        Inspector.el('jr-position').textContent = (index + 1) + ' of ' + Inspector.model.rows.length;
        Inspector.el('jr-previous').disabled = index === 0; Inspector.el('jr-next').disabled = index === Inspector.model.rows.length - 1;
        function prop(label, value, hint){ return '<div title="' + Inspector.esc((hint || Inspector.fieldHint(label)) + ' A dash means this field is absent or unavailable.') + '"><dt>' + label + '</dt><dd>' + Inspector.esc(value) + '</dd></div>'; }
        Inspector.el('jr-metadata').innerHTML = prop('Marker ID', h ? '0x' + (h.magic + h.type).toUpperCase() : '—') + prop('Offset', Inspector.number(row.start)) + prop('Declared length', h && h.haslenbytes && !h.incompleteLength ? String(h.len).replace(/ \(Scanned\)/, '') : '—', 'Includes the length field, but excludes the marker.') + prop('Actual size', Inspector.number(h ? Math.max(0, row.size - h.markerwidth) : row.size), 'Available bytes after the marker, including any length field.');
        Inspector.renderContent();
    }

    static select(id,reveal){
        if(!Inspector.model || !Inspector.model.rows.some(function(r){ return r.id === id; })) return;
        Inspector.selected = id; Inspector.view = 'decoded'; Inspector.renderSelection(); Inspector.el('jr-status').textContent = 'Opened ' + Inspector.current().code + ' details.';
        if(reveal && window.matchMedia('(max-width: 760px)').matches) Inspector.el('jr-close-detail').focus();
    }

    static tail(){
        return Inspector.model && Inspector.model.rows.filter(function(r){ return r.group === 'extra' || r.group === 'unparsed'; })[0];
    }

    static copyBytes(){
        var row = Inspector.current(); if(!row) return;
        var generation = ContentView.requestId, id = row.id;
        var hex = BinaryUtils.hexDump(ImageController.data.substring(row.contentStart, Math.min(row.contentEnd, row.contentStart + ContentView.MAX_PREVIEW)), 16).toUpperCase();
        function fallback(){
            if(generation !== ContentView.requestId || id !== Inspector.selected) return;
            Inspector.el('jr-copy-fallback').hidden = false; Inspector.el('jr-copy-text').value = hex; Inspector.el('jr-copy-text').focus(); Inspector.el('jr-copy-text').select();
        }
        if(!navigator.clipboard || !navigator.clipboard.writeText) { fallback(); return; }
        navigator.clipboard.writeText(hex).then(function(){
            if(generation !== ContentView.requestId || id !== Inspector.selected) return;
            Inspector.el('jr-copy').querySelector('span').textContent = 'Copied'; Inspector.el('jr-status').textContent = 'Hex bytes copied.';
        }, fallback);
    }

    static isFileDrag(event){
        var transfer = event.dataTransfer;
        return !!(transfer && (Array.prototype.indexOf.call(transfer.types || [], 'Files') !== -1 || transfer.files && transfer.files.length));
    }

    static clearDrag(){
        Inspector.dragDepth = 0; Inspector.el('jr-drop-target').hidden = true;
    }

    static dropFeedback(message){
        Inspector.el('jr-drop-feedback').textContent = message; Inspector.el('jr-drop-feedback').hidden = false;
    }

    static openDroppedFile(droppedFile){
        var requestId = ++Inspector.dropRequestId, selectionId = ImageController.requestId;
        function active(){ return requestId === Inspector.dropRequestId && selectionId === ImageController.requestId; }
        function incompatible(){ Inspector.dropFeedback('This file is not a supported JPEG, JPEG-LS or raw JPEG 2000 codestream.'); }
        // Read only a prefix before opening. Follow unusually long marker-fill
        // runs in bounded chunks, and ignore probes superseded by another choice.
        function probe(offset){
            var reader = new FileReader();
            reader.onload = function(){
                if(!active()) return;
                var bytes = new Uint8Array(reader.result);
                for(var i = 0; i < bytes.length; i++){
                    if(bytes[i] === 0xff) continue;
                    if(offset + i > 0 && (bytes[i] === 0xd8 || bytes[i] === 0x4f)) {
                        // A drop must not leave an older picker selection behind.
                        Inspector.el('upload').value = '';
                        ImageController.selectFile({target: {files: [droppedFile]}});
                    } else incompatible();
                    return;
                }
                if(bytes.length && offset + bytes.length < droppedFile.size) probe(offset + bytes.length);
                else incompatible();
            };
            reader.onerror = function(){ if(active()) Inspector.dropFeedback('Unable to read the dropped file. Try opening it with Open image.'); };
            reader.readAsArrayBuffer(droppedFile.slice(offset, offset + 65536));
        }
        probe(0);
    }

    static prepareDrop(){
        document.addEventListener('dragenter', function(event){
            if(!Inspector.isFileDrag(event)) return;
            event.preventDefault(); ++Inspector.dragDepth; Inspector.el('jr-drop-target').hidden = false;
        });
        document.addEventListener('dragover', function(event){
            if(!Inspector.isFileDrag(event)) return;
            event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; Inspector.el('jr-drop-target').hidden = false;
        });
        document.addEventListener('dragleave', function(){
            Inspector.dragDepth = Math.max(0, Inspector.dragDepth - 1);
            if(!Inspector.dragDepth) Inspector.clearDrag();
        });
        document.addEventListener('drop', function(event){
            if(!Inspector.isFileDrag(event)) return;
            event.preventDefault(); Inspector.clearDrag();
            var files = event.dataTransfer.files;
            if(!files || files.length !== 1) { ++Inspector.dropRequestId; Inspector.dropFeedback('Drop one image file at a time.'); return; }
            Inspector.openDroppedFile(files[0]);
        });
        document.addEventListener('dragend', Inspector.clearDrag);
        window.addEventListener('blur', Inspector.clearDrag);
    }

    static init(){
        if(Inspector.initialized) return; Inspector.initialized = true; Inspector.root = Inspector.el('inspector-app'); Inspector.icons();
        Inspector.root.querySelector('.jr-nav-active').setAttribute('aria-current', 'page');
        Inspector.el('jr-open').onclick = function(){ Inspector.el('upload').click(); };
        Inspector.el('jr-empty').onclick = function(){ Inspector.el('upload').click(); };
        Inspector.el('jr-close-detail').onclick = function(){ var id = Inspector.selected; Inspector.selected = null; Inspector.el('jr-content').innerHTML = ''; Inspector.el('jr-copy-text').value = ''; Inspector.renderSelection(); Inspector.root.querySelector('[data-segment="' + id + '"] button').focus(); };
        Inspector.el('jr-previous').onclick = function(){ var i = Inspector.model.rows.indexOf(Inspector.current()); if(i > 0) Inspector.select(Inspector.model.rows[i - 1].id); };
        Inspector.el('jr-next').onclick = function(){ var i = Inspector.model.rows.indexOf(Inspector.current()); if(i < Inspector.model.rows.length - 1) Inspector.select(Inspector.model.rows[i + 1].id); };
        Inspector.root.querySelectorAll('[data-view]').forEach(function(button){ button.onclick = function(){ Inspector.view = button.dataset.view; Inspector.renderContent(); }; });
        Inspector.root.querySelector('.jr-tabs').onkeydown = function(event){
            var names = ['decoded', 'hex', 'text']; if(['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) < 0) return;
            event.preventDefault(); var i = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (names.indexOf(Inspector.view) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
            Inspector.view = names[i]; Inspector.renderContent(); Inspector.el('jr-tab-' + Inspector.view).focus();
        };
        Inspector.el('jr-inspect-extra').onclick = function(){ var row = Inspector.tail(); if(row) Inspector.select(row.id, true); };
        Inspector.el('jr-download').onclick = function(){
            var row = Inspector.current(); if(!row) return false;
            if(typeof row.contentId === 'undefined') row.contentId = ContentView.register(Inspector.content(row));
            var success = ContentView.download(row.contentId, this, ContentView.requestId);
            if(success) row.downloadURL = this.href;
            return success;
        };
        Inspector.el('jr-download-huffman').onclick = function(){ return Inspector.downloadHuffman(this); };
        Inspector.el('jr-download-symbols').onclick = Inspector.downloadScanSymbols;
        Inspector.el('jr-export').onclick = function(){
            if(!Inspector.model) return false;
            function csv(value){ return '"' + String(value).replace(/"/g, '""') + '"'; }
            var lines = ['Index,Segment,Description,Offset,Total bytes,Status'];
            Inspector.model.rows.forEach(function(row, i){ lines.push([i + 1, csv(row.code), csv(row.name), row.start, row.size, csv(row.status)].join(',')); });
            var blob = new Blob([lines.join('\r\n')], {type: 'text/csv;charset=utf-8'});
            if(navigator.msSaveBlob) { navigator.msSaveBlob(blob, this.download); return false; }
            if(!Inspector.csvURL) { Inspector.csvURL = window.URL.createObjectURL(blob); ContentView.downloadURLs.push(Inspector.csvURL); }
            this.href = Inspector.csvURL; return true;
        };
        Inspector.el('jr-copy').onclick = Inspector.copyBytes;
        Inspector.prepareDrop();
        document.addEventListener('keydown', function(event){ if(event.key === 'Escape') { Inspector.clearDrag(); ContentView.hideOverlay(); } });
        if(typeof Workspaces !== 'undefined') Workspaces.init();
        Inspector.reset();
        // Keep site-owner branding customizations, which are intentionally untracked.
        Branding.load('branding-bottom');
    }
}

Inspector.root=undefined;
Inspector.model=null;
Inspector.file=null;
Inspector.selected=null;
Inspector.view='decoded';
Inspector.hovered=null;
Inspector.highlighted=null;
Inspector.highlightTimer=undefined;
Inspector.csvURL=null;
Inspector.initialized=false;
Inspector.dropRequestId=0;
Inspector.symbolRequest=0;
Inspector.dragDepth=0;
Inspector.DEFAULT_HINT='Hover for byte ranges. Click a region to highlight its segments.';
Inspector.DEFAULT_STATUS='Offsets in bytes · sizes include headers where present';
Inspector.GROUP_HINTS={
    soi:'Marks the beginning of an image stream.',
    headers:'Headers describe dimensions, compression settings and metadata needed to interpret the picture.',
    image:'Encoded image data contains the compressed picture, rather than directly viewable pixels.',
    eoi:'Marks the end of an image stream. Any later bytes are shown separately.',
    extra:'Extra data follows the confirmed end of the image stream. Its purpose is unknown.',
    unparsed:'Unparsed data contains bytes whose role could not be verified.'
};
Inspector.MARKER_HINTS={
    d8:'Begins a JPEG or JPEG-LS image.',
    d9:'Ends the image stream. Any later bytes are shown separately.',
    da:'A scan is a pass of compressed picture data; this header describes which channels and detail it contains.',
    db:'Controls how much fine image detail is discarded during compression. The table number is an identifier used by other headers.',
    c4:'Maps short bit patterns to numbers used when decoding the compressed picture. DC describes block-average differences (or lossless prediction differences); AC describes variation within blocks. The table number is an identifier used by scan headers.',
    cc:'Supplies settings for a compression method that represents symbols using probability estimates.',
    dc:'Supplies the image height when it was omitted from the frame header.',
    dd:'Sets how often compressed picture sections can restart decoding independently.',
    de:'Describes an image stored using multiple resolution stages.',
    df:'Specifies how to expand a reference image channel for hierarchical decoding.',
    fe:'Stores a comment written by the camera or other software.',
    f8:'Supplies JPEG-LS compression settings, mapping tables or large image dimensions.',
    '4f':'Begins a raw JPEG 2000 image stream.',
    '51':'Describes the JPEG 2000 image dimensions, tiles (rectangular image sections) and channels.',
    '52':'Supplies default compression settings for JPEG 2000 image data.',
    '53':'Supplies compression settings for one JPEG 2000 brightness or color channel.',
    '5c':'Supplies default quantization settings, which control how precisely image detail is retained.',
    '5d':'Supplies quantization settings for one brightness or color channel.',
    '5e':'Identifies settings for retaining more detail in a region of interest.',
    '5f':'Changes the order in which image quality, resolution and channels are delivered.',
    '55':'Lists lengths of tile parts, which are sections of the compressed image.',
    '57':'Lists compressed packet lengths in the main header. Packets group image detail for decoding.',
    '58':'Lists compressed packet lengths for a tile part (a section of the image).',
    '60':'Stores packet headers together in the main image header instead of beside the picture data.',
    '61':'Stores packet headers together in a tile-part header instead of beside the picture data.',
    '90':'Begins a stored section of a rectangular image tile.',
    '91':'Marks the beginning of a compressed image packet.',
    '92':'Marks the end of instructions for a compressed packet.',
    '93':'Compressed JPEG 2000 tile data follows this marker.',
    '63':'Describes how the brightness or color channels line up on the image grid.',
    '64':'Stores a comment inside the JPEG 2000 stream.'
};
Inspector.FIELD_HINTS={
    markerid:'The special byte sequence identifying this marker. The prefix 0x means the number is written in hexadecimal (base 16).',
    offset:'Byte position counted from zero at the beginning of the file.',
    startsatbyte:'Byte position where this region begins, counted from zero at the beginning of the file.',
    size:'The number of stored bytes in this region. A byte is a unit of data containing eight bits.',
    identifiedpurpose:'Whether the role of these bytes could be determined. Unknown does not establish whether they can be discarded.',
    version:'The version of the format recorded by the software that wrote this segment.',
    units:'Units for the horizontal and vertical density: no physical unit means pixel aspect ratio; other values use pixels per inch or centimeter.',
    xdensity:'Horizontal pixel density in the recorded units. Without physical units, its ratio to Y Density describes pixel shape.',
    ydensity:'Vertical pixel density in the recorded units. Without physical units, its ratio to X Density describes pixel shape.',
    thumbnailpixels:'Width × height, in pixels, of the small preview image stored inside this segment.',
    thumbnailsize:'The number of bytes used by the embedded small preview image.',
    thumbnail:'Whether this segment contains a small preview image in addition to the main picture.',
    packedrgbthumbnail:'Small preview stored as red, green and blue (RGB) byte values for each pixel.',
    availablebytes:'Bytes still present in this field. They may be incomplete or have an unknown purpose.',
    dataprecisionbitssample:'Number of bits used for one brightness or color sample. More bits allow more distinct sample values.',
    imagewidth:'Number of pixels across the image.',
    imageheight:'Number of pixels from top to bottom of the image.',
    components:'Number and names of the separately stored brightness or color channels used to form the picture.',
    componentid:'Identifier used by other headers to refer to this brightness or color channel.',
    samplingfactors:'Relative horizontal and vertical sample counts for this channel. Color channels may be stored at lower resolution than brightness.',
    quantizationtable:'Identifier of the table of compression divisors used for this channel. Larger divisors discard more image detail.',
    actable:'Identifier of the Huffman decoding table for AC values, which describe variation within image blocks.',
    dctable:'Identifier of the Huffman decoding table for DC differences (block averages), or prediction differences in lossless JPEG.',
    mappingtable:'Identifier of a JPEG-LS table that maps decoded sample values to output values. Zero means no mapping table.',
    startofspectralpredictiveselection:'In DCT JPEG, the first frequency position included in this scan (0 is the block average). In lossless JPEG, this selects the prediction rule.',
    endofspectralselection:'The last frequency position included in this scan. DCT blocks have positions 0–63, from the block average toward finer detail.',
    successiveapproximatebitpositions:'Two packed settings for progressive detail: the upper four bits give the previous bit level and the lower four give the new level. Lossless JPEG uses the lower part as a point transform.',
    nearlosslesserrorlimit:'Largest allowed difference between an original and decoded sample in JPEG-LS. Zero means exact, lossless reconstruction.',
    interleavemode:'How JPEG-LS channels are mixed in the stored data: 0 = separate scans, 1 = line by line, 2 = sample by sample.',
    pointtransform:'Number of low-order sample bits omitted before coding, reducing the precision of the reconstructed values.',
    entropycodeddatadestuffed:'Derived compressed data with JPEG byte-stuffing removed. Stuffing is an extra zero byte inserted after FF to distinguish data from markers. Use the stored-data rows for the original file bytes.',
    jpeglscodeddatabitstuffed:'JPEG-LS compressed picture bytes, retaining the inserted bits that distinguish picture data from marker sequences.',
    precision:'Number of bits used to store each quantization-table value, rather than the number of bits in a picture pixel.',
    entries:'Number of values stored in this decoding table.',
    tableclass:'DC tables decode block-average differences (or lossless prediction differences). AC tables decode variations within a block.',
    symbols:'Number of symbol values in this Huffman table. Symbols describe how to read compressed picture values.',
    codesperlength116:'Sixteen counts: how many Huffman codes use 1 bit, then 2 bits, through 16 bits. Shorter codes represent more frequent symbols.',
    dctencodeversion:'Version recorded by the Adobe encoder. DCT (discrete cosine transform) describes image blocks as broad patterns and fine detail.',
    flags0:'First set of Adobe application flags. The number stores individual on/off settings; it is not a pixel value.',
    flags1:'Second set of Adobe application flags. The number stores individual on/off settings; it is not a pixel value.',
    colortransform:'Adobe color interpretation: 0 = unspecified (possibly RGB or CMYK), 1 = brightness plus two color-difference channels (YCbCr), 2 = those channels plus black (YCCK).',
    id:'Identifier selecting the type of JPEG-LS extension parameters in this segment.',
    maximum:'Largest sample value used by JPEG-LS when compressing the picture.',
    t1:'First JPEG-LS threshold for grouping neighboring brightness differences during compression.',
    t2:'Second JPEG-LS threshold for grouping neighboring brightness differences during compression.',
    t3:'Third JPEG-LS threshold for grouping neighboring brightness differences during compression.',
    reset:'Interval at which JPEG-LS updates its running compression statistics.',
    table:'Identifier of the JPEG-LS sample-mapping table stored in this extension.',
    width:'JPEG-LS dimension width in pixels, or bytes per mapping-table entry when this extension contains a mapping table.',
    height:'JPEG-LS image height in pixels.',
    exifversion:'Version of EXIF (Exchangeable Image File Format), the metadata format used for camera and image details.',
    flashpixversion:'Version of the FlashPix image format recorded in the metadata.',
    colorspace:'The color system used to interpret the image values, such as sRGB (a common display color space).',
    pixelxdimension:'Recorded width of the main picture in pixels.',
    pixelydimension:'Recorded height of the main picture in pixels.',
    componentsconfiguration:'Order and type of image channels, such as brightness (Y) and color differences (Cb and Cr).',
    compressedbitsperpixel:'Recorded average number of compressed bits per pixel, rather than decoded color depth.',
    makernote:'Camera-manufacturer metadata with a device-specific layout; it may contain undecoded binary data.',
    usercomment:'A comment recorded in EXIF metadata; a character-encoding prefix may precede the text.',
    relatedsoundfile:'Name of an audio file associated with this picture.',
    datetimeoriginal:'Recorded time the picture was taken. A time zone may not be included.',
    datetimedigitized:'Recorded time the picture was converted to digital form. A time zone may not be included.',
    datetime:'Recorded modification date and time. A time zone may not be included.',
    subsectime:'Fractional seconds associated with the recorded modification time.',
    subsectimeoriginal:'Fractional seconds associated with the time the picture was taken.',
    subsectimedigitized:'Fractional seconds associated with the digitization time.',
    exposuretime:'How long the sensor collected light, measured in seconds. A fraction such as 1/125 is a shutter speed.',
    fnumber:'Lens aperture as an f-number, such as f/2.8. Smaller numbers describe a wider opening.',
    exposureprogram:'Camera program used to choose exposure settings, such as manual or aperture priority.',
    spectralsensitivity:'Recorded description of which wavelengths of light the camera responds to.',
    isospeedratings:'Camera light-sensitivity setting. Higher ISO usually brightens the result and can increase visible noise.',
    oecf:'Optoelectronic conversion function: recorded relationship between incoming light and the camera output values.',
    shutterspeedvalue:'Shutter speed expressed on the logarithmic APEX scale, rather than directly in seconds.',
    aperturevalue:'Lens opening expressed on the logarithmic APEX scale, rather than directly as an f-number.',
    brightnessvalue:'Scene brightness recorded on the logarithmic APEX exposure scale.',
    exposurebias:'Exposure compensation in stops: positive values request a brighter image; negative values request a darker image.',
    maxaperturevalue:'Largest lens opening expressed on the logarithmic APEX scale; this corresponds to the smallest f-number.',
    subjectdistance:'Recorded distance from the camera to the subject, in meters.',
    meteringmode:'How the camera measured scene brightness to choose an exposure.',
    lightsource:'Type of illumination recorded by the camera, such as daylight or fluorescent light.',
    flash:'Recorded flash firing status and related flash settings.',
    subjectarea:'Recorded location and extent of the main subject within the image, in pixel coordinates.',
    focallength:'Lens focal length in millimeters; it affects how wide or narrow the field of view is.',
    flashenergy:'Recorded flash output in beam candle power seconds, a measure of emitted light.',
    spatialfrequencyresponse:'Recorded description of how well the camera captures fine patterns and detail.',
    focalplanexresolution:'Horizontal sensor sampling density, in the units given by FocalPlaneResolutionUnit.',
    focalplaneyresolution:'Vertical sensor sampling density, in the units given by FocalPlaneResolutionUnit.',
    focalplaneresolutionunit:'Physical unit used by the horizontal and vertical sensor sampling-density fields.',
    subjectlocation:'Recorded position of the main subject in image pixel coordinates.',
    exposureindex:'Recorded sensitivity or exposure index selected when taking the picture.',
    sensingmethod:'Type and arrangement of the camera sensor.',
    filesource:'Recorded source of the image; DSC means digital still camera.',
    scenetype:'Recorded origin of the scene, commonly a directly photographed image.',
    cfapattern:'Color filter array: arrangement of red, green and blue filters over sensor pixels.',
    customrendered:'Whether the camera reports special processing of the picture.',
    exposuremode:'Whether exposure was chosen automatically, manually or with automatic exposure bracketing.',
    whitebalance:'How the camera adjusted colors for the lighting, automatically or manually.',
    digitalzoomratio:'Amount of digital enlargement recorded by the camera; this differs from optical lens zoom.',
    focallengthin35mmfilm:'Lens focal length expressed as the equivalent on a 35 mm film camera, for comparing field of view.',
    scenecapturetype:'Camera scene setting, such as standard, landscape, portrait or night.',
    gaincontrol:'Recorded adjustment to signal amplification, which changes brightness and noise.',
    contrast:'Camera-reported adjustment to the difference between light and dark tones.',
    saturation:'Camera-reported adjustment to color intensity.',
    sharpness:'Camera-reported adjustment to edge emphasis.',
    devicesettingdescription:'Device-specific description of camera settings used for the picture.',
    subjectdistancerange:'Broad subject-distance category recorded by the camera, such as macro or distant view.',
    imageuniqueid:'Identifier assigned to the image in metadata; it does not prove authenticity.',
    bitspersample:'Number of bits used to represent one brightness or color-channel value.',
    compression:'Method used to encode the stored image or thumbnail.',
    photometricinterpretation:'How stored channel values should be interpreted as brightness or colors.',
    orientation:'Rotation or mirroring instructions for displaying the picture upright.',
    samplesperpixel:'Number of channel values per pixel, such as three for red, green and blue.',
    planarconfiguration:'Whether channel values are mixed pixel by pixel or stored in separate channel planes.',
    ycbcrsubsampling:'How much the color-difference channels are reduced in resolution compared with brightness.',
    ycbcrpositioning:'Where reduced-resolution color samples line up relative to brightness samples.',
    xresolution:'Recorded horizontal pixel density, using ResolutionUnit; this does not change the stored image width.',
    yresolution:'Recorded vertical pixel density, using ResolutionUnit; this does not change the stored image height.',
    resolutionunit:'Physical unit, such as inches or centimeters, for the recorded pixel density.',
    stripoffsets:'Byte positions of image strips (groups of pixel rows) inside the metadata image.',
    rowsperstrip:'Number of pixel rows grouped into each stored image strip.',
    stripbytecounts:'Number of stored bytes in each image strip.',
    jpeginterchangeformat:'Byte position of an embedded JPEG thumbnail, measured from the start of the TIFF metadata.',
    jpeginterchangeformatlength:'Number of bytes occupied by the embedded JPEG thumbnail.',
    jpegifoffset:'Byte position of an embedded JPEG thumbnail, measured from the start of the TIFF metadata.',
    jpegifbytecount:'Number of bytes occupied by the embedded JPEG thumbnail.',
    transferfunction:'Recorded conversion from stored sample numbers to brightness values.',
    whitepoint:'Color coordinates defining which color should be treated as neutral white.',
    primarychromaticities:'Color coordinates defining the red, green and blue primary colors.',
    ycbcrcoefficients:'Weights used to convert red, green and blue values into brightness and color differences.',
    referenceblackwhite:'Reference sample values used for black and white when interpreting image channels.',
    imagedescription:'Text description of the image recorded in metadata.',
    make:'Recorded manufacturer of the camera or device.',
    model:'Recorded camera or device model.',
    software:'Name or version of the software that wrote the image metadata.',
    artist:'Recorded creator or photographer name.',
    copyright:'Copyright or rights statement recorded in the image metadata.',
    gpsversionid:'Version of the GPS (Global Positioning System) metadata format.',
    gpslatituderef:'Whether the recorded latitude is north (N) or south (S) of the equator.',
    gpslatitude:'Recorded position north or south of the equator, as degrees, minutes and seconds. GPSLatitudeRef gives the direction.',
    gpslongituderef:'Whether the recorded longitude is east (E) or west (W) of the prime meridian.',
    gpslongitude:'Recorded position east or west of the prime meridian, as degrees, minutes and seconds. GPSLongitudeRef gives the direction.',
    gpsaltituderef:'Whether the recorded altitude is above (0) or below (1) sea level.',
    gpsaltitude:'Recorded height in meters relative to sea level. GPSAltitudeRef indicates above or below.',
    gpstimestamp:'Recorded GPS time as hours, minutes and seconds in UTC (Coordinated Universal Time).',
    gpssatellites:'Description of the satellites used for the recorded GPS measurement.',
    gpsstatus:'GPS measurement status: A means a measurement was in progress; V means it was unavailable.',
    gpsmeasuremode:'Whether the recorded GPS measurement used a two-dimensional or three-dimensional position fix.',
    gpsdop:'Dilution of precision: a measure of how satellite geometry affects GPS accuracy. Smaller values generally indicate better precision.',
    gpsspeedref:'Unit of recorded speed: K = kilometers per hour, M = miles per hour, N = knots.',
    gpsspeed:'Recorded speed of the GPS receiver, in the units specified by GPSSpeedRef.',
    gpstrackref:'Whether the direction of travel uses true north (T) or magnetic north (M) as its reference.',
    gpstrack:'Recorded direction of travel in degrees, relative to the north reference in GPSTrackRef.',
    gpsimgdirectionref:'Whether the direction the camera faces uses true north (T) or magnetic north (M).',
    gpsimgdirection:'Recorded direction the camera faces, in degrees from the north reference in GPSImgDirectionRef.',
    gpsmapdatum:'Coordinate reference system used for the GPS location, such as WGS-84.',
    gpsdestlatituderef:'Whether the destination latitude is north (N) or south (S) of the equator.',
    gpsdestlatitude:'Recorded destination latitude as degrees, minutes and seconds; GPSDestLatitudeRef gives the direction.',
    gpsdestlongituderef:'Whether the destination longitude is east (E) or west (W) of the prime meridian.',
    gpsdestlongitude:'Recorded destination longitude as degrees, minutes and seconds; GPSDestLongitudeRef gives the direction.',
    gpsdestbearingref:'Whether the direction toward the destination uses true north (T) or magnetic north (M).',
    gpsdestbearing:'Recorded direction toward the destination in degrees, using GPSDestBearingRef as the north reference.',
    gpsdestdistanceref:'Unit of distance to the destination: K = kilometers, M = miles, N = nautical miles.',
    gpsdestdistance:'Recorded distance to the destination, in the units specified by GPSDestDistanceRef.',
    gpsprocessingmethod:'Recorded method used to determine location, such as GPS, a cellular network or manual entry.',
    gpsareainformation:'Recorded name or description of the area associated with the location.',
    gpsdatestamp:'Recorded GPS date in UTC (Coordinated Universal Time), in year:month:day form.',
    gpsdifferential:'Whether differential GPS corrections were used to improve location accuracy: 0 = no, 1 = yes.'
};
