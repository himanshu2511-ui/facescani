import React, { useState, useEffect } from 'react';
import { Sparkles, Trophy, Navigation, LogOut, Camera, BookOpen, AlertCircle } from 'lucide-react';
import AuthPage from './components/AuthPage';
import ScanPage from './components/ScanPage';
import RoadmapPage from './components/RoadmapPage';
import LeaderboardPage from './components/LeaderboardPage';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('glowup_token'));
  const [user, setUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('scan');
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session
  useEffect(() => {
    async function restoreSession() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`${BACKEND_URL}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          // Token expired or invalid
          handleSignOut();
        }
      } catch (err) {
        console.error("Session restore error:", err);
      } finally {
        setLoading(false);
      }
    }
    restoreSession();
  }, [token]);

  const handleAuthSuccess = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
    setCurrentTab('scan');
  };

  const handleSignOut = () => {
    localStorage.removeItem('glowup_token');
    setToken(null);
    setUser(null);
    setScanResult(null);
    setCurrentTab('scan');
  };

  const fetchFullRoadmap = async (scoreId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/guidance/${scoreId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setScanResult(data);
        setCurrentTab('roadmap');
      }
    } catch (err) {
      console.error("Error fetching roadmap:", err);
    }
  };

  const handleScanComplete = (socketResult) => {
    // socketResult has: score_id, total_score, potential_score, details, created_at
    fetchFullRoadmap(socketResult.score_id);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-secondary)' }}>
        <div className="float-anim" style={{ fontSize: '1.2rem' }}>⚡ Authenticating Glowup Core...</div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '40px 20px', gap: '32px' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.5rem', background: 'linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-cyan) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'inline-flex', alignItems: 'center', gap: '10px', margin: '0' }}>
            <Sparkles size={32} style={{ color: 'var(--accent-purple)' }} /> GLOWUP COACH
          </h1>
        </div>
        <AuthPage onAuthSuccess={handleAuthSuccess} />
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Shell Header */}
      <header className="app-header">
        <div className="logo-container">
          <Sparkles size={24} style={{ color: 'var(--accent-purple)' }} />
          <span>GLOWUP.AI</span>
        </div>

        {/* Tab Navigator */}
        <div className="nav-links">
          <button 
            className={`nav-btn ${currentTab === 'scan' ? 'active' : ''}`}
            onClick={() => setCurrentTab('scan')}
          >
            <Camera size={16} /> Scan Face
          </button>
          <button 
            className={`nav-btn ${currentTab === 'roadmap' ? 'active' : ''}`}
            onClick={() => setCurrentTab('roadmap')}
          >
            <BookOpen size={16} /> My Roadmap
          </button>
          <button 
            className={`nav-btn ${currentTab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setCurrentTab('leaderboard')}
          >
            <Trophy size={16} /> Leaderboard
          </button>
        </div>

        {/* User context widget */}
        <div className="user-profile-nav">
          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Hi, <strong style={{ color: 'var(--text-primary)' }}>{user.username}</strong>
          </span>
          <span className={`gender-badge ${user.gender}`}>{user.gender}</span>
          <button 
            onClick={handleSignOut} 
            className="nav-btn" 
            style={{ padding: '8px 12px', border: '1px solid rgba(255,62,181,0.2)', color: 'var(--accent-pink)' }}
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="main-content">
        {currentTab === 'scan' && (
          <ScanPage 
            token={token} 
            user={user} 
            onScanComplete={handleScanComplete} 
          />
        )}

        {currentTab === 'roadmap' && (
          scanResult ? (
            <RoadmapPage 
              scanResult={scanResult} 
              user={user} 
            />
          ) : (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 40px', maxWidth: '600px', margin: '40px auto' }}>
              <AlertCircle size={48} style={{ color: 'var(--accent-purple)', marginBottom: '16px', display: 'inline-block' }} />
              <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>No Active Scan Analysis Found</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem' }}>
                You must perform a 30-second face scan from all angles to construct your custom 4-week glowup roadmap.
              </p>
              <button onClick={() => setCurrentTab('scan')} className="btn-primary">
                <Camera size={18} /> Start Face Scan Now
              </button>
            </div>
          )
        )}

        {currentTab === 'leaderboard' && (
          <LeaderboardPage />
        )}
      </main>
    </div>
  );
}
