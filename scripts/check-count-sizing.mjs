// github#186
export async function countSizingCheck(p) {
  await p.eval(`window.__countSizingResult=null;(async()=>{
    const api=__vg,scale=api.timeScale,wait=()=>new Promise(r=>requestAnimationFrame(r));
    const settle=async()=>{const end=performance.now()+15000;while(api.demo.busy()){if(performance.now()>end)throw Error('Count sizing did not settle');await wait();}await wait();};
    const snapshot=()=>{const out={};api.graph.forEachNode((id,a)=>{const d=api.renderer.getNodeDisplayData(id);if(d&&!d.hidden&&(api.alpha[id]||0)>.999&&!api.isPinned(id))out[id]={size:d.size,x:a.x,y:a.y};});return out;};
    const floor=()=>{const id=api.graph.nodes()[0];return api.dotWhy(id).countFloorPx;};
    const drift=(a,b)=>Math.max(0,...Object.keys(a).filter(id=>b[id]).map(id=>Math.abs(a[id].size-b[id].size)));
    try{
      api.timeScale=.5;api.setRange();await settle();
      const baseline=snapshot(),days={};
      api.graph.forEachNode((id,a)=>{if(baseline[id]&&a.created){const d=String(a.created).slice(0,10);days[d]=(days[d]||0)+1;}});
      const day=Object.keys(days).sort().reverse().find(d=>days[d]>0&&days[d]<=12);
      if(!day)throw Error('No sparse date');
      const sample=async(trigger,direction)=>{
        let prev=floor(),reversals=0,maxJump=0,frames=0,min=prev,max=prev;
        trigger();
        const end=performance.now()+15000;
        do{await wait();const v=floor();if(!Number.isFinite(v)||v<0||v>7.5+1e-8)throw Error('Invalid readability floor');
          if(direction*(v-prev)<-1e-6)reversals++;maxJump=Math.max(maxJump,Math.abs(v-prev));min=Math.min(min,v);max=Math.max(max,v);prev=v;frames++;
          if(performance.now()>end)throw Error('Count sizing ride timed out');
        }while(api.demo.busy());return {frames,reversals,maxJump,min,max};
      };
      const narrow=await sample(()=>api.setRange(day,day),1),shown=snapshot();
      const expected=Math.min(7.5,1.5+.7*Math.log2(Object.keys(baseline).length/Object.keys(shown).length));
      const floorError=Math.abs(floor()-expected);
      api.syncAlpha();api.applyLayout(false);api.applyLayout(false);api.renderer.refresh();await wait();
      const landingDrift=drift(shown,snapshot());
      const widen=await sample(()=>api.setRange(),-1),restored=snapshot();
      const restoreDrift=drift(baseline,restored);
      api.setRange(day,day);for(let i=0;i<6;i++)await wait();
      const before=floor();api.setRange();const interruptionJump=Math.abs(floor()-before);await settle();
      api.setRange('2100-01-01','2100-01-02');await settle();
      const emptyCount=Object.keys(snapshot()).length,emptyFloor=floor();
      api.setRange();await settle();
      return {ok:floorError<1e-6&&!narrow.reversals&&!widen.reversals&&landingDrift<.02&&restoreDrift<.02&&interruptionJump<.15&&emptyCount===0&&Number.isFinite(emptyFloor),
        detail:JSON.stringify({day,baseline:Object.keys(baseline).length,shown:Object.keys(shown).length,expected,floorError,narrow,widen,landingDrift,restoreDrift,interruptionJump,emptyCount,emptyFloor})};
    }finally{api.timeScale=scale;api.setRange();await settle();}
  })().then(r=>window.__countSizingResult=r,e=>window.__countSizingResult={ok:false,detail:String(e)});void 0`);
  for (let i = 0; i < 300; i++) {
    const result = await p.eval("window.__countSizingResult");
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { ok: false, detail: "Count sizing check timed out" };
}
