const $ = id => document.getElementById(id);
const video = $('video');
let url = null, dur = 0, rs = 0, re = 0;
const MAX_FRAMES = 400;

const loading = msg => { $('loading').hidden = !msg; if (msg) $('loadmsg').textContent = msg; };
const seek = t => new Promise(res => {
  const h = () => { video.removeEventListener('seeked', h); res(); };
  video.addEventListener('seeked', h); video.currentTime = Math.min(t, dur - 0.001);
});
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Estimate native fps by timing presented frames (needs requestVideoFrameCallback)
async function detectFps() {
  if (!('requestVideoFrameCallback' in video)) return 30;
  const times = [];
  video.currentTime = 0;
  await new Promise(r => { video.onseeked = r; if (video.currentTime === 0) r(); });
  await new Promise(done => {
    const cb = (_, m) => {
      times.push(m);
      if (times.length >= 12) done(); else video.requestVideoFrameCallback(cb);
    };
    video.requestVideoFrameCallback(cb);
    video.play().catch(done);
    setTimeout(done, 1500);
  });
  video.pause(); video.currentTime = 0;
  const d = times.slice(1).map((t, i) => t - times[i]).filter(x => x > 0).sort((a, b) => a - b);
  return d.length ? clamp(Math.round(1 / d[Math.floor(d.length / 2)]), 1, 60) : 30;
}

// ---- file input
const drop = $('drop'), file = $('file');
drop.onclick = () => file.click();
drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') file.click(); };
file.onchange = () => file.files[0] && load(file.files[0]);
['dragover', 'dragenter'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
document.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) load(f); });
$('new').onclick = () => { video.pause(); $('editor').hidden = true; drop.hidden = false; file.value = ''; };

async function load(f) {
  if (!f.type.startsWith('video/')) return alert('Please choose a video file.');
  loading('Reading video…');
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(f);
  video.src = url;
  try {
    await new Promise((ok, no) => { video.onloadeddata = ok; video.onerror = () => no(); });
  } catch { loading(); return alert('Could not decode this video in your browser.'); }
  loading();
  dur = video.duration;
  drop.hidden = true; $('editor').hidden = false; $('result').hidden = true;
  const maxW = Math.max(120, Math.floor(video.videoWidth / 20) * 20);
  $('width').max = Math.min(1280, maxW);
  $('width').value = Math.min(480, maxW); $('wv').textContent = $('width').value;
  const slow = setTimeout(() => $('detect').hidden = false, 1000);
  const fps = await detectFps();
  clearTimeout(slow); $('detect').hidden = true;
  $('fps').value = fps; $('fpsv').textContent = fps;
  rs = 0; re = dur; video.currentTime = 0;
  render();
}

// ---- timeline
const tl = $('timeline');
const pct = t => (t / dur * 100) + '%';
const timeAt = e => { const r = tl.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * dur; };

function render() {
  $('sel').style.left = pct(rs);
  $('sel').style.width = ((re - rs) / dur * 100) + '%';
  $('playhead').style.left = pct(video.currentTime);
  $('time').textContent = `${fmt(video.currentTime)} / ${fmt(dur)}`;
  $('rs').textContent = fmt(rs); $('re').textContent = fmt(re);
  $('rd').textContent = (re - rs).toFixed(1) + 's';
  const n = frameCount();
  $('rf').textContent = n + (n >= MAX_FRAMES ? ' (max)' : '');
  $('export').disabled = re - rs < 0.05;
}
const frameCount = () => Math.min(MAX_FRAMES, Math.max(1, Math.floor((re - rs) * +$('fps').value)));

let drag = null;
tl.addEventListener('pointerdown', e => {
  tl.setPointerCapture(e.pointerId);
  drag = e.target.id === 'h1' ? 'h1' : e.target.id === 'h2' ? 'h2' : 'head';
  move(e);
});
tl.addEventListener('pointermove', e => drag && move(e));
tl.addEventListener('pointerup', () => drag = null);
function move(e) {
  const t = timeAt(e);
  if (drag === 'h1') { rs = Math.min(t, re - 0.05); video.currentTime = rs; }
  else if (drag === 'h2') { re = Math.max(t, rs + 0.05); video.currentTime = re; }
  else video.currentTime = t;
  render();
}
$('setStart').onclick = () => { rs = Math.min(video.currentTime, re - 0.05); render(); };
$('setEnd').onclick = () => { re = Math.max(video.currentTime, rs + 0.05); render(); };
$('reset').onclick = () => { rs = 0; re = dur; render(); };

// ---- playback (loops within range)
const toggle = () => {
  if (video.paused) {
    if (video.currentTime < rs || video.currentTime >= re - 0.05) video.currentTime = rs;
    video.play();
  } else video.pause();
};
$('play').onclick = toggle;
video.onclick = toggle;
video.onplay = () => $('play').textContent = '⏸';
video.onpause = () => $('play').textContent = '▶';
video.ontimeupdate = render;
(function raf() {
  if (!video.paused) { if (video.currentTime >= re) video.currentTime = rs; render(); }
  requestAnimationFrame(raf);
})();
document.addEventListener('keydown', e => {
  if ($('editor').hidden || /INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
  if (e.key === ' ') { e.preventDefault(); toggle(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  else if (e.key === 'i') $('setStart').click();
  else if (e.key === 'o') $('setEnd').click();
});

// ---- frame step (one export-fps frame)
const step = d => { video.pause(); video.currentTime = clamp(video.currentTime + d / +$('fps').value, 0, dur); render(); };
$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);

// ---- settings
$('fps').oninput = () => { $('fpsv').textContent = $('fps').value; render(); };
$('width').oninput = () => $('wv').textContent = $('width').value;
$('quality').oninput = () => $('qv').textContent = $('quality').value;

// ---- export
$('export').onclick = async () => {
  video.pause();
  const btn = $('export'); btn.disabled = true;
  $('progress').hidden = false; $('result').hidden = true; $('bar').style.width = '0';
  const fps = +$('fps').value, n = frameCount();
  const w = +$('width').value, h = Math.round(w * video.videoHeight / video.videoWidth);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const gif = new GIF({ workers: 2, quality: +$('quality').value, width: w, height: h,
    workerScript: 'vendor/gif.worker.js', repeat: $('loop').checked ? 0 : -1 });
  const keep = video.currentTime;
  for (let i = 0; i < n; i++) {
    await seek(rs + i / fps);
    ctx.drawImage(video, 0, 0, w, h);
    gif.addFrame(ctx, { copy: true, delay: Math.round(1000 / fps) });
    $('bar').style.width = (i / n * 50) + '%';
  }
  video.currentTime = keep;
  gif.on('progress', p => $('bar').style.width = (50 + p * 50) + '%');
  gif.on('finished', blob => {
    const u = URL.createObjectURL(blob);
    $('out').src = u; $('dl').href = u;
    $('size').textContent = `(${(blob.size / 1048576).toFixed(2)} MB)`;
    $('result').hidden = false; $('progress').hidden = true; btn.disabled = false;
  });
  gif.render();
};
