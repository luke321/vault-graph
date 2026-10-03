// github#186
export async function dimensionRefreshCheck(p) {
  await p.eval(`window.__dimensionRefreshResult=null; (async () => {
    const api=__vg, rides=[], original=api.timeScale;
    api.timeScale=1.25;
    const wait=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    try {
      api.setDim('folder');
      while(api.demo.busy()) await wait();
      for(const dim of ['tag','folder']) {
        const old=new Set(api.graph.nodes().filter(id=>(api.alpha[id]||0)>.5));
        const prev=new Map(), crossed=[[],[]], angles=[0,0];
        let frames=0, overlap=0, reversals=0;
        document.querySelector('#vg-dim button[data-dim="'+dim+'"]').click();
        const limit=performance.now()+15000;
        while(api.demo.busy()) {
          if(performance.now()>limit) throw Error('Dimension Refresh timed out');
          await wait(); if(!api.demo.busy())break; frames++;
          const visible=[0,0];
          api.graph.forEachNode((id,a)=>{
            const side=old.has(id)&&!a.standIn?0:1, al=api.alpha[id]||0, before=prev.get(id);
            if(al>.1)visible[side]++;
            const angle=Math.atan2(a.y,a.x);
            if(before) {
              if((side===0&&al>before.al+1e-6)||(side===1&&al<before.al-1e-6))reversals++;
              if(al>.1&&before.al>.1) {
                const da=Math.abs(angle-before.angle);
                angles[side]=Math.max(angles[side],Math.min(da,2*Math.PI-da));
              }
              if(side===0?before.al>=.5&&al<.5:before.al<.5&&al>=.5)
                crossed[side].push({frame:frames,date:String(a.created||'')});
            }
            prev.set(id,{al,angle});
          });
          if(visible.every(n=>n>0))overlap++;
        }
        const order=crossed.map((rows,side)=>{
          rows.sort((a,b)=>a.date.localeCompare(b.date));
          const q=Math.max(1,Math.floor(rows.length/4));
          const mean=a=>a.reduce((n,x)=>n+x.frame,0)/a.length;
          const early=mean(rows.slice(0,q)),late=mean(rows.slice(-q));
          return {count:rows.length,early,late,ok:side===0?early>late:early<late};
        });
        const landed=new Map(api.graph.nodes().map(id=>[id,{...api.graph.getNodeAttributes(id)}]));
        api.applyLayout(false);api.applyLayout(false);
        let drift=0;api.graph.forEachNode((id,a)=>{const b=landed.get(id);drift=Math.max(drift,Math.hypot(a.x-b.x,a.y-b.y));});
        rides.push({dim,frames,overlap,angles,order,reversals,drift,standIns:api.standIns().length,exit:api.lastCascade().exit});
      }
      return {ok:rides.every(r=>r.frames>20&&r.overlap>10&&r.angles.every(a=>a>.005)&&r.order.every(o=>o.count>10&&o.ok)&&r.reversals===0&&r.drift<.5&&r.standIns===0&&r.exit==='converged'),detail:JSON.stringify(rides)};
    } finally {api.timeScale=original;api.setDim('folder');}
  })().then(result=>window.__dimensionRefreshResult=result,error=>window.__dimensionRefreshResult={ok:false,detail:String(error)}); void 0`);
  for (let i=0;i<160;i++) {
    const result=await p.eval('window.__dimensionRefreshResult');
    if(result)return result;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  return {ok:false,detail:'Dimension Refresh check timed out'};
}
