/**
 * Names and descriptions for JPEG marker codes.
 */
class JPEGMarkers{
    static replace(hex,desc,test,original){
        if(test===hex) return {shortname:desc[0],longname:desc[1],uses:desc[2]};
        return original;
    }

    static replaceRange(min,max,diff,desc,test,original){
        //console.log(original)
        for(var n=min;n<=max;n++){
            var intermediate=JPEGMarkers.replace(BinaryUtils.byteHex(n),desc,test,original);
            //console.log(intermediate)
            intermediate.shortname=intermediate.shortname.replace("%N%",n-diff);
            intermediate.longname=intermediate.longname.replace("%N%",n-diff);
            original=intermediate;
        }
        return original;
    }

    static get(header){
        var out={shortname:"",longname:"Unknown",uses:""};

        out=JPEGMarkers.replace("4f",["J2K-SOC","Start of Codestream","JPEG2000 Signature"],header,out);
        out=JPEGMarkers.replace("90",["J2K-SOT","Start of Tile-part",""],header,out);
        out=JPEGMarkers.replace("93",["J2K-SOD","Start of Data",""],header,out);
        out=JPEGMarkers.replace("51",["J2K-SIZ","Image and Tile-size",""],header,out);
        out=JPEGMarkers.replace("52",["J2K-COD","Coding style Default",""],header,out);
        out=JPEGMarkers.replace("53",["J2K-COC","Coding style Component",""],header,out);
        out=JPEGMarkers.replace("5e",["J2K-RGN","Region of Interest",""],header,out);
        out=JPEGMarkers.replace("5c",["J2K-QCD","Quantization Default",""],header,out);
        out=JPEGMarkers.replace("5d",["J2K-QCC","Quantization Component",""],header,out);
        out=JPEGMarkers.replace("5f",["J2K-POC","Progression Order Change",""],header,out);
        out=JPEGMarkers.replace("55",["J2K-TLM","Tile-part Lengths Main Header",""],header,out);
        out=JPEGMarkers.replace("57",["J2K-PLM","Packet Length Main Header",""],header,out);
        out=JPEGMarkers.replace("58",["J2K-PLT","Packet Length Tile-part Header",""],header,out);
        out=JPEGMarkers.replace("60",["J2K-PPM","Packed Packet-headers Main Header",""],header,out);
        out=JPEGMarkers.replace("61",["J2K-PPT","Packed Packet-headers Tile-part header",""],header,out);
        out=JPEGMarkers.replace("91",["J2K-SOP","Start of Packet",""],header,out);
        out=JPEGMarkers.replace("92",["J2K-EPH","End of Packet Header",""],header,out);
        out=JPEGMarkers.replace("63",["J2K-CRG","Component Registration",""],header,out);
        out=JPEGMarkers.replace("64",["J2K-COM","Comment",""],header,out);

        out=JPEGMarkers.replaceRange(0xc0,0xc3,0xc0,["SOF%N%","Start of DCT Frame %N%",""],header,out);
        out=JPEGMarkers.replace("c4",["DHT","Huffman Table",""],header,out);
        out=JPEGMarkers.replaceRange(0xc5,0xc7,0xc0,["SOF%N%","Start of Differential Frame %N%",""],header,out);
        out=JPEGMarkers.replace("c8",["JPG","Extensions",""],header,out);
        out=JPEGMarkers.replaceRange(0xc9,0xcb,0xc0,["SOF%N%","Start of Arithmetic-coding Frame %N%",""],header,out);
        out=JPEGMarkers.replace("cc",["DAC","Arithmetic Coding",""],header,out);
        out=JPEGMarkers.replaceRange(0xcd,0xcf,0xc0,["SOF%N%","Start of Differential/Arithmetic Frame %N%",""],header,out);
        out=JPEGMarkers.replace("c3",["SOF3","Start of Lossless Frame",""],header,out);
        out=JPEGMarkers.replace("cb",["SOF11","Start of Lossless Arithmetic-coding Frame",""],header,out);
        out=JPEGMarkers.replace("c7",["SOF7","Start of Differential Lossless Frame",""],header,out);
        out=JPEGMarkers.replace("cf",["SOF15","Start of Differential Lossless Arithmetic-coding Frame",""],header,out);
        out=JPEGMarkers.replaceRange(0xd0,0xd7,0xd0,["RST%N%","Restart Marker %N%",""],header,out);
        out=JPEGMarkers.replace("d8",["SOI","Start of Image",""],header,out);
        out=JPEGMarkers.replace("d9",["EOI","End of Image",""],header,out);
        out=JPEGMarkers.replace("da",["SOS","Start of Scan",""],header,out);
        out=JPEGMarkers.replace("db",["DQT","Quantization Table",""],header,out);
        out=JPEGMarkers.replace("dc",["DNL","Number of Lines",""],header,out);
        out=JPEGMarkers.replace("dd",["DRI","Restart Interval",""],header,out);
        out=JPEGMarkers.replace("de",["DHP","Hierarchical Progression",""],header,out);
        out=JPEGMarkers.replace("df",["EXP","Expand Reference Component",""],header,out);

        out=JPEGMarkers.replace("e0",["APP0","Application Segment 0","JFIF Header,JFIF Extensions,Motion JPEG"],header,out);
        out=JPEGMarkers.replace("e1",["APP1","Application Segment 1","EXIF,TIFF-IFD,Adobe XMP"],header,out);
        out=JPEGMarkers.replace("e2",["APP2","Application Segment 2","Color Profile,FlashPix"],header,out);
        out=JPEGMarkers.replace("e3",["APP3","Application Segment 3","JPS-Stereoscopic JPEG"],header,out);
        out=JPEGMarkers.replaceRange(0xe4,0xe5,0xe0,["APP%N%","Application Segment %N%",""],header,out);
        out=JPEGMarkers.replace("e6",["APP6","Application Segment 6","NITF Lossless profile"],header,out);
        out=JPEGMarkers.replaceRange(0xe7,0xe9,0xe0,["APP%N%","Application Segment %N%",""],header,out);
        out=JPEGMarkers.replace("ea",["APP10","Application Segment 10","ActiveObject multimedia"],header,out);
        out=JPEGMarkers.replace("eb",["APP11","Application Segment 11","JPEGH-HDR,HELIOS JPEG Resources,OPI Postscript"],header,out);
        out=JPEGMarkers.replace("ec",["APP12","Application Segment 12","Old digicam info,Photoshop Save for Web: Ducky"],header,out);
        out=JPEGMarkers.replace("ed",["APP13","Application Segment 13","Photoshop IRB,8BIM,IPTC"],header,out);
        out=JPEGMarkers.replace("ee",["APP14","Application Segment 14","Adobe DCT Information"],header,out);
        out=JPEGMarkers.replace("ef",["APP15","Application Segment 15",""],header,out);

        out=JPEGMarkers.replaceRange(0xf0,0xf6,0xf0,["JPG%N%","Extension %N%",""],header,out);
        out=JPEGMarkers.replace("f7",["SOF (JPEG-LS)","Start of JPEG-LS Frame","JPEG-LS lossless and near-lossless coding"],header,out);
        out=JPEGMarkers.replace("f8",["LSE","JPEG-LS Parameters","Coding presets, mapping tables, oversized dimensions"],header,out);
        out=JPEGMarkers.replaceRange(0xf9,0xfd,0xf0,["JPG%N%","Extension %N%",""],header,out);
        out=JPEGMarkers.replace("fe",["COM","Comment",""],header,out);
        return out;
    }
}
