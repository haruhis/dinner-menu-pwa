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

// Rich recipes for empty ingredients input
const RANDOM_MEALS: MenuSuggestion[] = [
  {
    title: "ジューシー極上ハンバーグ定食",
    description: "お肉の旨味をぎゅっと閉じ込めた、ふっくら手作りデミグラスハンバーグ。大人も子供も喜ぶ定番のごちそうです。",
    steps: [
      "玉ねぎをみじん切りにして炒め、しっかり冷ましておく。",
      "合挽き肉、塩コショウ、パン粉、牛乳、卵、冷ました玉ねぎをボウルに入れ、粘りが出るまでよく捏ねる。",
      "空気を抜きながら小判型に成形し、真ん中を少しくぼませて中火で両面を焼き、フタをして極弱火で蒸し焼きにする。",
      "肉汁の残ったフライパンにケチャップ、ウスターソース、みりんを加えて特製デミグラスソースを作る。"
    ]
  },
  {
    title: "お魚とたっぷりお野菜の健康和食定食",
    description: "香ばしく焼き上げた焼き魚に、彩り豊かな季節野菜の小鉢を添えた、栄養バランス満点なヘルシーメニューです。",
    steps: [
      "魚（サバや鮭など）に塩を振り、水分を拭き取ってからグリルで皮目がパリッとなるまで両面焼く。",
      "ニンジン、大根、ほうれん草などお手持ちの温野菜を一口大にカットする。",
      "醤油、すりごま、砂糖、だし汁を合わせた和風ダレで和え、お野菜の小鉢を作る。",
      "お豆腐とわかめのお味噌汁を添えて完成。"
    ]
  },
  {
    title: "特製ふんわり卵の親子丼",
    description: "鶏肉の旨味を吸った甘辛いお出汁と、とろとろの半熟卵がご飯にたっぷり絡む、大満足の丼ものです。",
    steps: [
      "鶏もも肉を一口大に切り、玉ねぎを薄切りにする。",
      "小鍋またはフライパンに、醤油・みりん・酒・砂糖・和風だしを入れて沸騰させ、お肉と玉ねぎを煮る。",
      "具材に火が通り味が染み込んだら、溶き卵を2回に分けて回し入れる。",
      "1回目はフタをして1分、2回目を入れてすぐに火を止め、余熱で半熟に仕上げて温かいご飯にのせる。"
    ]
  },
  {
    title: "スタミナ満点！特製回鍋肉定食",
    description: "甘辛い合わせ味噌のタレがシャキシャキのキャベツと豚肉にたっぷり絡んだ、ご飯が無限に進む中華の大定番です。",
    steps: [
      "豚バラ肉を一口大に切り、キャベツ、ピーマンを乱切りにする。",
      "フライパンに油を引き、豆板醤とニンニクを熱し、豚肉を炒めて一度取り出す。",
      "同じフライパンでキャベツとピーマンを強火で素早く炒め、シャキシャキ感を残す。",
      "お肉を戻し入れ、甜麺醤・醤油・酒・砂糖を合わせたタレを一気に流し込んで強火で絡める。"
    ]
  },
  {
    title: "コク旨たっぷり肉豆腐スープ仕立て",
    description: "牛肉または豚肉の甘みとお豆腐のなめらかさが、和風のお出汁でじんわり温まる、優しく豊かな一品です。",
    steps: [
      "お豆腐を大きめの角切りにし、お肉（薄切り肉）は食べやすい大きさに切る。",
      "お鍋に醤油、みりん、砂糖、酒、和風だしを合わせ、玉ねぎを入れてしんなりするまで煮る。",
      "お肉とお豆腐を加え、弱火でじっくり10分ほど煮込んで味を染み込ませる。",
      "仕上げにネギを散らし、七味唐辛子をお好みで添える。"
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

    // 1. Try real Gemini API on Server Side
    try {
      if (rawIngredients.length > 0) {
        const avoid = (params as any).avoidTitles || [];
        const geminiSuggestions = await suggestMenusServer(rawIngredients, recentMeals, disliked, avoid);
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

    if (rawIngredients.length === 0) {
      // Return 3 random safe and new ones shuffled
      let safeRandom = RANDOM_MEALS.filter(meal => isRecipeSafe(meal, disliked) && isRecipeNew(meal.title, avoid));
      if (safeRandom.length < 3) {
        const safeFallbacks = SAFE_FALLBACK_MEALS.filter(meal => isRecipeSafe(meal, disliked) && isRecipeNew(meal.title, avoid));
        safeRandom = [...safeRandom, ...safeFallbacks];
      }

      const shuffled = [...safeRandom].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 3).map(meal => ({ ...meal }));
      if (trend) {
        selected.forEach(meal => applyTrendRecommendation(meal, trend));
      }
      return selected;
    }

    // Normalized lookup
    const userIngs = rawIngredients.map(ing => ing.toLowerCase());

    const canMakeNow: MenuSuggestion[] = [];
    const missingOne: MenuSuggestion[] = [];

    // Simple matching helper
    const matchesIngredient = (requiredItem: string, userList: string[]) => {
      return userList.some(userItem => 
        requiredItem.includes(userItem) || userItem.includes(requiredItem)
      );
    };

    // Filter catalog
    for (const recipe of RECIPE_CATALOG) {
      if (!isRecipeSafe(recipe, disliked) || !isRecipeNew(recipe.title, avoid)) {
        continue;
      }

      const matchCount = recipe.required.filter(req => matchesIngredient(req, userIngs)).length;
      const totalRequired = recipe.required.length;

      if (matchCount === totalRequired) {
        canMakeNow.push({
          title: recipe.title,
          description: recipe.description,
          steps: recipe.steps
        });
      } else if (matchCount === totalRequired - 1 && totalRequired > 1) {
        const missingReq = recipe.required.find(req => !matchesIngredient(req, userIngs));
        if (missingReq) {
          const item = {
            title: `${recipe.title} (要: ${missingReq}追加)`,
            description: `${recipe.description} ※「${missingReq}」を買い足すことで、この絶品メニューが完成します！`,
            missingIngredient: missingReq,
            steps: recipe.steps
          };
          if (isRecipeSafe(item, disliked)) {
            missingOne.push(item);
          }
        }
      }

      for (const opt of recipe.missingOptions) {
        if (containsDisliked(opt.ingredient, disliked)) {
          continue;
        }

        const hasAllRequired = recipe.required.every(req => matchesIngredient(req, userIngs));
        const userHasOpt = matchesIngredient(opt.ingredient, userIngs);

        if (hasAllRequired && !userHasOpt) {
          const item = {
            title: opt.titleWithMissing,
            description: opt.descWithMissing,
            missingIngredient: opt.ingredient,
            steps: recipe.steps
          };
          if (isRecipeSafe(item, disliked)) {
            missingOne.push(item);
          }
        }
      }
    }

    // Dynamic Generator Fallback:
    if (canMakeNow.length === 0 && rawIngredients.length > 0) {
      const mainIng = rawIngredients[0];
      const subIngStr = rawIngredients.slice(1).join("と") || "常備菜";
      
      const item1 = {
        title: `${mainIng}の極上特製炒め`,
        description: `今ある新鮮な${mainIng}${rawIngredients.length > 1 ? `と${subIngStr}` : ''}の風味を最大限に活かした、特製の簡単和風炒め物です。醤油とみりんの香ばしい香りが立ち上ります。`,
        steps: [
          `${mainIng}とお手持ちの食材を、火が通りやすい大きさに均一にカットします。`,
          "フライパンにごごま油を熱し、香りが立ったら食材を中火〜強火で素早く炒めます。",
          "全体に火が通ったら、醤油大さじ1、みりん大さじ1、酒大さじ1、砂糖少々を加え、タレを絡めるように炒め上げます。"
        ]
      };
      if (isRecipeSafe(item1, disliked)) {
        canMakeNow.push(item1);
      }

      if (rawIngredients.length === 1) {
        const item2 = {
          title: `${mainIng}たっぷり和風雑炊`,
          description: `冷えた体に染み渡る、優しい${mainIng}の出汁スープをベースにしたほかほか雑炊です。`,
          steps: [
            `小鍋に水300ml、和風だしの素小さじ1、醤油小さじ1、みりん小さじ1を入れ沸騰させます。`,
            `細かくカットした${mainIng}と、水洗いしてヌメリを取ったご飯1杯分を加え、弱火で5分煮込みます。`,
            "仕上げにお好みで塩で味を整え、溶き卵やお好みの薬味を回し入れます。"
          ]
        };
        if (isRecipeSafe(item2, disliked)) {
          canMakeNow.push(item2);
        }
      } else {
        const secondIng = rawIngredients[1];
        const item3 = {
          title: `${mainIng}と${secondIng}の味わい健康スープ`,
          description: `素材本来の自然な甘みと旨味をギュッと閉じ込めた、栄養たっぷりの温かいコンソメ風スープです。`,
          steps: [
            `${mainIng}と${secondIng}をサイコロ状にカットします。`,
            "鍋に水400mlとコンソメスープの素1個を入れ、カットした具材を入れ煮立てます。",
            "具材が柔らかくなるまで弱火で10分ほど煮込み、仕上げに塩コショウで味を調えます。"
          ]
        };
        if (isRecipeSafe(item3, disliked)) {
          canMakeNow.push(item3);
        }
      }
    }

    if (missingOne.length === 0 && rawIngredients.length > 0) {
      const mainIng = rawIngredients[0];
      const commonAdditions = ["とろけるチーズ", "シャキシャキ玉ねぎ", "新鮮な完熟トマト", "ふんわり卵"];
      const safeAdditions = commonAdditions.filter(add => !containsDisliked(add, disliked));

      if (safeAdditions.length > 0) {
        const randomAdd = safeAdditions[Math.floor(Math.random() * safeAdditions.length)];
        const missingName = randomAdd.replace(/(とろける|シャキシャキ|新鮮な|ふんわり)/, "").trim();

        const item = {
          title: `${mainIng}と${randomAdd}の黄金チーズ焼き`,
          description: `今の${mainIng}に「${missingName}」をあと1つだけ買い足すことで、とろ〜り絶品のオーブン焼きが作れます。おもてなしにもピッタリ！`,
          missingIngredient: missingName,
          steps: [
            `${mainIng}はあらかじめソテーするか茹でておきます。`,
            `耐熱皿に具材を並べ、買い足した${missingName}をたっぷりとのせます。`,
            "オーブントースターまたはグリルで、表面に香ばしい焼き色がつくまで5〜8分焼き上げます。"
          ]
        };
        if (isRecipeSafe(item, disliked)) {
          missingOne.push(item);
        }
      }
    }

    if (canMakeNow.length === 0 && missingOne.length === 0) {
      const safeFallbacks = SAFE_FALLBACK_MEALS.filter(meal => isRecipeSafe(meal, disliked));
      canMakeNow.push(...safeFallbacks);
    }

    if (trend) {
      canMakeNow.forEach(meal => applyTrendRecommendation(meal, trend));
      missingOne.forEach(meal => applyTrendRecommendation(meal, trend));
    }

    const finalCanMake = canMakeNow.sort(() => 0.5 - Math.random()).slice(0, 2);
    const finalMissing = missingOne.sort(() => 0.5 - Math.random()).slice(0, 2);

    if (trend) {
      finalCanMake.sort((a, b) => (b.isDietitianRecommended ? -1 : 0) - (a.isDietitianRecommended ? -1 : 0));
      finalMissing.sort((a, b) => (b.isDietitianRecommended ? -1 : 0) - (a.isDietitianRecommended ? -1 : 0));
    }

    return [...finalCanMake, ...finalMissing];
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
