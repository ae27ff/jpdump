const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const projectRoot=path.resolve(__dirname,'../..');

function loadScript(context,file){
    vm.runInContext(fs.readFileSync(path.join(projectRoot,file),'utf8'),context,{filename:file});
    const name=path.basename(file,'.js');
    context[name]=vm.runInContext(name,context);
}

module.exports={projectRoot,loadScript};
