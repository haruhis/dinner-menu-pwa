import { createClient } from '@supabase/supabase-js';
import { MealLog } from '../types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Initialize Supabase only if credentials exist
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const LOCAL_STORAGE_KEY = 'dinner_meal_logs';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: Get local logs
const getLocalLogs = (): MealLog[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Error parsing local meal logs', e);
    return [];
  }
};

// Helper: Save local logs
const saveLocalLogs = (logs: MealLog[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(logs));
};

export const databaseService = {
  /**
   * Fetch all saved meal logs, sorted by date (newest first).
   */
  getLogs: async (): Promise<MealLog[]> => {
    await delay(300); // Simulate network latency

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('meal_logs')
          .select('*')
          .order('date', { ascending: false });

        if (error) throw error;
        return (data || []) as MealLog[];
      } catch (e) {
        console.error('Supabase getLogs error, falling back to localStorage:', e);
      }
    }

    // Fallback: LocalStorage
    const logs = getLocalLogs();
    // Validate each log entry to ensure it's a valid object with date and markdown strings
    const validLogs = logs.filter(log => 
      log && 
      typeof log === 'object' && 
      typeof log.date === 'string' && 
      typeof log.markdown === 'string'
    );
    // Sort descending by date
    return validLogs.sort((a, b) => b.date.localeCompare(a.date));
  },

  /**
   * Save a new meal log.
   */
  saveLog: async (logInput: Omit<MealLog, 'id' | 'createdAt'>): Promise<MealLog> => {
    await delay(400); // Simulate network latency
    const id = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : Math.random().toString(36).substring(2, 15);
    const createdAt = new Date().toISOString();

    const newLog: MealLog = {
      ...logInput,
      id,
      createdAt
    };

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('meal_logs')
          .insert([newLog])
          .select();

        if (error) throw error;
        if (data && data[0]) return data[0] as MealLog;
      } catch (e) {
        console.error('Supabase saveLog error, falling back to localStorage:', e);
      }
    }

    // Fallback: LocalStorage
    const logs = getLocalLogs();
    
    // Check if a log already exists for this exact date
    const existingIndex = logs.findIndex(l => l.date === logInput.date);
    if (existingIndex > -1) {
      // Overwrite or update
      logs[existingIndex] = {
        ...logs[existingIndex],
        rawInput: logInput.rawInput,
        markdown: logInput.markdown
      };
      saveLocalLogs(logs);
      return logs[existingIndex];
    } else {
      logs.push(newLog);
      saveLocalLogs(logs);
      return newLog;
    }
  },

  /**
   * Update an existing meal log's Markdown content.
   */
  updateLog: async (id: string, markdown: string): Promise<MealLog> => {
    await delay(300); // Simulate network latency

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('meal_logs')
          .update({ markdown })
          .eq('id', id)
          .select();

        if (error) throw error;
        if (data && data[0]) return data[0] as MealLog;
      } catch (e) {
        console.error('Supabase updateLog error, falling back to localStorage:', e);
      }
    }

    // Fallback: LocalStorage
    const logs = getLocalLogs();
    const index = logs.findIndex(log => log.id === id);
    if (index === -1) {
      throw new Error(`Meal log with ID ${id} not found.`);
    }

    logs[index] = {
      ...logs[index],
      markdown
    };

    saveLocalLogs(logs);
    return logs[index];
  }
};
