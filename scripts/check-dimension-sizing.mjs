// github#186
export async function dimensionSizingCheck(p) {
  await p.eval(`window.__dimensionSizingResult=null;(async()=>{
    const api=__vg,original=api.timeScale,rides=[];
    const wait=()=>new Promise(r=>requestAnimationFrame(r));
    const snapshot=()=>{
      const rows={};api.graph.forEachNode((id)=>{if(!api.visible(id)||api.isPinned(id))return;
        const d=api.dotWhy(id);rows[id]={ramp:d.rampV,size:d.out};});return rows;
    };
    api.timeScale=1.25;
    try {
      api.setDim('folder');
      for(const target of ['tag','folder']){
        const source=api.state.dim;
        api.setDim(target);api.syncAlpha();api.applyLayout(false);api.applyLayout(false);
        const expected=snapshot();api.setDim(source);
        while(api.demo.busy())await wait();
        document.querySelector('#vg-dim button[data-dim="'+target+'"]').click();
        let samples=0,badRank=0,maxRankError=0;
        const deadline=performance.now()+15000;
        while(api.demo.busy()){
          if(performance.now()>deadline)throw Error('Sizing transition timed out');
          await wait();if(!api.demo.busy())break;
          for(const sid of api.standIns()){
            if((api.alpha[sid]||0)<.5)continue;
            const id=api.noteOf(sid),want=expected[id];if(!want)continue;
            const d=api.dotWhy(sid),error=Math.abs(d.rampV-want.ramp);
            samples++;if(error>1e-6)badRank++;maxRankError=Math.max(maxRankError,error);
          }
        }
        const landed=snapshot();let badLanding=0,maxSizeDelta=0;
        api.syncAlpha();api.applyLayout(false);api.applyLayout(false);
        const refreshed=snapshot();
        for(const [id,d] of Object.entries(landed)){
          const fresh=refreshed[id];if(!fresh)continue;
          const delta=Math.abs(d.size-fresh.size);maxSizeDelta=Math.max(maxSizeDelta,delta);
          if(Math.abs(d.ramp-fresh.ramp)>1e-6||delta>.01)badLanding++;
        }
        rides.push({target,samples,badRank,maxRankError,badLanding,maxSizeDelta,standIns:api.standIns().length,exit:api.lastCascade().exit});
      }
      return {ok:rides.every(r=>r.samples>100&&!r.badRank&&!r.badLanding&&!r.standIns&&r.exit==='converged'),detail:JSON.stringify(rides)};
    }finally{api.timeScale=original;api.setDim('folder');}
  })().then(r=>window.__dimensionSizingResult=r,e=>window.__dimensionSizingResult={ok:false,detail:String(e)});void 0`);
  for(let i=0;i<160;i++){
    const r=await p.eval('window.__dimensionSizingResult');if(r)return r;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  return {ok:false,detail:'Sizing check timed out'};
}
