'use client';

import React, { useState } from 'react';
import { aiService } from '../lib/services/aiService';
import { databaseService } from '../lib/services/databaseService';

interface LogTabProps {
  onLogSaved?: () => void; // Callback to notify parent (so calendar can refresh)
}

export default function LogTab({ onLogSaved }: LogTabProps) {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedMarkdown, setGeneratedMarkdown] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedLogDate, setSavedLogDate] = useState('');
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setLoading(true);
    setGeneratedMarkdown('');
    setShowSuccess(false);

    try {
      const markdown = await aiService.generateMealLog(inputText);
      setGeneratedMarkdown(markdown);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!generatedMarkdown) return;
    setLoading(true);

    try {
      await databaseService.saveLog({
        date: selectedDate,
        rawInput: inputText,
        markdown: generatedMarkdown
      });

      // Show success
      setSavedLogDate(selectedDate);
      setShowSuccess(true);
      
      // Clear states
      setInputText('');
      setGeneratedMarkdown('');
      
      // Trigger parent calendar update if callback provided
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (e) {
      console.error('Error saving log', e);
      alert('保存中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return (
      <div className="space-y-6 pb-20 animate-fade-in">
        {/* Header section */}
        <div className="text-center pt-2">
          <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500">
            📝 食事ログ自動収集
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            今日の晩ごはんをメモするだけで、AIがキレイなMarkdownログを作成します。
          </p>
        </div>
        <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-8 border border-slate-700/50 shadow-xl flex items-center justify-center">
          <div className="text-center text-slate-500 text-xs animate-pulse">ログ画面を読み込み中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      {/* Header section - Hide when generatedMarkdown is active to maximize vertical viewport space */}
      {!generatedMarkdown && (
        <div className="text-center pt-2">
          <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500">
            📝 食事ログ自動収集
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            今日の晩ごはんをメモするだけで、AIがキレイなMarkdownログを作成します。
          </p>
        </div>
      )}

      {/* Success notification */}
      {showSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-4 rounded-2xl flex items-start gap-3 shadow-lg shadow-emerald-950/10 animate-fade-in">
          <span className="text-xl flex-shrink-0">🎉</span>
          <div className="flex-1 space-y-0.5">
            <h4 className="font-bold text-sm">ログの保存に成功しました！</h4>
            <p className="text-xxs text-emerald-400">
              {savedLogDate} の夕食ログがカレンダーに保存されました。カレンダータブからいつでも閲覧・編集できます。
            </p>
          </div>
          <button
            onClick={() => setShowSuccess(false)}
            className="text-slate-400 hover:text-white text-xs"
          >
            ×
          </button>
        </div>
      )}

      {/* Write log box (Show only when no preview is active) */}
      {!generatedMarkdown && !loading && (
        <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-4 border border-slate-700/50 shadow-xl space-y-4 animate-fade-in">
          <form onSubmit={handleGenerate} className="space-y-3">
            <label htmlFor="meal-input" className="block text-xs font-bold text-emerald-400">
              🍽️ 食べたものや感想を入力してください:
            </label>
            <textarea
              id="meal-input"
              rows={5}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="例: チーズインハンバーグ、ポテトサラダ、オニオンスープを食べた！手作りでチーズがとろけて美味しかった。"
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm transition-all resize-none leading-relaxed"
            />
            
            <div className="flex justify-between items-center gap-4">
              <div className="flex items-center gap-1.5 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-700/30">
                <span className="text-xxs text-slate-400 font-bold">日付:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent border-none text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer"
                />
              </div>
              
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-40 disabled:pointer-events-none text-white font-bold rounded-xl text-sm transition-all active:scale-95 shadow-lg shadow-emerald-900/30 flex items-center gap-1.5"
              >
                <span>✨</span>
                <span>AIログ生成</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loading overlay for AI operation */}
      {loading && !generatedMarkdown && (
        <div className="bg-slate-800/40 rounded-2xl p-12 border border-slate-700/30 flex flex-col items-center justify-center space-y-4 animate-pulse">
          <div className="flex space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }}></span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }}></span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }}></span>
          </div>
          <p className="text-slate-300 font-semibold text-sm text-center">食事内容を解析中...</p>
          <span className="text-slate-500 text-xxs text-center">Markdown形式にきれいに変換しています</span>
        </div>
      )}

      {/* Generated Markdown Preview Panel */}
      {generatedMarkdown && (
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl space-y-0 animate-slide-up">
          {/* Panel Top bar */}
          <div className="bg-slate-900/80 px-4 py-3 border-b border-slate-700/50 flex justify-between items-center">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
              <span>📝</span> AI生成ログ プレビュー
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xxs font-bold">
              📅 {selectedDate}
            </span>
          </div>

          {/* Styled Display Mock of Markdown - reduced max height for better mobile scrolling and immediate button visibility */}
          <div className="p-4 space-y-4 max-h-[220px] overflow-y-auto text-xs text-slate-300 leading-relaxed scrollbar-thin scrollbar-thumb-slate-700">
            {/* Custom display representing md */}
            {generatedMarkdown.split('\n').map((line, idx) => {
              if (line.startsWith('# ')) {
                return (
                  <h2 key={idx} className="text-base font-extrabold text-white border-b border-slate-700 pb-1.5 mb-3 mt-1">
                    {line.replace('# ', '')}
                  </h2>
                );
              }
              if (line.startsWith('## ')) {
                return (
                  <h3 key={idx} className="text-sm font-bold text-emerald-400 mt-4 mb-2">
                    {line.replace('## ', '')}
                  </h3>
                );
              }
              if (line.startsWith('- **')) {
                // Split title and value
                const matches = line.match(/- \*\*(.*?)\*\*: (.*)/);
                if (matches) {
                  return (
                    <div key={idx} className="flex gap-2 pl-2 py-0.5">
                      <span className="text-emerald-500 font-bold">▪</span>
                      <span>
                        <strong className="text-slate-200">{matches[1]}</strong>: {matches[2]}
                      </span>
                    </div>
                  );
                }
              }
              if (line.startsWith('- ')) {
                return (
                  <div key={idx} className="flex gap-2 pl-2 py-0.5">
                    <span className="text-emerald-500 font-bold">▪</span>
                    <span>{line.replace('- ', '')}</span>
                  </div>
                );
              }
              if (line.trim() === '---') {
                return <hr key={idx} className="border-slate-750 my-4" />;
              }
              if (line.startsWith('*') && line.endsWith('*')) {
                return <p key={idx} className="text-xxs text-slate-500 italic text-center mt-3">{line.replace(/\*/g, '')}</p>;
              }
              if (line.trim().length > 0) {
                return <p key={idx} className="pl-1 text-slate-350">{line}</p>;
              }
              return null;
            })}
          </div>

          {/* Save Action Area */}
          <div className="bg-slate-900/60 p-4 border-t border-slate-700/50 flex justify-between items-center gap-4">
            <button
              onClick={() => setGeneratedMarkdown('')}
              className="text-xs text-slate-400 hover:text-slate-300 font-semibold active:scale-95 transition-all py-2 px-3 rounded-lg hover:bg-slate-800/50"
            >
              ← やり直す
            </button>
            
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl text-xs transition-all active:scale-95 shadow-lg shadow-emerald-950/20 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              <span>{loading ? '保存中...' : 'この内容で保存する'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
