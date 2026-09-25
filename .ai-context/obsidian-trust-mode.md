# Obsidian's trust prompt, and why it reads as a broken plugin

A vault Obsidian has not been told to trust opens in **restricted mode**, and the plugin does not
load at all. Any fixture or generated vault is "untrusted" on its first open: Obsidian puts up
**"Trust author and enable plugins?"** and opens its Settings window behind it. Until that is
confirmed *and* Settings is closed, `app.plugins.getPlugin("vault-graph")` is `null`, the ribbon
icon and the `vault-graph:open` command do nothing, and **a perfectly good plugin reads as
broken** — the trap is that it looks like a code fault, so it gets diagnosed as one.

## Driving over CDP

Do not click the dialog — enable it programmatically, which is what the harnesses already do
(`obsidian-smoke.mjs`, `spike-check.mjs`) and what any new one should copy:

```javascript
if (!app.plugins.getPlugin(id)) {
  await app.plugins.setEnable(true);          // leave restricted mode
  await app.plugins.enablePluginAndSave(id);  // then enable ours
}
```

Judge nothing about the plugin's behaviour until `getPlugin(id)` is truthy.

## By hand

Confirm the prompt, close Settings, then look. It has bitten more than once on a freshly generated
fixture vault that had never been opened before — it looks exactly like the plugin failing to load.
