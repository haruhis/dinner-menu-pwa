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
