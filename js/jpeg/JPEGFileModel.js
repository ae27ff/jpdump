/**
 * Partition the original file into exact marker, coded data and trailing byte ranges.
 */
class JPEGFileModel{
    static build(info,data){
        var size = data.length, rows = [], cursor = 0, headers = info.headers || [];
        var first = headers[0], recognized = first && first.p === 0 && first.magic === 'ff' && (first.type === 'd8' || first.type === '4f');
        var recoverable = !!(recognized || info.prefixRecovered);
        var j2k = recognized && first.type === '4f';
        var ls = recognized && !j2k && headers.some(function(h){ return h.type === 'f7'; });
        var images = info.images || [], sequence = images.length > 1;
        var format = info.format || (recognized ? (j2k ? 'JPEG 2000 codestream' : ls ? 'JPEG-LS' : 'JPEG') : 'Unrecognized format');
        var last = headers[headers.length - 1];
        var finalImage = images[images.length - 1];
        var endName = (finalImage ? finalImage.format === 'JPEG 2000 codestream' : j2k) ? 'End of Codestream' : 'End of Image';
        var confirmedEnd = !!(recognized && info.valid && !info.unparsed && last && last.type === 'd9' && last.boundaryKnown);
        function bound(value){ return Math.max(0, Math.min(size, Number(value) || 0)); }
        function add(start, end, code, name, group, header, contentStart, imageIndex){
            if(end <= start) return;
            rows.push({id: 'region-' + rows.length, start: start, end: end, size: end - start,
                code: code, name: sequence && typeof imageIndex === 'number' ? 'Image ' + (imageIndex + 1) + ' · ' + name : name,
                group: group, header: header || null, imageIndex: imageIndex,
                contentStart: Math.min(end, Math.max(start, contentStart)), contentEnd: end,
                status: header ? (header.truncated ? 'Truncated' : !header.valid ? 'Invalid structure' : header.recovered ? 'Recovered; sequence unverified' : '') : ''});
            cursor = end;
        }
        headers.forEach(function(h, index){
            if(h.magic !== 'ff' || h.p < cursor || h.p >= size) return;
            var start = bound(h.p);
            if(start > cursor) add(cursor, start, 'Unparsed data', 'Unverified bytes', 'unparsed', null, cursor);
            var end = bound(index + 1 < headers.length ? headers[index + 1].p : h.type === 'd9' && h.boundaryKnown ? h.nextp : info.nextp);
            if(end <= start) end = size;
            var prefixEnd = end;
            var scan = h.boundaryKnown && (h.type === 'da' || h.type === '93' || /^d[0-7]$/.test(h.type));
            if(scan) prefixEnd = Math.max(start, Math.min(end, bound(h.nextp)));
            var group = !h.boundaryKnown && !h.valid ? 'unparsed' : h.type === 'd9' ? 'eoi' : 'headers';
            var name = h.extendedtype === 'JFIF' ? 'JFIF' : h.desc.longname;
            var image = images[h.imageIndex], imageJ2K = image ? image.format === 'JPEG 2000 codestream' : j2k;
            var imageLS = image ? image.format === 'JPEG-LS' : ls;
            if(h.type === 'db' || h.type === 'c4') {
                var tables = JPEGTable.read(h);
                if(tables && tables.length) name = tables.map(function(table){ return h.type === 'db' ? 'Table ' + table.id : table.coding + ' · ' + table.id; }).join(', ');
            }
            add(start, prefixEnd, h.desc.shortname || 'Unknown marker', name, group, h, bound(h.contentp), h.imageIndex);
            if(scan && end > prefixEnd) add(prefixEnd, end, imageJ2K ? 'Coded data' : 'Scan data', h.recovered ? 'Unverified coded data' : imageLS ? 'JPEG-LS bit-stuffed data' : 'Stored encoded bytes', 'image', null, prefixEnd, h.imageIndex);
        });
        if(cursor < size) add(cursor, size, confirmedEnd ? 'Extra data' : 'Unparsed data', confirmedEnd ? 'After ' + endName : 'Unverified bytes', confirmedEnd ? 'extra' : 'unparsed', null, cursor);
        var groups = [], byGroup = {};
        rows.forEach(function(row){
            var group = byGroup[row.group];
            if(!group) {
                group = byGroup[row.group] = {id: row.group, rows: [], size: 0, contiguous: true};
                groups.push(group);
            }
            if(group.rows.length && group.rows[group.rows.length - 1].end !== row.start) group.contiguous = false;
            group.rows.push(row); group.size += row.size;
        });
        var mixed = sequence && images.some(function(image){ return image.format !== images[0].format; });
        var names = {headers: 'Headers', image: mixed ? 'Encoded image data' : j2k ? 'Coded image data' : 'Encoded image', eoi: mixed ? 'End markers' : j2k ? 'End of Codestream' : 'End of Image', extra: 'Extra / trailing data', unparsed: 'Unparsed data'};
        groups.forEach(function(g){ g.name = names[g.id]; });
        var ghosts = recoverable ? JPEGFileModel.missingRegions(finalImage || info, size, names, finalImage ? finalImage.format === 'JPEG 2000 codestream' : j2k) : [];
        if(info.prefixMissing) ghosts.unshift({id:'missing-prefix',group:'headers',name:'Missing prefix',ghost:true,size:null,expected:false,
            leading:true,hint:'The start of this JPEG is missing. The original prefix length and any lost header values are unknown; only stored bytes appear in the table.'});
        var frame = headers.filter(function(h){ return h.extendedtype === 'SOF'; })[0];
        return {info: info, size: size, rows: rows, groups: groups, ghosts: ghosts, format: format, j2k: j2k, recognized: recognized, recoverable:recoverable, images: images, sequence: sequence,
            confirmedEnd: confirmedEnd, parsedSize: bound(info.nextp), dimensions: info.dimensions, mixed: mixed, endName: endName,
            precision: frame && frame.extendeddata.dataprec, markerCount: rows.filter(function(r){ return !!r.header; }).length,
            interleaved: groups.some(function(g){ return !g.contiguous; })};
    }

