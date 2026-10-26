/*	This work is licensed under Creative Commons GNU LGPL License.

	License: http://creativecommons.org/licenses/LGPL/2.1/
   Version: 0.10
	Author:  Stefan Goessner/2006, Henrik Ingo/2013
	Web:     https://github.com/henrikingo/xml2json
*/

/**
 * Convert XML DOM nodes to JSON while preserving metadata text.
 */
class XMLConverter{
    static err(msg){
        alert("Error: " + msg);
    }

    static toObj(xml,parent){
        if(xml.nodeType==9) // document.node
            return XMLConverter.toObj(xml.documentElement, parent);

        var o = Object.create(null);

        if(   !parent                    // no parent = root element = first step in recursion
            || parent instanceof Array ){ // if parent is an Array, we cannot add attributes to it, so handle it with similar extra step as a root element
            if(xml.nodeType==1) { // element node
                o[xml.nodeName] = XMLConverter.toObj(xml, o);
            }
            else
                XMLConverter.err("unhandled node type: " + xml.nodeType);
            return o;
        }

        // second and following recursions
        if(xml.nodeType==1) {   // element node ..

            if(xml.attributes.length)   // element with attributes  ..
                for(var i=0; i<xml.attributes.length; i++)
                    parent[xml.nodeName+"@"+xml.attributes[i].nodeName] = xml.attributes[i].nodeValue;

            if(xml.firstChild) { // element has child nodes. Figure out some properties of it's structure, to guide us later.
                var textChild=0, cdataChild=0, hasElementChild=false, needsArray=false;
                var elemCount = Object.create(null);
                var textNodes=0;
                for(var n=xml.firstChild; n; n=n.nextSibling){
                    if(n.nodeType==1) {
                        hasElementChild = true;
                        elemCount[n.nodeName] = (elemCount[n.nodeName] ? elemCount[n.nodeName] + 1 : 1);
                        if( elemCount[n.nodeName] > 1 ) needsArray=true;
                    }
                    else if(n.nodeType==3) {
                        textNodes++;
                        if(n.nodeValue.match(/[^ \f\n\r\t\v]/)) textChild++;
                    }
                    else if(n.nodeType==4) cdataChild++; // cdata section node
                }
                if(!hasElementChild || XMLConverter.preserveSpace(xml)) textChild=textNodes;
                if(hasElementChild && textChild) needsArray=true;
                if(hasElementChild && cdataChild) needsArray=true;
                if(textChild && cdataChild) needsArray=true;
                if(cdataChild > 1) needsArray=true;

                if(hasElementChild && !needsArray) { // Neatly structured and unique child elements, no plain text/cdata in the mix
                    XMLConverter.removeWhite(xml);
                    for(var n=xml.firstChild; n; n=n.nextSibling){
                        if(n.nodeType == 7 || n.nodeType == 8) continue; // PI or comment
                        if(n.nodeType == 3)  // text node
                            o["#text"] = n.nodeValue;
                        else if(n.nodeType == 4)  // cdata node
                            o["#cdata"] = n.nodeValue;
                        else if(o[n.nodeName]) {  // multiple occurence of element ..
                            if(o[n.nodeName] instanceof Array)
                                o[n.nodeName][o[n.nodeName].length] = XMLConverter.toObj(n, o);
                            else
                                o[n.nodeName] = [o[n.nodeName], XMLConverter.toObj(n, o)];
                        }
                        else  // first occurence of element..
                            o[n.nodeName] = XMLConverter.toObj(n, o);
                    }
                }
                else if( needsArray ) {
                    o = [];
                    XMLConverter.removeWhite(xml);
                    for(var n=xml.firstChild; n; n=n.nextSibling){
                        if(n.nodeType == 7 || n.nodeType == 8) continue; // PI or comment
                        if(n.nodeType == 3)  // text node
                            o[o.length] = n.nodeValue;
                        else if(n.nodeType == 4)  // cdata node
                            o[o.length] = { "#cdata" : n.nodeValue };
                        else  { // element
        /*                           // at least in browser, cannot create new object with value of a variable as key
                            var newObj = {};
                            // must set the key here separately
                            newObj[n.nodeName] = X.toObj(n, o);
                            o[o.length] = newObj; // push
        */
                            o[o.length] = XMLConverter.toObj(n, o); //push
                        }
                    }
                }
                else if(textChild) { // pure text
                    o = xml.textContent;
                }
                else if(cdataChild) { // single cdata
                    XMLConverter.removeWhite(xml);
                    for(var n=xml.firstChild; n; n=n.nextSibling)
                    if(n.nodeType == 4) o["#cdata"] = n.nodeValue;
                }
            }

            //if (!xml.attributes.length && !xml.firstChild) o = null;
            if(!xml.firstChild) o = null;

        }
        else
            XMLConverter.err("unhandled node type: " + xml.nodeType);

        return o;
    }

