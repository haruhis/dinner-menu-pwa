'use client';

import React, { useState, useEffect } from 'react';
import { aiService } from '../lib/services/aiService';
import { databaseService } from '../lib/services/databaseService';
import { MenuSuggestion, DietaryAnalysis } from '../lib/types';

const QUICK_INGREDIENTS = ['豚肉', '鶏肉', 'キャベツ', '豆腐', '卵', 'トマト', '玉ねぎ', '魚'];

// 日本語の助詞「と」や「や」に対応した賢いスプリット処理
function parseJapaneseIngredients(text: string): string[] {
  if (!text) return [];

  // 記号類をスペースに置換
  let normalized = text
    .replace(/[、。，．.．・+＋]/g, ' ')
    .trim();

  // 「と」や「や」が含まれる一般的なひらがな名詞を、一時的に漢字・カタカナに置換して誤分割を防ぐ
  const replacements: { [key: string]: string } = {
    'さといも': '里芋',
    'やまいも': '山芋',
    'とまと': 'トマト',
    'とうふ': '豆腐',
    'なっとう': '納豆',
    'とうもろこし': 'トウモロコシ',
    'とろろ': 'トロロ',
    'とりの': '鶏の',
    'とり肉': '鶏肉',
    'やさい': '野菜',
    'じゃがいも': 'ジャガイモ',
    'さつまいも': 'サツマイモ',
  };

  for (const [hiragana, replacement] of Object.entries(replacements)) {
    normalized = normalized.replaceAll(hiragana, replacement);
  }

  // 「と」「や」および空白文字で分割
  const rawTokens = normalized.split(/[\s|と|や]+/);

  // 空文字や「と」「や」そのものをフィルタリングしてトリミング
  const ingredients: string[] = [];
  rawTokens.forEach(token => {
    const clean = token.trim();
    if (clean.length > 0 && clean !== 'と' && clean !== 'や') {
      ingredients.push(clean);
    }
  });

  return ingredients;
}

