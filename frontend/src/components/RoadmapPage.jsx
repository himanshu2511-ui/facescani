import React, { useState } from 'react';
import { Download, Compass, ShieldAlert, Sparkles, BookOpen, ChevronRight, CheckSquare } from 'lucide-react';
import { jsPDF } from 'jspdf';

const RATING_MAP = [
  { min: 90, label: 'LEGENDARY',     color: '#ffd700', emoji: '👑' },
  { min: 80, label: 'EXCEPTIONAL',   color: '#b17eff', emoji: '🔥' },
  { min: 70, label: 'ELITE',         color: '#00e5ff', emoji: '⚡' },
  { min: 60, label: 'ATTRACTIVE',    color: '#7fff72', emoji: '✨' },
  { min: 50, label: 'AVERAGE',       color: '#ffb347', emoji: '😐' },
  { min: 0,  label: 'BELOW AVG',     color: '#ff3eb5', emoji: '💀' },
];

function getRating(score) {
  return RATING_MAP.find(r => score >= r.min) || RATING_MAP[RATING_MAP.length - 1];
}

export default function RoadmapPage({ scanResult, user }) {
  const [completedTasks, setCompletedTasks] = useState({});
  const { total_score, potential_score, details, guidance } = scanResult;

  const toggleTask = (dayKey) => {
    setCompletedTasks(prev => ({
      ...prev,
      [dayKey]: !prev[dayKey]
    }));
  };

  const getPotentialScore = (val) => {
    return Math.min(100, Math.round(val + (100 - val) * 0.35));
  };

  // PDF Generator using jsPDF
  const downloadPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const primaryColor = [177, 126, 255]; // Purple
    const secondaryColor = [0, 229, 255]; // Cyan

    // Page 1: Premium Title Cover
    doc.setFillColor(13, 13, 21); // Dark background
    doc.rect(0, 0, 210, 297, 'F');

    // Title Block
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.text("GLOWUP COACH", 105, 50, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("PERSONALIZED 4-WEEK ROADMAP", 105, 60, { align: "center" });

    // Divider Line
    doc.setDrawColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.setLineWidth(1);
    doc.line(40, 68, 170, 68);

    // Profile Details Card
    doc.setFillColor(30, 30, 45);
    doc.rect(30, 85, 150, 45, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Client: ${user.username.toUpperCase()}`, 40, 97);
    doc.text(`Gender Focus: ${user.gender.toUpperCase()}`, 40, 107);
    doc.text(`Date of Scan: ${new Date(scanResult.created_at || Date.now()).toLocaleDateString()}`, 40, 117);

    // Scores Summary
    doc.setFontSize(18);
    doc.text("Facial Analysis Scores", 30, 160);

    doc.setFillColor(30, 30, 45);
    doc.rect(30, 170, 70, 40, 'F');
    doc.rect(110, 170, 70, 40, 'F');

    doc.setFontSize(10);
    doc.setTextColor(180, 180, 180);
    doc.text("CURRENT INDEX SCORE", 40, 182);
    doc.text("POTENTIAL GLOWUP INDEX", 120, 182);

    doc.setFontSize(24);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`${total_score.toFixed(1)}`, 40, 198);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(`${potential_score.toFixed(1)}`, 120, 198);

    // Disclaimer Box
    doc.setFillColor(45, 20, 20);
    doc.rect(30, 230, 150, 35, 'F');
    doc.setTextColor(255, 100, 100);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const disclaimerSplit = doc.splitTextToSize(
      "MEDICAL WARNING: This document does not provide medical diagnoses, treatment or prescription. Always consult a certified dermatologist, orthodontist, or doctor before commencing physical exercises or aggressive treatments.",
      135
    );
    doc.text(disclaimerSplit, 38, 240);

    // Page 2: Detailed Feature Breakdown Table
    doc.addPage();
    doc.setFillColor(13, 13, 21);
    doc.rect(0, 0, 210, 297, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Category Score Breakdown", 20, 30);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("FACIAL FEATURE", 20, 45);
    doc.text("CURRENT", 80, 45);
    doc.text("POTENTIAL", 110, 45);
    doc.text("RATING LEVEL", 140, 45);
    doc.line(20, 48, 190, 48);

    let yOffset = 58;
    doc.setFont("helvetica", "normal");
    Object.entries(details).forEach(([feature, score]) => {
      const pot = getPotentialScore(score);
      const rating = getRating(score);
      
      doc.setTextColor(255, 255, 255);
      doc.text(feature, 20, yOffset);
      doc.text(`${score.toFixed(1)}`, 80, yOffset);
      
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text(`${pot.toFixed(1)}`, 110, yOffset);
      
      doc.setTextColor(rating.color === '#ffd700' ? 255 : 177, rating.color === '#ffd700' ? 215 : 126, rating.color === '#ffd700' ? 0 : 255);
      doc.text(rating.label, 140, yOffset);
      
      yOffset += 12;
    });

    // Page 3: 4-Week Roadmap Planner Outline
    doc.addPage();
    doc.setFillColor(13, 13, 21);
    doc.rect(0, 0, 210, 297, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Your 4-Week Glowup Checklist", 20, 30);

    yOffset = 45;
    guidance.roadmap.forEach((week) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(`WEEK ${week.week}: ${week.theme}`, 20, yOffset);
      
      yOffset += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(220, 220, 220);
      
      week.goals.slice(0, 2).forEach(g => {
        doc.text(`- Goal: ${g}`, 25, yOffset);
        yOffset += 5;
      });

      week.days.slice(0, 4).forEach((day) => {
        const text = `Day ${day.day}: ${day.task.substring(0, 75)}...`;
        doc.text(`[ ]  ${text}`, 25, yOffset);
        yOffset += 6;
      });

      yOffset += 10;
    });

    doc.save(`${user.username}_glowup_roadmap.pdf`);
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Top Banner and Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        
        {/* Score Ring Card */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
          <Compass size={48} style={{ color: 'var(--accent-purple)', marginBottom: '16px' }} />
          <h3 style={{ fontSize: '1.4rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Overall Symmetry Index</h3>
          
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center', margin: '12px 0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.4rem', fontWeight: '800', color: 'var(--accent-purple)', fontFamily: 'var(--font-heading)' }}>
                {total_score.toFixed(1)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CURRENT</div>
            </div>
            <div style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>➔</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.4rem', fontWeight: '800', color: 'var(--accent-cyan)', fontFamily: 'var(--font-heading)' }}>
                {potential_score.toFixed(1)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>POTENTIAL</div>
            </div>
          </div>
          
          <div className="gender-badge female" style={{ color: getRating(total_score).color, borderColor: getRating(total_score).color, background: 'rgba(255,255,255,0.05)', marginTop: '8px' }}>
            {getRating(total_score).emoji} {getRating(total_score).label}
          </div>
        </div>

        {/* Categories Bar Card */}
        <div className="glass-panel">
          <h3 style={{ fontSize: '1.2rem', marginBottom: '18px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
            Feature Breakdown & Potential
          </h3>
          {Object.entries(details).map(([key, val]) => {
            const pot = getPotentialScore(val);
            return (
              <div key={key} style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifycontent: 'space-between', fontSize: '0.85rem', marginBottom: '4px', fontWeight: '600' }}>
                  <span>{key}</span>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>{val.toFixed(1)}</span>
                    <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>➔</span>
                    <span style={{ color: 'var(--accent-cyan)' }}>{pot.toFixed(1)}</span>
                  </div>
                </div>
                <div className="score-bar-track" style={{ height: '5px' }}>
                  <div className="score-bar-fill" style={{ width: `${val}%`, background: 'var(--accent-purple)' }} />
                  {/* Underlay representation of potential score improvement */}
                  <div className="score-bar-fill" style={{ width: `${pot}%`, background: 'var(--accent-cyan)', opacity: 0.3, marginTop: '-5px' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action panel & Disclaimer */}
      <div className="alert-warning" style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
        <ShieldAlert size={28} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <h4 style={{ fontWeight: '700', fontSize: '0.95rem', marginBottom: '4px' }}>Medical & Aesthetic Notice</h4>
          <p style={{ fontSize: '0.82rem' }}>{guidance.disclaimer}</p>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen size={24} style={{ color: 'var(--accent-purple)' }} /> 4-Week Custom Roadmap
        </h2>
        <button onClick={downloadPDF} className="btn-primary">
          <Download size={18} /> Download PDF Roadmap
        </button>
      </div>

      {/* 4-Week Calendar Grid */}
      <div className="roadmap-timeline">
        {guidance.roadmap.map((week) => (
          <div key={week.week} className="timeline-node">
            <div className="node-number">{week.week}</div>
            <div className="node-content">
              <div className="glass-panel" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1.25rem', color: 'var(--accent-purple)', marginBottom: '8px' }}>
                  {week.theme}
                </h3>
                
                {/* Goals */}
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  {week.goals.map((g, idx) => (
                    <span key={idx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      ✓ {g}
                    </span>
                  ))}
                </div>

                {/* Day-by-Day Cards */}
                <div className="day-grid">
                  {week.days.map((day) => {
                    const dayKey = `${week.week}-${day.day}`;
                    const isDone = completedTasks[dayKey];
                    return (
                      <div key={day.day} className="day-card" style={{ borderLeft: isDone ? '3px solid var(--accent-green)' : '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                          <span className="day-badge">Day {day.day}</span>
                          <button 
                            onClick={() => toggleTask(dayKey)}
                            style={{ background: 'none', border: 'none', color: isDone ? 'var(--accent-green)' : 'var(--text-muted)', cursor: 'pointer' }}
                          >
                            <CheckSquare size={16} />
                          </button>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: isDone ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: isDone ? 'line-through' : 'none', minHeight: '40px' }}>
                          {day.task}
                        </p>
                        {day.demo && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '10px', fontSize: '0.72rem', color: 'var(--accent-cyan)' }}>
                            <Sparkles size={10} />
                            <span>Demo: {day.demo}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
