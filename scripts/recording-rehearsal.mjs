// github#186
const snapshot = "JSON.stringify({state:__vg.state," +
  "nodes:__vg.graph.nodes().map(id=>[id,__vg.graph.getNodeAttributes(id)])," +
  "camera:__vg.renderer.getCamera().getState(),viewport:[innerWidth,innerHeight,devicePixelRatio]})";

export async function rehearse({ page, setup, trigger, until, pause, maxMs, save }) {
  const before = await page.eval(snapshot);
  const storage = await page.eval("Object.fromEntries(Object.entries(localStorage))");
  await page.eval(`window.rehearsalPrevious=__vg.lastCascade();
    window.rehearsalStarted=performance.now(); (() => {${trigger}\n})(); void 0`);
  await pause(300);
  await until(() => page.eval("!__vg.demo.busy()"), maxMs, "Rehearsal action");
  const action = await page.eval("({report:__vg.lastCascade(),replaced:__vg.lastCascade()!==rehearsalPrevious," +
    "started:rehearsalStarted})");
  if (!action.replaced || !(action.report.frames === 0 && action.report.path === "instant: nothing to move" ||
      action.report.frames > 0 && action.report.exit === "converged" && action.report.t0 >= action.started - 1)) {
    save({ equal: false, action, error: "Rehearsal did not complete a fresh action" });
    throw Error("Rehearsal did not complete a fresh action");
  }
  await pause(400);
  await page.eval(`localStorage.clear();for(const [key,value] of Object.entries(${JSON.stringify(storage)}))
    localStorage.setItem(key,value);window.rehearsalOldDocument=true;void 0`);
  await page.send("Page.reload");
  await until(() => page.eval("!window.rehearsalOldDocument && !!window.__vg && !__vg.demo.busy()")
    .catch(() => false), 15000, "Rehearsal reload");
  if (setup) {
    await page.eval(`(async () => {${setup}\n})()`);
    await until(() => page.eval("!__vg.demo.busy()"), maxMs, "Rehearsal setup reset");
  }
  await pause(400);
  const after = await page.eval(snapshot);
  const evidence = { equal: before === after, action, before: JSON.parse(before), after: JSON.parse(after) };
  save(evidence);
  if (!evidence.equal) throw Error("Rehearsal changed the initial graph, controls, camera or viewport");
}
