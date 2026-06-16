import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CameraOff, Sparkles, ShieldAlert } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Client-side geometry helpers — same formulas as backend face_analyzer.py
// ─────────────────────────────────────────────────────────────────────────────
const GOLDEN_RATIO = 1.618;

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function angle2d(p1, p2, p3) {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.sqrt(v1.x ** 2 + v1.y ** 2) * Math.sqrt(v2.x ** 2 + v2.y ** 2) + 1e-6;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI);
}

function normScore(value, optimal, tolerance) {
  if (optimal === 0) return 0;
  return Math.max(0, Math.min(1, 1 - Math.abs(value - optimal) / optimal / tolerance));
}

function clamp(v, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)); }

function computeScores(lm) {
  let harmony = 0.5, goldenRatio = 0.5, symmetry = 0.5, eyeAesthetics = 0.5,
      jawline = 0.5, eyebrowShape = 0.5, noseAesthetics = 0.5, lipAesthetics = 0.5,
      cheekbones = 0.5, faceShape = 0.5;

  try { // Harmony (Facial Thirds)
    const u = dist(lm[10], lm[151]), m = dist(lm[151], lm[2]), l = dist(lm[2], lm[152]);
    const total = u + m + l, ideal = total / 3;
    harmony = clamp(1 - (Math.abs(u-ideal)+Math.abs(m-ideal)+Math.abs(l-ideal))/ideal/3);
  } catch(_) {}

  try { // Golden Ratio
    const w = dist(lm[234], lm[454]), h = dist(lm[10], lm[152]);
    if (h > 0) goldenRatio = normScore(w / h, 1 / GOLDEN_RATIO, 0.18);
  } catch(_) {}

  try { // Symmetry
    const c = lm[1];
    const pairs = [[33,263],[133,362],[70,300],[107,336],[61,291],[234,454],[172,397]];
    const s = pairs.map(([L,R]) => {
      const ld = Math.abs(lm[L].x - c.x), rd = Math.abs(lm[R].x - c.x);
      return 1 - Math.abs(ld - rd) / Math.max(ld + rd, 1e-6);
    });
    symmetry = clamp(s.reduce((a,b)=>a+b,0)/s.length);
  } catch(_) {}

  try { // Eye Aesthetics
    const lw = dist(lm[33],lm[133]), rw = dist(lm[263],lm[362]);
    const inter = dist(lm[133],lm[362]), avg = (lw+rw)/2;
    eyeAesthetics = normScore(avg > 0 ? inter/avg : 0, 1.0, 0.25);
  } catch(_) {}

  try { // Jawline
    jawline = normScore(angle2d(lm[234], lm[172], lm[152]), 125, 25);
  } catch(_) {}

  try { // Eyebrow Shape
    const la = angle2d(lm[70],lm[105],lm[107]), ra = angle2d(lm[300],lm[334],lm[336]);
    eyebrowShape = clamp((normScore(Math.abs(la-ra),0,15) + normScore((la+ra)/2,160,30))/2);
  } catch(_) {}

  try { // Nose
    const nw = dist(lm[129],lm[358]), nh = dist(lm[168],lm[2]);
    if (nw > 0) noseAesthetics = clamp(normScore(nh/nw, 0.8, 0.3));
  } catch(_) {}

  try { // Lips
    const up = dist(lm[13],lm[0]), lo = dist(lm[14],lm[17]);
    if (lo > 0) lipAesthetics = clamp(normScore(up/lo, 0.5, 0.4));
  } catch(_) {}

  try { // Cheekbones
    const n = lm[1], ld = Math.abs(lm[234].x-n.x), rd = Math.abs(lm[454].x-n.x);
    cheekbones = clamp(1 - Math.abs(ld-rd)/Math.max(ld+rd,1e-6));
  } catch(_) {}

  try { // Face Shape
    const fh = dist(lm[10],lm[152]), fw = dist(lm[234],lm[454]);
    if (fw > 0) faceShape = clamp(normScore(fh/fw, 1.5, 0.3));
  } catch(_) {}

  const details = {
    'Symmetry':        +(symmetry*100).toFixed(1),
    'Golden Ratio':    +(goldenRatio*100).toFixed(1),
    'Harmony':         +(harmony*100).toFixed(1),
    'Eye Aesthetics':  +(eyeAesthetics*100).toFixed(1),
    'Eyebrow Shape':   +(eyebrowShape*100).toFixed(1),
    'Nose Aesthetics': +(noseAesthetics*100).toFixed(1),
    'Lip Aesthetics':  +(lipAesthetics*100).toFixed(1),
    'Jawline':         +(jawline*100).toFixed(1),
    'Cheekbones':      +(cheekbones*100).toFixed(1),
    'Face Shape':      +(faceShape*100).toFixed(1),
  };

  const weights = {
    'Symmetry':0.20,'Golden Ratio':0.15,'Harmony':0.10,'Eye Aesthetics':0.12,
    'Eyebrow Shape':0.06,'Nose Aesthetics':0.08,'Lip Aesthetics':0.10,
    'Jawline':0.09,'Cheekbones':0.05,'Face Shape':0.05,
  };

  const total = +Object.keys(weights).reduce((s,k)=>s+details[k]*weights[k],0).toFixed(1);
  return { total, details };
}

