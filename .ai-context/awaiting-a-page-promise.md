# Awaiting a promise from a check, and the two ways it goes silent

**Status** as-built · 2026-09-17 · `scripts/smoke.mjs`, `scripts/cdp.mjs`, github#179

> A check that samples the page over time has to hand back a Promise. Two surfaces look
> interchangeable for that and only one of them awaits, and the failure of the other is
> a JSON error that names neither.

## `p.j` cannot await. `p.eval` can.

`runOne()` defines the two surfaces a check drives the page with:

```js
page.eval = (expr) => Runtime.evaluate(expr, { returnByValue: true, awaitPromise: true })
page.j    = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`))
```

`p.j` is the convenient one and almost every check uses it, because almost every probe
answers immediately. But look at where it puts the `JSON.stringify`: **inside the page, around
the expression, before anything awaits it.** Hand `p.j` an expression that evaluates to a
Promise and the page stringifies the Promise object itself — `"{}"` — and `awaitPromise` then
has a plain string to return, so nothing ever waits for the work.

The symptom is not a timeout. It is:

```
FAIL  a settings push during a fit flight changes nothing
      threw: "[object Object]" is not valid JSON
```

which comes from the check's own `.then(JSON.parse)` being handed the already-parsed `{}`,
coerced back to the string `[object Object]`. Nothing in that message says "promise", and
nothing says which of the expression's two JSON round-trips failed.

**A promise-returning probe goes through `p.eval`, and serialises itself.** That is why the
rides in the phone checks end with `res(JSON.stringify({...}))` and the caller does the
`.then(JSON.parse)` — the stringify has to happen *after* the await, so it happens inside the
promise rather than around it.

## The transport's ceiling is real, but it is not a check's bound

`cdp.mjs`'s `send()` rejects any command that gets no reply in **10 s**. So a promise the page
never settles cannot hang a run forever, and the runaway `setInterval` behind it dies at the
next `reboot()`, which every phone check's `finally` reaches. That ceiling is a backstop
against a wedged transport; it is a poor bound for a check, for two reasons:

- **It reports the expression, not the check.** The message is
  `Runtime.evaluate "(function () {\n    var s = [], t0 = Date..." got no reply in 10s` —
  the first 70 characters of the source, which for two rides built from the same template is
  the same string both times.
- **10 s of silence on a 1.5 s ride is indistinguishable from a run that has stopped**, and a
  smoke run holds `screen-left` while it is silent. Whoever is watching cannot tell a slow
  check from a dead one, so the honest response is to wait — which is how github#179's check
  came to be described as hanging for eight minutes.

## So the ride is bounded twice, and the two bounds catch different things

**In the page: every tick runs in a `try`, and a throw stops the sampler with its message.**
This is the case the 10 s ceiling handles worst. A sampler that throws on `getState()` never
reaches its `t > 1500` exit, so the promise is never settled and the interval keeps firing
until the page is reloaded — and all the check gets back is the transport's timeout. Catching
in the tick turns that into `the plain ride stopped early: the sampler threw: <message>`,
which is a diagnosis rather than a symptom.

**In the harness: `rideCap()` races the eval against `RIDE_CAP_MS` (5 s).** This is the case
the in-page bound cannot reach — an interval that stops firing at all, because the page was
navigated, frozen or torn down. Nothing inside the page can report that, by definition. 5 s is
three times the 1.5 s ride and sits under the transport's 10 s, so the message names the ride
rather than the expression. Its timer is `unref`'d: a cap that fired would otherwise hold the
process open for its full span after the suite is done.

**Neither bound replaces the other, and neither is a retry.** A capped ride is a failed check,
reported with what it had sampled when it stopped. The point is that it fails *while the
screen still matters*, instead of holding the lock and saying nothing. Forced by dropping
`RIDE_CAP_MS` to 200 ms, the check reports `threw: the plain ride did not settle in 200ms` and
the run finishes in 16 s — including against a sampler edited never to reach its exit at all.

**`rideCap` suppresses its loser's rejection, as a precaution rather than a repair.** The
promise that loses a `Promise.race` still settles, and if it settles by *rejecting* — which is
what the transport does at 10 s, in exactly the never-settling case this cap exists for —
nothing is listening, and an unhandled rejection can take the process down instead of letting
the check report. A bare `promise.catch(() => {})` before the race attaches that listener. Note
that neither forced run above actually produced the crash: the reload in the check's `finally`
tears the page down first, and the browser closes before the transport's timer would fire. The
guard costs one line and is kept on the mechanism, not on an observed failure.

## What the check was left unable to say

github#179 found this by trying to verify github#175's item 3 on `develop` at `60b7301`, where
the check had never run once — the screen guard was busy for its author's whole run, and the
first thing it does when it finally runs is throw on its own JSON. Both halves of that are
worth keeping in mind for any check written against a promise: it fails in a way that does not
mention promises, and a check that has never been run is not evidence of anything, however
carefully it was written.

**The `p.eval` swap alone was enough to make it run.** The hang recorded in github#179's item 2
did **not** reproduce here across repeated runs — the awaited ride settles at ~50 samples every
time. The bounds above are therefore preventive, not a repair of a diagnosed defect, and that
is deliberate: the reason the hang could not be diagnosed after the fact is precisely that
nothing bounded it or reported why it stopped.
