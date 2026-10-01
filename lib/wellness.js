/**
 * HealthSphere — Wellness Routes
 *
 * Daily wellness tracking (sleep, hydration, activity, weight, mood) plus the
 * evidence-based wellness assistant. Includes focused `/diet` and `/sleep`
 * sub-resources backed by the same `wellness_records` table.
 *
 * Routed by lib/router.js inside the single Vercel Serverless Function.
 */

import { query, queryOne, execute } from './db.js';
import { ok, created, fail, requireUser, q, qInt } from './middleware.js';
import { generateId, sanitizeString } from './validation.js';
import { logAudit } from './audit.js';

const WELLNESS_FIELDS = [
  'diet_data',
  'sleep_hours',
  'water_intake',
  'exercise_minutes',
  'weight',
  'mood',
  'notes',
];

/**
 * Determine which patient's wellness data the caller may read.
 */
function resolveTargetPatient(ctx, user) {
  const patientIdParam = q(ctx, 'patient_id');
  if (user.role === 'PATIENT') return user.id;
  if (patientIdParam) return patientIdParam;
  return user.id;
}

/**
 * Insert or update the wellness record for a given date, touching only the
 * supplied fields so partial updates (diet, sleep) never wipe other metrics.
 */
async function upsertWellness(ctx, user, recordDate, values) {
  const patientId = user.id;
  const supplied = WELLNESS_FIELDS.filter((field) => values[field] !== undefined);

  const existing = await queryOne(
    'SELECT id FROM wellness_records WHERE patient_id = ? AND record_date = ?',
    [patientId, recordDate]
  );

  if (existing) {
    if (supplied.length === 0) return existing.id;
    const assignments = supplied.map((field) => `${field} = ?`).join(', ');
    const args = supplied.map((field) => values[field]);
    args.push(existing.id);
    await execute(
      `UPDATE wellness_records SET ${assignments} WHERE id = ?`,
      args
    );
    return existing.id;
  }

  const recordId = generateId('well');
  const columns = ['id', 'patient_id', 'record_date', ...supplied];
  const placeholders = ['?', '?', '?', ...supplied.map(() => '?')];
  const args = [recordId, patientId, recordDate, ...supplied.map((field) => values[field])];

  await execute(
    `INSERT INTO wellness_records (${columns.join(', ')}, created_at)
     VALUES (${placeholders.join(', ')}, datetime('now'))`,
    args
  );
  return recordId;
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function summarize(records) {
  let sleepSum = 0;
  let sleepCount = 0;
  let waterSum = 0;
  let waterCount = 0;
  let exerciseTotal = 0;
  let latestWeight = null;
  let dietCount = 0;

  for (const r of records) {
    if (r.sleep_hours != null) {
      sleepSum += Number(r.sleep_hours);
      sleepCount++;
    }
    if (r.water_intake != null) {
      waterSum += Number(r.water_intake);
      waterCount++;
    }
    if (r.exercise_minutes != null) exerciseTotal += Number(r.exercise_minutes);
    if (r.diet_data) dietCount++;
    if (latestWeight == null && r.weight != null) latestWeight = Number(r.weight);
  }

  return {
    avgSleepHours: sleepCount > 0 ? (sleepSum / sleepCount).toFixed(1) : '0.0',
    avgWaterIntakeLiters: waterCount > 0 ? (waterSum / waterCount).toFixed(1) : '0.0',
    totalExerciseMinutes: exerciseTotal,
    latestWeightKg: latestWeight || null,
    daysDietLogged: dietCount,
    totalEntries: records.length,
  };
}

/* ------------------------------------------------------------------ */
/* GET /wellness  |  GET /wellness/:id                                 */
/* ------------------------------------------------------------------ */

export async function listWellness(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const id = q(ctx, 'id');
    if (id) {
      const record = await queryOne('SELECT * FROM wellness_records WHERE id = ?', [id]);
      if (!record) return fail(ctx, 404, 'Wellness record not found.');
      if (user.role === 'PATIENT' && record.patient_id !== user.id) {
        return fail(ctx, 403, 'Unauthorized to view this wellness record.');
      }
      return ok(ctx, { record }, 'Wellness record retrieved');
    }

    const targetPatientId = resolveTargetPatient(ctx, user);
    const limit = Math.min(Math.max(qInt(ctx, 'limit', 30), 1), 365);

    const records = await query(
      'SELECT * FROM wellness_records WHERE patient_id = ? ORDER BY record_date DESC LIMIT ?',
      [targetPatientId, limit]
    );

    return ok(ctx, { records, summary: summarize(records) }, 'Wellness records retrieved');
  } catch (err) {
    console.error('Error fetching wellness records:', err);
    return fail(ctx, 500, 'Failed to fetch wellness records.');
  }
}

