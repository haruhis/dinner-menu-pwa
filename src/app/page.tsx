'use client';

import React, { useState } from 'react';
import SuggestTab from '../components/SuggestTab';
import LogTab from '../components/LogTab';
import CalendarTab from '../components/CalendarTab';
import ManualModal from '../components/ManualModal';

type TabType = 'suggest' | 'log' | 'calendar';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('suggest');
  const [calendarRefreshTrigger, setCalendarRefreshTrigger] = useState(0);
  const [isManualOpen, setIsManualOpen] = useState(false);

  // Trigger calendar update
  const handleLogSaved = () => {
    setCalendarRefreshTrigger(prev => prev + 1);
  };

  // Helper to switch tab
  const handleNavigateToLog = () => {
    setActiveTab('log');
  };

  return (
    <main className="flex-1 max-w-md mx-auto w-full min-h-screen flex flex-col bg-slate-950 shadow-2xl relative border-x border-slate-900">
      
      {/* Top Banner (Logo & PWA status-bar wrapper) */}
      <header className="px-5 pt-safe pb-3 bg-slate-900/40 backdrop-blur-md sticky top-0 z-40 border-b border-slate-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl filter drop-shadow">🍳</span>
          <span className="font-black text-sm tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-emerald-400 to-indigo-400">
            DISH LOG AI
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Subtle Online Badge */}
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold">
            <span className="w-1.2 h-1.2 rounded-full bg-emerald-400 animate-pulse"></span>
            MVP
          </span>

          {/* 📖 使い方ボタン */}
          <button 
            onClick={() => setIsManualOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-750 text-slate-200 text-xxs font-bold transition-all border border-slate-700/50 active:scale-95 shadow-sm"
          >
            <span>📖</span>
            <span>ガイド</span>
          </button>
        </div>
      </header>

      {/* Main Tab Content View Container */}
      <section className="flex-1 px-5 py-4 overflow-y-auto pb-safe">
        {activeTab === 'suggest' && <SuggestTab />}
        {activeTab === 'log' && <LogTab onLogSaved={handleLogSaved} />}
        {activeTab === 'calendar' && (
          <CalendarTab 
            onNavigateToLog={handleNavigateToLog} 
            refreshTrigger={calendarRefreshTrigger} 
          />
        )}
      </section>

      {/* Floating Bottom Navigation Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-xl border-t border-slate-800/80 shadow-2xl shadow-black/80 max-w-md mx-auto w-full">
        {/* pb-safe adds safe area on notch devices, otherwise defaults to normal paddings */}
        <div className="flex justify-around items-center pt-3 pb-[calc(env(safe-area-inset-bottom,16px)+8px)] px-2">
          
          {/* Tab 1: Suggest */}
          <button
            onClick={() => setActiveTab('suggest')}
            className={`flex flex-col items-center gap-1 transition-all duration-200 ${
              activeTab === 'suggest' 
                ? 'text-amber-400 scale-105 font-bold' 
                : 'text-slate-500 hover:text-slate-350'
            }`}
          >
            <div className="relative">
              {/* Suggestion Icon */}
              <svg className="w-5.5 h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'suggest' ? 2.5 : 2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              {activeTab === 'suggest' && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 shadow shadow-amber-400/40"></span>
              )}
            </div>
            <span className="text-xxs font-medium tracking-wide">提案</span>
          </button>

          {/* Tab 2: Log */}
          <button
            onClick={() => setActiveTab('log')}
            className={`flex flex-col items-center gap-1 transition-all duration-200 ${
              activeTab === 'log' 
                ? 'text-emerald-400 scale-105 font-bold' 
                : 'text-slate-500 hover:text-slate-350'
            }`}
          >
            <div className="relative">
              {/* Log Icon */}
              <svg className="w-5.5 h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'log' ? 2.5 : 2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {activeTab === 'log' && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 shadow shadow-emerald-400/40"></span>
              )}
            </div>
            <span className="text-xxs font-medium tracking-wide">食事ログ</span>
          </button>

          {/* Tab 3: Calendar */}
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex flex-col items-center gap-1 transition-all duration-200 ${
              activeTab === 'calendar' 
                ? 'text-indigo-400 scale-105 font-bold' 
                : 'text-slate-500 hover:text-slate-350'
            }`}
          >
            <div className="relative">
              {/* Calendar Icon */}
              <svg className="w-5.5 h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'calendar' ? 2.5 : 2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {activeTab === 'calendar' && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-400 shadow shadow-indigo-400/40"></span>
              )}
            </div>
            <span className="text-xxs font-medium tracking-wide">カレンダー</span>
          </button>
          
        </div>
      </nav>

      {/* Manual Modal Overlay */}
      {isManualOpen && (
        <ManualModal 
          onClose={() => setIsManualOpen(false)} 
          onDataImported={() => setCalendarRefreshTrigger(prev => prev + 1)}
        />
      )}
    </main>
  );
}
