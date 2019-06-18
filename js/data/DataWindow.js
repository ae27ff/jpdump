/* 
 *  This Source Code Form is subject to the terms of the Mozilla Public
 *  License, v. 2.0. If a copy of the MPL was not distributed with this
 *  file, You can obtain one at http://mozilla.org/MPL/2.0/ .
 */

/**
 * Defines an input data source with a selectable, exportable data range.
 * 
 * Child classes are responsible for slicing the selection when overriding selectPos or getSelectionArrayBuffer
 * @author crashdemons
 * @type {Object}
 */
class DataWindow{
	constructor(type,shortname,reference,realsize){
		this.type=type;//the type of the input source
		this.shortname=shortname;
		this.reference=reference;//an internal reference to the data source' origin
		this.realsize=realsize;//the size of the data source
		this.realend=realsize-1;//the end of the data source

		this.selection_start=0;//the start of the user-selected data range
		this.selection_end=this.realend;//...
		this.selection_length=this.realsize;//...
		this.selection_reference=this.reference;//an internal reference to the selected data representation
                
                //this.selectPos(0,this.realend);
	}
        
        beginSelectionState(){
            //indicated by a dependent datasource when a new iteration of slices multiple will occur (multiple selections making a greater whole in order)
            //generally nothing should happen here if your datasource handles positioning/rewinding-to-start with constant time. (Files, Arrays)
        }

	static calcSelectEnd(start,length){
		return start + length - 1;
	}
        
        selectLen(start,length){
            var end = DataWindow.calcSelectEnd(start,length);
            this.selectPos(start,end);
        }

	validateSelection(start,end){
		return (start>=0 && end>=0 && start<=end && start<=this.realend && end<=this.realend);
	}

	selectPos(start,end){
		this.selection_start=start;
		this.selection_end=end;
		this.selection_length=(this.selection_end - this.selection_start)+1;
	}
	getSelectionArrayBuffer(callback){
		return Promise.resolve( new ArrayBuffer(this.selection_length) ).then(callback);
	}

}

DataWindow.MAX_SIZE=Math.pow(2,31)-2;
//documentation says that the maximum array length is (2^32) - 1, however from testing:
//Both firefox and chrome:
// new Uint8Array(Math.pow(2,32)-1)   ==  Invalid array length  (keep in mind Uint8Array.BYTES_PER_ELEMENT = 1)
// new Uint8Array(Math.pow(2,32)-2)   ==  Invalid array length
/// ... until 2^31
// new Uint8Array(Math.pow(2,31))    ==  Invalid array length
// ... now this is were browser behavior differs:
//Chrome:
// new Uint8Array(Math.pow(2,31)-1)   ==  Uint8Array [0,0,0, ...]

//Firefox:
// new Uint8Array(Math.pow(2,31)-1)   ==  Invalid array length
// new Uint8Array(Math.pow(2,31)-2)   ==  Uint8Array [0,0,0, ...]