const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const baselineJPEG = Buffer.from('/9j/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAJgABAAAAAAAAAAAAAAAAAAAAABABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwA//9k=', 'base64');

function segment(marker, payload) {
    const header = Buffer.alloc(4);
    header[0] = 0xff;
    header[1] = marker;
    header.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([header, payload]);
}

function jpeg(...segments) {
    return Buffer.concat([baselineJPEG.subarray(0, 2), ...segments, baselineJPEG.subarray(2)]);
}

function xmpJPEG(packet) {
    const bytes = Buffer.isBuffer(packet) ? packet : Buffer.from(packet, 'utf8');
    return jpeg(segment(0xe1, Buffer.concat([
        Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'ascii'), bytes
    ])));
}

function xmlDocument(name, text, attributes = []) {
    const root = { nodeName: name, localName: name.split(':').pop(), textContent: text, attributes };
    return {
        documentElement: root,
        children: { length: 1, item: () => root },
        getElementsByTagName: tag => tag === name ? [root] : []
    };
}

// Node has no DOMParser. On Windows, validate XML with the OS's .NET parser,
// then expose the small DOM surface needed by EXIF's XML conversion.
class NativeDOMParser {
    parseFromString(xml) {
        const script = `
            [Console]::InputEncoding = [System.Text.Encoding]::UTF8
            [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
            try {
                $document = [System.Xml.XmlDocument]::new()
                $document.LoadXml([Console]::In.ReadToEnd())
                $attributes = @($document.DocumentElement.Attributes | ForEach-Object {
                    @{ nodeName = $_.Name; nodeValue = $_.Value }
                })
                @{ name = $document.DocumentElement.Name; text = $document.DocumentElement.InnerText; attributes = $attributes } | ConvertTo-Json -Depth 5 -Compress
            } catch {
                @{ name = 'parsererror'; text = $_.Exception.Message; attributes = @() } | ConvertTo-Json -Compress
            }
        `;
        const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
            input: xml, encoding: 'utf8', windowsHide: true
        });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(result.stderr);
        const parsed = JSON.parse(result.stdout.replace(/^\uFEFF/, ''));
        return xmlDocument(parsed.name, parsed.text, parsed.attributes);
    }
}

function loadEXIF(overrides = {}) {
    const context = vm.createContext({
        atob, console,
        xml2json: node => JSON.stringify({ text: node.textContent }),
        ...overrides
    });
    context.self = context;
    vm.runInContext(fs.readFileSync(path.join(projectRoot, 'exif.js'), 'utf8'), context);
    return context;
}

function readMetadata(bytes, overrides = {}) {
    const context = loadEXIF(overrides);
    const image = { src: 'data:image/jpeg;base64,' + bytes.toString('base64') };
    let called = false;
    context.EXIF.getData(image, () => { called = true; });
    if (!called) throw new Error('Metadata callback did not complete');
    return image;
}

module.exports = { projectRoot, segment, jpeg, xmpJPEG, NativeDOMParser, readMetadata, loadEXIF };
