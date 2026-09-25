// github#142

/**
 * @param {{ api: string, button: string, logo: string, stage: string }} at
 * @returns {string}
 */
export function pngCaptureJs(at) {
  return `(async function(){
  var real = HTMLAnchorElement.prototype.click;
  var href = null, layers = null;
  var painted = function (cv) {
    var c = document.createElement('canvas');
    c.width = cv.width; c.height = cv.height;
    var x = c.getContext('2d');
    x.drawImage(cv, 0, 0);
    var d = x.getImageData(0, 0, c.width, c.height).data, n = 0;
    for (var i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
    return n;
  };
  // github#142
  HTMLAnchorElement.prototype.click = function () {
    if (!this.download) return real.apply(this, arguments);
    href = this.href;
    var cv = (${at.api}).renderer.getCanvases();
    layers = { edges: painted(cv.edges), nodes: painted(cv.nodes) };
  };
  try { (${at.button}).click(); } finally { HTMLAnchorElement.prototype.click = real; }
  if (href === null) return { clicked: false };

  var img = new Image();
  await new Promise(function (res, rej) { img.onload = res; img.onerror = rej; img.src = href; });
  var out = document.createElement('canvas');
  out.width = img.naturalWidth; out.height = img.naturalHeight;
  var cx = out.getContext('2d');
  cx.drawImage(img, 0, 0);
  var d = cx.getImageData(0, 0, out.width, out.height).data;
  // github#142
  var br = d[0], bg = d[1], bb = d[2];
  var lg = ${at.logo}, stage = ${at.stage}, box = null;
  if (lg && !lg.hidden) {
    var w = parseFloat(lg.style.width) || 0;
    var dpr = out.width / ((stage && stage.clientWidth) || out.width);
    if (w > 0) box = { x: (parseFloat(lg.style.left) - w / 2) * dpr,
                       y: (parseFloat(lg.style.top) - w / 2) * dpr, s: w * dpr };
  }
  var graphPx = 0, logoPx = 0;
  for (var y = 0; y < out.height; y++) {
    for (var x = 0; x < out.width; x++) {
      var i = (y * out.width + x) * 4;
      if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb) < 12) continue;
      if (box && x >= box.x && x < box.x + box.s && y >= box.y && y < box.y + box.s) logoPx++;
      else graphPx++;
    }
  }
  return { clicked: true, bytes: href.length, layers: layers,
           graphPx: graphPx, logoPx: logoPx, w: out.width, h: out.height };
})()`;
}

// github#142
const PNG_GRAPH_PX_MIN = 2000;

/**
 * @param {{ clicked: boolean, layers?: { edges: number, nodes: number }, graphPx?: number }} r
 * @returns {boolean}
 */
export function pngCarriesGraph(r) {
  return !!r.clicked && !!r.layers && r.layers.edges > 0 && r.layers.nodes > 0 &&
         (r.graphPx || 0) > PNG_GRAPH_PX_MIN;
}

/**
 * @param {{ clicked: boolean, bytes?: number, layers?: { edges: number, nodes: number }, graphPx?: number, logoPx?: number, w?: number, h?: number }} r
 * @returns {string}
 */
export function pngCaptureDetail(r) {
  if (!r.clicked) return "the PNG button never reached its download";
  return `${r.w}x${r.h}, ${Math.round((r.bytes || 0) / 1024)} kB of data URL; at the moment of ` +
         `the copy the edge layer held ${r.layers?.edges} painted px and the node layer ` +
         `${r.layers?.nodes}; the saved file differs from its background in ${r.graphPx} px ` +
         `outside the logo and ${r.logoPx} px inside it`;
}