    static missingRegions(info, size, names, j2k){
        var headers = info.headers || [], last = headers[headers.length - 1], ghosts = [];
        // Infer a tail only when traversal reaches EOF, rather than stopping at an unknown boundary.
        if(!last || (last.type === 'd9' && last.boundaryKnown) ||
            !(last.truncated || (last.boundaryKnown && info.nextp >= size))) return ghosts;
        function add(group, missingSize, hint, expected){
            ghosts.push({id: 'missing-' + ghosts.length, group: group, name: names[group], ghost: true,
                size: missingSize, expected: !!expected, hint: hint});
        }
        if(last.truncated && last.haslenbytes){
            var missing = typeof last.len === 'number' && last.nextp > size ? last.nextp - size : null;
            add('headers', missing, names.headers + ' · ' + last.desc.shortname + ' is truncated at byte ' + size +
                (missing === null ? '; its length field is incomplete.' : '; ' + missing + ' bytes missing according to its declared segment length.'));
        }
        if((!j2k && (last.type === 'da' || /^d[0-7]$/.test(last.type))) || (j2k && last.type === '93')){
            var codedMissing = null;
            if(j2k && last.boundaryKnown){
                for(var index = headers.length - 1; index >= 0; index--){
                    if(headers[index].type !== '90') continue;
                    var declaredEnd = headers[index].markerp + headers[index].tilePartLength;
                    if(declaredEnd > size) codedMissing = declaredEnd - size;
                    break;
                }
            }
            add('image', codedMissing, names.image + (codedMissing === null ?
                ' · The file ends before a terminating marker. The remaining encoded length is unknown and may be zero; additional scans or headers cannot be predicted.' :
                ' · ' + codedMissing + ' bytes missing according to the declared tile-part length. Further tile parts cannot be predicted.'));
        }
        var endCode = j2k ? 'EOC' : 'EOI';
        add('eoi', 2, names.eoi + ' · ' + endCode + ' was not found. This is an expected 2-byte marker; its final position is unknown.', true);
        return ghosts;
    }
}
