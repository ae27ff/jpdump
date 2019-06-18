/* 
 * Copyright (C) 2019 crashdemons (crashenator at gmail.com)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

function getSOSComponentId(id){
	if(id<1 || id>5) return id+" (Unknown)"
	var ids=["","Y","Cb","Cr","I","Q"]
	return ids[id];
}

function getSOSComponentsStr(ncomponents){
	if(compstr>4) return ncomponents+" (Unknown colorspace)"
	var types=["","grayscale","","Color YcbCr or YIQ","Color CMYK"]
	var compstr=ncomponents+" ("+types[ncomponents]+")"
	if(compstr==="") compstr=ncomponents+" (Unknown colorspace)"
	return compstr
}

function processSOS(data){
    var sos = {ncomponents:0, ncomponentsstr:"", components:[], sss:0, ess:0, sabp:0, hcdata:""};
    var p=0;
    //thanks to DCube Software Technologies for overview: http://vip.sugovica.hu/Sardi/kepnezo/JPEG%20File%20Layout%20and%20Format.htm
    //Length                        2 bytes      This must be equal to 6+2*(number of components in scan).
    //sos.scanlen = hexdec( get2bytes(data,p));
    p=-2;// the above line is an oversight, the scan length decoded here is the same as the *header length* we decode before we get here, so our next header at
    //    p+2 actually needs to be at 0

    //Number of Components in scan  1 byte        This must be >= 1 and <=4 (otherwise error), usually 1 or 3
    sos.ncomponents = data.charCodeAt(p+2);
    sos.ncomponentsstr=getSOSComponentsStr(sos.ncomponents);
    p+=3;//advance to beginning of component section [this was p=0 so this could just be p=3]


    //Each component                2 bytes      For each component, read 2 bytes. It contains,
    for(var i=0;i<sos.ncomponents;i++){
        var component={id:0,idstr:"",actn:0,dctn:0};
        // 1 byte   Component Id (1=Y, 2=Cb, 3=Cr, 4=I, 5=Q),
        component.id=data.charCodeAt(p);
        component.idstr = getSOSComponentId(component.id);
        //  1 byte   Huffman table to use :
        var ht = data.charCodeAt(p+1);
        //     bit 0..3 : AC table (0..3)
        component.actn = ht&(0xF);
        //     bit 4..7 : DC table (0..3)
        component.dctn = (ht>>4)&(0xF);
        sos.components.push(component);
        p+=2;//advance for next component position or next field
    }

    //"Ignorable Bytes"               3 bytes      We have to skip 3 bytes. 
    // the ignorable bytes are actually (courtesy NTUEE http://lad.dsc.ufcg.edu.br/multimidia/jpegmarker.pdf )
    //    Start of spectral/predictor selection   1 byte
    sos.sss=data.charCodeAt(p);
    //    End of spectral selection               1 byte
    sos.ess=data.charCodeAt(p+1);
    // successive approximate bit positions:  1 byte
    //    Successive approx. high bit position    4 bits
    //    Successive approx. low bit position     4 bits   (or point transform)
    sos.sabp = data.charCodeAt(p+2);
    p+=3;//advance to data after fields
    
    
    sos.hcdata=data.substring(p);//blank because we didn't scan yet - see postprocess
    
    
    
    return sos;
}


function unstuffSOSHCData(data){
    var c = 0;
    var c2 = 0;
    var data_unstuffed = "";
    for(var i=0;i<data.length;i++){
        c = data.charCodeAt(i);
        c2 = data.charCodeAt(i+1);
        //console.log(c.toString(16)+" "+c2.toString(16));
        if(c===0xFF && c2===0x00){
            i+=1;//skip the next null
        }
        data_unstuffed += data.charAt(i);
    }
    return data_unstuffed;
}


function postprocessSOS(header){
    var prefix_length = 1;//ncomponents field
    var components_length = 2*(header.extendeddata.ncomponents); //each component data
    var suffix_length = 3;//extra sos data fields after components
    
    var sos_header_length = prefix_length +  components_length + suffix_length;
    
    header.extendeddata.hcdata=header.content.substring(sos_header_length);
    
    //If the huffman coding scheme needed to write a 0xFF byte, then it writes a 0xFF followed by a 0x00 -- a process known as adding a stuff byte.
    //https://www.impulseadventure.com/photo/jpeg-huffman-coding.html
    header.extendeddata.hcdata = unstuffSOSHCData(header.extendeddata.hcdata);
    
    
    
    return header.extendeddata;
}