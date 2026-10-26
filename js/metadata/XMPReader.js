// Adapted from https://github.com/dschanoeh/exif-js

/**
 * Read UTF-8 XMP packets and repair missing namespace declarations.
 */
class XMPReader{
    // The browser loads the converter later in the script list.
    static get XMLConverter(){
        if(typeof module!=='undefined' && module.exports) return require('./XMLConverter');
        return XMLConverter;
    }

    // Resolve the shared debug flag when used, avoiding a circular module import.
    static get debug(){
        if(typeof module!=='undefined' && module.exports) return require('./EXIF').debug;
        return EXIF.debug;
    }

    static parseDocument(xmpString){
        try {
            var xml = new DOMParser().parseFromString(xmpString, 'text/xml');
            if(!xml || !xml.documentElement) return;
            // Firefox uses a dedicated namespace for parse failures, while
            // Chromium exposes a parsererror document in the XHTML namespace.
            // Only treat parsererror as special when it is the document root;
            // legitimate metadata may contain an element with that local name.
            if((xml.documentElement.localName || xml.documentElement.nodeName) === 'parsererror') return;
            var errors=xml.getElementsByTagName('parsererror');
            for(var index=0;index<errors.length;index++)
            if(errors[index].namespaceURI==='http://www.mozilla.org/newlayout/xml/parsererror.xml') return;
            return xml;
        } catch(error){
            // A malformed optional packet must not prevent other metadata from loading.
            return;
        }
    }

    static repairNamespaces(xmpString){
        // Locate the opening root tag, skipping XML declarations, packet PIs and comments.
        // Quoted attributes may contain '>', so they must be matched as complete values.
        var rootMatch = /^(?:\s|<\?[\s\S]*?\?>|<!--[\s\S]*?-->)*<([A-Za-z_][\w.:-]*)(?=\s|\/?>)((?:[^"'<>]|"[^"]*"|'[^']*')*)>/.exec(xmpString);
        if(!rootMatch) return;
        var rootAttributes = rootMatch[2];
        var insertionOffset = rootMatch[0].length - rootAttributes.length - 1;
        // Some encoders omit namespace declarations which the XML parser requires.
        var namespaces = [
            ['Iptc4xmpCore', 'http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/'],
            ['xsi', 'http://www.w3.org/2001/XMLSchema-instance'],
            ['tiff', 'http://ns.adobe.com/tiff/1.0/'],
            ['plus', 'http://schemas.android.com/apk/lib/com.google.android.gms.plus'],
            ['ext', 'http://www.gettyimages.com/xsltExtension/1.0'],
            ['exif', 'http://ns.adobe.com/exif/1.0/'],
            ['stEvt', 'http://ns.adobe.com/xap/1.0/sType/ResourceEvent#'],
            ['stRef', 'http://ns.adobe.com/xap/1.0/sType/ResourceRef#'],
            ['crs', 'http://ns.adobe.com/camera-raw-settings/1.0/'],
            ['xapGImg', 'http://ns.adobe.com/xap/1.0/g/img/'],
            ['Iptc4xmpExt', 'http://iptc.org/std/Iptc4xmpExt/2008-02-29/']
        ];
        var attributePattern = /\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"[^"]*"|'[^']*')/g;
        var declarations = {};
        var attribute;
        while((attribute = attributePattern.exec(rootAttributes)) !== null){
            declarations[attribute[1]] = true;
        }
        var missingNamespaces = '';
        for(var namespaceIndex = 0; namespaceIndex < namespaces.length; namespaceIndex++){
            var namespacePrefix = namespaces[namespaceIndex][0];
            if(!declarations['xmlns:' + namespacePrefix]) {
                missingNamespaces += ' xmlns:' + namespacePrefix + '="' + namespaces[namespaceIndex][1] + '"';
            }
        }
        if(!missingNamespaces) return;
        return xmpString.slice(0, insertionOffset) + missingNamespaces + xmpString.slice(insertionOffset);
    }

    static findInJPEG(file){
        if(typeof DOMParser!=='function') return;

        var signature = "http://ns.adobe.com/xap/1.0/\0";
        var result = XMPReader.JPEGMetadata.findSegment(file, 0xE1, function(dataView, payloadStart, payloadLength){
            if(payloadLength < signature.length || XMPReader.BinaryUtils.readString(dataView, payloadStart, signature.length) !== signature) return;

            var xmpString = XMPReader.BinaryUtils.readUTF8String(dataView, payloadStart + signature.length, payloadLength - signature.length);
            if(typeof xmpString === 'undefined') return;
            var xml = XMPReader.parseDocument(xmpString);
            if(!xml) {
                var repaired = XMPReader.repairNamespaces(xmpString);
                if(typeof repaired === 'undefined') return;
                xml = XMPReader.parseDocument(repaired);
            }
            if(xml) return XMPReader.toObject(xml);
        });
        return result;
    }

    static toObject(xml){
        try {
            var item=xml.documentElement || xml;
            if(item.nodeType!==1) return;
            var obj=Object.create(null);
            for(var index=0;index<item.attributes.length;index++){
                var attribute=item.attributes[index];
                obj[attribute.nodeName]=attribute.nodeValue;
            }
            obj[item.nodeName]=XMPReader.XMLConverter.stringify(item);
            return obj;
        } catch(e){
            if(XMPReader.debug) console.log(e.message);
        }
    }
}

if(typeof module!=='undefined' && module.exports){
    XMPReader.BinaryUtils=require('../util/BinaryUtils');
    XMPReader.JPEGMetadata=require('./JPEGMetadata');
}else{
    XMPReader.BinaryUtils=BinaryUtils;
    XMPReader.JPEGMetadata=JPEGMetadata;
}

if(typeof module!=='undefined' && module.exports) module.exports=XMPReader;
