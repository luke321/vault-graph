// A minimal Chrome DevTools Protocol client. No dependencies, on purpose.
//
// CDP commands need a WebSocket -- Chrome's /json HTTP endpoints only list and open
// targets, everything else is over the socket. Node 18 has no WebSocket global (it
// landed in 22), and this repo installs nothing, so the ~80 lines below are a WebSocket
// client: HTTP Upgrade, then RFC 6455 frames.
//
// It implements exactly what driving a page needs and no more: text frames, client
// masking (mandatory), server frames unmasked, close and ping. No compression
// (`permessage-deflate` is never offered), no fragmentation on send, and continuation
// frames on receive are reassembled because a big Runtime.evaluate result does arrive
// split.

import { createConnection } from "node:net";
import { randomBytes, createHash } from "node:crypto";
import { get } from "node:http";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** GET a JSON endpoint on the debugging port. */
function json(port, path) {
  return new Promise((resolve, reject) => {
    const req = get({ host: "127.0.0.1", port, path }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => {
        try { resolve(JSON.parse(b)); } catch (e) { reject(new Error(`bad JSON from ${path}: ${b.slice(0, 200)}`)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(4000, () => req.destroy(new Error("timeout")));
  });
}

class Socket {
  constructor(sock) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.frag = [];      // continuation reassembly
    this.onText = () => {};
    sock.on("data", (d) => this.feed(d));
  }

  feed(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f;
      // Server-to-client frames are never masked, per spec; Chrome obeys.
      let len = b1 & 0x7f, off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > 268435456n) throw new Error("frame too large");
        len = Number(big); off = 10;
      }
      if (this.buf.length < off + len) return;
      const payload = this.buf.subarray(off, off + len);
      this.buf = this.buf.subarray(off + len);

      if (op === 0x8) { this.sock.end(); return; }          // close
      if (op === 0x9) { this.send(payload, 0xa); continue; } // ping -> pong
      if (op === 0xa) continue;                             // pong
      if (op === 0x0 || op === 0x1) {
        this.frag.push(payload);
        if (fin) {
          const text = Buffer.concat(this.frag).toString("utf8");
          this.frag = [];
          this.onText(text);
        }
        continue;
      }
      // any other opcode: ignore rather than die -- nothing we send provokes one
    }
  }

  send(payload, op = 0x1) {
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
    const n = data.length;
    const head = n < 126 ? 2 : n < 65536 ? 4 : 10;
    // +4 for the mask: every client frame MUST be masked or Chrome closes the socket.
    const out = Buffer.alloc(head + 4 + n);
    out[0] = 0x80 | op;
    if (head === 2) out[1] = 0x80 | n;
    else if (head === 4) { out[1] = 0x80 | 126; out.writeUInt16BE(n, 2); }
    else { out[1] = 0x80 | 127; out.writeBigUInt64BE(BigInt(n), 2); }
    const mask = randomBytes(4);
    mask.copy(out, head);
    for (let i = 0; i < n; i++) out[head + 4 + i] = data[i] ^ mask[i & 3];
    this.sock.write(out);
  }

  close() { try { this.send(Buffer.alloc(0), 0x8); } catch {} this.sock.end(); }
}

function upgrade(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = randomBytes(16).toString("base64");
    const expect = createHash("sha1").update(key + GUID).digest("base64");
    const sock = createConnection({ host: u.hostname, port: Number(u.port || 80) }, () => {
      sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
        `Host: ${u.host}\r\n` +
        "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
      );
    });
    sock.once("error", reject);
    let head = "";
    const onData = (d) => {
      head += d.toString("latin1");
      const i = head.indexOf("\r\n\r\n");
      if (i < 0) return;
      sock.removeListener("data", onData);
      if (!/^HTTP\/1\.1 101/.test(head)) return reject(new Error("upgrade refused: " + head.split("\r\n")[0]));
      if (!head.toLowerCase().includes("sec-websocket-accept: " + expect.toLowerCase())) {
        return reject(new Error("bad Sec-WebSocket-Accept"));
      }
      const ws = new Socket(sock);
      // Bytes after the header belong to the first frame.
      const rest = Buffer.from(head.slice(i + 4), "latin1");
      resolve(ws);
      if (rest.length) ws.feed(rest);
    };
    sock.on("data", onData);
  });
}

