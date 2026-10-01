import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';
import { sanitizeString } from '../../lib/validation.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed. Use POST.');
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { message, category, context = {} } = req.body || {};
    const cleanMessage = sanitizeString(message);

    if (!cleanMessage) {
      return errorResponse(res, 400, 'Message query is required.');
    }

    const aiApiKey = process.env.AI_API_KEY;

    // If an external AI API key is configured
    if (aiApiKey) {
      try {
        // Attempt external AI service (e.g. Gemini / OpenAI compatible)
        const systemPrompt = `You are HealthSphere AI Wellness Assistant.
IMPORTANT CLINICAL SAFETY BOUNDARIES:
- You are a lifestyle & wellness coach ONLY.
- You must NOT diagnose diseases, prescribe medication, or give definitive medical diagnoses.
- Provide practical, evidence-based lifestyle suggestions for nutrition, sleep hygiene, hydration, stress management, and daily physical activity.
- Always include this disclaimer: "HealthSphere Wellness Assistant provides general lifestyle recommendations and does not replace medical advice from qualified healthcare providers."`;

        // We can do a fetch to the standard OpenAI-compatible or Gemini endpoint if configured
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `User query: ${cleanMessage}\nUser wellness context: ${JSON.stringify(context)}` },
            ],
            temperature: 0.7,
            max_tokens: 500,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const reply = data.choices?.[0]?.message?.content;
          if (reply) {
            return jsonResponse(
              res,
              200,
              {
                reply,
                source: 'AI_SERVICE',
                disclaimer: 'General wellness guidance only. Not medical diagnosis.',
              },
              'Wellness suggestion generated'
            );
          }
        }
      } catch (externalErr) {
        console.warn('External AI call failed, falling back to built-in wellness engine:', externalErr.message);
      }
    }

    // Graceful Intelligent Rule-based Wellness Engine Fallback
    const reply = generateWellnessSuggestions(cleanMessage, category, context);

    return jsonResponse(
      res,
      200,
      {
        reply,
        source: 'WELLNESS_ENGINE_FALLBACK',
        disclaimer: 'General lifestyle and wellness guidance only. Consult a doctor for medical conditions or diagnoses.',
      },
      'Wellness suggestion generated'
    );
  } catch (err) {
    console.error('AI Wellness Assistant error:', err);
    return errorResponse(res, 500, 'Failed to process wellness request.');
  }
}

/**
 * Intelligent evidence-based wellness guidance generator
 */
function generateWellnessSuggestions(query, category, context = {}) {
  const q = query.toLowerCase();

  // Sleep
  if (q.includes('sleep') || category === 'sleep' || q.includes('insomnia') || q.includes('tired')) {
    return `### 🌙 Sleep Hygiene & Rest Recommendations

Good sleep is the foundation of mental clarity, immune recovery, and metabolic balance.

* **Consistent Sleep Schedule:** Aim to wake up and sleep at the same time every day (including weekends) to regulate your circadian rhythm.
* **Blue Light Reduction:** Discontinue screen time (phones, laptops, TV) 45–60 minutes before bedtime or use blue-light filters.
* **Optimal Sleep Environment:** Keep your bedroom dark, quiet, and slightly cool (~18–20°C / 65–68°F).
* **Caffeine Cut-off:** Avoid caffeine consumption 6–8 hours before bedtime.
* **Wind-down Routine:** Practice 10 minutes of gentle stretching, mindfulness, or reading before sleeping.

> *Note: If you suffer from chronic insomnia or breathing interruptions, please schedule a consultation with a sleep specialist.*`;
  }

  // Hydration & Water
  if (q.includes('water') || q.includes('hydration') || q.includes('drink') || category === 'hydration') {
    return `### 💧 Daily Hydration Guidance

Optimal hydration supports kidney filtration, cognitive performance, and energy levels.

* **Target Volume:** Aim for approximately 2.0 to 3.0 Liters (8–12 glasses) of water daily, adjusted for physical activity and climate.
* **Paced Intake:** Drink a glass upon waking up to jumpstart metabolism, and sip consistently throughout the day rather than chugging large amounts at once.
* **Hydration Indicators:** Pale, straw-colored urine usually indicates adequate hydration.
* **Electrolytes:** If engaging in intense workouts (>60 mins) or high heat, include natural electrolytes such as coconut water or lemon with a pinch of mineral salt.

> *Note: Individuals with cardiac or renal fluid restrictions should strictly follow their doctor's prescribed fluid volume.*`;
  }

  // Nutrition & Diet
  if (q.includes('diet') || q.includes('food') || q.includes('meal') || q.includes('nutrition') || q.includes('eat') || category === 'diet') {
    return `### 🥗 Balanced Nutrition & Meal Suggestions

Focus on whole, minimally processed nutrient-dense foods to fuel steady energy.

* **The Balanced Plate Rule:**
  - **50% Vegetables & Fruits:** Leafy greens, cruciferous vegetables, berries, and colorful peppers.
  - **25% Lean Protein:** Lentils, chickpeas, tofu, eggs, fish, or skinless poultry.
  - **25% Complex Carbohydrates:** Brown rice, quinoa, oats, sweet potatoes, or whole-grain breads.
* **Healthy Fats:** Incorporate extra virgin olive oil, avocados, chia seeds, and raw nuts.
* **Mindful Eating:** Chew slowly and avoid eating while distracted to allow satiety signals to register (typically takes 20 minutes).
* **Fiber Intake:** Aim for 25–35 grams of dietary fiber daily for optimal gut microbiome health.

> *Note: For medical conditions such as diabetes, hypertension, or food allergies, consult a registered clinical dietitian.*`;
  }

  // Exercise & Activity
  if (q.includes('exercise') || q.includes('workout') || q.includes('walk') || q.includes('gym') || category === 'activity') {
    return `### 🏃 Physical Activity & Movement Suggestions

Regular movement enhances cardiovascular endurance, regulates blood sugar, and boosts mood.

* **Baseline Recommendation:** 150 minutes of moderate-intensity aerobic exercise (brisk walking, cycling, swimming) or 75 minutes of vigorous activity weekly.
* **Strength Training:** Include resistance or bodyweight exercises (squats, push-ups, planks) at least 2 days per week.
* **Daily Step Goal:** Strive for 7,000 to 10,000 steps daily. Break up prolonged sitting every 45 minutes with a 2-minute standing stretch.
* **Warm-up & Cool-down:** Always spend 5 minutes preparing joints and muscles before working out to avoid strain.

> *Note: If you have existing cardiovascular or orthopedic conditions, obtain medical clearance prior to initiating high-intensity regimens.*`;
  }

  // General Wellness / Stress
  return `### 🌿 Comprehensive Wellness Suggestions

Thank you for your wellness inquiry! Here are evidence-based habits to support your overall vitality:

1. **Hydration First:** Start your day with 500ml of fresh water before your morning beverage.
2. **Move Consistently:** Aim for at least 30 minutes of physical activity today, even a brisk outdoor walk.
3. **Nourish Deliberately:** Prioritize colorful whole foods with adequate lean protein and fiber.
4. **Stress & Mindfulness:** Take 3 minutes for diaphragmatic breathing (4 seconds in, 4 seconds hold, 6 seconds out) when feeling overwhelmed.
5. **Quality Sleep:** Allow for 7–8 hours of restful sleep in a dark, quiet room.

> *HealthSphere Wellness Assistant provides lifestyle recommendations only and does not diagnose conditions. Please consult a doctor for clinical concerns.*`;
}
