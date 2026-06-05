import { MenuSuggestion, SuggestionParams, MealLog, DietaryAnalysis } from '../types';
import { suggestMenusServer, generateMealLogServer, analyzeMealImageServer } from '../actions/aiActions';

// Helper to simulate API call latency for mock fallback
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Helper to compress and resize images client-side before uploading.
 * Resizes the image to a maximum dimension of 1024px and encodes as a medium-quality JPEG (0.7).
 */
const compressImage = async (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxDimension = 1024;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file); // fallback to original
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file); // fallback
            }
          },
          "image/jpeg",
          0.7 // 70% quality jpeg is perfectly visible for Gemini yet extremely compact
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

// Safe fallback recipes for personalization (Mock Fallback when everything is filtered out)
const SAFE_FALLBACK_MEALS: MenuSuggestion[] = [
  {
    title: "シンプル旨塩チキンソテー",
    description: "鶏肉を塩コショウとオリーブオイルだけでカリッと焼き上げた、シンプルで一番美味しいソテーです。素材本来の味が楽しめます。",
    steps: [
      "鶏もも肉またはむね肉の水分をキッチンペーパーでよく拭き取り、一口大に切る。",
      "両面に塩、コショウを適量振り、手で軽く揉み込んでなじませる。",
      "フライパンにオリーブオイルまたはサラダ油を中火で熱し、皮目からじっくり焼く。",
      "皮目がパリッと黄金色になったらひっくり返し、弱火で中までしっかり火を通す。"
    ]
  },
  {
    title: "香ばし焼きおにぎりとあったか味噌汁",
    description: "醤油の香ばしさがたまらない焼きおにぎりと、お豆腐だけのシンプルな味噌汁のセット。ほっこり落ち着く組み合わせです。",
    steps: [
      "温かいご飯に少々の塩を混ぜて、ぎゅっと固めにおにぎりを握る。",
      "フライパンに薄くごま油を引き、おにぎりを並べて両面をじっくり焼く。",
      "両面に焼き色がついたら、醤油とみりんを混ぜたタレをハケなどで塗り、サッと両面を焼いて香ばしく仕上げる。",
      "だし汁にお豆腐を入れ、味噌を溶き入れて温かいお味噌汁を作る。"
    ]
  }
];

// Helper to check if text contains any disliked ingredients
const containsDisliked = (text: string, disliked: string[]) => {
  return disliked.some(d => {
    const dLower = d.toLowerCase().trim();
    if (!dLower) return false;
    return text.toLowerCase().includes(dLower);
  });
};

// Helper to check if a recipe is safe
const isRecipeSafe = (recipe: { title: string; description: string; steps: string[]; required?: string[] }, disliked: string[]) => {
  if (disliked.length === 0) return true;
  if (containsDisliked(recipe.title, disliked)) return false;
  if (containsDisliked(recipe.description, disliked)) return false;
  if (recipe.steps.some(step => containsDisliked(step, disliked))) return false;
  if (recipe.required && recipe.required.some(req => containsDisliked(req, disliked))) return false;
  return true;
};

// Helper to check if a recipe title is unique (not already recommended)
const isRecipeNew = (title: string, avoid: string[]) => {
  if (avoid.length === 0) return true;
  return !avoid.some(t => {
    const tClean = t.replace(/（要:.*追加）/g, "").replace(/【定食セット】/g, "").toLowerCase().trim();
    const titleClean = title.replace(/（要:.*追加）/g, "").replace(/【定食セット】/g, "").toLowerCase().trim();
    if (!tClean || !titleClean) return false;
    return titleClean.includes(tClean) || tClean.includes(titleClean);
  });
};

// Pre-defined rich recipe catalog for intelligent matching (Mock Fallback)
interface CatalogRecipe {
  title: string;
  description: string;
  required: string[]; // key ingredients
  missingOptions: { ingredient: string; titleWithMissing: string; descWithMissing: string }[];
  steps: string[];
}

