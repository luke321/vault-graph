
import { createConnection } from "node:net";
import { randomBytes, createHash } from "node:crypto";
import { get } from "node:http";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function json(port, path) {
  return new Promise((resolve, reject) => {
    const req = get({ host: "127.0.0.1", port, path }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => {
        try { resolve(JSON.parse(b)); } catch { reject(new Error(`bad JSON from ${path}: ${b.slice(0, 200)}`)); }
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
    this.frag = [];
    this.onText = () => {};
    sock.on("data", (d) => this.feed(d));
  }

  feed(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f;
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

      if (op === 0x8) { this.sock.end(); return; }
      if (op === 0x9) { this.send(payload, 0xa); continue; }
      if (op === 0xa) continue;
      if (op === 0x0 || op === 0x1) {
        this.frag.push(payload);
        if (fin) {
          const text = Buffer.concat(this.frag).toString("utf8");
          this.frag = [];
          this.onText(text);
        }
        continue;
      }
    }
  }

  send(payload, op = 0x1) {
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
    const n = data.length;
    const head = n < 126 ? 2 : n < 65536 ? 4 : 10;
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
      const rest = Buffer.from(head.slice(i + 4), "latin1");
      resolve(ws);
      if (rest.length) ws.feed(rest);
    };
    sock.on("data", onData);
  });
}

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

  const errors = [];
  listeners.push((msg) => {
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params?.exceptionDetails || {};
      errors.push({
        kind: "exception",
        text: d.exception?.description || d.text || "unknown exception",
        line: d.lineNumber, col: d.columnNumber, url: d.url || "",
      });
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
      errors.push({
        kind: "console",
        text: (msg.params.args || [])
          .map((a) => a.description ?? a.value ?? a.type).join(" "),
      });
    }
  });
  await send("Runtime.enable").catch(() => {});

  return {
    target: page,
    send,
    on: (fn) => listeners.push(fn),
    get errors() { return errors.slice(); },
    firstError() {
      if (!errors.length) return null;
      const e = errors[0];
      return e.kind + ": " + String(e.text).split(String.fromCharCode(10))[0] +
             (e.line != null ? " (line " + (e.line + 1) + ")" : "");
    },
    get lost() { return dead; },
    close: () => ws.close(),

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
