export interface MenuSuggestion {
  title: string;
  description: string;
  missingIngredient?: string; // If "あと1つ買えば作れるもの", this will contain the missing ingredient name
  steps: string[];
  isDietitianRecommended?: boolean; // AI栄養士イチオシかどうか
  dietitianLabel?: string;          // イチオシの理由（例：「不足しがちな野菜を補給！」）
}

export interface SuggestionParams {
  ingredients: string[];
  recentMeals?: string[]; // 直近の食事ログ
  dislikedIngredients?: string[]; // 苦手・除外食材
  avoidTitles?: string[]; // 避けるべき既存のレシピタイトル
}

export interface MealLog {
  id: string;
  date: string; // Format: YYYY-MM-DD
  rawInput: string;
  markdown: string;
  createdAt: string;
}

export interface DietaryAnalysis {
  advice: string;
  recommendedTheme: string;
  trend: 'meat_heavy' | 'veg_deficient' | 'carb_heavy' | 'balanced' | 'insufficient_data';
  meatCount: number;
  vegCount: number;
  fishCount: number;
  logCount: number;
}