/* ------------------------------------------------------------------ */
/* POST /wellness                                                      */
/* ------------------------------------------------------------------ */

export async function logWellness(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx, ['PATIENT', 'ADMIN']));
    if (!user) return;

    const body = ctx.body || {};
    const recordDate = sanitizeString(body.record_date) || new Date().toISOString().split('T')[0];

    const recordId = await upsertWellness(ctx, user, recordDate, {
      diet_data: sanitizeString(body.diet_data) || (body.diet_data === '' ? null : undefined),
      sleep_hours: toNumberOrNull(body.sleep_hours),
      water_intake: toNumberOrNull(body.water_intake),
      exercise_minutes: toNumberOrNull(body.exercise_minutes),
      weight: toNumberOrNull(body.weight),
      mood: sanitizeString(body.mood) || undefined,
      notes: sanitizeString(body.notes) || undefined,
    });

    await logAudit(user.id, 'LOG_WELLNESS', 'wellness_records', recordId, ctx.req);

    const saved = await queryOne('SELECT * FROM wellness_records WHERE id = ?', [recordId]);
    return created(ctx, { record: saved }, 'Wellness logged successfully');
  } catch (err) {
    console.error('Error logging wellness:', err);
    return fail(ctx, 500, 'Failed to log wellness entry.');
  }
}

/* ------------------------------------------------------------------ */
/* /wellness/diet                                                      */
/* ------------------------------------------------------------------ */

export async function getDiet(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const targetPatientId = resolveTargetPatient(ctx, user);
    const limit = Math.min(Math.max(qInt(ctx, 'limit', 30), 1), 365);

    const records = await query(
      `SELECT id, record_date, diet_data, weight, mood, notes, created_at
       FROM wellness_records
       WHERE patient_id = ? AND diet_data IS NOT NULL AND diet_data != ''
       ORDER BY record_date DESC LIMIT ?`,
      [targetPatientId, limit]
    );

    return ok(
      ctx,
      { dietEntries: records, total: records.length },
      'Diet entries retrieved'
    );
  } catch (err) {
    console.error('Error fetching diet entries:', err);
    return fail(ctx, 500, 'Failed to fetch diet entries.');
  }
}

export async function logDiet(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx, ['PATIENT', 'ADMIN']));
    if (!user) return;

    const body = ctx.body || {};
    const recordDate = sanitizeString(body.record_date) || new Date().toISOString().split('T')[0];
    const diet = sanitizeString(body.diet_data ?? body.diet);

    if (!diet) return fail(ctx, 400, 'diet_data is required.');

    const recordId = await upsertWellness(ctx, user, recordDate, {
      diet_data: diet,
      water_intake: toNumberOrNull(body.water_intake),
      weight: toNumberOrNull(body.weight),
      notes: sanitizeString(body.notes) || undefined,
    });

    await logAudit(user.id, 'LOG_WELLNESS_DIET', 'wellness_records', recordId, ctx.req);

    const saved = await queryOne('SELECT * FROM wellness_records WHERE id = ?', [recordId]);
    return created(ctx, { record: saved }, 'Diet entry logged successfully');
  } catch (err) {
    console.error('Error logging diet entry:', err);
    return fail(ctx, 500, 'Failed to log diet entry.');
  }
}

/* ------------------------------------------------------------------ */
/* /wellness/sleep                                                     */
/* ------------------------------------------------------------------ */

