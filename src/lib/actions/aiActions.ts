"use server";

import { MenuSuggestion } from "../types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/**
 * Helper to call Google Gemini API securely on the server-side.
 */
async function callGemini(contents: any[]): Promise<string> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
    throw new Error("GEMINI_API_KEY が設定されていません。.env.local ファイルにAPIキーを設定してください。");
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ contents }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API Error:", errorText);
    throw new Error(`Gemini API 呼び出しに失敗しました: ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini API から有効なレスポンスが得られませんでした。");
  }

  return text;
}

/**
 * Generates a beautifully formatted Markdown meal log from raw text using Gemini 1.5 Flash.
 */
export async function generateMealLogServer(rawInput: string, customDate?: string): Promise<string> {
  let formattedDate = "";
  if (customDate && /^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
    const parts = customDate.split("-");
    formattedDate = `${parts[0]}年${parts[1]}月${parts[2]}日`;
  } else {
    const today = new Date();
    formattedDate = `${today.getFullYear()}年${String(today.getMonth() + 1).padStart(2, '0')}月${String(today.getDate()).padStart(2, '0')}日`;
  }

  const systemPrompt = `あなたは優秀なAI管理栄養士です。ユーザーが入力した今日の夕食のメモから、美しく整理された食事ログのMarkdownを出力してください。
返却するテキストは、Markdown記法に基づいた以下の構成に厳格に従ってください。

# 🍽️ 今日の夕食ログ (${formattedDate})

## 🍲 本日の献立
（ユーザーの入力から、主食、主菜、副菜、汁物などに仕分けした綺麗な太字マークアップ付きの箇条書きを生成してください。例: - **主菜**: ○○、- **副菜**: ○○。わからないものは『主菜/副菜』のように推測して整理してください。元の入力メモが写真解析結果（カンマ区切りの料理一覧）の場合は、それを綺麗に仕分けてマークアップしてください）

## 💬 感想・メモ
（【極めて重要】ユーザーの入力に感想、感情、味覚の評価、疲労度、食べた状況などの主観的なエピソード（例: 「美味しかった」「しんどい」「手作りした」など）が含まれている場合のみ、その内容を綺麗に整理したコメント（栄養面や健康に寄り添うAI栄養士風の温かい一言コメントを含む）を2〜3文で出力してください。
ユーザーの入力が単なる「料理名」や「食材リスト」のみで、感想や主観的な記述が一切ない場合（例: 「唐揚げ定食、ご飯、味噌汁」や「カレーライス」など）は、でっち上げの感想（「美味しく仕上がりました」「大満足でした」など）を絶対に捏造して出力しないでください。感想がない場合は「（今回はシンプルな献立のみの記録です。）」と記載するか、客観的な食事バランスへの極めてシンプルなコメントのみにし、勝手な主観コメントの追加は一切禁止します。
元の入力メモは、常に最後に「元のメモ：「...」」として引用してください）

## 📊 栄養バランス評価
- **タンパク質**: （🟢 良好 / 🟡 控えめ などの判定と、その理由やアドバイスを簡潔に記載）
- **野菜・ビタミン**: （🟢 良好 / 🟡 控えめ などの判定と、アドバイス）
- **炭水化物**: （🟢 適量 / 🟡 控えめ などの判定と、アドバイス）

---
*Generated with 夕食献立提案アプリ AI Assistant*

【重要ルール】
- ユーザーの入力に「満足」「お腹いっぱい」「満腹」「最高」などのキーワード、またはそれに準ずる満足しているニュアンスがある場合にのみ、感想欄に「満足度の高いお食事でした。」というフレーズを含めてください。シンプルな入力のときはこのフレーズを入れないでください。
- ユーザーが書いていない感想や感情を「想像ででっち上げること」は厳禁です。
- 余計な前置き（「かしこまりました」「以下が出力です」など）や、トリプルバッククォート（\`\`\`markdown）などの囲み記号は一切含めず、純粋なMarkdownテキストのみを出力してください。`;

  const contents = [
    {
      role: "user",
      parts: [
        { text: systemPrompt },
        { text: `ユーザーの入力メモ: 「${rawInput}」` }
      ]
    }
  ];

  try {
    return await callGemini(contents);
  } catch (error: any) {
    console.error("Failed to generate meal log using Gemini:", error);
    throw error;
  }
}

