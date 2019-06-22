var Jfif={
    HEADER_SIZE: 2,
    LENGTH_BYTES_SIZE: 2,
    MARKER_PREFIX: 0xFF,
    MARKERS:[]
};


(function(){
    function header_define(id,shortname,longname,uses){
        var info = {id:id, shortname:shortname,longname:longname,uses:uses};
        Jfif.MARKERS[id]=info;
        Jfif.MARKERS[shortname]=info;
    }
    function header_defineN(min,max,diff,shortnameN,longnameN,uses){
        for(var n=min;n<=max;n++){
            var id=n;
            var shortname=shortnameN.replace("%N%",n-diff);
            var longname=longnameN.replace("%N%",n-diff);
            header_define(id,shortname,longname,uses);
        }
    }

    header_define(0x4f,"J2K-SOC","Start of Codestream","JPEG2000 Signature");
    header_define(0x90,"J2K-SOT","Start of Tile-part","");
    header_define(0x93,"J2K-SOD","Start of Data","");
    header_define(0x51,"J2K-SIZ","Image and Tile-size","");
    header_define(0x52,"J2K-COD","Coding style Default","");
    header_define(0x53,"J2K-COC","Coding style Component","");
    header_define(0x5e,"J2K-RGN","Region of Interest","");
    header_define(0x5c,"J2K-QCD","Quantization Default","");
    header_define(0x5d,"J2K-QCC","Quantization Component","");
    header_define(0x5f,"J2K-POD","Progression Order Default","");
    header_define(0x55,"J2K-TLM","Tile-part Lengths Main Header","");
    header_define(0x57,"J2K-PLM","Packet Length Main Header","");
    header_define(0x58,"J2K-PLT","Packet Length Tile-part Header","");
    header_define(0x60,"J2K-PPM","Packed Packet-headers Main Header","");
    header_define(0x61,"J2K-PPT","Packed Packet-headers Tile-part header","");
    header_define(0x91,"J2K-SOP","Start of Packet","");
    header_define(0x92,"J2K-EPH","End of Packet Header","");
    header_define(0x64,"J2K-CME","Comment and Extension","");

    header_defineN(0xc0,0xc3,0xc0,"SOF%N%","Start of DCT Frame %N%","");
    header_define(0xc4,"DHT","Huffman Table","");
    header_defineN(0xc5,0xc7,0xc0,"SOF%N%","Start of Differential Frame %N%","");
    header_define(0xc8,"JPG","Extensions","");
    header_defineN(0xc9,0xcb,0xc0,"SOF%N%","Start of Arithmetic-coding Frame %N%","");
    header_define(0xcc,"DAC","Arithmetic Coding","");
    header_defineN(0xcd,0xcf,0xc0,"SOF%N%","Start of Differential/Arithmetic Frame %N%","");
    header_defineN(0xd0,0xd7,0xd0,"RST%N%","Restart Marker %N%","");
    header_define(0xd8,"SOI","Start of Image","");
    header_define(0xd9,"EOI","End of Image/End of Codestream","");
    header_define(0xda,"SOS","Start of Scan","");
    header_define(0xdb,"DQT","Quantization Table","");
    header_define(0xdc,"DNL","Number of Lines","");
    header_define(0xdd,"DRI","Restart Interval","");
    header_define(0xde,"DHP","Hierarchical Progression","");
    header_define(0xdf,"EXP","Expand Reference Component","");

    header_define(0xe0,"APP0","Application Segment 0","JFIF Header,JFIF Extensions,Motion JPEG");
    header_define(0xe1,"APP0","Application Segment 1","EXIF,TIFF-IFD,Adobe XMP");
    header_define(0xe2,"APP2","Application Segment 2","Color Profile,FlashPix");
    header_define(0xe3,"APP3","Application Segment 3","JPS-Stereoscopic JPEG");
    header_defineN(0xe4,0xe5,0xe0,"APP%N%","Application Segment %N%","");
    header_define(0xe6,"APP6","Application Segment 6","NITF Lossless profile");
    header_defineN(0xe7,0xe9,0xe0,"APP%N%","Application Segment %N%","");
    header_define(0xea,"APP10","Application Segment 10","ActiveObject multimedia");
    header_define(0xeb,"APP11","Application Segment 11","JPEGH-HDR,HELIOS JPEG Resources,OPI Postscript");
    header_define(0xec,"APP12","Application Segment 12","Old digicam info,Photoshop Save for Web: Ducky");
    header_define(0xed,"APP13","Application Segment 13","Photoshop IRB,8BIM,IPTC");
    header_defineN(0xee,0xef,0xe0,"APP%N%","Application Segment %N%","Adobe DCT Information");

    header_defineN(0xf0,0xf6,0xf0,"JPG%N%","Extension %N%","");
    header_define(0xf7,"JPG7/SOF48","Extension 7","JPEG-LS Lossless JPEG");
    header_define(0xf8,"JPG8/LSE","Extension 8","JPEG-LS Parameters");
    header_defineN(0xf9,0xfd,0xf0,"JPG%N%","Extension %N%","");
    header_define(0xfe,"COM","Comment","");
    
    Jfif.MARKERS['J2K-EOC'] = Jfif.MARKERS['EOI'];
})();