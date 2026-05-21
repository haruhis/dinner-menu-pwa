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

  // 写真入力関連のステート・参照
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // 音声入力関連のステート
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [listeningError, setListeningError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState('');


  // クライアントサイドでのみ音声入力をサポートしているか確認（SSRハイドレーション回避）
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setIsSpeechSupported(true);
      }
    }
  }, []);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleSpeechResult = (transcript: string) => {
    if (!transcript.trim()) return;
    setInputText(prev => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed} ${transcript}` : transcript;
    });
  };

  const startListening = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setListeningError('お使いのブラウザは音声入力をサポートしていません。');
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.lang = 'ja-JP';
      rec.continuous = false;
      rec.interimResults = true;

      rec.onstart = () => {
        setIsListening(true);
        setListeningError(null);
        setInterimTranscript('');
      };

      rec.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const transcript = event.results[i][0].transcript;
            handleSpeechResult(transcript);
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        if (interim) {
          setInterimTranscript(interim);
        }
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setListeningError('マイクの使用許可が拒否されました。設定をご確認ください。');
        } else if (event.error === 'no-speech') {
          setListeningError('音声が検出されませんでした。');
        } else {
          setListeningError(`エラーが発生しました: ${event.error}`);
        }
        setTimeout(() => {
          setIsListening(false);
        }, 2500);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.start();
      (window as any)._activeLogRecognition = rec;
    } catch (e) {
      console.error(e);
      setListeningError('音声入力の起動に失敗しました。');
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (typeof window !== 'undefined' && (window as any)._activeLogRecognition) {
      try {
        (window as any)._activeLogRecognition.stop();
      } catch (e) {
        console.error(e);
      }
      setIsListening(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);

    // Create image preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Trigger scanner
    setIsScanning(true);

    try {
      const analyzedText = await aiService.analyzeMealImage(file);
      setInputText(prev => {
        const trimmed = prev.trim();
        return trimmed ? `${trimmed} ${analyzedText}` : analyzedText;
      });
    } catch (err) {
      console.error("Image analysis failed:", err);
    } finally {
      setIsScanning(false);
      // Clear file input value so same file can be selected again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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
            <div className="flex justify-between items-center mb-1">
              <label htmlFor="meal-input" className="block text-xs font-bold text-emerald-400">
                🍽️ 食べたものや感想を入力してください:
              </label>
              <div className="flex items-center gap-1.5">
                {isSpeechSupported && (
                  <button
                    type="button"
                    onClick={startListening}
                    className="flex items-center gap-1 text-xxs font-extrabold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg active:scale-95 transition-all shadow-sm"
                    title="音声で入力"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <span>音声入力</span>
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xxs font-extrabold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg active:scale-95 transition-all shadow-sm"
                  title="写真から解析"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>写真解析</span>
                </button>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* 解析完了した写真プレビュー */}
            {imagePreview && (
              <div className="relative flex items-center gap-3 bg-slate-900/95 border border-emerald-500/30 rounded-xl p-2.5 shadow-lg transition-all animate-fade-in mb-2 mt-1">
                <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-700/60 flex-shrink-0">
                  <img src={imagePreview} alt="Meal preview" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xxs font-extrabold mb-0.5">
                    📸 AI解析完了
                  </span>
                  <p className="text-slate-500 text-xxs truncate">アップロードされた食事写真</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                  }}
                  className="w-6 h-6 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all active:scale-90 flex-shrink-0"
                  title="画像を削除"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

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

      {/* 音声入力聞き取り中オーバーレイ（食事ログ用・エメラルドグリーンテーマ） */}
      {isListening && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md p-6">
          <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-8 max-w-sm w-full flex flex-col items-center space-y-6 shadow-2xl text-center">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              マイク聞き取り中...
            </h3>
            
            {/* Pulsing Waveform Animation (Emerald/Teal Theme) */}
            <div className="relative flex items-center justify-center w-28 h-28">
              <div className="absolute inset-0 rounded-full bg-emerald-500/10 animate-ping" style={{ animationDuration: '3s' }}></div>
              <div className="absolute inset-2 rounded-full bg-emerald-500/20 animate-ping" style={{ animationDuration: '2s' }}></div>
              <div className="absolute inset-4 rounded-full bg-emerald-500/30 animate-pulse"></div>
              <div className="z-10 w-16 h-16 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
            </div>

            <div className="space-y-2 w-full">
              <p className="text-sm font-semibold text-emerald-300 min-h-[1.5rem] break-all">
                {interimTranscript || 'お話ししてください...'}
              </p>
              <p className="text-xxs text-slate-400 leading-relaxed">
                食べたおかずや感想などを、マイクに向かって自由にお話しください。
              </p>
            </div>

            {listeningError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 px-3 py-2 rounded-xl w-full">
                ⚠️ {listeningError}
              </p>
            )}

            <button
              type="button"
              onClick={stopListening}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white rounded-xl text-xs font-bold tracking-wider active:scale-95 transition-all w-full"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* AI画像解析中スキャンオーバーレイ */}
      {isScanning && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md p-6">
          <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-8 max-w-sm w-full flex flex-col items-center space-y-6 shadow-2xl text-center animate-slide-up">
            
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500">
                🔍 AI食事画像解析中...
              </h3>
              <p className="text-xxs text-slate-400">
                AIが画像からおかずの種類や栄養バランスを解析しています
              </p>
            </div>

            {/* Scanning Polaroid Mock Container */}
            <div className="relative w-48 h-48 rounded-2xl overflow-hidden border border-emerald-500/30 shadow-lg shadow-emerald-950/20 bg-slate-950 flex items-center justify-center">
              {imagePreview ? (
                <img src={imagePreview} alt="Scanning target" className="w-full h-full object-cover opacity-90" />
              ) : (
                <div className="text-slate-500 text-xs">読み込み中...</div>
              )}

              {/* Sci-Fi Scanning Laser Line Animation */}
              <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_10px_#10b981] animate-laser"></div>
              
              {/* Futuristic scanning corners */}
              <div className="absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-emerald-400/80"></div>
              <div className="absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-emerald-400/80"></div>
              <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-emerald-400/80"></div>
              <div className="absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-emerald-400/80"></div>
            </div>

            <div className="flex flex-col items-center gap-1">
              <div className="flex space-x-1.5 justify-center py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
              <p className="text-xxs text-emerald-400 font-bold tracking-wider animate-pulse">
                ビジュアルスキャン実行中...
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsScanning(false);
                setImageFile(null);
                setImagePreview(null);
              }}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white rounded-xl text-xs font-bold active:scale-95 transition-all w-full"
            >
              スキャンをキャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

