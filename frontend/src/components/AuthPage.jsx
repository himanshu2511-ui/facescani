import React, { useState } from 'react';
import { LogIn, UserPlus, Key, User as UserIcon, Sparkles } from 'lucide-react';

// Centralized backend URL helper — strips trailing slashes
function getBackendUrl() {
  const raw = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const url = raw.replace(/\/+$/, ''); // strip trailing slashes
  return url;
}

export default function AuthPage({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState('female');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/auth/login' : '/auth/register';
    const backendUrl = getBackendUrl();
    const fullUrl = `${backendUrl}${endpoint}`;

    try {
      let response;
      if (isLogin) {
        // OAuth2 Password Grant Form Data
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        response = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });
      } else {
        // Register JSON Payload
        response = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, password, gender }),
        });
      }

      // Handle non-JSON error responses (e.g. HTML 404 pages)
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          `Server returned ${response.status}. Backend may be unreachable. ` +
          `Check VITE_API_URL setting. Tried: ${fullUrl}`
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || `Server error: ${response.status}`);
      }

      localStorage.setItem('glowup_token', data.access_token);
      
      // Fetch user profile details
      const userRes = await fetch(`${backendUrl}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${data.access_token}`
        }
      });
      const userData = await userRes.json();
      
      onAuthSuccess(userData, data.access_token);
    } catch (err) {
      console.error('[AuthPage] Error:', err);
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        setError(
          `Cannot reach backend server. Please verify VITE_API_URL is set correctly. Tried: ${fullUrl}`
        );
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', background: 'rgba(177, 126, 255, 0.15)', marginBottom: '16px' }}>
            <Sparkles size={32} style={{ color: 'var(--accent-purple)' }} />
          </div>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '6px' }}>
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {isLogin ? 'Sign in to access your Glowup Dashboard' : 'Start your personalized 4-week facial analysis'}
          </p>
        </div>

        {error && (
          <div className="alert-warning" style={{ border: '1px solid rgba(255, 62, 181, 0.3)', color: 'var(--accent-pink)', background: 'rgba(255, 62, 181, 0.08)', marginBottom: '20px', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', wordBreak: 'break-word' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <div style={{ position: 'relative' }}>
              <UserIcon size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '44px' }}
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={20}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Key size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
              <input
                type="password"
                className="form-input"
                style={{ paddingLeft: '44px' }}
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
          </div>

          {!isLogin && (
            <div className="form-group">
              <label className="form-label">Aesthetic Baseline Focus (Gender)</label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className={`nav-btn ${gender === 'female' ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setGender('female')}
                >
                  Female
                </button>
                <button
                  type="button"
                  className={`nav-btn ${gender === 'male' ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setGender('male')}
                >
                  Male
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}
            disabled={loading}
          >
            {loading ? 'Processing...' : isLogin ? (
              <>Sign In <LogIn size={18} /></>
            ) : (
              <>Register <UserPlus size={18} /></>
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.9rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
          >
            {isLogin ? 'Sign Up' : 'Log In'}
          </button>
        </div>
      </div>
    </div>
  );
}