/**
 * Analyzes an uploaded meal image and returns simulated food items using Gemini 2.5 Flash.
 */
export async function analyzeMealImageServer(formData: FormData): Promise<string> {
  const file = formData.get("image") as File;
  if (!file) {
    throw new Error("画像ファイルが見つかりません。");
  }

  // Convert File to Base64 safely on the server side to bypass React RSC serialization constraints
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64Data = buffer.toString("base64");
  const mimeType = file.type;

  const systemPrompt = `この画像に写っている食事メニューを極めて正確に分析し、写っている料理名や代表的な食材名を簡潔なカンマ区切りの日本語文字列（例：ジューシー唐揚げ定食、キャベツの千切り、お味噌汁、ご飯）で出力してください。
料理名や食材名以外の説明、前置き、分析理由、余計な記号、挨拶などは一切含めず、カンマ区切りのプレーンテキストのみを返してください。`;

  const contents = [
    {
      role: "user",
      parts: [
        { text: systemPrompt },
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        }
      ]
    }
  ];

  try {
    const responseText = await callGemini(contents);
    return responseText.trim();
  } catch (error: any) {
    console.error("Failed to analyze image using Gemini:", error);
    throw error;
  }
}

/**
 * Dynamic menu suggestions based on user ingredients using Gemini 1.5 Flash.
 */
export async function suggestMenusServer(ingredients: string[], recentMeals?: string[]): Promise<MenuSuggestion[]> {
  const ingredientsStr = ingredients.join("、");
  const recentMealsStr = recentMeals && recentMeals.length > 0
    ? `\nユーザーの直近の食事内容（これと被らないような異なる味付けを考慮してください）:\n${recentMeals.map((m, i) => `- ${m}`).join("\n")}\n`
    : "";

  const systemPrompt = `あなたはプロの料理研究家兼管理栄養士です。ユーザーが指定した冷蔵庫の残り食材「${ingredientsStr}」を活かした美味しい夕食の献立を提案してください。
以下のJSONフォーマット（配列形式）で、合計3〜4件のレシピを提案してください。
${recentMealsStr}
【超重要：味付けの重複を避けるルール】
${recentMeals && recentMeals.length > 0 ? `ユーザーの直近の食事内容を考慮し、それらの料理の主要な味付け（例：醤油ベースの甘辛、塩味、味噌など）を分析してください。
ユーザーが食事の味付けに飽きないよう、直近と重複しない異なる味付けジャンル（例：ケチャップ・トマト味、カレー・スパイシー系、洋風クリーム、酸味の効いたさっぱり塩レモン、中華風ピリ辛など）のバリエーション豊かなメニューを優先的に組み立てて提案してください。` : `バリエーション豊かな味付け（醤油ベース of 甘辛、塩味、味噌、トマトケチャップ、カレーなど）のメニューをバランスよく提案してください。`}

提案の条件：
1. 「今ある材料で作れるもの（即席OK）」を2件。
2. 「あと1つだけ特定の食材を買い足せば作れるもの（要買い足し）」を1〜2件。

出力フォーマット（JSON配列）の各オブジェクトのスキーマ：
[
  {
    "title": "料理名（今ある材料で作れる場合はそのまま、買い出しが必要な場合は『料理名（要: ○○追加）』のようにタイトルに明記）",
    "description": "料理の説明（食欲をそそる魅力的な紹介文、買い足しレシピの場合は『※「○○」を買い足すことで...』という説明を必ず含める）",
    "missingIngredient": "買い足す必要のある食材名（今ある材料で作れる場合は空文字 \"\"）",
    "steps": [
      "工程ステップ1のテキスト",
      "工程ステップ2のテキスト",
      "工程ステップ3のテキスト"
    ]
  }
]

【重要ルール】
- 余計な説明テキストや、トリプルバッククォート（\`\`\`json）などのマークダウンの囲み記号は一切出力せず、JSON.parseでそのまま処理できる純粋なJSON配列のみを返してください。`;

  const contents = [
    {
      role: "user",
      parts: [{ text: systemPrompt }]
    }
  ];

  try {
    const rawJson = await callGemini(contents);
    // Clean up codeblock markers if generated
    const cleanJson = rawJson.replace(/```json/i, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson) as MenuSuggestion[];
    return parsed;
  } catch (error: any) {
    console.error("Failed to suggest menus using Gemini:", error);
    throw error;
  }
}