export default function SuggestTab() {
  const [inputText, setInputText] = useState('');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<MenuSuggestion[]>([]);
  const [stockedSetSuggestions, setStockedSetSuggestions] = useState<MenuSuggestion[]>([]);
  const [stockedSingleSuggestions, setStockedSingleSuggestions] = useState<MenuSuggestion[]>([]);
  const [displayedTitles, setDisplayedTitles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [dietaryTrend, setDietaryTrend] = useState<DietaryAnalysis | null>(null);

  // 苦手・除外食材関連のステート
  const [dislikedIngredients, setDislikedIngredients] = useState<string[]>([]);
  const [showPersonalization, setShowPersonalization] = useState(false);
  const [dislikedInput, setDislikedInput] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  // 音声入力関連のステート
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [listeningError, setListeningError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState('');

  // クライアントサイドでのみ音声入力をサポートしているか確認（SSRハイドレーション回避）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setIsSpeechSupported(true);
      }
    }
  }, []);

  // Load disliked ingredients from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('dinner-menu-pwa-disliked-ingredients');
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as string[];
          setDislikedIngredients(parsed);
        } catch (e) {
          console.error('Failed to parse disliked ingredients from localStorage', e);
        }
      }
    }
    setIsLoaded(true);
  }, []);

  // Fetch initial suggestions after loading state
  useEffect(() => {
    if (isLoaded) {
      fetchSuggestions(ingredients, dislikedIngredients);
    }
  }, [isLoaded]);

  const fetchSuggestions = async (ings: string[], disliked?: string[], avoidTitles?: string[]) => {
    setLoading(true);
    setExpandedIndex(null);
    try {
      const logs = await databaseService.getLogs();
      const trend = aiService.analyzeDietaryTrend(logs);
      setDietaryTrend(trend);

      // 直近3日間の食事内容（生メモ）を抽出
      const recentMeals = logs
        .slice(0, 3)
        .map(log => log.rawInput)
        .filter(Boolean);

      const targetDisliked = disliked !== undefined ? disliked : dislikedIngredients;

      const results = await aiService.suggestMenus({ 
        ingredients: ings, 
        recentMeals,
        dislikedIngredients: targetDisliked,
        avoidTitles: avoidTitles || []
      }, trend);

      // Separate sets (recommendation meal sets) and singles
      const sets = results.filter(r => r.title.includes('おすすめセット') || r.title.includes('定食セット') || r.title.includes('セット'));
      const singles = results.filter(r => !sets.includes(r));

      // Display 1 set and up to 3 singles
      const initialSet = sets[0];
      const initialSingles = singles.slice(0, 3);
      const initialDisplay = initialSet ? [initialSet, ...initialSingles] : initialSingles;

      // Cache remaining items in stock
      const remainingSets = initialSet ? sets.slice(1) : sets;
      const remainingSingles = singles.slice(3);

      setStockedSetSuggestions(remainingSets);
      setStockedSingleSuggestions(remainingSingles);
      setSuggestions(initialDisplay);

      const newTitles = initialDisplay.map(d => d.title);
      if (avoidTitles && avoidTitles.length > 0) {
        setDisplayedTitles(prev => Array.from(new Set([...prev, ...newTitles])));
      } else {
        setDisplayedTitles(newTitles);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddIngredient = (ing: string) => {
    const trimmed = ing.trim();
    if (!trimmed) return;
    if (dislikedIngredients.includes(trimmed)) return;
    if (ingredients.includes(trimmed)) return;
    const newIngs = [...ingredients, trimmed];
    setIngredients(newIngs);
    fetchSuggestions(newIngs, dislikedIngredients);
  };

  const handleRemoveIngredient = (ing: string) => {
    const newIngs = ingredients.filter(i => i !== ing);
    setIngredients(newIngs);
    fetchSuggestions(newIngs, dislikedIngredients);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    // Split by spaces, commas, or Japanese punctuation
    const items = inputText
      .split(/[,，、\s\+]+/)
      .map(i => i.trim())
      .filter(i => i.length > 0);

    const updatedIngs = [...ingredients];
    items.forEach(item => {
      if (dislikedIngredients.includes(item)) return;
      if (!updatedIngs.includes(item)) {
        updatedIngs.push(item);
      }
    });

    setIngredients(updatedIngs);
    setInputText('');
    fetchSuggestions(updatedIngs, dislikedIngredients);
  };

  const handleSpeechResult = (transcript: string) => {
    if (!transcript.trim()) return;

    const parsed = parseJapaneseIngredients(transcript);
    if (parsed.length === 0) return;

    const updatedIngs = [...ingredients];
    let addedAny = false;

    parsed.forEach(item => {
      if (dislikedIngredients.includes(item)) return;
      if (!updatedIngs.includes(item)) {
        updatedIngs.push(item);
        addedAny = true;
      }
    });

    if (addedAny) {
      setIngredients(updatedIngs);
      fetchSuggestions(updatedIngs, dislikedIngredients);
    }
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
          setListeningError('音声が検出されませんでした。もう一度お話しください。');
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
      (window as any)._activeRecognition = rec;
    } catch (e) {
      console.error(e);
      setListeningError('音声入力の起動に失敗しました。');
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (typeof window !== 'undefined' && (window as any)._activeRecognition) {
      try {
        (window as any)._activeRecognition.stop();
      } catch (e) {
        console.error(e);
      }
      setIsListening(false);
    }
  };

  const handleQuickTap = (ing: string) => {
    if (ingredients.includes(ing)) {
      handleRemoveIngredient(ing);
    } else {
      handleAddIngredient(ing);
    }
  };

  const handleReload = () => {
    // Rotate instantly from cache stock if we have enough sets and singles
    if (stockedSetSuggestions.length >= 1 && stockedSingleSuggestions.length >= 2) {
      setExpandedIndex(null);
      
      const nextSet = stockedSetSuggestions[0];
      const nextSingles = stockedSingleSuggestions.slice(0, 3);
      const nextDisplay = nextSet ? [nextSet, ...nextSingles] : nextSingles;

      // Slice out consumed items and update state
      setStockedSetSuggestions(stockedSetSuggestions.slice(1));
      setStockedSingleSuggestions(stockedSingleSuggestions.slice(3));
      setSuggestions(nextDisplay);

      // Accumulate displayed titles to ensure future duplicates are restricted
      const newTitles = nextDisplay.map(d => d.title);
      setDisplayedTitles(prev => Array.from(new Set([...prev, ...newTitles])));
    } else {
      // Stock is low or exhausted, pull fresh 10 recipes while avoiding all seen titles
      fetchSuggestions(ingredients, dislikedIngredients, displayedTitles);
    }
  };

  const clearAll = () => {
    setIngredients([]);
    fetchSuggestions([], dislikedIngredients);
  };

  const handleAddDisliked = (ing: string) => {
    const trimmed = ing.trim();
    if (!trimmed) return;
    if (dislikedIngredients.includes(trimmed)) return;
    
    // もし現在の冷蔵庫の食材に入っていたら、そこから除外する
    const updatedIngredients = ingredients.filter(i => i !== trimmed);
    if (updatedIngredients.length !== ingredients.length) {
      setIngredients(updatedIngredients);
    }

    const next = [...dislikedIngredients, trimmed];
    setDislikedIngredients(next);
    localStorage.setItem('dinner-menu-pwa-disliked-ingredients', JSON.stringify(next));
    setDislikedInput('');
    fetchSuggestions(updatedIngredients, next);
  };

  const handleRemoveDisliked = (ing: string) => {
    const next = dislikedIngredients.filter(i => i !== ing);
    setDislikedIngredients(next);
    localStorage.setItem('dinner-menu-pwa-disliked-ingredients', JSON.stringify(next));
    fetchSuggestions(ingredients, next);
  };

  // Group recipes into "can make now" vs "needs buying 1 item"
  const canMakeNowRecipes = suggestions.filter(r => !r.missingIngredient);
  const needBuyingRecipes = suggestions.filter(r => !!r.missingIngredient);

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      {/* Header section */}
      <div className="text-center pt-2">
        <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
          🍳 今日の晩ごはん提案
        </h1>
        <p className="text-slate-400 text-xs mt-1">
          冷蔵庫にある材料を入れるだけで、ぴったりな献立を提案します。
        </p>
      </div>

      {/* AI Dietitian Advice Banner */}
      {dietaryTrend && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 shadow-lg space-y-2 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black tracking-wider text-emerald-400 flex items-center gap-1">
              <span>🩺</span> 食生活分析
            </span>
            {dietaryTrend.trend !== 'insufficient_data' && (
              <span className={`px-2 py-0.5 rounded-full text-xxs font-bold ${
                dietaryTrend.trend === 'balanced' 
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
              }`}>
                {dietaryTrend.trend === 'balanced' && '🟢 栄養バランス良好'}
                {dietaryTrend.trend === 'veg_deficient' && '🟡 お野菜不足気味'}
                {dietaryTrend.trend === 'meat_heavy' && '🥩 お肉料理多め'}
              </span>
            )}
          </div>
          <p className="text-slate-350 text-xs leading-relaxed">
            {dietaryTrend.advice}
          </p>
          {dietaryTrend.trend !== 'insufficient_data' && (
            <div className="flex gap-4 pt-1.5 text-xxs text-slate-500 font-medium border-t border-slate-850/30">
              <span>🥩 お肉: {dietaryTrend.meatCount}回 / 直近7回</span>
              <span>🥗 野菜: {dietaryTrend.vegCount}回 / 直近7回</span>
              <span>🐟 お魚: {dietaryTrend.fishCount}回 / 直近7回</span>
            </div>
          )}
        </div>
      )}

      {/* Ingredient Inputs Card */}
      <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-4 border border-slate-700/50 shadow-xl">
        <form onSubmit={handleTextSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="例: 豚肉, キャベツ, 豆腐..."
              className={`w-full pl-4 ${isSpeechSupported ? 'pr-11' : 'pr-4'} py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm transition-all`}
            />
            {isSpeechSupported && (
              <button
                type="button"
                onClick={startListening}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 active:scale-95 transition-all rounded-lg"
                title="音声で食材を入力"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl text-sm transition-all active:scale-95 shadow-lg shadow-amber-900/30"
          >
            追加
          </button>
        </form>

        {/* Quick select tags */}
        <div className="mt-3">
          <p className="text-slate-400 text-xs mb-2 font-medium">人気の食材をタップで追加:</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_INGREDIENTS.map(ing => {
              const isSelected = ingredients.includes(ing);
              return (
                <button
                  key={ing}
                  type="button"
                  onClick={() => handleQuickTap(ing)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all duration-200 ${
                    isSelected
                      ? 'bg-amber-500 text-slate-900 border-amber-400 shadow-md shadow-amber-500/20'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {ing} {isSelected ? '✓' : '+'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected ingredients tag list */}
        {ingredients.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-750">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-amber-400 font-bold">現在の食材:</span>
              <button
                type="button"
                onClick={clearAll}
                className="text-xxs text-slate-500 hover:text-slate-300 transition-colors"
              >
                すべてクリア
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ingredients.map(ing => (
                <span
                  key={ing}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-950/40 border border-amber-900 text-amber-300 text-xs font-medium"
                >
                  {ing}
                  <button
                    type="button"
                    onClick={() => handleRemoveIngredient(ing)}
                    className="hover:text-white transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ⚙️ 苦手・除外食材の設定アコーディオン */}
        <div className="mt-4 pt-3 border-t border-slate-700/50">
          <button
            type="button"
            onClick={() => setShowPersonalization(!showPersonalization)}
            className="flex items-center justify-between w-full text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <span>⚙️</span> 苦手・除外食材の設定
              {dislikedIngredients.length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xxs font-extrabold">
                  {dislikedIngredients.length}
                </span>
              )}
            </span>
            <svg
              className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-300 ${
                showPersonalization ? 'rotate-180 text-rose-400' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showPersonalization && (
            <div className="mt-3 space-y-3 animate-fade-in">
              <p className="text-xxs text-slate-400 leading-relaxed">
                ここに登録された食材（アレルギーや苦手なもの）は、献立のタイトル・説明・手順から**100%除外**されます。
              </p>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={dislikedInput}
                  onChange={(e) => setDislikedInput(e.target.value)}
                  placeholder="例: マヨネーズ, ブロッコリー..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-transparent text-xs transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDisliked(dislikedInput);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleAddDisliked(dislikedInput)}
                  className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 hover:border-rose-700 text-rose-200 font-semibold rounded-lg text-xs transition-all active:scale-95 shadow-md shadow-rose-950/40"
                >
                  除外
                </button>
              </div>

              {dislikedIngredients.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {dislikedIngredients.map(ing => (
                    <span
                      key={ing}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-rose-950/20 border border-rose-900/60 text-rose-300 text-xxs font-medium"
                    >
                      <span>🚫 {ing}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDisliked(ing)}
                        className="text-rose-400 hover:text-rose-200 transition-colors font-bold text-xs"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Suggestion List Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-bold text-slate-300">
          {ingredients.length > 0 ? `食材から見つかった献立 (${suggestions.length})` : 'おすすめの夕食献立 (ランダム)'}
        </span>
        <button
          onClick={handleReload}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 active:scale-95 transition-all font-semibold"
        >
          <svg
            className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17m0 0V3m0 5h4"
            />
          </svg>
          {loading ? '提案中...' : '別案を出す'}
        </button>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="bg-slate-800/40 rounded-2xl p-12 border border-slate-700/30 flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            {/* Spinning Plate/Dish SVG */}
            <svg className="w-16 h-16 text-amber-500 animate-spin" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="30 20" />
              <path d="M50 15 L50 25 M50 75 L50 85 M15 50 L25 50 M75 50 L85 50" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xl">🍳</span>
          </div>
          <p className="text-slate-300 font-semibold text-sm animate-pulse text-center">
            {ingredients.length > 0
              ? '冷蔵庫の材料を組み合わせています...'
              : '本日のスペシャル献立を選定中...'}
          </p>
          <span className="text-slate-500 text-xxs text-center">AIの創作アイデアを読み込んでいます</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Group 1: Can make now */}
          {ingredients.length > 0 && canMakeNowRecipes.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-emerald-400 tracking-wider uppercase px-1">
                🟢 今ある材料で作れるもの
              </h3>
              <div className="space-y-3">
                {canMakeNowRecipes.map((recipe, idx) => (
                  <RecipeCard
                    key={recipe.title}
                    recipe={recipe}
                    isExpanded={expandedIndex === idx}
                    onToggle={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Group 2: Needs buying 1 ingredient */}
          {ingredients.length > 0 && needBuyingRecipes.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-amber-400 tracking-wider uppercase px-1">
                🛒 あと1つ買えば作れるもの
              </h3>
              <div className="space-y-3">
                {needBuyingRecipes.map((recipe, idx) => {
                  const globalIdx = canMakeNowRecipes.length + idx;
                  return (
                    <RecipeCard
                      key={recipe.title}
                      recipe={recipe}
                      isExpanded={expandedIndex === globalIdx}
                      onToggle={() => setExpandedIndex(expandedIndex === globalIdx ? null : globalIdx)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Fallback for empty screen suggestions */}
          {ingredients.length === 0 && (
            <div className="space-y-3">
              {suggestions.map((recipe, idx) => (
                <RecipeCard
                  key={recipe.title}
                  recipe={recipe}
                  isExpanded={expandedIndex === idx}
                  onToggle={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 音声入力聞き取り中オーバーレイ */}
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
            
            {/* Pulsing Waveform Animation */}
            <div className="relative flex items-center justify-center w-28 h-28">
              <div className="absolute inset-0 rounded-full bg-amber-500/10 animate-ping" style={{ animationDuration: '3s' }}></div>
              <div className="absolute inset-2 rounded-full bg-amber-500/20 animate-ping" style={{ animationDuration: '2s' }}></div>
              <div className="absolute inset-4 rounded-full bg-amber-500/30 animate-pulse"></div>
              <div className="z-10 w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/30">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
            </div>

            <div className="space-y-2 w-full">
              <p className="text-sm font-semibold text-amber-300 min-h-[1.5rem] break-all">
                {interimTranscript || 'お話ししてください...'}
              </p>
              <p className="text-xxs text-slate-400 leading-relaxed">
                「豚肉とキャベツと豆腐」のように、食材の名前を「と」や「や」で繋げて話してください。
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
    </div>
  );
}

// Sub-component: Recipe Card with Expand/Accordion
interface RecipeCardProps {
  recipe: MenuSuggestion;
  isExpanded: boolean;
  onToggle: () => void;
}

function RecipeCard({ recipe, isExpanded, onToggle }: RecipeCardProps) {
  return (
    <div
      onClick={onToggle}
      className={`bg-slate-800 rounded-2xl border transition-all duration-300 overflow-hidden cursor-pointer ${
        isExpanded
          ? 'border-amber-500/50 shadow-lg shadow-amber-950/10'
          : 'border-slate-700/50 hover:border-slate-650 hover:scale-[1.01]'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <h4 className="font-extrabold text-slate-100 text-sm sm:text-base transition-colors duration-200 group-hover:text-amber-400 flex flex-wrap items-center gap-1.5">
              <span>{recipe.title}</span>
              {recipe.isDietitianRecommended && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/35 text-emerald-400 text-xxs font-extrabold tracking-wide animate-pulse">
                  ⭐ おすすめ
                </span>
              )}
            </h4>
            <p className="text-slate-400 text-xs line-clamp-2 leading-relaxed">
              {recipe.description}
            </p>
          </div>
          
          {/* Missing ingredient badge */}
          {recipe.missingIngredient ? (
            <span className="flex-shrink-0 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xxs font-extrabold flex items-center gap-0.5 animate-pulse">
              <span>+</span>
              <span>{recipe.missingIngredient}</span>
            </span>
          ) : (
            /* Standard "Complete" badge for ingredient matches */
            recipe.description.includes('今ある') && (
              <span className="flex-shrink-0 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xxs font-bold">
                即席OK
              </span>
            )
          )}
        </div>

        {/* Expand indicator chevron */}
        <div className="flex justify-center mt-2">
          <svg
            className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${
              isExpanded ? 'rotate-180 text-amber-400' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded Accordion Area (Steps) */}
      <div
        className={`transition-all duration-300 ease-in-out bg-slate-900/60 border-t border-slate-750/30 ${
          isExpanded ? 'max-h-[800px] p-4 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()} // Stop closing parent
      >
        {recipe.isDietitianRecommended && (
          <div className="mb-4 p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-xxs text-emerald-300 leading-normal flex items-start gap-1.5">
            <span>🩺</span>
            <span>
              <strong>栄養アドバイス:</strong> {recipe.dietitianLabel}
            </span>
          </div>
        )}

        <h5 className="text-xs font-extrabold text-amber-400 mb-3 flex items-center gap-1">
          <span>📖</span> つくりかた (主な工程)
        </h5>
        
        <ol className="space-y-3">
          {recipe.steps.map((step, index) => (
            <li key={index} className="flex gap-2.5 items-start text-xs text-slate-300 leading-relaxed">
              <span className="w-4 h-4 rounded-full bg-slate-800 text-amber-500 border border-slate-700 flex items-center justify-center font-bold text-xxs flex-shrink-0 mt-0.5">
                {index + 1}
              </span>
              <span className="flex-1">{step}</span>
            </li>
          ))}
        </ol>

        {recipe.missingIngredient && (
          <div className="mt-4 p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/10 text-xxs text-amber-300/90 leading-normal flex items-start gap-1.5">
            <span>💡</span>
            <span>
              買い出しメモに <strong>{recipe.missingIngredient}</strong> を追加して、さっそくお買い物へ出かけましょう！
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