// ─────────────────────────────────────────────────────────────────────────────
// Face mesh drawing (canvas-based, mirrors flipped video)
// ─────────────────────────────────────────────────────────────────────────────
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
const L_EYE    = [33,160,158,133,153,144];
const R_EYE    = [362,385,387,263,373,380];
const L_BROW   = [70,63,105,66,107,55,65,52,53,46];
const R_BROW   = [336,296,334,293,300,285,295,282,283,276];
const LIPS     = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const NOSE     = [168,6,197,195,5,4,1,19,94,2];
const KEY_PTS  = [1,10,152,33,263,61,291,234,454,9,168];

function polyline(ctx, lm, idx, close, W, H) {
  if (!lm || idx.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(lm[idx[0]].x * W, lm[idx[0]].y * H);
  for (let i = 1; i < idx.length; i++) ctx.lineTo(lm[idx[i]].x * W, lm[idx[i]].y * H);
  if (close) ctx.closePath();
  ctx.stroke();
}

function drawFaceMesh(ctx, lm, W, H) {
  if (!lm) return;

  // Micro dots (tesselation feel)
  ctx.fillStyle = 'rgba(0,229,255,0.15)';
  for (let i = 0; i < lm.length; i += 4) {
    ctx.beginPath();
    ctx.arc(lm[i].x * W, lm[i].y * H, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Face oval
  ctx.strokeStyle = 'rgba(177,126,255,0.7)'; ctx.lineWidth = 1.5;
  polyline(ctx, lm, FACE_OVAL, true, W, H);

  // Eyes
  ctx.strokeStyle = 'rgba(0,229,255,0.95)'; ctx.lineWidth = 1.5;
  polyline(ctx, lm, L_EYE, true, W, H);
  polyline(ctx, lm, R_EYE, true, W, H);

  // Eyebrows
  ctx.strokeStyle = 'rgba(255,179,71,0.8)'; ctx.lineWidth = 1.5;
  polyline(ctx, lm, L_BROW, false, W, H);
  polyline(ctx, lm, R_BROW, false, W, H);

  // Lips
  ctx.strokeStyle = 'rgba(255,62,181,0.85)'; ctx.lineWidth = 1.5;
  polyline(ctx, lm, LIPS, true, W, H);

  // Nose
  ctx.strokeStyle = 'rgba(0,255,157,0.75)'; ctx.lineWidth = 1.2;
  polyline(ctx, lm, NOSE, false, W, H);

  // Key dots
  ctx.fillStyle = '#00e5ff';
  KEY_PTS.forEach(i => {
    ctx.beginPath();
    ctx.arc(lm[i].x * W, lm[i].y * H, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function scoreColor(s) {
  if (s >= 85) return '#00ff9d';
  if (s >= 75) return '#00e5ff';
  if (s >= 65) return '#b17eff';
  if (s >= 50) return '#ffb347';
  return '#ff3eb5';
}
function scoreLabel(s) {
  if (s >= 85) return 'EXCEPTIONAL';
  if (s >= 75) return 'EXCELLENT';
  if (s >= 65) return 'VERY GOOD';
  if (s >= 50) return 'GOOD';
  return 'AVERAGE';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function ScanPage({ token, user, onScanComplete }) {
  const [mpReady, setMpReady]           = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [scanning, setScanning]         = useState(false);
  const [progress, setProgress]         = useState(0);
  const [statusMsg, setStatusMsg]       = useState('Loading face detector…');
  const [timeLeft, setTimeLeft]         = useState(30);
  const [liveScore, setLiveScore]       = useState(null);
  const [liveDetails, setLiveDetails]   = useState(null);
  const [error, setError]               = useState('');

  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const fmRef       = useRef(null);      // FaceMesh instance
  const lmRef       = useRef(null);      // latest mirrored landmarks
  const animRef     = useRef(null);
  const bufRef      = useRef([]);        // rolling score buffer
  const wsRef       = useRef(null);
  const frameIntRef = useRef(null);
  const timerIntRef = useRef(null);
  const capCanvas   = useRef(document.createElement('canvas'));

  // ── 1. Camera ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let stream = null;
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false })
      .then(s => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setError('Camera access denied. Allow camera permissions and reload.'));
    return () => stream && stream.getTracks().forEach(t => t.stop());
  }, []);

  // ── 2. MediaPipe FaceMesh via CDN global (window.FaceMesh) ───────────────
  useEffect(() => {
    // Poll until the CDN script has loaded window.FaceMesh
    let attempts = 0;
    const MAX = 60; // 6 seconds max

    function tryInit() {
      if (window.FaceMesh) {
        initFaceMesh();
      } else if (attempts++ < MAX) {
        setTimeout(tryInit, 100);
      } else {
        setError('MediaPipe CDN failed to load. Check internet connection.');
        setMpReady(true); // allow server-only mode
        setStatusMsg('Falling back to server-only analysis.');
      }
    }

    function initFaceMesh() {
      try {
        const fm = new window.FaceMesh({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`,
        });
        fm.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });
        fm.onResults((results) => {
          const raw = results.multiFaceLandmarks?.[0] ?? null;
          if (raw) {
            // Mirror x to match flipped canvas render
            const mirrored = raw.map(p => ({ x: 1 - p.x, y: p.y, z: p.z || 0 }));
            lmRef.current = mirrored;
            const { total, details } = computeScores(mirrored);
            const buf = bufRef.current;
            buf.push(total);
            if (buf.length > 8) buf.shift();
            const smoothed = +(buf.reduce((a,b)=>a+b,0)/buf.length).toFixed(1);
            setLiveScore(smoothed);
            setLiveDetails(details);
            setFaceDetected(true);
          } else {
            lmRef.current = null;
            setFaceDetected(false);
          }
        });
        fmRef.current = fm;
        setMpReady(true);
        setStatusMsg('Face detector ready. Position your face in the frame.');
      } catch (e) {
        setError(`Face detector init failed: ${e.message}`);
        setMpReady(true);
        setStatusMsg('Falling back to server-only analysis.');
      }
    }

    tryInit();
    return () => { fmRef.current = null; };
  }, []);

  // ── 3. Render loop ────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    async function frame() {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) { if (active) animRef.current = requestAnimationFrame(frame); return; }

      const ctx = canvas.getContext('2d');
      const W   = canvas.width  = video.videoWidth  || 640;
      const H   = canvas.height = video.videoHeight || 480;

      if (video.readyState >= 2) {
        // Draw mirrored video
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, W, H);
        ctx.restore();

        // Send to MediaPipe
        if (fmRef.current && video.readyState >= 2) {
          try { await fmRef.current.send({ image: video }); } catch(_) {}
        }

        // Draw mesh
        drawFaceMesh(ctx, lmRef.current, W, H);

        // Vignette during scan
        if (scanning) {
          const g = ctx.createRadialGradient(W/2,H/2,W*0.28,W/2,H/2,W*0.72);
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(1, 'rgba(5,5,9,0.5)');
          ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
        }
      }
      if (active) animRef.current = requestAnimationFrame(frame);
    }

    animRef.current = requestAnimationFrame(frame);
    return () => { active = false; cancelAnimationFrame(animRef.current); };
  }, [scanning]);

  // ── 4. Scan controls ─────────────────────────────────────────────────────
  const startScan = useCallback(() => {
    if (!mpReady) return;
    setError(''); setScanning(true); setProgress(0); setTimeLeft(30);
    bufRef.current = [];
    setStatusMsg('Connecting to server…');

    const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/,'');
    const proto = base.startsWith('https') ? 'wss' : 'ws';
    const host  = base.replace(/^https?:\/\//,'');
    const ws = new WebSocket(`${proto}://${host}/ws/scan?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatusMsg('Analysing your face…');
      frameIntRef.current = setInterval(() => {
        const v = videoRef.current;
        if (!v || ws.readyState !== WebSocket.OPEN) return;
        const c = capCanvas.current;
        c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob(blob => {
          if (blob && ws.readyState === WebSocket.OPEN)
            blob.arrayBuffer().then(buf => ws.send(buf));
        }, 'image/jpeg', 0.82);
      }, 2000);

      timerIntRef.current = setInterval(() => {
        setTimeLeft(p => { if (p <= 1) { clearInterval(timerIntRef.current); return 0; } return p-1; });
      }, 1000);
    };

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === 'progress') { setProgress(d.progress); setStatusMsg(d.message); }
      else if (d.type === 'complete') { stopScan(); onScanComplete(d); }
      else if (d.type === 'error') { setError(d.message); stopScan(); }
    };

    ws.onerror = () => { setError('WebSocket error. Is the backend online?'); stopScan(); };
    ws.onclose = () => setScanning(false);
  }, [mpReady, token, onScanComplete]);

  const stopScan = useCallback(() => {
    setScanning(false);
    clearInterval(frameIntRef.current); clearInterval(timerIntRef.current);
    frameIntRef.current = null; timerIntRef.current = null;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'cancel' }));
      wsRef.current.close();
    }
    wsRef.current = null;
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const col = liveScore ? scoreColor(liveScore) : 'var(--accent-cyan)';
  const canStart = mpReady && faceDetected && !scanning;

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto' }}>
      {/* Header */}
      <div className="glass-panel" style={{ textAlign:'center', marginBottom:'28px' }}>
        <h2 style={{ fontSize:'1.9rem', marginBottom:'8px' }}>AI Face Mesh Scanner</h2>
        <p style={{ color:'var(--text-secondary)', maxWidth:'620px', margin:'0 auto', fontSize:'0.93rem' }}>
          Live 468-point face mesh renders directly in your browser.
          Hold still for 30 s and rotate slowly left-to-right for best accuracy.
        </p>
      </div>

      {error && (
        <div className="alert-warning" style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'20px' }}>
          <ShieldAlert size={22} /><span>{error}</span>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 240px', gap:'24px', alignItems:'start' }}>

        {/* Left: canvas */}
        <div>
          <div style={{
            position:'relative', borderRadius:'20px', overflow:'hidden', background:'#000',
            border:`2px solid ${faceDetected ? 'rgba(0,229,255,0.55)' : 'rgba(255,255,255,0.1)'}`,
            boxShadow: faceDetected ? '0 0 35px rgba(0,229,255,0.18)' : '0 20px 50px rgba(0,0,0,0.5)',
            transition:'border-color 0.4s, box-shadow 0.4s', aspectRatio:'4/3',
          }}>
            {/* Real video — hidden, used as MediaPipe input */}
            <video ref={videoRef} autoPlay playsInline muted
              style={{ position:'absolute', opacity:0, pointerEvents:'none', width:1, height:1 }} />

            {/* Canvas with mesh overlay */}
            <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block' }} />

            {/* Face detected badge */}
            <div style={{
              position:'absolute', top:14, left:14,
              display:'flex', alignItems:'center', gap:'7px',
              background:'rgba(0,0,0,0.75)', backdropFilter:'blur(8px)',
              border:`1px solid ${faceDetected ? 'rgba(0,255,157,0.5)' : 'rgba(255,62,181,0.4)'}`,
              padding:'5px 12px', borderRadius:'20px',
              fontSize:'0.75rem', fontFamily:'var(--font-heading)', fontWeight:700,
              color: faceDetected ? '#00ff9d' : '#ff3eb5', transition:'all 0.3s',
            }}>
              <div style={{
                width:8, height:8, borderRadius:'50%',
                background: faceDetected ? '#00ff9d' : '#ff3eb5',
                boxShadow: `0 0 8px ${faceDetected ? '#00ff9d' : '#ff3eb5'}`,
              }} />
              {!mpReady ? 'LOADING…' : faceDetected ? 'FACE DETECTED' : 'NO FACE'}
            </div>

            {/* Loading spinner when MP is not ready */}
            {!mpReady && (
              <div style={{
                position:'absolute', inset:0, display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center',
                background:'rgba(5,5,9,0.65)', backdropFilter:'blur(4px)',
              }}>
                <div style={{
                  width:48, height:48, borderRadius:'50%',
                  border:'3px solid rgba(0,229,255,0.15)',
                  borderTopColor:'var(--accent-cyan)',
                  animation:'spin 0.9s linear infinite', marginBottom:14,
                }} />
                <p style={{ color:'var(--accent-cyan)', fontSize:'0.85rem', fontFamily:'var(--font-heading)' }}>
                  Loading face detector…
                </p>
              </div>
            )}

            {/* Oval guide when no face */}
            {mpReady && !faceDetected && (
              <div style={{
                position:'absolute', top:'50%', left:'50%',
                transform:'translate(-50%,-52%)',
                width:'44%', height:'62%',
                border:'2px dashed rgba(0,229,255,0.4)', borderRadius:'50%',
                pointerEvents:'none', animation:'glow-pulse 2s infinite ease-in-out',
              }} />
            )}

            {scanning && <>
              <div className="laser-line" />
              <div className="countdown-badge">SCANNING: {timeLeft}s</div>
            </>}
          </div>

          {/* Controls */}
          <div className="glass-panel" style={{ marginTop:'20px' }}>
            {!scanning ? (
              <div style={{ textAlign:'center' }}>
                <button onClick={startScan} className="btn-primary"
                  style={{ width:'100%', justifyContent:'center', fontSize:'1rem', opacity: canStart ? 1 : 0.55 }}
                  disabled={!canStart}>
                  <Camera size={20} />
                  {!mpReady ? 'Loading detector…' : !faceDetected ? 'Position face to begin…' : 'Begin 30s Analysis'}
                </button>
                <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:'10px' }}>
                  Analysing as{' '}
                  <strong style={{ color: user?.gender==='male' ? 'var(--accent-cyan)' : 'var(--accent-pink)' }}>
                    {user?.gender?.toUpperCase()}
                  </strong>
                </p>
              </div>
            ) : (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px', fontSize:'0.9rem', fontWeight:600 }}>
                  <span>Scan Progress</span>
                  <span style={{ color:'var(--accent-cyan)' }}>{progress}%</span>
                </div>
                <div className="score-bar-track" style={{ height:'10px', marginBottom:'14px' }}>
                  <div className="score-bar-fill" style={{
                    width:`${progress}%`,
                    background:'linear-gradient(90deg,var(--accent-purple),var(--accent-cyan))',
                    boxShadow:'0 0 8px var(--accent-cyan)',
                  }} />
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', fontSize:'0.9rem', color:'var(--text-primary)', marginBottom:'14px' }}>
                  <Sparkles size={15} style={{ color:'var(--accent-cyan)' }} />
                  <span>{statusMsg}</span>
                </div>
                <button onClick={stopScan} className="btn-secondary" style={{ width:'100%', justifyContent:'center' }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: live scores */}
        <div>
          {/* Overall */}
          <div className="glass-panel" style={{ textAlign:'center', marginBottom:'16px', padding:'20px 16px' }}>
            <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' }}>
              Live Score
            </p>
            <div style={{
              fontSize:'3.2rem', fontFamily:'var(--font-heading)', fontWeight:700,
              color: col, lineHeight:1, textShadow:`0 0 24px ${col}55`, transition:'color 0.5s',
            }}>
              {faceDetected && liveScore ? liveScore : '--'}
            </div>
            {faceDetected && liveScore && (
              <div style={{ fontSize:'0.78rem', color:col, marginTop:'6px', fontWeight:700, letterSpacing:'0.06em' }}>
                {scoreLabel(liveScore)}
              </div>
            )}
            {!faceDetected && mpReady && (
              <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'8px' }}>
                Centre your face in the oval
              </p>
            )}
          </div>

          {/* Feature bars */}
          {liveDetails && faceDetected && (
            <div className="glass-panel" style={{ padding:'16px' }}>
              <p style={{ fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'14px' }}>
                Feature Scores
              </p>
              {Object.entries(liveDetails).map(([key, val]) => (
                <div key={key} style={{ marginBottom:'10px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.7rem', marginBottom:'3px' }}>
                    <span style={{ color:'var(--text-secondary)' }}>{key}</span>
                    <span style={{ color:scoreColor(val), fontWeight:700 }}>{val.toFixed(0)}</span>
                  </div>
                  <div style={{ height:'4px', background:'rgba(255,255,255,0.06)', borderRadius:'2px', overflow:'hidden' }}>
                    <div style={{
                      height:'100%', width:`${val}%`, background:scoreColor(val),
                      borderRadius:'2px', transition:'width 0.35s ease',
                      boxShadow:`0 0 5px ${scoreColor(val)}88`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
