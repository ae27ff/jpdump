jpdump.ui = {
    
    handleFile:function(file){
        jpdump.decoder.processFile(file);
    },
    
    handleFileSelect:function(evt) {
        console.log("file select "+evt);
	var files = evt.target.files; // FileList object

	// use the 1st file from the list
        for(var i=0;i<files.length;i++){
            this.handleFile(files[i]);
        }
    },
    
    init:function(){
        this.fileTrigger = $("#upload");
        console.log(this.fileTrigger);
        console.log(
            this.fileTrigger.on('change',function(e){
                console.log(e);
                jpdump.ui.handleFileSelect(e);
            })
        )
    }
};