const RECIPE_CATALOG: CatalogRecipe[] = [
  {
    title: "豚肉とキャベツの回鍋肉風炒め",
    description: "今ある豚肉とキャベツでサッと作れる、コク深い味噌味がご飯にぴったりの一品です。",
    required: ["豚肉", "キャベツ"],
    missingOptions: [
      { ingredient: "ピーマン", titleWithMissing: "シャキシャキピーマンと豚肉・キャベツの回鍋肉", descWithMissing: "ピーマンを加えることで、彩りとシャキシャキした食感が加わり、さらに本格的な回鍋肉になります！" }
    ],
    steps: [
      "キャベツと豚肉を一口大に切る。",
      "熱したフライパンに油を引き、豚肉を炒め、色が変わったらキャベツを加えて強火で炒める。",
      "合わせ調味料（味噌、醤油、砂糖、みりん、豆板醤）を入れ、全体によく絡める。"
    ]
  },
  {
    title: "定番の豚の生姜焼き",
    description: "甘辛いタレと生姜の香りが食欲をそそる、日本の家庭料理の定番です。",
    required: ["豚肉"],
    missingOptions: [
      { ingredient: "玉ねぎ", titleWithMissing: "玉ねぎたっぷり豚の生姜焼き", descWithMissing: "玉ねぎの甘みが豚肉の旨味を引き立て、ボリュームもアップする大満足のおかずです。" }
    ],
    steps: [
      "豚肉に軽く塩コショウをし、小麦粉を薄くまぶす。",
      "醤油、みりん、酒、すりおろし生姜を混ぜて合わせタレを作る。",
      "フライパンで豚肉を焼き、火が通ったらタレを流し込んで煮詰めながら絡める。"
    ]
  },
  {
    title: "鶏肉とキャベツの塩コショウ炒め",
    description: "あっさりしながらも鶏肉のコクとキャベツの甘みが引き立つ、シンプルな炒め物です。",
    required: ["鶏肉", "キャベツ"],
    missingOptions: [
      { ingredient: "にんにく", titleWithMissing: "鶏肉とキャベツ of ガーリック塩炒め", descWithMissing: "にんにくを一辺加えるだけで、スタミナ満点でパンチの効いた絶品おかずに変身します！" }
    ],
    steps: [
      "鶏肉はそぎ切りにし、キャベツは手でちぎる。",
      "フライパンに油を引き、鶏肉の皮目からパリッと焼く。",
      "キャベツを投入しサッと炒め合わせ、塩、コショウ、鶏ガラスープの素で味を整える。"
    ]
  },
  {
    title: "鶏の照り焼き",
    description: "ジューシーな鶏肉に甘辛い黄金比のタレが絡み、大人から子供まで大人気のおかずです。",
    required: ["鶏肉"],
    missingOptions: [
      { ingredient: "白ネギ", titleWithMissing: "香ばし焼きネギ添えの鶏の照り焼き", descWithMissing: "白ネギを一緒にじっくり焼いて添えることで、ネギの甘みと香ばしさが加わり高級感が出ます。" }
    ],
    steps: [
      "鶏もも肉の余分な脂を取り除き、フォークで皮目に穴を開ける。",
      "皮目からフライパンでじっくり焼き、出てきた脂をペーパーで拭き取る。",
      "両面が焼けたら、醤油2:みりん2:酒2:砂糖1のタレを入れ、とろみがつくまで絡める。"
    ]
  },
  {
    title: "豆腐とキャベツのとろみ煮",
    description: "胃に優しくヘルシーな一品。キャベツの水分と豆腐のなめらかさが目立って絶妙です。",
    required: ["豆腐", "キャベツ"],
    missingOptions: [
      { ingredient: "ひき肉", titleWithMissing: "ひき肉入り豆腐とキャベツの麻婆風とろみ煮", descWithMissing: "ひき肉のコクをプラスして少しピリ辛に仕上げることで、食べ応えのあるメインおかずになります。" }
    ],
    steps: [
      "キャベツはざく切り、豆腐は一口大に切る。",
      "鍋にだし汁、醤油、みりんを入れて沸かし、キャベツと豆腐を入れて煮る。",
      "キャベツが柔らかくなったら、水溶き片栗粉でとろみをつける。"
    ]
  },
  {
    title: "ふんわり卵とトマトの炒め物",
    description: "トマトの酸味とふんわりと焼き上げた甘い卵のバランスが絶品の中華風炒め物です。",
    required: ["卵", "トマト"],
    missingOptions: [
      { ingredient: "豚肉", titleWithMissing: "ふんわり卵とトマトと豚肉のスタミナ炒め", descWithMissing: "豚肉を加えることで旨味とコクが劇的にアップし、おかずとしての主役級感が増します！" }
    ],
    steps: [
      "卵をボールに割り入れてしっかりと溶き、塩コショウ少々とマヨネーズを隠し味に混ぜる。",
      "フライパンにサラダ油を熱し、卵液を入れて半熟状になったら一度取り出す。",
      "トマトをくし形に切り、フライパンでさっと炒め、卵を戻して醤油少々で味を調える。"
    ]
  },
  {
    title: "鮭のちゃんちゃん焼き風",
    description: "お魚とキャベツや玉ねぎを特製の甘い甘味噌で蒸し焼きにする、北海道の郷土料理風メニューです。",
    required: ["魚", "キャベツ"],
    missingOptions: [
      { ingredient: "バター", titleWithMissing: "コク旨バター風味の鮭ちゃんちゃん焼き", descWithMissing: "仕上げにバターをひとかけらのせるだけで、味噌の塩気とバターの風味が調和して極上の味わいになります。" }
    ],
    steps: [
      "キャベツや玉ねぎをざく切りにし、フライパンの底に敷き詰める。",
      "その上に魚（鮭の切り身など）をのせ、味噌・酒・砂糖・みりんを混ぜた特製ダレを回しかける。",
      "フタをして弱火〜中火で10分ほど蒸し焼きにし、全体をほぐしながら絡める。"
    ]
  }
];

