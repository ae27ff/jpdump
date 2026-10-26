/**
 * Read Adobe APP14 application headers.
 */
class JPEGAdobe{
    static read(data){
        var app14={valid:false,type:"",info:null};
        if(JPEGAdobe.matches(data)){
            if(data.length < 12) return app14;
            app14.valid=true;
            app14.type="Adobe";
            app14.info=JPEGAdobe.readAdobe(data);
        }
        return app14;
    }

    static matches(content){
        return (content.substr(0,5)==="Adobe");
    }

    static readAdobe(data){
        var adobe={DCTEncodeVersion:"unknown",flags0:0,flags1:0,colorTransform:0};
        var p=5;
        adobe.DCTEncodeVersion = BinaryUtils.parseHex( BinaryUtils.wordHex(data,p) );
        adobe.flags0 = BinaryUtils.parseHex( BinaryUtils.wordHex(data,p+2) )
        adobe.flags1 = BinaryUtils.parseHex( BinaryUtils.wordHex(data,p+4) )
        adobe.colorTransform = data.charCodeAt(p+6)

        switch(adobe.colorTransform){
            case 0:
            adobe.colorTransform+=" (Unknown, possibly RGB or CMYK)";
            break;
            case 1:
            adobe.colorTransform+=" (YCbCr)";
            break;
            case 2:
            adobe.colorTransform+=" (YCCK)";
            break;
            default:
            adobe.colorTransform+=" (Unknown)";

        }
        return adobe;
    }
}
