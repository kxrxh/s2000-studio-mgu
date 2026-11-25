'use strict';
const path=require('path'),{fork}=require('child_process');
const STYLES={s2000:'S2000',bmw_m:'BMW M'};

class Clusters{
    constructor(socket){
        this.socket=socket||'';this.style='bmw_m';this.metric='oil';this.enabled=false;
        this.child=null;this.childKey='';this.stopping=false;this.closed=false;this.packet=null;
        this.status='Выключен — штатная BMW';
    }
    update(state,settings){
        if(this.closed)return;
        if(!Object.prototype.hasOwnProperty.call(STYLES,settings.style)){
            this.style=null;this.disable();this.status='Неизвестный дизайн';return;
        }
        this.style=settings.style;this.metric=settings.tripMetric==='coolant'?'coolant':'oil';
        this.packet={state:state,redline:settings.redline,capacity:settings.tankCapacity,tripMetric:this.metric};
        this.reconcile();
    }
    enable(){
        if(this.closed||!this.style)return;
        this.enabled=true;this.reconcile();
    }
    disable(){this.enabled=false;this.status='Выключен — штатная BMW';this.reconcile();}
    reconcile(){
        const key=this.style+(this.style==='s2000'?':'+this.metric:'');
        if(this.child){
            if(!this.enabled||this.closed||this.childKey!==key)this.stop();
            else this.send();
            return;
        }
        if(!this.enabled||this.closed||!this.style)return;
        this.status='Запуск '+STYLES[this.style];
        let child;
        try{child=fork(path.join(__dirname,this.style+'-worker.js'),[this.socket,this.metric],{stdio:['ignore','ignore','inherit','ipc']});}
        catch(e){this.enabled=false;this.status='Не удалось запустить кластер: '+e.message;return;}
        this.child=child;this.childKey=key;this.stopping=false;
        child.on('message',m=>{
            if(this.child===child&&!this.stopping&&m&&typeof m.status==='string')this.status=STYLES[this.style]+': '+m.status;
        });
        const ended=()=>{
            if(this.child!==child)return;
            clearTimeout(this.killTimer);
            const expected=this.stopping;
            this.child=null;this.childKey='';this.stopping=false;
            if(!expected){this.enabled=false;this.status='Кластер остановлен. Включите его повторно.';}
            this.reconcile();
        };
        child.on('error',e=>{
            if(this.child!==child)return;
            this.enabled=false;this.status='Ошибка кластера: '+e.message;this.stop();
            if(!child.pid)ended();
        });
        child.once('exit',ended);
        this.send();
    }
    send(){
        const child=this.child;
        if(!child||!child.connected||this.stopping||!this.packet)return;
        child.send(Object.assign({enabled:this.enabled},this.packet),err=>{
            if(err&&this.child===child&&!this.stopping){
                this.enabled=false;this.status='Связь с кластером потеряна';this.stop();
            }
        });
    }
    stop(){
        const child=this.child;if(!child||this.stopping)return;
        this.stopping=true;
        // Wait for process/socket teardown before another design can claim the panel.
        try{if(child.connected)child.disconnect();else child.kill('SIGTERM');}catch(e){child.kill('SIGTERM');}
        this.killTimer=setTimeout(()=>{if(this.child===child)child.kill('SIGKILL');},1500);
        this.killTimer.unref();
    }
    close(){this.closed=true;this.disable();}
}
module.exports={Clusters:Clusters};