const applyTrendRecommendation = (meal: MenuSuggestion, trend: DietaryAnalysis) => {
  const text = ((meal.title || '') + " " + (meal.description || '')).toLowerCase();
  
  if (trend.trend === 'veg_deficient') {
    if (/野菜|トマト|サラダ|キャベツ|ネギ|ねぎ|大根|きゅうり|すだち/.test(text)) {
      meal.isDietitianRecommended = true;
      meal.dietitianLabel = "不足しがちな野菜を補給！";
    }
  } else if (trend.trend === 'meat_heavy') {
    if (/魚|豆腐|サバ|鮭|うどん|吸い物/.test(text)) {
      meal.isDietitianRecommended = true;
      meal.dietitianLabel = "お肉お休み・ヘルシー！";
    }
  } else if (trend.fishCount === 0 && trend.trend !== 'insufficient_data') {
    if (/魚|サバ|鮭|サーモン/.test(text)) {
      meal.isDietitianRecommended = true;
      meal.dietitianLabel = "サラサラお魚DHA補給！";
    }
  }
};

export const aiService = {
  /**
   * Suggests menus based on ingredients (Real Gemini with graceful Mock Fallback).
   */
  suggestMenus: async (params: SuggestionParams, trend?: DietaryAnalysis): Promise<MenuSuggestion[]> => {
    let rawIngredients = params.ingredients.map(i => i.trim()).filter(i => i.length > 0);
    const recentMeals = params.recentMeals || [];
    const disliked = params.dislikedIngredients || [];
    const avoid = params.avoidTitles || [];

    // ユーザー指定の材料から苦手・除外食材を除去する
    if (disliked.length > 0) {
      rawIngredients = rawIngredients.filter(ing => 
        !disliked.some(d => ing.toLowerCase().includes(d.toLowerCase()) || d.toLowerCase().includes(ing.toLowerCase()))
      );
    }

    // 1. Try real Gemini API on Server Side (even when rawIngredients is empty)
    try {
      const avoid = (params as any).avoidTitles || [];
      const geminiSuggestions = await suggestMenusServer(rawIngredients, recentMeals, disliked, avoid);
      if (geminiSuggestions && geminiSuggestions.length > 0) {
        if (trend) {
          geminiSuggestions.forEach(meal => applyTrendRecommendation(meal, trend));
        }
        return geminiSuggestions;
      }
    } catch (e) {
      console.warn("Fallback to Mock AI for suggestMenus due to error:", e);
    }

    // 2. Mock Fallback
    await delay(900); // Simulate network/LLM latency

    // Predefined 10 premium meal templates: 3 sets and 7 singles
    const MOCK_RECIPE_TEMPLATES = [
      // 3 おすすめセット (Teishoku sets)
      {
        title: "【ほっこり和食】おすすめセット：ふっくら照り焼きチキンと大根のコク旨お味噌汁セット",
        description: "ジューシーな鶏もも肉を甘辛い黄金ダレで焼き上げた照り焼きを主役に、出汁の染みた大根のお味噌汁とさっぱり小鉢を添えた、大満足の和食セットです。主菜：照り焼きチキン、副菜：ほうれん草のお浸し、汁物：大根とお豆腐のお味噌汁。",
        steps: [
          "1. 【下準備＆汁物】大根とお豆腐を切り、お鍋で出汁と一緒にコトコト煮て、仕上げに味噌を溶き入れます。",
          "2. 【副菜】ほうれん草をサッと茹でて水気を絞り、醤油とすりごまで和えて小鉢を作ります。",
          "3. 【主菜】鶏もも肉をフライパンで皮目からパリッと焼き、醤油・みりん・酒・砂糖の合わせダレを絡めて照りよく仕上げます。"
        ],
        required: ["鶏肉"],
        isSet: true
      },
      {
        title: "【コク旨中華】おすすめセット：シャキシャキキャベツの回鍋肉ととろとろ卵スープセット",
        description: "豆板醤と甜麺醤のコクがキャベツと豚肉に絡む回鍋肉をメインに、ふんわり優しい中華風卵スープを合わせたスタミナ満点の中華セットです。主菜：回鍋肉、副菜：たたききゅうりの塩ごま油和え、汁物：とろみ卵スープ。",
        steps: [
          "1. 【下準備＆汁物】お鍋に中華スープ of 素と水を沸かし、水溶き片栗粉でとろみをつけてから溶き卵を回し入れます。",
          "2. 【副菜】きゅうりを叩いて割り、ごま油と塩、ニンニク少々で和えておきます。",
          "3. 【主菜】豚バラ肉とキャベツ、ピーマンを強火で素早く炒め、特製中華味噌ダレを一気に絡めてシャキシャキに仕上げます。"
        ],
        required: ["豚肉", "キャベツ"],
        isSet: true
      },
      {
        title: "【さっぱり和食】おすすめセット：香ばし鮭の塩焼きとさっぱり冷奴セット（要: 白ネギ追加）",
        description: "皮までパリッと香ばしく焼いた鮭の塩焼きに、たっぷりの薬味ネギをのせた冷奴とお吸い物を組み合わせた、胃に優しくヘルシーなヘルシーセットです。※「白ネギ」を買い足すことで、薬味たっぷりの絶品冷奴が完成します！主菜：鮭の塩焼き、副菜：白ネギたっぷり冷奴、汁物：お麩とお出汁のお吸い物。",
        steps: [
          "1. 【下準備＆汁物】お鍋にお湯を沸かし、和風だしとお麩を入れてひと煮立ちさせ、薄口醤油と塩で味を調えます。",
          "2. 【副菜】豆腐をお皿に盛り、買い足した白ネギをみじん切りにしてたっぷりとのせ、ポン酢を回しかけます。",
          "3. 【主菜】鮭の切り身に塩を振り、グリルで皮目がパリッとなるまで両面を香ばしく焼き上げます。"
        ],
        required: ["魚"],
        missingIngredient: "白ネギ",
        isSet: true
      },
      
      // 7 単品レシピ
      {
        title: "【さっぱり時短】完熟トマトと大葉のさわやかポン酢和え",
        description: "切って和えるだけで完成する、夏場や疲れた夜にぴったりの超スピードおかず。ポン酢の酸味と大葉の香りが絶妙です。",
        steps: [
          "トマトを一口大のくし形に切り、大葉は細い千切りにします。",
          "ボウルにトマトと大葉を入れ、ポン酢大さじ1、ごま油小さじ1、すりごま少々を加えて優しく和えます。",
          "冷蔵庫で5分ほど冷やすと、味がさらに馴染んで美味しく召し上がれます。"
        ],
        required: ["トマト"],
        isSet: false
      },
      {
        title: "【おしゃれカフェ】鶏肉の極上ガーリックバターソテー（要: ブロッコリー追加）",
        description: "にんにくの香ばしい香りとバターの深いコクがジューシーな鶏肉に絡む、おうちでカフェ気分を味わえる極上メニューです。※「ブロッコリー」を買い足すことで、彩り豊かなごちそうソテーに変身します！",
        steps: [
          "鶏肉は一口大に切り、塩コショウと小麦粉を薄くまぶします。買い足したブロッコリーは小房に分けて下茹でしておきます。",
          "フライパンにオリーブオイルとスライスにんにくを弱火で熱し、香りが立ったら鶏肉を皮目からじっくり焼きます。",
          "鶏肉に火が通ったらブロッコリーを加え、バター10gと醤油小さじ1を投入して全体に素早く絡めます。"
        ],
        required: ["鶏肉"],
        missingIngredient: "ブロッコリー",
        isSet: false
      },
      {
        title: "【とろ〜り時短】キャベツととろけるチーズの極旨チヂミ（要: チーズ追加）",
        description: "千切りキャベツをたっぷり使い、モチモチの生地とカリッと焼けた表面がたまらない、おやつ感覚でも食べられるスピードおかずです。※「とろけるチーズ」を買い足すことで、コクと旨味が溢れる絶品チヂミになります！",
        steps: [
          "キャベツを細い千切りにします。小麦粉50g、片栗粉30g、水80ml、鶏ガラスープの素小さじ1を混ぜて生地を作ります。",
          "生地にキャベツを混ぜ合わせ、フライパンにごま油を熱して薄く広げて両面をこんがりと焼きます。",
          "ひっくり返した後に買い足したチーズをたっぷりとのせ、フタをしてチーズがとろけるまで蒸し焼きにします。"
        ],
        required: ["キャベツ"],
        missingIngredient: "チーズ",
        isSet: false
      },
      {
        title: "【王道おかず】豚肉と玉ねぎの極旨生姜焼き（要: 玉ねぎ追加）",
        description: "甘辛いタレと生姜の香りが食欲をそそる、ご飯が進む生姜焼きです。※「玉ねぎ」を買い足すことで、お肉の甘みが引き立つ定番おかずになります。",
        steps: [
          "豚肉に軽く塩コショウをし、小麦粉を薄くまぶします。買い足した玉ねぎは薄切りにしておきます。",
          "醤油、みりん、酒、すりおろし生姜を混ぜて合わせタレを作ります。",
          "フライパンで豚肉と玉ねぎを炒め、火が通ったらタレを流し込んで煮詰めながら絡めます。"
        ],
        required: ["豚肉"],
        missingIngredient: "玉ねぎ",
        isSet: false
      },
      {
        title: "【ほっこり洋風】完熟トマトと豆腐のヘルシーカプレーゼ風",
        description: "みずみずしいトマトとさっぱりしたお豆腐を、オリーブオイルと塩胡椒でイタリアン風に仕上げた、彩り華やかな冷菜です。胃に優しくヘルシーな一品。",
        steps: [
          "トマトとお豆腐を一口大の角切りまたはスライスにします。",
          "ボウルにトマトとお豆腐を入れ、オリーブオイル大さじ1、塩少々、黒コショウ、あれば乾燥バジルを振ります。",
          "優しく和えて器に盛り付け、冷蔵庫で少し冷やしてから召し上がります。"
        ],
        required: ["トマト", "豆腐"],
        isSet: false
      },
      {
        title: "【ご飯が進む】ジューシー鶏肉とキャベツのコク旨味噌炒め",
        description: "鶏肉のジューシーな旨味と甘みのあるキャベツに、濃厚な特製味噌だれがたっぷり絡む大満足のおかずです。",
        steps: [
          "鶏肉は一口大に切り、キャベツはざく切りにします。味噌、醤油、砂糖、みりんを混ぜ合わせて味噌ダレを作ります。",
          "フライパンに油を引き、鶏肉を入れて皮目からじっくり焼き、火が通ったらキャベツを加えて強火で炒めます。",
          "キャベツが少ししんなりしたら、味噌ダレを投入して手早く炒め合わせます。"
        ],
        required: ["鶏肉", "キャベツ"],
        isSet: false
      },
      {
        title: "【お魚ヘルシー】鮭とキャベツの旨塩バター蒸し（要: バター追加）",
        description: "鮭の旨味とキャベツの甘みが塩バターの香りで引き立つ、ふっくらヘルシーな蒸し焼きです。※「バター」を買い足すことで、コク深い風味になります。",
        steps: [
          "キャベツをざく切りにしてフライパンの底に敷き、その上に魚（鮭の切り身）をのせ、軽く塩と酒を振ります。",
          "フタをして弱火〜中火で8〜10分ほどじっくり蒸し焼きにします。",
          "鮭に火が通ったら、仕上げに買い足したバター10gをのせ、フタをして余熱で溶かします。"
        ],
        required: ["魚", "キャベツ"],
        missingIngredient: "バター",
        isSet: false
      }
    ];

    // Helper to dynamically map user ingredients into templates
    const buildMockRecipe = (template: typeof MOCK_RECIPE_TEMPLATES[0]) => {
      let title = template.title;
      let description = template.description;
      let steps = [...template.steps];
      const required = [...template.required];
      const missingIngredient = template.missingIngredient || "";

      if (rawIngredients.length > 0) {
        required.forEach((req, idx) => {
          // Map user ingredients in a round-robin cycle
          const userIng = rawIngredients[idx % rawIngredients.length];
          const reqRegex = new RegExp(req, "g");
          
          title = title.replace(reqRegex, userIng);
          description = description.replace(reqRegex, userIng);
          steps = steps.map(step => step.replace(reqRegex, userIng));
        });
      }

      return {
        title,
        description,
        steps,
        missingIngredient,
        isSet: template.isSet
      } as MenuSuggestion & { isSet: boolean };
    };

    // 1. Build all 10 templates dynamically
    let allGenerated = MOCK_RECIPE_TEMPLATES.map(buildMockRecipe);

    // 2. Strong disliked ingredients filtering
    if (disliked.length > 0) {
      allGenerated = allGenerated.filter(recipe => {
        if (containsDisliked(recipe.title, disliked)) return false;
        if (containsDisliked(recipe.description, disliked)) return false;
        if (recipe.steps.some(step => containsDisliked(step, disliked))) return false;
        if (recipe.missingIngredient && containsDisliked(recipe.missingIngredient, disliked)) return false;
        return true;
      });
    }

    // 3. Avoid already displayed items with exhaustion auto-reset safeguard
    if (avoid.length > 0) {
      const filtered = allGenerated.filter(recipe => isRecipeNew(recipe.title, avoid));
      const setsCount = filtered.filter(r => r.isSet).length;
      const singlesCount = filtered.filter(r => !r.isSet).length;

      // Keep duplicate avoidance only if we have at least 1 set and 3 singles left in the pool.
      // If we fall below this threshold, bypass avoidTitles to guarantee fresh selections.
      if (setsCount >= 1 && singlesCount >= 3) {
        allGenerated = filtered;
      } else {
        console.log("Mock AI stock exhausted by avoidTitles. Auto-resetting avoidance constraint.");
      }
    }

    // 4. Fallback/padding logic if filtering reduced items below required count
    let safeSets = allGenerated.filter(r => r.isSet);
    let safeSingles = allGenerated.filter(r => !r.isSet);

    if (safeSets.length < 1) {
      // Create fallback sets from safe single recipes or static sets
      const fallbackSets = [
        {
          title: "【ほっこり和食】おすすめセット：香ばし焼きおにぎりとあったか味噌汁セット",
          description: "醤油の香ばしさがたまらない焼きおにぎりと、お豆腐だけのシンプルな味噌汁のセット。ほっこり落ち着く組み合わせです。主菜：香ばし焼きおにぎり、副菜：お漬物、汁物：お豆腐のあったか味噌汁。",
          steps: [
            "1. 【下準備＆汁物】だし汁にお豆腐を入れ、味噌を溶き入れて温かいお味噌汁を作ります。",
            "2. 【副菜】お皿にお好みの塩昆布やたくあんなどのお漬物を用意します。",
            "3. 【主菜】温かいご飯に少々の塩を混ぜて握り、フライパンで香ばしく焼き、醤油ダレを絡めます。"
          ],
          missingIngredient: "",
          isSet: true
        }
      ].filter(r => isRecipeSafe(r, disliked) && isRecipeNew(r.title, avoid));
      safeSets = [...safeSets, ...fallbackSets];
    }

    if (safeSingles.length < 3) {
      const fallbackSingles = SAFE_FALLBACK_MEALS.map(m => ({
        title: `【定番の味】${m.title}`,
        description: m.description,
        steps: m.steps,
        missingIngredient: "",
        isSet: false
      })).filter(r => isRecipeSafe(r, disliked) && isRecipeNew(r.title, avoid));
      safeSingles = [...safeSingles, ...fallbackSingles];
    }

    // Shuffle the safe sets and singles dynamically before slicing to ensure variety on every reload
    const shuffledSets = [...safeSets].sort(() => 0.5 - Math.random());
    const shuffledSingles = [...safeSingles].sort(() => 0.5 - Math.random());

    // Pick top 1 set and 3 singles (total 4 recipes)
    const finalSets = shuffledSets.slice(0, 1);
    const finalSingles = shuffledSingles.slice(0, 3);

    const mergedSuggestions = [...finalSets, ...finalSingles];

    // Apply dietary trend rules
    if (trend) {
      mergedSuggestions.forEach(meal => applyTrendRecommendation(meal, trend));
    }

    // 5. Strict title-based de-duplication to ensure zero repeats or duplicate keys
    const seen = new Set<string>();
    const uniqueSuggestions = mergedSuggestions.filter(meal => {
      const cleanTitle = meal.title
        .replace(/【.*?】/g, '')
        .replace(/おすすめセット：/g, '')
        .replace(/セット/g, '')
        .replace(/（要:.*追加）/g, '')
        .replace(/\s+/g, '')
        .trim();
      if (seen.has(cleanTitle)) return false;
      seen.add(cleanTitle);
      return true;
    });

    return uniqueSuggestions;
  },

  /**
   * Generates a beautifully formatted Markdown meal log from today's dinner raw text input (Real Gemini with graceful Mock Fallback).
   */
  generateMealLog: async (rawInput: string, customDate?: string): Promise<string> => {
    if (!rawInput || rawInput.trim().length === 0) {
      return "入力された内容が空です。夕食の内容を入力してください。";
    }

    // 1. Try real Gemini API on Server Side
    try {
      const geminiLog = await generateMealLogServer(rawInput, customDate);
      return geminiLog;
    } catch (e) {
      console.warn("Fallback to Mock AI for generateMealLog due to error:", e);
    }

    // 2. Mock Fallback
    await delay(1200); // Simulate AI generation/reasoning latency

    let formattedDate = "";
    if (customDate && /^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
      const parts = customDate.split("-");
      formattedDate = `${parts[0]}年${parts[1]}月${parts[2]}日`;
    } else {
      const today = new Date();
      formattedDate = `${today.getFullYear()}年${String(today.getMonth() + 1).padStart(2, '0')}月${String(today.getDate()).padStart(2, '0')}日`;
    }

    const items = rawInput
      .split(/[,，、\s\+\-\/\n・]+/)
      .map(item => item.trim())
      .filter(item => item.length > 0 && !["おいしかった", "美味しい", "お腹いっぱい", "最高", "満足", "食べた", "つかれた", "食べた！", "美味しかった！", "美味しかった", "完食"].includes(item));

    let mainDish = "";
    const sideDishes: string[] = [];
    let soup = "";
    let rice = "";
    const comments: string[] = [];

    if (rawInput.includes("美味") || rawInput.includes("おいし")) {
      comments.push("とても美味しく仕上がりました！");
    }
    if (rawInput.includes("簡単") || rawInput.includes("すぐ")) {
      comments.push("手軽に時短で作れました。忙しい日に最適です。");
    }
    if (rawInput.includes("疲") || rawInput.includes("しんど")) {
      comments.push("疲れた体に栄養がしっかり染み渡りました。");
    }
    if (rawInput.includes("満足") || rawInput.includes("お腹いっぱい") || rawInput.includes("満腹") || rawInput.includes("最高")) {
      comments.push("満足度の高いお食事でした。");
    }

    items.forEach((item) => {
      const lowerItem = item.toLowerCase();
      if (lowerItem.includes("汁") || lowerItem.includes("スープ") || lowerItem.includes("吸い物") || lowerItem.includes("ポタージュ") || lowerItem.includes("とん汁")) {
        soup = item;
      }
      else if (
        lowerItem.includes("米") || 
        lowerItem.includes("ご飯") || 
        lowerItem.includes("ごはん") || 
        lowerItem.includes("パン") || 
        lowerItem.includes("ライス") || 
        lowerItem.includes("うどん") || 
        lowerItem.includes("パスタ") || 
        lowerItem.includes("そば") || 
        lowerItem.includes("麺")
      ) {
        rice = item;
      }
      else {
        if (!mainDish) {
          mainDish = item;
        } else {
          sideDishes.push(item);
        }
      }
    });

    if (!mainDish && items.length > 0) {
      mainDish = items[0];
    }

    let dishesMd = "";
    if (mainDish) dishesMd += `- **主菜**: ${mainDish}\n`;
    if (sideDishes.length > 0) dishesMd += `- **副菜**: ${sideDishes.join("、")}\n`;
    if (soup) dishesMd += `- **汁物**: ${soup}\n`;
    if (rice) dishesMd += `- **主食**: ${rice}\n`;

    const lowerInput = rawInput.toLowerCase();
    const hasProtein = /肉|豚|鶏|牛|豆腐|大豆|卵|魚|サバ|鮭|ツナ|チーズ|納豆|ささみ|ステーキ/.test(lowerInput);
    const hasVegetable = /キャベツ|トマト|サラダ|野菜|ねぎ|ネギ|玉ねぎ|タマネギ|大根|ピーマン|ナス|きゅうり|レタス|ほうれん草|小松菜|もやし/.test(lowerInput);
    const hasCarbs = /ごはん|ご飯|白米|米|うどん|パスタ|ラーメン|そば|パン|芋|じゃがいも|サツマイモ/.test(lowerInput);

    const proteinEval = hasProtein ? "🟢 良好 (良質なタンパク質が含まれています)" : "🟡 やや控えめ (肉・魚・大豆製品の追加がおすすめ)";
    const vegEval = hasVegetable ? "🟢 良好 (ビタミンや食物繊維が含まれています)" : "🟡 やや控えめ (野菜を追加するとさらに健康的です)";
    const carbsEval = hasCarbs ? "🟢 適量 (エネルギー源が確保されています)" : "🟡 控えめ (炭水化物控えめのお食事です)";

    const commentText = comments.length > 0
      ? `${comments.join(" ")}\n元のメモ: 「${rawInput}」`
      : `元のメモ: 「${rawInput}」`;

    return `# 🍽️ 今日の夕食ログ (${formattedDate})

## 🍲 本日の献立
${dishesMd || "- 記録された献立はありません\n"}
## 💬 感想・メモ
${commentText}

## 📊 栄養バランス評価
- **タンパク質**: ${proteinEval}
- **野菜・ビタミン**: ${vegEval}
- **炭水化物**: ${carbsEval}

---
*Generated with 夕食献立提案アプリ AI Assistant*`;
  },

  /**
   * Analyzes recent meal logs to determine dietary trends.
   */
  analyzeDietaryTrend: (logs: MealLog[]): DietaryAnalysis => {
    const recentLogs = logs.slice(0, 7);
    const logCount = recentLogs.length;

    let meatCount = 0;
    let vegCount = 0;
    let fishCount = 0;

    recentLogs.forEach(log => {
      if (!log) return;
      const text = (log.rawInput || '').toLowerCase();
      
      const hasMeat = /肉|豚|鶏|牛|ステーキ|ハンバーグ|カツ|から揚げ|チャーシュー|ウインナー|ソーセージ|ミート/.test(text);
      const hasVeg = /キャベツ|トマト|サラダ|野菜|ねぎ|ネギ|玉ねぎ|タマネギ|大根|ピーマン|ナス|きゅうり|レタス|ほうれん草|小松菜|もやし|人参|にんじん|ブロッコリー|きのこ|ゴボウ|ごぼう/.test(text);
      const hasFish = /魚|サバ|鮭|サーモン|アジ|タイ|マグロ|刺身|塩焼き|煮魚|ぶり|ホッケ|たら|タラ/.test(text);

      if (hasMeat) meatCount++;
      if (hasVeg) vegCount++;
      if (hasFish) fishCount++;
    });

    let trend: DietaryAnalysis['trend'] = 'balanced';
    let advice = 'バランスの良い食生活が送れています！素晴らしいですね。この調子をキープしましょう。';
    let recommendedTheme = 'バランス和食';

    if (logCount < 3) {
      trend = 'insufficient_data';
      advice = '夕食ログがまだ少ないため、食習慣の分析ができません。食事ログを3日以上保存すると、AI栄養士が最近の傾向を分析してアドバイスを表示します！';
      recommendedTheme = 'おすすめ夕食';
    } else {
      const meatRatio = meatCount / logCount;
      const vegRatio = vegCount / logCount;

      if (vegRatio < 0.5) {
        trend = 'veg_deficient';
        advice = '最近の夕食ログを分析すると、お野菜が少し不足している傾向があります。キャベツやトマト、緑黄色野菜を取り入れたメニューがおすすめです！';
        recommendedTheme = '野菜たっぷりメニュー';
      } else if (meatRatio >= 0.7) {
        trend = 'meat_heavy';
        advice = '最近はお肉料理が続いていますね！今日は胃腸をお休みさせるために、お豆腐や白身魚、さっぱりした和風スープなどを取り入れてみませんか？';
        recommendedTheme = '胃に優しい和食・魚料理';
      } else if (fishCount === 0) {
        trend = 'balanced';
        advice = '全体的に良いバランスですが、最近お魚を食べていないようです。サラサラ成分DHAが豊富なサバや鮭を使ったメニューを提案にピックアップしました！';
        recommendedTheme = 'お魚健康メニュー';
      }
    }

    return {
      advice,
      recommendedTheme,
      trend,
      meatCount,
      vegCount,
      fishCount,
      logCount
    };
  },

  /**
   * Analyzes an uploaded meal image (Real Gemini with graceful Mock Fallback).
   */
  analyzeMealImage: async (imageFile: File): Promise<string> => {
    // 1. Try real Gemini Multimodal API on Server Side (use FormData to prevent RSC serialization nesting limits)
    try {
      // Compress and resize client-side to easily fit within Vercel 4.5MB payload and 10s Serverless timeout
      let compressedBlob: Blob = imageFile;
      try {
        compressedBlob = await compressImage(imageFile);
      } catch (compressErr) {
        console.warn("Client-side image compression failed, sending original:", compressErr);
      }

      const formData = new FormData();
      // Retain standard filename and append the compressed blob (standardized as a JPEG for extreme light weight)
      formData.append("image", compressedBlob, "meal.jpg");

      const result = await analyzeMealImageServer(formData);
      return result;
    } catch (e) {
      console.warn("Fallback to Mock AI for analyzeMealImage due to error:", e);
    }

    // 2. Mock Fallback
    await delay(1500); // Simulate visual AI scan latency

    const meals = [
      "ジューシー唐揚げ定食、キャベツの千切り、お味噌汁、ご飯",
      "サーモンのムニエル、ブロッコリーのソテー、コーンスープ、ライス",
      "大盛り豚の生姜焼き、千切りキャベツ、豆腐とワカメのお味噌汁、ご飯",
      "具だくさん冷やし中華、冷奴、わかめスープ",
      "旨辛麻婆豆腐定食、中華スープ、ご飯"
    ];

    const selectedMeal = meals[Math.floor(Math.random() * meals.length)];
    return selectedMeal;
  }
};
