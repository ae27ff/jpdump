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

Jfif.Header = 
class Header{
    constructor(marker){
        this.hasLengthBytes=true;
        this.hasScannedLength=false;
        this.marker=marker;
        this.indicatedLength=0;//length of data *after* the marker, including the length bytes themself.
        this.adjustedLength=0;//the adjusted version of the above, adjusted for any scanned data - before adjustment, this is the same as the indicated length.
        this.content=new Uint8Array;
        
    }
    
    setLengthless(){
        this.hasLengthBytes=false;
        this.setLengths(0);
    }
    
    setLengths(len){
        this.indicatedLength=len;
        this.adjustedLength=len;
    }
    
    getHeaderSize(){//length of all non-content data
        if(this.hasLengthBytes){
            return Jfif.HEADER_SIZE + Jfif.LENGTH_BYTES_SIZE;
        }
        return Jfif.HEADER_SIZE;
    }
    
    getContentLength(){//length of data [*after* any length bytes] belonging to the header
        var nonContentLen = this.hasLengthBytes ? Jfif.LENGTH_BYTES_SIZE : 0;
        return this.adjustedLength - nonContentLen;
    }
    
    getTotalLength(){//length of the marker, length bytes, and content
        return this.getHeaderSize() + this.getContentLength();
    }
    
    
    
    
}