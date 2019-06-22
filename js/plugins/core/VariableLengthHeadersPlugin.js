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

if(typeof Plugins==="undefined") Plugins={};//suppress IDE warning

/**
 * This plugin corrects processing of headers that have no or variable length.
 * Most headers have two length bytes that define their content, however some have no length bytes, and others have "scanned" content which continues until an end marker.
 * This is a core decoder behavior and this plugin should not be removed.
 * @type {Class}
 */
class VariableLengthHeadersPlugin extends Plugins.DecoderPlugin{
    constructor(){
        super(); 
    }
    
    event_afterHeaderRead(event,decoder,source,pos,header){
        if(event.isCancelled) return;
        //console.log("VLH.event_peekHeader:");
        switch(header.marker){
            case Jfif.MARKERS['SOS'].id://Start of Scan - length defined plus scan until next header
                header.hasScannedLength=true;
                break;
            case Jfif.MARKERS['J2K-SOD'].id://JPEG2000 image data - lengthless with scan until EOC (FFD9)
                header.hasScannedLength=true;
                header.setLengthless();
                break;
                
            case Jfif.MARKERS['SOI'].id: //Star/End - lengthless, no scan, no content
            case Jfif.MARKERS['EOI'].id:
                header.setLengthless();
                break;
            default:
                if(header.marker>=Jfif.MARKERS['RST0'].id && header.marker<=Jfif.MARKERS['RST7'].id){//Reset Markers - lengthless with scan until next header
                    header.hasScannedLength=true;
                    header.setLengthless();
                }
        }
        Plugins.manager.dispatchEvent('afterHeaderLengthCorrection',decoder,source,pos,header,event);
        //console.log(header);
        //console.log(header.indicatedLength);
    }
    
    async scanToEOC(decoder, source, pos, header){//find position of the "end" of the content (1 past last byte of content)
        var oldpos = pos;
        var content=null;
        do{
            content = await decoder.getData(source,pos,1024);
            for(var i=0;i<content.length;i++){
                if(content[i]===Jfif.MARKER_PREFIX){
                    var next = await decoder.getData(source,pos+1,1);
                    if(next.length===0) throw "Unexpected end of scan-data (#1)";
                    if(next[0]===Jfif.MARKER['J2K-EOC']){//same as EOI: FF D9
                        console.log("   FF "+next[0].toString(16)+" found at "+pos+"~"+i);
                        return pos;
                    }  
                }
                pos+=1;
            }
        }while(content.length===1024);
        throw "Unexpected end of scan-data (#2)";
    }
    
    async scanToHeader(decoder, source, pos, header){
        var oldpos = pos;
        var content=null;
        do{
            content = await decoder.getData(source,pos,1024);
            for(var i=0;i<content.length;i++){
                if(content[i]===Jfif.MARKER_PREFIX){
                    var next = await decoder.getData(source,pos+1,1);
                    if(next.length===0) throw "Unexpected end of scan-data (#3)";
                    if(next[0]!==0x00){//not a stuffed FF - a read header.
                        console.log("   FF "+next[0].toString(16)+" found at "+pos+"~"+i);
                        return pos;
                    }
                }
                pos+=1;
            }
        }while(content.length===1024);
        throw "Unexpected end of scan-data (#4)";
    }
    
    async event_afterHeaderContent(event,decoder,source,pos,header,content){//note: we are positioned after the length bytes, if any
        if(event.isCancelled) return;
        var oldpos = pos;
        if(header.hasScannedLength){
            var endpos;
            if(header.marker === Jfif.MARKERS['J2K-SOD'].id) endpos=await this.scanToEOC(decoder,source,pos,header); //supposedly SOD scans until the end, not next header (are FF's stuffed?)
            else endpos = await this.scanToHeader(decoder,source,pos,header); //SOS, RST# scan until the next header and have "Stuffed" FF's (encoded as FF 00)
            
            //console.log("getdatapos "+oldpos+" "+(endpos-1));
            
            Plugins.manager.dispatchEvent('beforeAdjustScannedContent',decoder,source,pos,header,event);//event, decoder, source, pos, header, parentEvent
            content=await decoder.getDataPos(source,oldpos,endpos-1);
            header.adjustedLength = content.length;
            header.content=content;
            Plugins.manager.dispatchEvent('afterAdjustScannedContent',decoder,source,pos,header,event);//event, decoder, source, pos, header, parentEvent
        }
    }
}
Plugins.manager.defineEvent('afterHeaderLengthCorrection');
Plugins.manager.defineEvent('afterAdjustScannedContent');
Plugins.manager.defineEvent('beforeAdjustScannedContent');
Plugins.manager.defineEvent('afterAdjustScannedContent');
Plugins.manager.registerPlugin(new VariableLengthHeadersPlugin());

