# A folder hidden by default

Some folders are noise most of the time — an archive, a template store, a folder of
attachments. Right-click any folder's row in the legend and toggle **hidden by default**,
one row down from its colour picker, and it starts hidden every time the disc opens: not
just for this session, but the next one, and on whichever host you opened it from. The
legend's **All** button leaves it alone, so "show everything" no longer quietly overrides
the one folder you told it to keep out of the way. Toggle it back off and the wedges
reallocate around it again. The setting was always there — it just used to mean opening
the settings panel for the one thing you wanted, which is why nobody used it.

## Where it lives in the storyboard

`act: "hiddenbydefault"` in `demoMode()` (`src/page.js`).

**Clip-only, like `subfoldercolor`:** it's in `FULL_RUN_EXCLUDES`, so it never plays in the
hero. The full storyboard already toggles this control mid-way through its `folders` act —
this act repeats those beats on their own so the feature has footage that is only itself,
rather than six beats buried between a hide/show pair and a solo.

## Regenerating this feature's clip

```powershell
.\scripts\record-demo.ps1 -Act hiddenbydefault
# wrote demo-hiddenbydefault-<timestamp>.mp4

.\scripts\make-hero.ps1 -In demo-hiddenbydefault-<timestamp>.mp4 -Out assets\features\hiddenbydefault.webp
```

Commit `assets/features/hiddenbydefault.webp` and update `Last re-recorded` below in the
same commit.

## Metadata

| | |
|---|---|
| **Introduced in** | `1.9.0` — "Belonging" (github#34; the setting itself predates it, the legend row does not) |
| **Last re-recorded** | `1.9.0 — 2026-09-02` |
