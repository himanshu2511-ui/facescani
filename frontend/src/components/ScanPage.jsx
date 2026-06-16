import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CameraOff, Sparkles, ShieldAlert } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Client-side geometry helpers (mirrors backend face_analyzer.py)
// ─────────────────────────────────────────────────────────────────────────────
const GOLDEN_RATIO = 1.618;

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2);
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
  const dev = Math.abs(value - optimal) / optimal;
  return Math.max(0, Math.min(1, 1 - dev / tolerance));
}

function clamp(v, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)); }

function computeScores(lm) {
  // Facial Thirds (Harmony)
  let harmony = 0.5;
  try {
    const u = dist(lm[10], lm[151]);
    const m = dist(lm[151], lm[2]);
    const l = dist(lm[2], lm[152]);
    const total = u + m + l;
    const ideal = total / 3;
    harmony = clamp(1 - (Math.abs(u - ideal) + Math.abs(m - ideal) + Math.abs(l - ideal)) / ideal / 3);
  } catch (_) {}

  // Golden Ratio
  let goldenRatio = 0.5;
  try {
    const w = dist(lm[234], lm[454]);
    const h = dist(lm[10], lm[152]);
    if (h > 0) goldenRatio = normScore(w / h, 1 / GOLDEN_RATIO, 0.18);
  } catch (_) {}

  // Symmetry
  let symmetry = 0.5;
  try {
    const center = lm[1];
    const pairs = [[33, 263], [133, 362], [70, 300], [107, 336], [61, 291], [234, 454], [172, 397]];
    const s = pairs.map(([L, R]) => {
      const ld = Math.abs(lm[L].x - center.x);
      const rd = Math.abs(lm[R].x - center.x);
      return 1 - Math.abs(ld - rd) / Math.max(ld + rd, 1e-6);
    });
    symmetry = clamp(s.reduce((a, b) => a + b, 0) / s.length);
  } catch (_) {}

  // Eye Aesthetics
  let eyeAesthetics = 0.5;
  try {
    const lw = dist(lm[33], lm[133]);
    const rw = dist(lm[263], lm[362]);
    const inter = dist(lm[133], lm[362]);
    const avg = (lw + rw) / 2;
    eyeAesthetics = normScore(avg > 0 ? inter / avg : 0, 1.0, 0.25);
  } catch (_) {}

  // Jawline
  let jawline = 0.5;
  try {
    const a = angle2d(lm[234], lm[172], lm[152]);
    jawline = normScore(a, 125, 25);
  } catch (_) {}

  // Eyebrow Shape
  let eyebrowShape = 0.5;
  try {
    const la = angle2d(lm[70], lm[105], lm[107]);
    const ra = angle2d(lm[300], lm[334], lm[336]);
    const sym = normScore(Math.abs(la - ra), 0, 15);
    const arch = normScore((la + ra) / 2, 160, 30);
    eyebrowShape = clamp((sym + arch) / 2);
  } catch (_) {}

  // Nose Aesthetics
  let noseAesthetics = 0.5;
  try {
    const nw = dist(lm[129], lm[358]);
    const nh = dist(lm[168], lm[2]);
    if (nw > 0) noseAesthetics = clamp(normScore(nh / nw, 0.8, 0.3));
  } catch (_) {}

  // Lip Aesthetics
  let lipAesthetics = 0.5;
  try {
    const upper = dist(lm[13], lm[0]);
    const lower = dist(lm[14], lm[17]);
    if (lower > 0) lipAesthetics = clamp(normScore(upper / lower, 0.5, 0.4));
  } catch (_) {}

  // Cheekbones
  let cheekbones = 0.5;
  try {
    const nose = lm[1];
    const ld = Math.abs(lm[234].x - nose.x);
    const rd = Math.abs(lm[454].x - nose.x);
    cheekbones = clamp(1 - Math.abs(ld - rd) / Math.max(ld + rd, 1e-6));
  } catch (_) {}

  // Face Shape
  let faceShape = 0.5;
  try {
    const fh = dist(lm[10], lm[152]);
    const fw = dist(lm[234], lm[454]);
    if (fw > 0) faceShape = clamp(normScore(fh / fw, 1.5, 0.3));
  } catch (_) {}

  const details = {
    'Symmetry':        +(symmetry * 100).toFixed(1),
    'Golden Ratio':    +(goldenRatio * 100).toFixed(1),
    'Harmony':         +(harmony * 100).toFixed(1),
    'Eye Aesthetics':  +(eyeAesthetics * 100).toFixed(1),
    'Eyebrow Shape':   +(eyebrowShape * 100).toFixed(1),
    'Nose Aesthetics': +(noseAesthetics * 100).toFixed(1),
    'Lip Aesthetics':  +(lipAesthetics * 100).toFixed(1),
    'Jawline':         +(jawline * 100).toFixed(1),
    'Cheekbones':      +(cheekbones * 100).toFixed(1),
    'Face Shape':      +(faceShape * 100).toFixed(1),
  };

  const weights = {
    'Symmetry': 0.20, 'Golden Ratio': 0.15, 'Harmony': 0.10,
    'Eye Aesthetics': 0.12, 'Eyebrow Shape': 0.06, 'Nose Aesthetics': 0.08,
    'Lip Aesthetics': 0.10, 'Jawline': 0.09, 'Cheekbones': 0.05, 'Face Shape': 0.05,
  };

  const total = Object.keys(weights).reduce((sum, k) => sum + details[k] * weights[k], 0);
  return { total: +total.toFixed(1), details };
}

