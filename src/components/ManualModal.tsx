'use client';

import React, { useState, useEffect } from 'react';
import { databaseService } from '../lib/services/databaseService';

interface ManualModalProps {
  onClose: () => void;
  onDataImported?: () => void; // データインポート完了時に親コンポーネント（カレンダーなど）をリフレッシュするためのコールバック
}

type TabType = 'guide' | 'pwa' | 'share' | 'backup';
type PWAType = 'ios' | 'android';

export default function ManualModal({ onClose, onDataImported }: ManualModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('guide');
  const [pwaOS, setPwaOS] = useState<PWAType>('ios');
  const [appUrl, setAppUrl] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 現在のアクセスURL（デプロイ先URL）を取得
      setAppUrl(window.location.origin);
    }
  }, []);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('URLのコピーに失敗しました', err);
    }
  };

  const handleExportData = () => {
    setIsExporting(true);
    try {
      const storedData = localStorage.getItem('dinner_meal_logs');
      if (!storedData) {
        alert('バックアップする食事がまだ記録されていません。食事ログを作成してからお試しください。');
        setIsExporting(false);
        return;
      }

      // JSONデータの検証と整形
      const parsed = JSON.parse(storedData);
      const dataStr = JSON.stringify(parsed, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      const now = new Date();
      const dateString = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      
      link.href = url;
      link.download = `dish-log-backup-${dateString}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('エクスポートエラー:', err);
      alert('データのエクスポート中にエラーが発生しました。');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus({ type: null, message: '' });

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        // 基本的なバリデーション: 配列であること、および必要なプロパティを持っていること
        if (!Array.isArray(parsed)) {
          throw new Error('バックアップファイルの形式が正しくありません。（配列である必要があります）');
        }

        const isValid = parsed.every(item => 
          item && 
          typeof item === 'object' && 
          typeof item.date === 'string' && 
          typeof item.markdown === 'string'
        );

        if (!isValid && parsed.length > 0) {
          throw new Error('一部のログデータに必要な項目（日付や解析データ）が不足しています。');
        }

        // ローカルストレージにマージまたは上書き
        const confirmImport = window.confirm(
          `ファイルから ${parsed.length} 件の食事ログが検出されました。現在の端末のデータと結合（マージ）しますか？\n\n※日付が重複するデータは上書きされます。`
        );

        if (!confirmImport) {
          setIsImporting(false);
          // Reset file input
          e.target.value = '';
          return;
        }

        const localDataRaw = localStorage.getItem('dinner_meal_logs');
        let localLogs = [];
        if (localDataRaw) {
          try {
            localLogs = JSON.parse(localDataRaw);
            if (!Array.isArray(localLogs)) localLogs = [];
          } catch {
            localLogs = [];
          }
        }

        // マージロジック (日付重複はインポート側を優先)
        const mergedMap = new Map();
        localLogs.forEach((log: any) => {
          if (log && log.date) mergedMap.set(log.date, log);
        });
        parsed.forEach((log: any) => {
          if (log && log.date) mergedMap.set(log.date, log);
        });

        const mergedLogs = Array.from(mergedMap.values()).sort((a, b) => b.date.localeCompare(a.date));
        
        localStorage.setItem('dinner_meal_logs', JSON.stringify(mergedLogs));
        
        setImportStatus({
          type: 'success',
          message: `データを正常に復元しました！合計 ${mergedLogs.length} 件のログになりました。`
        });

        // 親コンポーネント（カレンダーなど）を更新
        if (onDataImported) {
          onDataImported();
        }
      } catch (err: any) {
        console.error('インポートエラー:', err);
        setImportStatus({
          type: 'error',
          message: err.message || 'ファイルの読み込み中にエラーが発生しました。有効なバックアップJSONファイルを選択してください。'
        });
      } finally {
        setIsImporting(false);
        e.target.value = ''; // Reset file input
      }
    };

    reader.onerror = () => {
      setImportStatus({ type: 'error', message: 'ファイルの読み込みに失敗しました。' });
      setIsImporting(false);
    };

    reader.readAsText(file);
  };

  const qrImageUrl = appUrl 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(appUrl)}&color=090d16&bgcolor=ffffff`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="relative bg-slate-900/95 border border-slate-800/80 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* モーダルヘッダー */}
        <header className="px-5 py-4 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/50 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="text-lg">📖</span>
            <h2 className="font-bold text-slate-100 tracking-wide text-sm md:text-base">
              よるログ ご利用ガイド
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-full bg-slate-800/50 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* タブナビゲーション */}
        <nav className="flex justify-around border-b border-slate-800/40 text-xxs font-bold bg-slate-950/30">
          <button
            onClick={() => { setActiveTab('guide'); setImportStatus({ type: null, message: '' }); }}
            className={`py-3 px-2 flex-1 border-b-2 text-center transition-all ${
              activeTab === 'guide' 
                ? 'text-amber-400 border-amber-400 bg-amber-400/5' 
                : 'text-slate-450 border-transparent hover:text-slate-200'
            }`}
          >
            使い方
          </button>
          <button
            onClick={() => { setActiveTab('pwa'); setImportStatus({ type: null, message: '' }); }}
            className={`py-3 px-2 flex-1 border-b-2 text-center transition-all ${
              activeTab === 'pwa' 
                ? 'text-emerald-450 border-emerald-450 bg-emerald-450/5' 
                : 'text-slate-450 border-transparent hover:text-slate-200'
            }`}
          >
            ホーム画面追加
          </button>
          <button
            onClick={() => { setActiveTab('share'); setImportStatus({ type: null, message: '' }); }}
            className={`py-3 px-2 flex-1 border-b-2 text-center transition-all ${
              activeTab === 'share' 
                ? 'text-indigo-400 border-indigo-400 bg-indigo-400/5' 
                : 'text-slate-450 border-transparent hover:text-slate-200'
            }`}
          >
            友達にシェア
          </button>
          <button
            onClick={() => { setActiveTab('backup'); setImportStatus({ type: null, message: '' }); }}
            className={`py-3 px-2 flex-1 border-b-2 text-center transition-all ${
              activeTab === 'backup' 
                ? 'text-rose-400 border-rose-400 bg-rose-400/5' 
                : 'text-slate-450 border-transparent hover:text-slate-200'
            }`}
          >
            データ管理
          </button>
        </nav>

        {/* スクロール可能なコンテンツエリア */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 max-h-[55vh] text-slate-350 text-xs leading-relaxed">

          {/* TAB 1: 使い方ガイド */}
          {activeTab === 'guide' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <p className="text-center font-semibold text-slate-200 mb-2">
                🍳 よるログ は、毎日の夕食づくりのサポートと<br />
                食事の記録をスマートに行えるアプリです。
              </p>

              {/* 機能1: レシピ提案 */}
              <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/50">
                <h3 className="font-extrabold text-amber-400 mb-1 flex items-center gap-1.5 text-xs">
                  <span>💡</span> 夕食レシピの提案
                </h3>
                <p className="text-xxs leading-relaxed">
                  提案画面で、冷蔵庫に残っている食材をテキストや音声入力で入力してボタンを押すだけ。
                  何も入力しなくても何らかの提案をしますし、材料に一品足せば「こんなのも作れるよ」という提案もいたします。お買い物の参考にしてください。
                  また、過去の食事履歴を分析し、飽きの来ないメニューを提案します。
                </p>
              </div>

              {/* 機能2: 食事ログ */}
              <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/50">
                <h3 className="font-extrabold text-emerald-400 mb-1 flex items-center gap-1.5 text-xs">
                  <span>📸</span> 食事ログの記録
                </h3>
                <p className="text-xxs leading-relaxed">
                  食事ログ画面では、写真、音声入力、テキスト入力に対応しています。
                  今日の夕食の写真をアップロードすると料理を分析して、メニュー名やカロリー、栄養バランス、感想のメモを自動で記録します。
                </p>
              </div>

              {/* 機能3: カレンダー */}
              <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/50">
                <h3 className="font-extrabold text-indigo-400 mb-1 flex items-center gap-1.5 text-xs">
                  <span>📅</span> 食事カレンダー
                </h3>
                <p className="text-xxs leading-relaxed">
                  保存された食事ログは自動でカレンダー形式に整理され、日ごとの食事内容やアドバイスをいつでもタップで振り返ることができます。
                  記録した内容は、後から修正・編集することも可能です。
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: ホーム画面追加 */}
          {activeTab === 'pwa' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="text-center mb-3">
                <p className="text-slate-200 font-bold mb-1">
                  スマホのホーム画面に追加してアプリ化！
                </p>
                <p className="text-xxs text-slate-450">
                  PWA対応のため、ホーム画面に登録すると通常のアプリのように通知バーや全画面でサクサク使えるようになります。
                </p>
              </div>

              {/* OS切り替えサブタブ */}
              <div className="flex bg-slate-950/60 p-0.5 rounded-lg border border-slate-800/50">
                <button
                  onClick={() => setPwaOS('ios')}
                  className={`flex-1 py-1.5 text-xxs font-bold rounded-md transition-all ${
                    pwaOS === 'ios' 
                      ? 'bg-slate-800 text-slate-100 shadow' 
                      : 'text-slate-450 hover:text-slate-200'
                  }`}
                >
                  🍎 iPhone (Safari)
                </button>
                <button
                  onClick={() => setPwaOS('android')}
                  className={`flex-1 py-1.5 text-xxs font-bold rounded-md transition-all ${
                    pwaOS === 'android' 
                      ? 'bg-slate-800 text-slate-100 shadow' 
                      : 'text-slate-450 hover:text-slate-200'
                  }`}
                >
                  🤖 Android (Chrome)
                </button>
              </div>

              {/* iOSガイド */}
              {pwaOS === 'ios' && (
                <div className="space-y-3.5 py-1 text-xxs">
                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 flex-shrink-0">1</div>
                    <p>標準ブラウザの **Safari** でこのアプリのURLを開きます。</p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 flex-shrink-0">2</div>
                    <div>
                      <p>画面下部にある **「共有」ボタン（四角から上矢印が出ているアイコン）** をタップします。</p>
                      <div className="mt-1.5 p-2 bg-slate-950/40 border border-slate-800/30 rounded flex items-center gap-2 max-w-[180px]">
                        <span className="text-sm">📤</span>
                        <span className="text-xxs font-medium text-slate-400">共有メニューを開く</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 flex-shrink-0">3</div>
                    <p>メニューをスクロールし、**「ホーム画面に追加」** を選択します。</p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 flex-shrink-0">4</div>
                    <p>右上の **「追加」** をタップすると、ホーム画面にアプリアイコンが追加され、いつでも一瞬で起動できます！</p>
                  </div>
                </div>
              )}

              {/* Androidガイド */}
              {pwaOS === 'android' && (
                <div className="space-y-3.5 py-1 text-xxs">
                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 flex-shrink-0">1</div>
                    <p>標準ブラウザの **Chrome** でアプリを開きます。</p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 flex-shrink-0">2</div>
                    <div>
                      <p>画面右上にある **「メニュー」ボタン（3つの縦点 ︙ ）** をタップします。</p>
                      <div className="mt-1.5 p-2 bg-slate-950/40 border border-slate-800/30 rounded flex items-center gap-2 max-w-[180px]">
                        <span className="text-sm font-black">︙</span>
                        <span className="text-xxs font-medium text-slate-400">メニューを開く</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 flex-shrink-0">3</div>
                    <p>メニュー内にある **「アプリをインストール」** または **「ホーム画面に追加」** をタップします。</p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 flex-shrink-0">4</div>
                    <p>確認ポップアップが表示されるので **「追加」** を選択します。ホーム画面からネイティブアプリ同等の全画面モードでサクサク楽しめます！</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: 友達にシェア */}
          {activeTab === 'share' && (
            <div className="space-y-4 text-center animate-in fade-in duration-200 flex flex-col items-center">
              <p className="text-slate-200 font-bold max-w-xs text-xs">
                ご家族やご友人にこのアプリを紹介しよう！
              </p>
              <p className="text-xxs text-slate-450 max-w-xs">
                紹介された人は、その場ですぐに写真を撮って食事ログを楽しんだり、カレンダーを使うことができます。
              </p>

              {/* QRコード表示エリア */}
              {qrImageUrl ? (
                <div className="my-3 p-3 bg-white rounded-xl shadow-xl border border-slate-800 inline-block animate-in zoom-in-95 duration-300">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={qrImageUrl} 
                    alt="App QR Code" 
                    className="w-48 h-48 block rounded"
                  />
                  <div className="text-[10px] text-slate-500 font-bold mt-2">カメラでスキャンして即起動！</div>
                </div>
              ) : (
                <div className="my-3 w-48 h-48 bg-slate-950 flex items-center justify-center rounded-xl border border-slate-850">
                  <span className="text-slate-550 text-xxs">URL読み込み中...</span>
                </div>
              )}

              {/* コピー＆シェアボタン */}
              <div className="w-full max-w-xs space-y-2">
                <div className="p-2 bg-slate-950/80 rounded-lg border border-slate-850 flex items-center justify-between text-xxs font-mono text-slate-400 select-all overflow-x-auto whitespace-nowrap">
                  <span>{appUrl}</span>
                </div>
                
                <button
                  onClick={handleCopyUrl}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xxs transition-all flex items-center justify-center gap-2 shadow-lg ${
                    copySuccess 
                      ? 'bg-emerald-500 text-white shadow-emerald-500/25' 
                      : 'bg-indigo-600 hover:bg-indigo-550 text-slate-100 hover:scale-[1.01] active:scale-[0.99] shadow-indigo-600/35'
                  }`}
                >
                  {copySuccess ? (
                    <>
                      <span>✓</span>
                      <span>URLをコピーしました！</span>
                    </>
                  ) : (
                    <>
                      <span>🔗</span>
                      <span>招待URLをコピーする</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: データ管理 */}
          {activeTab === 'backup' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              
              {/* セキュリティ・プライバシー案内 */}
              <div className="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-900/30 flex gap-2.5 items-start">
                <span className="text-base select-none mt-0.5">🔒</span>
                <div>
                  <h4 className="font-extrabold text-indigo-400 mb-0.5 text-xxs">安心のプライバシー安全設計</h4>
                  <p className="text-[10px] leading-relaxed text-slate-400">
                    本アプリは、入力された食材や食事写真、カレンダーの履歴などの個人データを一切外部のサーバーに保存しません。
                    すべてのデータは**「あなたのスマートフォンの内部（LocalStorage）」**にのみ安全に保存されます。
                    他人に食事内容を見られる心配はありません。
                  </p>
                </div>
              </div>

              {/* エクスポート */}
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/50 space-y-2">
                <h3 className="font-extrabold text-slate-200 text-xs flex items-center gap-1.5">
                  📥 データのエクスポート（バックアップ）
                </h3>
                <p className="text-[10px] text-slate-450">
                  現在このスマートフォンに記録されているすべての食事ログをJSONファイルとして保存します。
                  機種変更時のデータ移行や、万が一のバックアップにご使用ください。
                </p>
                
                <button
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-xxs font-bold transition-all border border-slate-700/50 flex items-center justify-center gap-1.5 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                >
                  {isExporting ? 'エクスポート中...' : 'データをバックアップする'}
                </button>
              </div>

              {/* インポート */}
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/50 space-y-2">
                <h3 className="font-extrabold text-slate-200 text-xs flex items-center gap-1.5">
                  📤 データのインポート（復元）
                </h3>
                <p className="text-[10px] text-slate-450">
                  バックアップしたJSONファイルから食事データを読み込み、復元します。
                  現在端末にあるデータと自動でマージされます（同じ日付のデータはバックアップ側が優先されます）。
                </p>

                <label className="block w-full">
                  <span className="sr-only">バックアップファイルを選択</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportData}
                    disabled={isImporting}
                    className="block w-full text-xxs text-slate-500
                      file:mr-3 file:py-2 file:px-3
                      file:rounded-lg file:border-0
                      file:text-xxs file:font-bold
                      file:bg-rose-500/10 file:text-rose-400
                      hover:file:bg-rose-500/20
                      file:cursor-pointer cursor-pointer"
                  />
                </label>

                {importStatus.type && (
                  <div className={`p-2.5 rounded-lg text-[10px] leading-relaxed border animate-in slide-in-from-top-1 duration-200 ${
                    importStatus.type === 'success' 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-semibold' 
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-450 font-semibold'
                  }`}>
                    {importStatus.message}
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        {/* フッター */}
        <footer className="px-5 py-3 border-t border-slate-800/50 bg-slate-950/50 flex justify-between items-center text-[10px] text-slate-500">
          <span>Powered by Gemini 2.5 Flash</span>
          <span>Version 1.0.0 (MVP)</span>
        </footer>

      </div>
    </div>
  );
}
