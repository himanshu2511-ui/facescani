import React, { useEffect, useState } from 'react';
import { Trophy, Search, RefreshCw, Calendar, Eye } from 'lucide-react';

export default function LeaderboardPage({ onSelectUserScore }) {
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLeaderboard = async () => {
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${backendUrl}/leaderboard`);
      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard data.');
      }
      const data = await response.json();
      setEntries(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const filteredEntries = entries.filter(entry => 
    entry.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="glass-panel" style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Trophy size={32} style={{ color: 'var(--accent-yellow)' }} /> Global Rankings
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px' }}>
            Top aesthetic ratings across the platform (based on all-time highest scores)
          </p>
        </div>
        <button 
          onClick={fetchLeaderboard} 
          className="btn-secondary" 
          style={{ padding: '10px 16px', display: 'flex', gap: '8px' }}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'float-anim' : ''} /> Refresh
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '0px', overflow: 'hidden' }}>
        {/* Search Bar Row */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(0,0,0,0.15)' }}>
          <Search size={18} style={{ color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            className="form-input" 
            style={{ background: 'transparent', border: 'none', padding: '4px', fontSize: '0.95rem' }} 
            placeholder="Search candidates by username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            <div className="float-anim" style={{ display: 'inline-block', marginBottom: '8px' }}>⚡</div> Loading rankings...
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--accent-pink)' }}>
            ⚠️ {error}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            No candidates match your search filter.
          </div>
        ) : (
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th style={{ width: '80px', paddingLeft: '24px' }}>Rank</th>
                <th>User</th>
                <th>Gender</th>
                <th style={{ textAlign: 'right' }}>Aesthetic Score</th>
                <th style={{ textAlign: 'right', paddingRight: '24px' }}>Date Achieved</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry, index) => {
                const rank = index + 1;
                let rankClass = 'rank-other';
                if (rank === 1) rankClass = 'rank-1';
                else if (rank === 2) rankClass = 'rank-2';
                else if (rank === 3) rankClass = 'rank-3';

                return (
                  <tr key={index} className="leaderboard-row">
                    <td style={{ paddingLeft: '24px' }}>
                      <span className={`rank-badge ${rankClass}`}>{rank}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                        {entry.username}
                      </span>
                    </td>
                    <td>
                      <span className={`gender-badge ${entry.gender}`}>
                        {entry.gender}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--accent-green)', fontFamily: 'var(--font-heading)', fontSize: '1.05rem' }}>
                      {entry.best_score.toFixed(1)}
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: '24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} />
                        {new Date(entry.created_at).toLocaleDateString()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
