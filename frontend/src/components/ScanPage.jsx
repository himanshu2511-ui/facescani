import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Sparkles, ShieldAlert, CheckCircle } from 'lucide-react';

export default function ScanPage({ token, user, onScanComplete }) {
  const [stream, setStream] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Initialize scan to start...');
  const [currentScore, setCurrentScore] = useState(null);
  const [scanTimeLeft, setScanTimeLeft] = useState(30);
  const [error, setError] = useState('');
  
  const videoRef = useRef(null);
  const wsRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const intervalRef = useRef(null);
  const timerRef = useRef(null);

  // Initialize camera stream
  useEffect(() => {
    let activeStream = null;
    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false
        });
        activeStream = mediaStream;
        setStream(mediaStream);
      } catch (err) {
        setError('Camera access denied or unavailable. Please enable permissions.');
      }
    }
    startCamera();

    return () => {
      // Cleanup camera stream
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
      stopScan();
    };
  }, []);

  // Bind stream to video element when it mounts / state changes
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);


  const startScan = () => {
    if (!stream) {
      setError('Cannot start scan without camera stream.');
      return;
    }

    setError('');
    setScanning(true);
    setProgress(0);
    setScanTimeLeft(30);
    setStatusMessage('Establishing secure socket connection...');
    
    // Connect WebSocket
    const backendUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
    const wsProtocol = backendUrl.startsWith('https') ? 'wss' : 'ws';
    const wsHost = backendUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProtocol}://${wsHost}/ws/scan?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatusMessage('Socket connected. Beginning 30-second analysis...');
      
      // Start sending frames periodically
      intervalRef.current = setInterval(() => {
        captureAndSendFrame();
      }, 1500); // 1.5 seconds

      // Start Countdown Timer
      timerRef.current = setInterval(() => {
        setScanTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'progress') {
        setProgress(data.progress);
        setStatusMessage(data.message);
        if (data.current_score) {
          setCurrentScore(data.current_score);
        }
      } else if (data.type === 'complete') {
        stopScan();
        onScanComplete(data);
      } else if (data.type === 'error') {
        setError(data.message);
        stopScan();
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error. Make sure the backend server is running.');
      stopScan();
    };

    ws.onclose = () => {
      setScanning(false);
    };
  };

  const stopScan = () => {
    setScanning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'cancel' }));
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  };

  const captureAndSendFrame = () => {
    const video = videoRef.current;
    if (!video || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Match canvas dimensions to video
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to jpeg blob and send
    canvas.toBlob((blob) => {
      if (blob && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        blob.arrayBuffer().then(buffer => {
          wsRef.current.send(buffer);
        });
      }
    }, 'image/jpeg', 0.85); // 85% quality compression
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="glass-panel" style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '8px' }}>Futuristic Face Scanner</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto', fontSize: '0.95rem' }}>
          Please hold your position for 30 seconds and rotate your head slowly from left to right. This ensures 
          the AI analyzes symmetry, proportions, and structures from all angles.
        </p>
      </div>

      {error && (
        <div className="alert-warning" style={{ display: 'flex', alignItems: 'center', gap: '12px', borderColor: 'rgba(255, 62, 181, 0.3)', color: 'var(--accent-pink)', background: 'rgba(255, 62, 181, 0.08)' }}>
          <ShieldAlert size={24} />
          <div>{error}</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Scanner Window */}
        <div className="scanner-viewport">
          {stream ? (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="scanner-video"
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              <CameraOff size={48} style={{ marginBottom: '16px' }} />
              <p>Camera not connected</p>
            </div>
          )}
          
          {scanning && (
            <>
              <div className="laser-line" />
              <div className="scanner-overlay" />
              <div className="scanner-focus-ring" />
              <div className="scanner-corners"><span /></div>
              <div className="countdown-badge">
                SCANNING: {scanTimeLeft}s
              </div>
            </>
          )}
        </div>

        {/* Control and Progress Panel */}
        <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', marginTop: '24px', borderTopColor: scanning ? 'var(--accent-cyan)' : 'var(--glass-border)' }}>
          {!scanning ? (
            <div style={{ textAlign: 'center' }}>
              <button 
                onClick={startScan} 
                className="btn-primary" 
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={!stream}
              >
                <Camera size={20} /> Initialize 30s Scanner
              </button>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '12px' }}>
                Note: Analyzing model weights tailored for: <strong style={{ color: user?.gender === 'male' ? 'var(--accent-cyan)' : 'var(--accent-pink)' }}>{user?.gender?.toUpperCase()}</strong>
              </p>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '600' }}>
                <span>Scanning Progress</span>
                <span style={{ color: 'var(--accent-cyan)' }}>{progress}%</span>
              </div>
              
              {/* Progress Bar */}
              <div className="score-bar-track" style={{ height: '12px', marginBottom: '16px' }}>
                <div 
                  className="score-bar-fill" 
                  style={{ 
                    width: `${progress}%`, 
                    background: 'linear-gradient(90deg, var(--accent-purple), var(--accent-cyan))',
                    boxShadow: '0 0 8px var(--accent-cyan)'
                  }} 
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                <Sparkles className="float-anim" size={16} style={{ color: 'var(--accent-cyan)' }} />
                <span>{statusMessage}</span>
              </div>

              {currentScore && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Real-time aesthetic index:</span>
                  <span style={{ color: 'var(--accent-green)', fontWeight: '700', fontFamily: 'var(--font-heading)', fontSize: '1.2rem' }}>
                    {currentScore.toFixed(1)}
                  </span>
                </div>
              )}

              <button 
                onClick={stopScan} 
                className="btn-secondary" 
                style={{ width: '100%', justifyContent: 'center', marginTop: '16px' }}
              >
                Cancel Scanning
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