/**
 * Attach to a page target on `port` whose URL contains `match`.
 *
 * A NON-EMPTY `match` IS A REQUIREMENT, NOT A PREFERENCE. This used to fall back to any
 * page when the match found nothing, which is the worst of both: the caller asks for a
 * specific page, does not get it, and is handed a different one silently.
 *
 * What that cost: a killed run leaves its Chrome behind, still listening. The next run
 * launches its own, attaches to the LEFTOVER, and drives a page from a previous build --
 * so the checks report real-looking failures about code that is fine. Diagnosed as three
 * different bugs before the note count gave it away (`1402 notes` under a build that had
 * just said 455). Failing here turns that into one clear error instead.
 */
export async function attach(port, match = "") {
  const targets = await json(port, "/json/list");
  const pages = targets.filter((t) => t.type === "page");
  const page = match
    ? pages.find((t) => (t.url || "").includes(match))
    : pages[0];
  if (!page && match && pages.length) {
    throw new Error(
      `no page target on port ${port} matching ${match} -- found ` +
      pages.map((t) => t.url).join(", ") +
      `. A Chrome from an earlier run is probably still on this port.`
    );
  }
  if (!page) throw new Error(`no page target on port ${port}` + (match ? ` matching ${match}` : ""));
  const ws = await upgrade(page.webSocketDebuggerUrl);

  let seq = 0;
  const pending = new Map();
  const listeners = [];

  // A DEAD SOCKET HAS TO SAY SO. There was no close or error handler here, so when the
  // connection went the driver did not notice: onText simply never fired again and every
  // subsequent command sat until its own 30-second timeout. One dropped socket therefore
  // presented as a long tail of unrelated failures, each costing 30s -- measured once as 13
  // checks failing over 390 seconds, reported as "the tests are slow" and looking for all the
  // world like thirteen separate bugs in thirteen separate features.
  //
  // Now the first command after the drop fails immediately and says what happened, and any
  // command already in flight is rejected rather than left to time out.
  let dead = null;
  const die = (why) => {
    if (dead) return;
    dead = why;
    for (const [id, p] of pending) {
      pending.delete(id);
      p.reject(new Error("CDP connection lost (" + why + ")"));
    }
  };
  ws.sock.on("close", () => die("socket closed"));
  ws.sock.on("error", (e) => die(e.message || "socket error"));
  ws.onText = (text) => {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message || JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      if (dead) {
        reject(new Error("CDP connection lost (" + dead + ") before " + method));
        return;
      }
      const id = ++seq;
      // The timeout is CLEARED on completion, and that matters far more than it looks.
      // An outstanding setTimeout keeps Node's event loop alive, so leaving one armed per
      // command made the driver process linger a full 30s past its last command -- and
      // because record-demo.ps1 stops ffmpeg when the driver RETURNS, every recording came
      // out 30s longer than the demo. Measured: a 6.9s walkthrough produced a 39.2s video,
      // 32s of it a still frame. The driver's own log said 6.94s throughout, which is what
      // made it invisible: the process was done, it just would not exit.
      // TEN SECONDS, NOT THIRTY, and the error says what was being asked.
      //
      // Thirty was a value chosen when nothing here could plausibly take that long, and it
      // became the cost of every command issued after a page stopped answering: a wedged
      // renderer produced a tail of thirty-second waits, once totalling 390 seconds across
      // thirteen checks and reading as thirteen unrelated bugs. The slowest legitimate command
      // in this repo is a screenshot of a 10k-note page, comfortably under a second, so ten is
      // still thirty times the headroom -- and it turns a six-minute mystery into a minute.
      const label = method === "Runtime.evaluate"
        ? "Runtime.evaluate " + JSON.stringify(String(params.expression || "").slice(0, 70))
        : method;
      const timer = setTimeout(() => {
        if (pending.delete(id)) reject(new Error(label + " got no reply in 10s"));
      }, 10000);
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject:  (e) => { clearTimeout(timer); reject(e); }
      });
      ws.send(JSON.stringify({ id, method, params }));
    });

  return {
    target: page,
    send,
    on: (fn) => listeners.push(fn),
    // Why the connection went, or null while it is up. A long run can then stop at the first
    // sign of it rather than working through every remaining step against a closed socket.
    get lost() { return dead; },
    close: () => ws.close(),

    /** Evaluate an expression in the page and return its value. */
    async eval(expr) {
      const r = await send("Runtime.evaluate", {
        expression: expr, returnByValue: true, awaitPromise: true
      });
      if (r.exceptionDetails) {
        throw new Error("page threw: " + (r.exceptionDetails.exception?.description
                                       || r.exceptionDetails.text));
      }
      return r.result?.value;
    }
  };
}

export { json };
