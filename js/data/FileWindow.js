/* 
 *  This Source Code Form is subject to the terms of the Mozilla Public
 *  License, v. 2.0. If a copy of the MPL was not distributed with this
 *  file, You can obtain one at http://mozilla.org/MPL/2.0/ .
 */

/**
 * 
 * @author crashdemons
 * @type {Object}
 */

class FileWindow extends DataWindow{
    
	constructor(file){
		super('file',file.name,file,file.size);
		this.reader=new FileReader();
                this.selectPos(0,this.realend);
	}
        
        
	selectPos(start,end){
            super.selectPos(start,end);
            //console.log(" fselect "+start+" "+end+"   "+this.realend);
            if(end===this.realend)
                this.selection_reference = this.reference.slice(start);
            else
                this.selection_reference = this.reference.slice(start,end+1);
	}


	async getSelectionArrayBuffer(callback){
                var _slice = this.selection_reference;//instance variables so that they can't change during promise execution
		var _this = this;
		return new Promise(function(resolve,reject){
                    //console.log(" file read setup");
                    //console.log(_this);
                    //console.log(_slice)
                    _this.reader.onerror = function(event){
                        //console.log('file onerror');
                        console.log("reject "+event)
                        reject(event);
                    };
                    _this.reader.onabort=_this.reader.onerror;
                    _this.reader.onload = function(event){
                        console.log("resolve "+event);
                        resolve(event.target.result);
                    };
                    //console.log('file read start');
                    _this.reader.readAsArrayBuffer(_slice);
		});
	}
}