    static toJson(o,ind){
        return JSON.stringify(o, null, '\t');
    }

    static innerXml(node){
        var s = ""
        if("innerHTML" in node)
            s = node.innerHTML;
        else {
            var asXml = function(n){
                var s = "";
                if(n.nodeType == 1) {
                    s += "<" + n.nodeName;
                    for(var i=0; i<n.attributes.length;i++)
                        s += " " + n.attributes[i].nodeName + "=\"" + (n.attributes[i].nodeValue||"").toString() + "\"";
                    if(n.firstChild) {
                        s += ">";
                        for(var c=n.firstChild; c; c=c.nextSibling)
                            s += asXml(c);
                        s += "</"+n.nodeName+">";
                    }
                    else
                        s += "/>";
                }
                else if(n.nodeType == 3)
                    s += n.nodeValue;
                else if(n.nodeType == 4)
                    s += "<![CDATA[" + n.nodeValue + "]]>";
                return s;
            };
            for(var c=node.firstChild; c; c=c.nextSibling)
                s += asXml(c);
        }
        return s;
    }

    static escape(txt){
        return txt.replace(/[\\]/g, "\\\\")
            .replace(/[\"]/g, '\\"')
            .replace(/[\n]/g, '\\n')
            .replace(/[\r]/g, '\\r');
    }

    static removeWhite(e){
        e.normalize();
        var hasElementChild=false;
        for(var child=e.firstChild;child;child=child.nextSibling)
        if(child.nodeType==1) hasElementChild=true;
        var preserve=XMLConverter.preserveSpace(e);
        for(var n = e.firstChild; n; ){
            if(n.nodeType == 3) {  // text node
                if(hasElementChild && !preserve && !n.nodeValue.match(/[^ \f\n\r\t\v]/)) {
                    var nxt = n.nextSibling;
                    e.removeChild(n);
                    n = nxt;
                }
                else
                    n = n.nextSibling;
            }
            else if(n.nodeType == 1) {  // element node
                XMLConverter.removeWhite(n);
                n = n.nextSibling;
            }
            else                      // any other node
                n = n.nextSibling;
        }
        return e;
    }

    static preserveSpace(e){
        for(var node=e;node;node=node.parentNode){
            if(!node.attributes) continue;
            for(var i=0;i<node.attributes.length;i++)
            if(node.attributes[i].nodeName==='xml:space') return node.attributes[i].nodeValue==='preserve';
        }
        return false;
    }

    static parseXml(xmlString){
        return new DOMParser().parseFromString(xmlString,'text/xml');
    }

    static stringify(xml,tab){
        if(xml.nodeType == 9) // document node
            xml = xml.documentElement;
        var o = XMLConverter.toObj(XMLConverter.removeWhite(xml));
        var json = XMLConverter.toJson(o, "");
        // If tab given, do pretty print, otherwise remove white space
        return (tab ? json.replace(/\t/g, tab) : json.replace(/\t|\n/g, ""));
    }
}

if(typeof module!=='undefined' && module.exports) module.exports=XMLConverter;