// ─────────────────────────────────────────────────────────────────────────────
// Face mesh connection sets to draw (tesselation subset for performance)
// ─────────────────────────────────────────────────────────────────────────────
// FACEMESH_TESSELATION has 756 connections — we use a curated subset for overlay
const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10
];

const LEFT_EYE_IDX   = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE_IDX  = [362, 385, 387, 263, 373, 380];
const LEFT_BROW_IDX  = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const RIGHT_BROW_IDX = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LIPS_IDX       = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const NOSE_IDX       = [1, 2, 98, 327, 168, 4, 129, 358, 6, 195, 5, 4];

function drawPolyline(ctx, lm, indices, close, w, h) {
  if (!lm || indices.length < 2) return;
  ctx.beginPath();
  const s = lm[indices[0]];
  ctx.moveTo(s.x * w, s.y * h);
  for (let i = 1; i < indices.length; i++) {
    const p = lm[indices[i]];
    ctx.lineTo(p.x * w, p.y * h);
  }
  if (close) ctx.closePath();
  ctx.stroke();
}

function drawMesh(ctx, lm, w, h, faceDetected) {
  if (!faceDetected || !lm) return;

  // Tesselation (light dot mesh)
  ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
  lm.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 1, 0, Math.PI * 2);
    ctx.fill();
  });

  // Face oval
  ctx.strokeStyle = 'rgba(177, 126, 255, 0.6)';
  ctx.lineWidth = 1.5;
  drawPolyline(ctx, lm, FACE_OVAL_INDICES, true, w, h);

  // Eyes
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.9)';
  ctx.lineWidth = 1.5;
  drawPolyline(ctx, lm, LEFT_EYE_IDX, true, w, h);
  drawPolyline(ctx, lm, RIGHT_EYE_IDX, true, w, h);

  // Eyebrows
  ctx.strokeStyle = 'rgba(255, 179, 71, 0.7)';
  ctx.lineWidth = 1.5;
  drawPolyline(ctx, lm, LEFT_BROW_IDX, false, w, h);
  drawPolyline(ctx, lm, RIGHT_BROW_IDX, false, w, h);

  // Lips
  ctx.strokeStyle = 'rgba(255, 62, 181, 0.8)';
  ctx.lineWidth = 1.5;
  drawPolyline(ctx, lm, LIPS_IDX, true, w, h);

  // Nose
  ctx.strokeStyle = 'rgba(0, 255, 157, 0.7)';
  ctx.lineWidth = 1.2;
  drawPolyline(ctx, lm, NOSE_IDX, false, w, h);

  // Key landmark dots
  const keyPts = [1, 10, 152, 33, 263, 61, 291, 234, 454];
  ctx.fillStyle = 'rgba(0, 229, 255, 1)';
  keyPts.forEach(i => {
    const p = lm[i];
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Score colour helper
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
  const [ready, setReady]               = useState(false);  // mediapipe loaded
  const [faceDetected, setFaceDetected] = useState(false);
  const [scanning, setScanning]         = useState(false);
  const [progress, setProgress]         = useState(0);
  const [statusMessage, setStatusMessage] = useState('Initialising face detector...');
  const [scanTimeLeft, setScanTimeLeft] = useState(30);
  const [liveScore, setLiveScore]       = useState(null);
  const [liveDetails, setLiveDetails]   = useState(null);
  const [error, setError]               = useState('');

  // Refs
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const mpRef       = useRef(null);   // FaceMesh instance
  const animRef     = useRef(null);   // requestAnimationFrame id
  const wsRef       = useRef(null);
  const intervalRef = useRef(null);
  const timerRef    = useRef(null);
  const captureCanvasRef = useRef(document.createElement('canvas'));
  const latestLmRef = useRef(null);   // latest landmarks
  const scoreBufferRef = useRef([]);  // rolling window for smoothing

  // ── Load MediaPipe FaceMesh ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function initMP() {
      try {
        const { FaceMesh } = await import('@mediapipe/face_mesh');

        const fm = new FaceMesh({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`,
        });

        fm.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.65,
          minTrackingConfidence: 0.65,
        });

        fm.onResults((results) => {
          if (cancelled) return;
          const lm = results.multiFaceLandmarks?.[0] ?? null;
          latestLmRef.current = lm;
          setFaceDetected(!!lm);

          if (lm) {
            const { total, details } = computeScores(lm);
            // Rolling 8-frame smoothed score
            const buf = scoreBufferRef.current;
            buf.push(total);
            if (buf.length > 8) buf.shift();
            const smoothed = +(buf.reduce((a, b) => a + b, 0) / buf.length).toFixed(1);
            setLiveScore(smoothed);
            setLiveDetails(details);
          }
        });

        await fm.initialize();
        if (!cancelled) {
          mpRef.current = fm;
          setReady(true);
          setStatusMessage('Face detector ready. Position your face in the oval.');
        }
      } catch (e) {
        if (!cancelled) {
          setError(`Failed to load face detector: ${e.message}. Falling back to server-only mode.`);
          setReady(true);
          setStatusMessage('Ready (no local mesh). Server will analyse your frames.');
        }
      }
    }

    initMP();
    return () => { cancelled = true; };
  }, []);

  // ── Start camera ─────────────────────────────────────────────────────────
  useEffect(() => {
    let stream = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setError('Camera access denied. Please allow camera permissions and reload.');
      }
    }

    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Render loop: draw video + mesh onto canvas ───────────────────────────
  useEffect(() => {
    let running = true;

    async function loop() {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) { if (running) animRef.current = requestAnimationFrame(loop); return; }

      const ctx = canvas.getContext('2d');
      const W = canvas.width  = video.videoWidth  || 640;
      const H = canvas.height = video.videoHeight || 480;

      if (video.readyState >= 2) {
        // Mirror the video
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, W, H);
        ctx.restore();

        // Push to MediaPipe
        if (mpRef.current && video.readyState >= 2) {
          try {
            await mpRef.current.send({ image: video });
          } catch (_) {}
        }

        // Draw mesh on top
        const lm = latestLmRef.current;
        if (lm) {
          // Mirror landmark x-coords to match flipped canvas
          const mirroredLm = lm.map(p => ({ x: 1 - p.x, y: p.y, z: p.z || 0 }));
          drawMesh(ctx, mirroredLm, W, H, true);
        }

        // Scanning overlays
        if (scanning) {
          // Subtle dark vignette edges
          const grad = ctx.createRadialGradient(W/2, H/2, W*0.25, W/2, H/2, W*0.7);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(1, 'rgba(5,5,9,0.45)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, W, H);
        }
      }

      if (running) animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [scanning]);

  // ── Start / stop scan ────────────────────────────────────────────────────
  const startScan = useCallback(() => {
    if (!ready) return;
    setError('');
    setScanning(true);
    setProgress(0);
    setScanTimeLeft(30);
    scoreBufferRef.current = [];
    setStatusMessage('Establishing secure connection…');

    const backendUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
    const wsProtocol = backendUrl.startsWith('https') ? 'wss' : 'ws';
    const wsHost     = backendUrl.replace(/^https?:\/\//, '');
    const ws = new WebSocket(`${wsProtocol}://${wsHost}/ws/scan?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatusMessage('Connection open. Analysing…');

      // Send a frame every 2 s (12 frames over 24 s)
      intervalRef.current = setInterval(() => {
        const video = videoRef.current;
        if (!video || ws.readyState !== WebSocket.OPEN) return;

        const cap = captureCanvasRef.current;
        cap.width  = video.videoWidth  || 640;
        cap.height = video.videoHeight || 480;
        const ctx = cap.getContext('2d');
        ctx.drawImage(video, 0, 0, cap.width, cap.height);

        cap.toBlob(blob => {
          if (blob && ws.readyState === WebSocket.OPEN) {
            blob.arrayBuffer().then(buf => ws.send(buf));
          }
        }, 'image/jpeg', 0.82);
      }, 2000);

      timerRef.current = setInterval(() => {
        setScanTimeLeft(prev => {
          if (prev <= 1) { clearInterval(timerRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'progress') {
        setProgress(data.progress);
        setStatusMessage(data.message);
      } else if (data.type === 'complete') {
        stopScan();
        onScanComplete(data);
      } else if (data.type === 'error') {
        setError(data.message);
        stopScan();
      }
    };

    ws.onerror = () => { setError('WebSocket error. Check backend.'); stopScan(); };
    ws.onclose = () => setScanning(false);
  }, [ready, token, onScanComplete]);

  const stopScan = useCallback(() => {
    setScanning(false);
    clearInterval(intervalRef.current);
    clearInterval(timerRef.current);
    intervalRef.current = null;
    timerRef.current    = null;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'cancel' }));
      wsRef.current.close();
    }
    wsRef.current = null;
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const col = liveScore ? scoreColor(liveScore) : 'var(--accent-cyan)';

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      {/* Header */}
      <div className="glass-panel" style={{ textAlign: 'center', marginBottom: '28px' }}>
        <h2 style={{ fontSize: '1.9rem', marginBottom: '8px' }}>AI Face Mesh Scanner</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '620px', margin: '0 auto', fontSize: '0.93rem' }}>
          Your face mesh is rendered live in the browser. Hold still for 30 s and
          slowly rotate left-to-right so the AI can capture multiple angles.
        </p>
      </div>

      {error && (
        <div className="alert-warning" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <ShieldAlert size={22} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '24px', alignItems: 'start' }}>

        {/* ── Left: camera canvas ── */}
        <div>
          {/* Canvas viewport */}
          <div style={{
            position: 'relative', borderRadius: '20px', overflow: 'hidden',
            border: `2px solid ${faceDetected ? 'rgba(0,229,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
            boxShadow: faceDetected ? `0 0 30px rgba(0,229,255,0.2)` : '0 20px 50px rgba(0,0,0,0.5)',
            transition: 'border-color 0.4s, box-shadow 0.4s',
            background: '#000',
            aspectRatio: '4/3',
          }}>
            {/* Hidden real video for MediaPipe input */}
            <video
              ref={videoRef}
              autoPlay playsInline muted
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
            />

            {/* Visible canvas with mesh overlay */}
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
            />

            {/* Face-detected indicator */}
            <div style={{
              position: 'absolute', top: 14, left: 14,
              display: 'flex', alignItems: 'center', gap: '7px',
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
              border: `1px solid ${faceDetected ? 'rgba(0,255,157,0.5)' : 'rgba(255,62,181,0.4)'}`,
              padding: '5px 12px', borderRadius: '20px',
              fontSize: '0.78rem', fontFamily: 'var(--font-heading)', fontWeight: 700,
              color: faceDetected ? '#00ff9d' : '#ff3eb5',
              transition: 'all 0.3s',
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: faceDetected ? '#00ff9d' : '#ff3eb5',
                boxShadow: `0 0 6px ${faceDetected ? '#00ff9d' : '#ff3eb5'}`,
                animation: faceDetected ? 'none' : 'glow-pulse 1.5s infinite',
              }} />
              {faceDetected ? 'FACE DETECTED' : 'NO FACE'}
            </div>

            {/* Scanning countdown */}
            {scanning && (
              <div className="countdown-badge">SCANNING: {scanTimeLeft}s</div>
            )}

            {/* Face oval guide (shows when no face) */}
            {!faceDetected && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '42%', height: '60%',
                border: '2px dashed rgba(0,229,255,0.35)',
                borderRadius: '50%',
                pointerEvents: 'none',
                animation: 'glow-pulse 2s infinite ease-in-out',
              }} />
            )}

            {/* Laser scan line during active scan */}
            {scanning && <div className="laser-line" />}
          </div>

          {/* Control panel */}
          <div className="glass-panel" style={{ marginTop: '20px' }}>
            {!scanning ? (
              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={startScan}
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', fontSize: '1rem' }}
                  disabled={!ready || !faceDetected}
                >
                  <Camera size={20} />
                  {!ready ? 'Loading detector…' : !faceDetected ? 'Position face first…' : 'Begin 30s Analysis'}
                </button>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '10px' }}>
                  Analysing as{' '}
                  <strong style={{ color: user?.gender === 'male' ? 'var(--accent-cyan)' : 'var(--accent-pink)' }}>
                    {user?.gender?.toUpperCase()}
                  </strong>
                </p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
                  <span>Scan Progress</span>
                  <span style={{ color: 'var(--accent-cyan)' }}>{progress}%</span>
                </div>
                <div className="score-bar-track" style={{ height: '10px', marginBottom: '14px' }}>
                  <div className="score-bar-fill" style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, var(--accent-purple), var(--accent-cyan))',
                    boxShadow: '0 0 8px var(--accent-cyan)',
                  }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '14px' }}>
                  <Sparkles className="float-anim" size={15} style={{ color: 'var(--accent-cyan)' }} />
                  <span>{statusMessage}</span>
                </div>
                <button onClick={stopScan} className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: live score panel ── */}
        <div style={{ minWidth: '220px', maxWidth: '240px' }}>
          {/* Live overall score */}
          <div className="glass-panel" style={{ textAlign: 'center', marginBottom: '16px', padding: '20px 16px' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Live Score
            </p>
            <div style={{
              fontSize: '3rem', fontFamily: 'var(--font-heading)', fontWeight: 700,
              color: col, lineHeight: 1,
              textShadow: `0 0 20px ${col}55`,
              transition: 'color 0.5s',
            }}>
              {liveScore ?? '--'}
            </div>
            {liveScore && (
              <div style={{ fontSize: '0.8rem', color: col, marginTop: '6px', fontWeight: 700, letterSpacing: '0.06em' }}>
                {scoreLabel(liveScore)}
              </div>
            )}
            {!faceDetected && (
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                Position face in frame
              </p>
            )}
          </div>

          {/* Per-feature breakdown */}
          {liveDetails && (
            <div className="glass-panel" style={{ padding: '16px' }}>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px' }}>
                Feature Scores
              </p>
              {Object.entries(liveDetails).map(([key, val]) => (
                <div key={key} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{key}</span>
                    <span style={{ color: scoreColor(val), fontWeight: 700 }}>{val.toFixed(0)}</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${val}%`,
                      background: scoreColor(val),
                      borderRadius: '2px',
                      transition: 'width 0.4s ease',
                      boxShadow: `0 0 6px ${scoreColor(val)}88`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
