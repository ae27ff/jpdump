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

if(typeof Plugins==="undefined") Plugins={};

Plugins.Manager = 
class PluginManager{
    constructor(){
        this.plugins=[];
        this.events={};
    }
    defineEvent(stage,cancellable=false){
        console.log("Created event stage: "+stage+" cancellable="+cancellable);
        this.events[stage]={ cancellable:cancellable, handlers:[] };
    }
    
    getHandlers(stage){
        return this.events[stage].handlers;
    }
    addHandler(stage, plugin, method){
        var handler={plugin:plugin, method:method};
        this.events[stage].handlers.push(handler);
    }
    
    async dispatchEvent(stage, ...args){
        var flags = new Plugins.EventFlags(stage, args, this.events[stage].cancellable);
        return await this.dispatchEventRaw(stage,flags,args);
    }
    
    async dispatchEventRaw(stage,flags,args){
        console.log("PM.dispatchEvent "+stage+" ");
        
        args.unshift(flags);

        flags.pluginPosition=0;
        for(var handler of this.getHandlers(stage)){
            await handler.method.apply(handler.plugin, args);
            flags.pluginPosition++;
        }
        flags.pluginPosition=0;
        for(var handler of this.getHandlers('all')){
            await handler.method.apply(handler.plugin, args);
            flags.pluginPosition++;
        }
        
        //console.log("}");
    }
    registerEvent(stage,plugin){
        if(typeof this.events[stage] === "undefined"){
            throw "Unsupported event stage: "+stage;
        }else{
            var method = plugin['event_'+stage];
            if(typeof method === 'undefined'){
                throw "Plugin does not implement handler for event "+stage;
            }
            console.log("   Registering event for "+plugin.name+": "+stage);
            this.addHandler(stage,plugin,method);
        }
    }
    registerEvents(plugin){
        var _plugin = plugin;
        var obj = plugin;
        while(obj !== null){
            var props = Object.getOwnPropertyNames(obj);
            props.forEach( (prop)=>{
                if(prop.startsWith('event_')){
                    var eventname = prop.slice('event_'.length);
                    this.registerEvent(eventname,_plugin);
                }
            });
            obj = Object.getPrototypeOf(obj);
        }
    }
    registerPlugin(plugin){
        this.plugins.push(plugin);
    }
};

Plugins.manager = new Plugins.Manager();
Plugins.manager.defineEvent('load');
Plugins.manager.defineEvent('all');


$(function(){
   Plugins.manager.dispatchEvent('load'); 
});