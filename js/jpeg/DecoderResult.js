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

Jfif.DecoderResult = 
class DecoderResult{
    constructor(source){
        this.source=source;
        this.valid=true;
        this.error=null;
        this.size=0;
        this.headers=[];
        this.content="";
        this.extraneous="";
    }
    
    setError(error, valid=false, clearData=true){
        this.valid=valid;
        this.error=error;
        if(clearData){
            this.headers=[];
            this.content="";
            this.extraneous="";
        }
    }
    
    addHeader(marker){
        
    }
    
    
    
}