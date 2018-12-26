/* 
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */




//extend FileReader
//credit to Jack (SO 5352970)
if (!FileReader.prototype.readAsBinaryString) {
    FileReader.prototype.readAsBinaryString = function (fileData) {
        var binary = "";
        var pt = this;
        var reader = new FileReader();
        reader.onload = function (e) {
            var bytes = new Uint8Array(reader.result);
            var length = bytes.byteLength;
            for (var i = 0; i < length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            //pt.result  - readonly so assign binary
            pt.content = binary;
            //$(pt).trigger('onload');
            
            var evt = document.createEvent('Event');  
            evt.initEvent('load', false, false);  
            pt.dispatchEvent(evt);
            console.log("dispatched backported event to "+pt);
        };
        reader.readAsArrayBuffer(fileData);
    };
}



/**
 * detect IE
 * @author SpiderCode, Mario, Autom3
 * returns version of IE or false, if browser is not Internet Explorer
 */
function detectIE() {
    var ua = window.navigator.userAgent;

    var msie = ua.indexOf('MSIE ');
    if (msie > 0) {
        // IE 10 or older => return version number
        return parseInt(ua.substring(msie + 5, ua.indexOf('.', msie)), 10);
    }

    var trident = ua.indexOf('Trident/');
    if (trident > 0) {
        // IE 11 => return version number
        var rv = ua.indexOf('rv:');
        return parseInt(ua.substring(rv + 3, ua.indexOf('.', rv)), 10);
    }

    var edge = ua.indexOf('Edge/');
    if (edge > 0) {
        // Edge (IE 12+) => return version number
        return parseInt(ua.substring(edge + 5, ua.indexOf('.', edge)), 10);
    }

    // other browser
    return false;
}