export async function getSleep(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const targetPatientId = resolveTargetPatient(ctx, user);
    const limit = Math.min(Math.max(qInt(ctx, 'limit', 30), 1), 365);

    const records = await query(
      `SELECT id, record_date, sleep_hours, mood, notes, created_at
       FROM wellness_records
       WHERE patient_id = ? AND sleep_hours IS NOT NULL
       ORDER BY record_date DESC LIMIT ?`,
      [targetPatientId, limit]
    );

    return ok(
      ctx,
      { sleepEntries: records, summary: summarize(records), total: records.length },
      'Sleep entries retrieved'
    );
  } catch (err) {
    console.error('Error fetching sleep entries:', err);
    return fail(ctx, 500, 'Failed to fetch sleep entries.');
  }
}

export async function logSleep(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx, ['PATIENT', 'ADMIN']));
    if (!user) return;

    const body = ctx.body || {};
    const recordDate = sanitizeString(body.record_date) || new Date().toISOString().split('T')[0];
    const sleepHours = toNumberOrNull(body.sleep_hours);

    if (sleepHours === undefined) return fail(ctx, 400, 'sleep_hours is required.');
    if (sleepHours < 0 || sleepHours > 24) {
      return fail(ctx, 400, 'sleep_hours must be between 0 and 24.');
    }

    const recordId = await upsertWellness(ctx, user, recordDate, {
      sleep_hours: sleepHours,
      mood: sanitizeString(body.mood) || undefined,
      notes: sanitizeString(body.notes) || undefined,
    });

    await logAudit(user.id, 'LOG_WELLNESS_SLEEP', 'wellness_records', recordId, ctx.req);

    const saved = await queryOne('SELECT * FROM wellness_records WHERE id = ?', [recordId]);
    return created(ctx, { record: saved }, 'Sleep entry logged successfully');
  } catch (err) {
    console.error('Error logging sleep entry:', err);
    return fail(ctx, 500, 'Failed to log sleep entry.');
  }
}

/* ------------------------------------------------------------------ */
/* POST /wellness/ai-assistant                                         */
/* ------------------------------------------------------------------ */

const DISCLAIMER =
  'General lifestyle and wellness guidance only. Consult a doctor for medical conditions or diagnoses.';

export async function aiAssistant(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const { message, category, context = {} } = ctx.body || {};
    const cleanMessage = sanitizeString(message);
    if (!cleanMessage) return fail(ctx, 400, 'Message query is required.');

    const aiApiKey = process.env.AI_API_KEY;

    if (aiApiKey) {
      try {
        const systemPrompt = `You are HealthSphere AI Wellness Assistant.
IMPORTANT CLINICAL SAFETY BOUNDARIES:
- You are a lifestyle & wellness coach ONLY.
- You must NOT diagnose diseases, prescribe medication, or give definitive medical diagnoses.
- Provide practical, evidence-based lifestyle suggestions for nutrition, sleep hygiene, hydration, stress management, and daily physical activity.
- Always include this disclaimer: "HealthSphere Wellness Assistant provides general lifestyle recommendations and does not replace medical advice from qualified healthcare providers."`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: `User query: ${cleanMessage}\nUser wellness context: ${JSON.stringify(context)}`,
              },
            ],
            temperature: 0.7,
            max_tokens: 500,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const reply = data.choices?.[0]?.message?.content;
          if (reply) {
            return ok(
              ctx,
              { reply, source: 'AI_SERVICE', disclaimer: 'General wellness guidance only. Not medical diagnosis.' },
              'Wellness suggestion generated'
            );
          }
        }
      } catch (externalErr) {
        console.warn('External AI call failed, using built-in wellness engine:', externalErr.message);
      }
    }

    return ok(
      ctx,
      {
        reply: generateWellnessSuggestions(cleanMessage, category, context),
        source: 'WELLNESS_ENGINE_FALLBACK',
        disclaimer: DISCLAIMER,
      },
      'Wellness suggestion generated'
    );
  } catch (err) {
    console.error('AI Wellness Assistant error:', err);
    return fail(ctx, 500, 'Failed to process wellness request.');
  }
}

/**
 * Evidence-based wellness guidance generator (non-diagnostic).
 */
