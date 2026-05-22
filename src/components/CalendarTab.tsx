'use client';

import React, { useState, useEffect } from 'react';
import { databaseService } from '../lib/services/databaseService';
import { MealLog } from '../lib/types';

interface CalendarTabProps {
  onNavigateToLog: (date: string) => void; // Callback to switch active tab to "Log" with a specific date
  refreshTrigger?: number;      // Used to trigger refetch when a log is saved
  selectedDateStr: string;
  setSelectedDateStr: (date: string) => void;
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
}

export default function CalendarTab({ 
  onNavigateToLog, 
  refreshTrigger = 0,
  selectedDateStr,
  setSelectedDateStr,
  currentDate,
  setCurrentDate
}: CalendarTabProps) {
  const [logs, setLogs] = useState<MealLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchLogs();
  }, [refreshTrigger]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const allLogs = await databaseService.getLogs();
      setLogs(allLogs);
    } catch (e) {
      console.error('Error fetching logs in calendar', e);
    } finally {
      setLoading(false);
    }
  };

  // Calendar math helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const firstDayOfMonth = new Date(year, month, 1).getDay(); // Day of week (0 = Sunday)
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate(); // Days count

  // Generate date entries to render
  const daysArray: (Date | null)[] = [];
  
  // Pad previous month empty spaces
  for (let i = 0; i < firstDayOfMonth; i++) {
    daysArray.push(null);
  }
  
  // Populate actual month days
  for (let d = 1; d <= totalDaysInMonth; d++) {
    daysArray.push(new Date(year, month, d));
  }

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setIsEditing(false);
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setIsEditing(false);
  };

  const formatDateString = (date: Date): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const getLogForDate = (dateStr: string): MealLog | undefined => {
    return logs.find(log => log.date === dateStr);
  };

  const selectedLog = getLogForDate(selectedDateStr);

  const startEdit = () => {
    if (selectedLog) {
      setEditText(selectedLog.markdown);
      setIsEditing(true);
    }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditText('');
  };

  const handleSaveEdit = async () => {
    if (!selectedLog) return;
    setSaving(true);
    try {
      const updated = await databaseService.updateLog(selectedLog.id, editText);
      
      // Update local logs state
      setLogs(prev => prev.map(log => log.id === updated.id ? updated : log));
      setIsEditing(false);
    } catch (e) {
      console.error(e);
      alert('編集内容の保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) {
    return (
      <div className="space-y-6 pb-20 animate-fade-in">
        {/* Header */}
        <div className="text-center pt-2">
          <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-500">
            📅 カレンダーログ
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            過去の献立履歴の確認や、Markdown食事ログのインライン編集が行えます。
          </p>
        </div>
        <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-8 border border-slate-700/50 shadow-xl flex items-center justify-center">
          <div className="text-center text-slate-500 text-xs animate-pulse">カレンダーを読み込み中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      {/* Header */}
      <div className="text-center pt-2">
        <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-500">
          📅 カレンダーログ
        </h1>
        <p className="text-slate-400 text-xs mt-1">
          過去の献立履歴の確認や、Markdown食事ログのインライン編集が行えます。
        </p>
      </div>

      {/* Calendar Card */}
      <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-4 border border-slate-700/50 shadow-xl space-y-4">
        {/* Month Selector */}
        <div className="flex items-center justify-between px-1">
          <button
            onClick={handlePrevMonth}
            className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 flex items-center justify-center hover:bg-slate-750 transition-colors active:scale-90"
          >
            &lt;
          </button>
          <span className="font-extrabold text-sm sm:text-base text-slate-100">
            {year}年 {month + 1}月
          </span>
          <button
            onClick={handleNextMonth}
            className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 flex items-center justify-center hover:bg-slate-750 transition-colors active:scale-90"
          >
            &gt;
          </button>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 text-center text-xxs font-bold text-slate-400 uppercase tracking-wider">
          <div className="text-rose-400">日</div>
          <div>月</div>
          <div>火</div>
          <div>水</div>
          <div>木</div>
          <div>金</div>
          <div className="text-blue-400">土</div>
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1">
          {daysArray.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="aspect-square bg-slate-800/10 rounded-lg"></div>;
            }

            const dateStr = formatDateString(day);
            const log = getLogForDate(dateStr);
            const isSelected = selectedDateStr === dateStr;
            const isSunday = day.getDay() === 0;
            const isSaturday = day.getDay() === 6;

            return (
              <button
                key={dateStr}
                onClick={() => {
                  setSelectedDateStr(dateStr);
                  setIsEditing(false);
                }}
                className={`aspect-square relative rounded-xl flex flex-col items-center justify-center border transition-all duration-200 ${
                  isSelected
                    ? 'bg-gradient-to-br from-violet-600 to-indigo-600 border-violet-400 text-white font-extrabold scale-105 shadow-md shadow-violet-600/30'
                    : log
                    ? 'bg-slate-900 border-indigo-900/60 text-indigo-200'
                    : 'bg-slate-900/35 border-transparent hover:border-slate-700/30 text-slate-400'
                }`}
              >
                {/* Day number */}
                <span className={`text-xs ${
                  isSelected 
                    ? 'text-white' 
                    : isSunday 
                    ? 'text-rose-400/80' 
                    : isSaturday 
                    ? 'text-blue-400/80' 
                    : 'text-slate-300'
                }`}>
                  {day.getDate()}
                </span>

                {/* Dinner log indicator */}
                {log && (
                  <span className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${
                    isSelected ? 'bg-amber-300' : 'bg-indigo-400 animate-pulse'
                  }`}></span>
                )}
                
                {/* Plate Emoji (Super tiny badge in corners) */}
                {log && !isSelected && (
                  <span className="absolute top-0.5 right-0.5 text-xxs scale-75 opacity-80">🍽️</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Inspector */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
        {/* Title bar of Inspector */}
        <div className="bg-slate-900/80 px-4 py-3 border-b border-slate-700/50 flex justify-between items-center">
          <span className="text-xs font-bold text-indigo-400 flex items-center gap-1">
            <span>📅</span> {selectedDateStr.replace(/-/g, ' / ')} の夕食記録
          </span>
          {selectedLog && !isEditing && (
            <button
              onClick={startEdit}
              className="text-xs text-amber-400 hover:text-amber-300 transition-colors font-bold flex items-center gap-0.5"
            >
              ✍️ 編集
            </button>
          )}
        </div>

        {/* Loading logs indicator */}
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs animate-pulse">データを読み込み中...</div>
        ) : selectedLog ? (
          /* Case 1: Log exists on selected date */
          isEditing ? (
            /* Edit Mode active */
            <div className="p-4 space-y-4">
              <label htmlFor="md-editor" className="block text-xxs font-bold text-amber-400">
                Markdownの編集:
              </label>
              <textarea
                id="md-editor"
                rows={12}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 leading-normal"
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors font-semibold"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-4 py-2 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white text-xs font-bold rounded-xl active:scale-95 transition-all shadow-md shadow-violet-950/20"
                >
                  {saving ? '保存中...' : '保存する'}
                </button>
              </div>
            </div>
          ) : (
            /* Preview View Mode */
            <div className="p-5 space-y-4 max-h-[350px] overflow-y-auto text-xs text-slate-300 leading-relaxed scrollbar-thin scrollbar-thumb-slate-700">
              {/* Parse and render markdown beautifully */}
              {(selectedLog.markdown || '').split('\n').map((line, idx) => {
                if (line.startsWith('# ')) {
                  return (
                    <h2 key={idx} className="text-base font-extrabold text-white border-b border-slate-700 pb-1.5 mb-3 mt-1">
                      {line.replace('# ', '')}
                    </h2>
                  );
                }
                if (line.startsWith('## ')) {
                  return (
                    <h3 key={idx} className="text-sm font-bold text-indigo-400 mt-4 mb-2">
                      {line.replace('## ', '')}
                    </h3>
                  );
                }
                if (line.startsWith('- **')) {
                  const matches = line.match(/- \*\*(.*?)\*\*: (.*)/);
                  if (matches) {
                    return (
                      <div key={idx} className="flex gap-2 pl-2 py-0.5">
                        <span className="text-indigo-400 font-bold">▪</span>
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
                      <span className="text-indigo-400 font-bold">▪</span>
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
          )
        ) : (
          /* Case 2: No log exists on selected date */
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
            <span className="text-4xl filter drop-shadow animate-float">🍽️</span>
            <div className="space-y-1">
              <p className="text-slate-300 font-bold text-sm">この日の食事はまだ記録されていません</p>
              <p className="text-slate-550 text-xxs">お気に入りの手作りおかずや、今日食べたものを記録してみましょう。</p>
            </div>
            <button
              onClick={() => onNavigateToLog(selectedDateStr)}
              className="px-4 py-2 bg-slate-900 border border-slate-700 text-indigo-400 hover:text-indigo-300 hover:border-slate-600 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-md shadow-slate-950/20"
            >
              ✍️ この日の夕食を記録する
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
