"use server";

import { MenuSuggestion } from "../types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL_LITE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";
const GEMINI_API_URL_2_5_FLASH = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/**
 * Helper to call Google Gemini API securely on the server-side.
 */
async function callGemini(contents: any[], apiUrl: string, generationConfig?: any): Promise<string> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
    throw new Error("GEMINI_API_KEY が設定されていません。.env.local ファイルにAPIキーを設定してください。");
  }

  const requestBody: any = { contents };
  if (generationConfig) {
    requestBody.generationConfig = generationConfig;
  }

  const response = await fetch(`${apiUrl}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
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
    return await callGemini(contents, GEMINI_API_URL_LITE);
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
    const responseText = await callGemini(contents, GEMINI_API_URL_2_5_FLASH);
    return responseText.trim();
  } catch (error: any) {
    console.error("Failed to analyze image using Gemini:", error);
    throw error;
  }
}

/**
 * Dynamic menu suggestions based on user ingredients using Gemini 1.5 Flash.
 */
export async function suggestMenusServer(
  ingredients: string[], 
  recentMeals?: string[],
  dislikedIngredients?: string[],
  avoidTitles?: string[]
): Promise<MenuSuggestion[]> {
  const ingredientsStr = ingredients.join("、");
  const recentMealsStr = recentMeals && recentMeals.length > 0
    ? `\nユーザーの直近の食事内容（これと被らないような異なる味付けを考慮してください）:\n${recentMeals.map((m, i) => `- ${m}`).join("\n")}\n`
    : "";
  const dislikedIngredientsStr = dislikedIngredients && dislikedIngredients.length > 0
    ? dislikedIngredients.join("、")
    : "なし";
  const avoidTitlesStr = avoidTitles && avoidTitles.length > 0
    ? `\n【絶対遵守：以下のレシピは既に提案済みであるため、「絶対に異なる」新しい別のレシピを提案してください（名前・味付け・構成の被り禁止）】:\n${avoidTitles.map(t => `- ${t}`).join("\n")}\n`
    : "";

  // サーバーサイドの現在時刻から「現在の月」を判定
  const today = new Date();
  const currentMonth = today.getMonth() + 1; // 1-12

  const systemPrompt = `あなたはプロの料理研究家兼管理栄養士です。ユーザーが指定した冷蔵庫の残り食材「${ingredientsStr}」を活かした美味しい夕食の献立を提案してください。
以下のJSONフォーマット（配列形式）で, 合計3〜4件のレシピを提案してください。
${recentMealsStr}${avoidTitlesStr}
【絶対遵守：苦手・除外食材のルール（パーソナライズ）】
ユーザーは以下の食材・調味料をアレルギーまたは苦手としており、一切食べられません。
除外食材リスト: 「${dislikedIngredientsStr}」
提案するレシピ（タイトル、説明、材料、工程ステップ）のいかなる場所にも、上記の除外食材や調味料（およびそれらを主要な材料とする加工食品やタレ、ドレッシング、ソース等。例えばマヨネーズが除外されている場合はマヨネーズを使ったレシピを避け、ブロッコリーが除外されている場合はブロッコリー自体やそれを使った料理を完全に避ける）を**絶対に含めないでください**。代替の食材を使用するか、全く異なる安全なレシピを構築してください。このルールは他のすべてのルールよりも最優先されます。

【超重要：季節感の考慮ルール】
現在の月は **${currentMonth}月** です。この季節の気温や気候にふさわしい、季節感のある美味しい夕食メニューを提案してください。
- 春・秋（3〜5月、9〜11月）: 過ごしやすい気候に合わせた、標準的な温かさの料理や季節の旬を活かした定番おかず。
- 夏（6〜8月）: さっぱりしたもの、冷たい料理、スタミナ系など（例: 冷やし中華、素麺、サッパリ炒め、冷しゃぶ）。※真夏に熱々の土鍋煮込みやおでんなどの提案は避けてください。
- 冬（12〜2月）: 体がじんわり温まる煮込み料理、スープ、鍋料理など（例: 鍋、おでん、シチュー、ポトフ、煮込みうどん）。※真冬に冷やし中華や冷製パスタなどの冷たい料理の提案は避けてください。

【超重要：提案のバラエティ向上ルール（マンネリ防止）】
1. **異なる「スタイル役割」の義務化（改善案1）**
   提案する3〜4件のレシピには、マンネリ化を防ぐため、以下の4つのうちから**重複しない異なるスタイル役割**を必ず各レシピに1つずつ割り当てて設計してください。
   - **【王道のほっとする家庭料理】**: 誰にでも愛される定番の落ち着くおかず（例: 肉じゃが、豚の生姜焼き、筑前煮など）
   - **【意外性のある創作アレンジ】**: おなじみの食材を少し面白い組み合わせで楽しむ一工夫おかず（例: 残り野菜とチーズのチヂミ、アボカド納豆巾着など）
   - **【おしゃれなカフェ・モダン風】**: 見た目が華やかで気分が上がる洋風・モダンなおかず（例: ハニーマスタードチキン、ガリバタ醤油ソテーなど）
   - **【超簡単！スピードおかず】**: レンジ調理や時短テクニックでパパッと作れる機能性おかず（例: レンジで完結するタレ和え、無限ピーマンなど）
   ※提案のタイトルや説明にこれらのスタイル役割（例: 「【おしゃれなカフェ風】ハニーマスタードチキン」など）を含めても構いません。
   ※なお、必ず提案に含める「【定食セット】」は、これらのスタイル役割のいずれかのテイストを取り入れても良いですし、独立した「定食スタイル」として扱っても構いません。

2. **身近な調味料の新鮮な掛け合わせ（改善案2）**
   日常の冷蔵庫に必ずあるような「身近な調味料」を2つ以上掛け合わせて、飽きのこない新鮮な味付けのバリエーション（調味料フュージョン）をレシピの味付けに取り入れてください。
   - 例: **ポン酢×バター**（さっぱりコク旨）、**味噌×マヨネーズ**（濃厚まろやか）、**ケチャップ×醤油**（洋食屋風の深み）、**ごま油×めんつゆ**（万能コク旨）、**レモン×塩コショウ**（スッキリ爽やか）、**醤油×みりん×マスタード**（和風スパイシー）など。
   - 【毎日使うアプリとしての重要事項（改善案3の不採用）】ナンプラー、コチュジャン、スイートチリソースなどのアジアン・エスニック風の特殊な調味料、または入手しにくいハーブ類・スパイス類は**提案に含めないでください**。毎日使うアプリとして、身近な調味料の範囲で新鮮さを出す実用的な提案に限定してください。

【超重要：味付けの重複を避けるルール】
${recentMeals && recentMeals.length > 0 ? `ユーザーの直近の食事内容を考慮し、それらの料理の主要な味付け（例：醤油ベースの甘辛、塩味、味噌など）を分析してください。
ユーザーが食事の味付けに飽きないよう、直近と重複しない異なる味付けジャンル（例：ケチャップ・トマト味、カレー・スパイシー系、洋風クリーム、酸味の効いたさっぱり塩レモン、中華風ピリ辛など）のバリエーション豊かなメニューを優先的に組み立てて提案してください。` : `バリエーション豊かな味付け（醤油ベース of 甘辛、塩味、味噌、トマトケチャップ、カレーなど）のメニューをバランスよく提案してください。`}

提案の条件：
1. **【最重要】提案する3〜4件のうち、必ず1件は「【定食セット】（主菜・副菜・汁物のフルセット）」として提案してください。**
   - タイトル（"title"）は「【定食セット】〇〇と〇〇の〜〜定食」（買い出しが必要な場合はさらに「（要: 〇〇追加）」を付与）のように記載してください。
   - 説明（"description"）には、内訳（「主菜：〇〇、副菜：〇〇、汁物：〇〇」）を明確に記載し、全体の栄養バランスや魅力について説明してください。
   - 工程ステップ（"steps"）には、複数の料理を並行して効率よく作る手順を、「1. 【下準備＆汁物】〜〜 2. 【副菜】〜〜 3. 【主菜】〜〜」のように各料理名タグ付きで分かりやすく記述してください。
2. 残りの2〜3件は、従来どおりの単品おかずとして提案してください。
3. 全体の中で、2件程度は「今ある材料で作れるもの」、1〜2件は「あと1つだけ特定の食材を買い足せば作れるもの（要買い足し）」のバランスにしてください（定食セットがどちらに該当しても構いません）。

出力フォーマット（JSON配列）の各オブジェクトのスキーマ：
[
  {
    "title": "料理名（今ある材料で作れる場合はそのまま、買い出しが必要な場合は『料理名（要: ○○追加）』のようにタイトルに明記。定食セットの場合は必ず『【定食セット】』から開始すること）",
    "description": "料理の説明（食欲をそそる魅力的な紹介文、買い足しレシピの場合は『※「○○」を買い足すことで...』という説明を必ず含める。どのような『スタイル役割』や『調味料の掛け合わせ』の工夫があるかも魅力的に紹介し、定食セットの場合は主菜・副菜・汁物の内訳を明記すること）",
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

  // Dynamic patch to change "Teishoku" to "Meal Set" and upscale the count to 10 recipes (3 sets, 7 singles)
  // This runtime translation prevents Windows file-encoding corruption while yielding perfect AI outputs.
  const finalSystemPrompt = systemPrompt
    .replace(/合計3〜4件/g, "合計10件")
    .replace(/3〜4件のレシピ/g, "10件のレシピ")
    .replace(/【定食セット】（主菜・副菜・汁物のフルセット）/g, "【おすすめセット】（主菜・副菜・スープ等の汁物を組み合わせた1食丸ごとのMeal・セットメニュー。和食だけでなく洋風・中華風の多彩なジャンルを網羅すること）")
    .replace(/【定食セット】/g, "【おすすめセット】")
    .replace(/定食セット/g, "おすすめセット")
    .replace(/定食スタイル/g, "セットスタイル")
    .replace(/〜〜定食/g, "〜〜セット")
    .replace(/定食の/g, "おすすめセットの")
    .replace(/1．「今ある材料で作れるもの（即席OK）」を2件。\n2．「あと1つだけ特定の食材を買い足せば作れるもの（要買い足し）」を1〜2件。/g, 
             "1. 10件のうち、必ず3件は「【おすすめセット】（主菜・副菜・スープ等の汁物を組み合わせた1食丸ごとのMeal・セットメニュー）」として提案してください。和風・洋風（例: パスタ＋スープ＋サラダ）・中華風をバランスよく出力すること。\n2. 残りの7件は、従来どおりの単品おかずとして提案してください。\n3. 全体の中で、5件程度は「今ある材料で作れるもの」、残り5件程度は「あと1つだけ特定の食材を買い足せば作れるもの（要買い足し）」のバランスにしてください。")
    .replace(/1. 「今ある材料で作れるもの（即席OK）」を2件。\n2. 「あと1つだけ特定の食材を買い足せば作れるもの（要買い足し）」を1〜2件。/g, 
             "1. 10件のうち、必ず3件は「【おすすめセット】（主菜・副菜・スープ等の汁物を組み合わせた1食丸ごとのMeal・セットメニュー）」として提案してください。和風・洋風（例: パスタ＋スープ＋サラダ）・中華風をバランスよく出力すること。\n2. 残りの7件は、従来どおりの単品おかずとして提案してください。\n3. 全体の中で、5件程度は「今ある材料で作れるもの」、残り5件程度は「あと1つだけ特定の食材を買い足せば作れるもの（要買い足し）」のバランスにしてください。");

  const contents = [
    {
      role: "user",
      parts: [{ text: finalSystemPrompt }]
    }
  ];

  try {
    const rawJson = await callGemini(contents, GEMINI_API_URL_LITE, { responseMimeType: "application/json" });
    // Clean up codeblock markers if generated
    const cleanJson = rawJson.replace(/```json/i, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson) as MenuSuggestion[];
    return parsed;
  } catch (error: any) {
    console.error("Failed to suggest menus using Gemini:", error);
    throw error;
  }
}
