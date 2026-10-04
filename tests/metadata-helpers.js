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

function domNode(model) {
    const node = { ...model, localName: model.nodeName.split(':').pop() };
    node.attributes = model.attributes || [];
    node.childNodes = (model.childNodes || []).map(domNode);
    const relink = () => {
        node.firstChild = node.childNodes[0] || null;
        node.childNodes.forEach((child, i) => { child.nextSibling = node.childNodes[i + 1] || null; child.parentNode=node; });
        node.children = node.childNodes.filter(child => child.nodeType === 1);
        Object.defineProperty(node.children, 'item', { value: index => node.children[index] });
    };
    relink();
    node.normalize = () => {
        for (let i = node.childNodes.length - 1; i > 0; i--) {
            const previous = node.childNodes[i - 1], current = node.childNodes[i];
            if (previous.nodeType === 3 && current.nodeType === 3) {
                previous.nodeValue += current.nodeValue;
                node.childNodes.splice(i, 1);
            }
        }
        node.childNodes.forEach(child => child.normalize());
        relink();
    };
    node.removeChild = child => {
        node.childNodes.splice(node.childNodes.indexOf(child), 1);
        relink();
    };
    node.getElementsByTagName = name => node.childNodes.flatMap(child => [
        ...(child.nodeType === 1 && child.nodeName === name ? [child] : []), ...child.getElementsByTagName(name)
    ]);
    if (node.nodeType === 9) node.documentElement = node.children[0];
    return node;
}

// Node has no DOMParser. On Windows, validate XML with the OS's .NET parser,
// then expose the DOM surface used by the actual XML-to-JSON converter.
class NativeDOMParser {
    parseFromString(xml) {
        const script = `
            [Console]::InputEncoding = [System.Text.Encoding]::UTF8
            [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
            function Export-XmlNode([System.Xml.XmlNode]$xmlNode) {
                @{
                    nodeType = if ($xmlNode.NodeType -in @([System.Xml.XmlNodeType]::Whitespace, [System.Xml.XmlNodeType]::SignificantWhitespace)) { 3 } else { [int]$xmlNode.NodeType }
                    nodeName = $xmlNode.Name
                    nodeValue = $xmlNode.Value
                    namespaceURI = $xmlNode.NamespaceURI
                    textContent = $xmlNode.InnerText
                    innerHTML = $xmlNode.InnerXml
                    attributes = @($xmlNode.Attributes | ForEach-Object { @{ nodeName = $_.Name; nodeValue = $_.Value } })
                    childNodes = @($xmlNode.ChildNodes | ForEach-Object { Export-XmlNode $_ })
                }
            }
            try {
                $document = [System.Xml.XmlDocument]::new()
                $document.PreserveWhitespace = $true
                $document.LoadXml([Console]::In.ReadToEnd())
                Export-XmlNode $document | ConvertTo-Json -Depth 100 -Compress
            } catch {
                @{ nodeType = 9; nodeName = '#document'; childNodes = @(@{ nodeType = 1; nodeName = 'parsererror'; namespaceURI = 'http://www.mozilla.org/newlayout/xml/parsererror.xml'; textContent = $_.Exception.Message }) } | ConvertTo-Json -Depth 5 -Compress
            }
        `;
        const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
            input: xml, encoding: 'utf8', windowsHide: true
        });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(result.stderr);
        const parsed = JSON.parse(result.stdout.replace(/^\uFEFF/, ''));
        return domNode(parsed);
    }
}

function loadEXIF(overrides = {}, realConverter = true) {
    const context = vm.createContext({
        atob, console,
        ...overrides
    });
    context.self = context;
    if (realConverter) vm.runInContext(fs.readFileSync(path.join(projectRoot, 'xml2json.min.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(projectRoot, 'exif.js'), 'utf8'), context);
    return context;
}

function readMetadata(bytes, overrides = {}, realConverter = true) {
    const context = loadEXIF(overrides, realConverter);
    const image = { src: 'data:image/jpeg;base64,' + bytes.toString('base64') };
    let called = false;
    context.EXIF.getData(image, () => { called = true; });
    if (!called) throw new Error('Metadata callback did not complete');
    return image;
}

module.exports = { projectRoot, segment, jpeg, xmpJPEG, NativeDOMParser, readMetadata, loadEXIF };