function generateWellnessSuggestions(queryText, category) {
  const q = queryText.toLowerCase();

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

  if (q.includes('water') || q.includes('hydration') || q.includes('drink') || category === 'hydration') {
    return `### 💧 Daily Hydration Guidance

Optimal hydration supports kidney filtration, cognitive performance, and energy levels.

* **Target Volume:** Aim for approximately 2.0 to 3.0 Liters (8–12 glasses) of water daily, adjusted for physical activity and climate.
* **Paced Intake:** Drink a glass upon waking to boost metabolism, and sip consistently rather than chugging large amounts at once.
* **Hydration Indicators:** Pale, straw-colored urine usually indicates adequate hydration.
* **Electrolytes:** For intense workouts (>60 mins) or high heat, include natural electrolytes.

> *Note: Individuals with cardiac or renal fluid restrictions should follow their doctor's prescribed fluid volume.*`;
  }

  if (
    q.includes('diet') ||
    q.includes('food') ||
    q.includes('meal') ||
    q.includes('nutrition') ||
    q.includes('eat') ||
    category === 'diet'
  ) {
    return `### 🥗 Balanced Nutrition & Meal Suggestions

Focus on whole, minimally processed nutrient-dense foods to fuel steady energy.

* **The Balanced Plate Rule:**
  - **50% Vegetables & Fruits:** Leafy greens, cruciferous vegetables, berries, and colorful peppers.
  - **25% Lean Protein:** Lentils, chickpeas, tofu, eggs, fish, or skinless poultry.
  - **25% Complex Carbohydrates:** Brown rice, quinoa, oats, sweet potatoes, or whole-grain breads.
* **Healthy Fats:** Extra virgin olive oil, avocados, chia seeds, and raw nuts.
* **Mindful Eating:** Chew slowly and avoid eating while distracted so satiety signals can register.
* **Fiber Intake:** Aim for 25–35 grams of dietary fiber daily.

> *Note: For medical conditions such as diabetes, hypertension, or food allergies, consult a registered clinical dietitian.*`;
  }

  if (
    q.includes('exercise') ||
    q.includes('workout') ||
    q.includes('walk') ||
    q.includes('gym') ||
    category === 'activity'
  ) {
    return `### 🏃 Physical Activity & Movement Suggestions

Regular movement enhances cardiovascular endurance, regulates blood sugar, and boosts mood.

* **Baseline Recommendation:** 150 minutes of moderate-intensity aerobic exercise weekly, or 75 minutes of vigorous activity.
* **Strength Training:** Include resistance or bodyweight exercises at least 2 days per week.
* **Daily Step Goal:** Strive for 7,000 to 10,000 steps daily. Break up prolonged sitting every 45 minutes.
* **Warm-up & Cool-down:** Always spend 5 minutes preparing joints and muscles before working out.

> *Note: If you have existing cardiovascular or orthopedic conditions, obtain medical clearance prior to high-intensity regimens.*`;
  }

  return `### 🌿 Comprehensive Wellness Suggestions

Thank you for your wellness inquiry! Here are evidence-based habits to support your overall vitality:

1. **Hydration First:** Start your day with 500ml of fresh water before your morning beverage.
2. **Move Consistently:** Aim for at least 30 minutes of physical activity today.
3. **Nourish Deliberately:** Prioritize colorful whole foods with adequate lean protein and fiber.
4. **Stress & Mindfulness:** Take 3 minutes for diaphragmatic breathing (4s in, 4s hold, 6s out) when overwhelmed.
5. **Quality Sleep:** Allow for 7–8 hours of restful sleep in a dark, quiet room.

> *HealthSphere Wellness Assistant provides lifestyle recommendations only and does not diagnose conditions.*`;
}

/* ------------------------------------------------------------------ */
/* Route table                                                         */
/* ------------------------------------------------------------------ */

export const routes = [
  { method: 'GET', path: '/wellness', handler: listWellness },
  { method: 'POST', path: '/wellness', handler: logWellness, roles: ['PATIENT', 'ADMIN'] },
  { method: 'POST', path: '/wellness/ai-assistant', handler: aiAssistant },
  { method: 'GET', path: '/wellness/diet', handler: getDiet },
  { method: 'POST', path: '/wellness/diet', handler: logDiet, roles: ['PATIENT', 'ADMIN'] },
  { method: 'GET', path: '/wellness/sleep', handler: getSleep },
  { method: 'POST', path: '/wellness/sleep', handler: logSleep, roles: ['PATIENT', 'ADMIN'] },
  { method: 'GET', path: '/wellness/:id', handler: listWellness },
];
