
const app = document.getElementById('app');
const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
const STORAGE_KEY = 'bulgarian-trainer-progress-v1';

const state = {
  screen: 'dashboard',
  words: [],
  verbs: [],
  loaded: false,
  progress: loadProgress(),
  session: null,
  filter: {
    search: '',
    category: 'all'
  }
};

function todayISO(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDaysISO(base, days) {
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function uniqueByExact(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.bg}|${item.en}|${item.category}|${item.kind || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zа-я0-9\s-]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: {}, history: [] };
    const parsed = JSON.parse(raw);
    return {
      items: parsed.items || {},
      history: Array.isArray(parsed.history) ? parsed.history : []
    };
  } catch {
    return { items: {}, history: [] };
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function setScreen(screen) {
  state.screen = screen;
  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.nav === screen));
  render();
}

function clearSession() {
  state.session = null;
  state.screen = 'dashboard';
  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.nav === 'dashboard'));
  render();
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => setScreen(btn.dataset.nav));
});

function itemKey(item) {
  return `${item.type}:${item.id}`;
}

function getItemProgress(item) {
  const key = itemKey(item);
  if (!state.progress.items[key]) {
    state.progress.items[key] = {
      correct: 0,
      wrong: 0,
      box: 0,
      due: todayISO(),
      last: null
    };
  }
  return state.progress.items[key];
}

function updateItemProgress(item, correct) {
  const p = getItemProgress(item);
  const now = todayISO();
  p.last = now;
  if (correct) {
    p.correct += 1;
    p.box = Math.min(p.box + 1, 6);
    const intervals = [1, 2, 4, 7, 14, 30, 60];
    p.due = addDaysISO(now, intervals[p.box]);
  } else {
    p.wrong += 1;
    p.box = 0;
    p.due = addDaysISO(now, 1);
  }
  state.progress.history.push({
    date: now,
    key: itemKey(item),
    correct
  });
  if (state.progress.history.length > 2000) {
    state.progress.history = state.progress.history.slice(-2000);
  }
  saveProgress();
}

function summarizeStats() {
  const all = [...state.words, ...state.verbs];
  let studied = 0;
  let correct = 0;
  let wrong = 0;
  let dueToday = 0;
  const today = todayISO();

  for (const item of all) {
    const p = state.progress.items[itemKey(item)];
    if (p) {
      if ((p.correct + p.wrong) > 0) studied += 1;
      correct += p.correct || 0;
      wrong += p.wrong || 0;
      if (p.due <= today) dueToday += 1;
    }
  }

  const accuracy = correct + wrong === 0 ? 0 : Math.round((correct / (correct + wrong)) * 100);
  const streak = calculateStreak();

  return {
    total: all.length,
    studied,
    dueToday,
    correct,
    wrong,
    accuracy,
    streak
  };
}

function calculateStreak() {
  const days = [...new Set(state.progress.history.map(h => h.date))].sort();
  if (!days.length) return 0;

  let streak = 1;
  let current = todayISO();
  if (!days.includes(current)) {
    // if no activity today, compute from last date backwards
    current = days[days.length - 1];
  }
  let cursor = current;

  for (;;) {
    const prev = addDaysISO(cursor, -1);
    if (days.includes(prev)) {
      streak += 1;
      cursor = prev;
    } else {
      break;
    }
  }
  return streak;
}

function categoryLabel(item) {
  return item.category.replace(/_/g, ' ');
}

function kindLabel(item) {
  return item.type === 'verb' ? 'Verb' : (item.kind || 'Word');
}

function usageHint(item) {
  if (item.type === 'verb') {
    const base = item.bg;
    const extra = {
      'пътувам': 'Пътувам до работа.',
      'ремонтирам': 'Ремонтирам двигателя.',
      'проверявам': 'Проверявам документа.',
      'говоря': 'Говоря с колега.',
      'чета': 'Чета инструкцията.',
      'пиша': 'Пиша имейл.',
      'купувам': 'Купувам хляб.',
      'плащам': 'Плащам на касата.',
      'трябва': 'Трябва да работя.',
      'мога': 'Мога да помогна.'
    };
    const first = extra[base] || `Аз ${base}.`;
    return [
      first,
      `Ще ${base}.`,
      `Трябва да ${base}.`
    ];
  }

  const text = item.bg;
  const specials = {
    'да': ['Да, разбира се.', 'Да, идвам.', 'Да, мога.'],
    'не': ['Не, благодаря.', 'Не, не мога.', 'Не, днес не.'],
    'моля': ['Моля, помогни ми.', 'Моля, повтори.', 'Моля, изпрати файла.'],
    'благодаря': ['Благодаря за помощта.', 'Благодаря много.'],
    'извинявай': ['Извинявай, закъснях.', 'Извинявай, не разбрах.'],
    'здравей': ['Здравей, как си?', 'Здравей!'],
    'здравейте': ['Здравейте, как сте?', 'Здравейте!'],
    'довиждане': ['Довиждане, до утре.', 'Довиждане!']
  };
  if (specials[text]) return specials[text];

  if (item.kind === 'adjective') return [`Това е ${text}.`, `Стаята е ${text}.`];
  if (item.kind === 'number') return [`Има ${text} човека.`, `Виждам ${text} коли.`];
  if (item.category === 'food') return [`Купувам ${text}.`, `Имам ${text} за вечеря.`];
  if (item.category === 'mechanic') return [`Проверявам ${text}.`, `В сервиза има ${text}.`];
  if (item.category === 'work_office') return [`Имаме ${text} в офиса.`, `Проверявам ${text}.`];
  if (item.category === 'transport') return [`Пътувам с ${text}.`, `Имам ${text}.`];
  if (item.category === 'body_health') return [`Имам ${text}.`, `Лекарят проверява ${text}.`];
  if (item.category === 'people_abstract') return [`Говоря с ${text}.`, `Имам ${text}.`];
  if (item.category === 'nature_weather') return [`Виждам ${text}.`, `Днес има ${text}.`];
  if (item.category === 'tech_education') return [`Използвам ${text}.`, `Чета в ${text}.`];
  return [`Имам ${text}.`, `Виждам ${text}.`];
}

function questionTextFor(item) {
  if (item.type === 'verb') return `How do you say “${item.en}” in Bulgarian?`;
  return `How do you say “${item.en}” in Bulgarian?`;
}

function readingPromptFor(item) {
  if (item.type === 'verb') {
    return `Read: “Аз ${item.bg}.”`;
  }
  return `Read: “Имам ${item.bg}.”`;
}

function buildOptions(correct, pool, property = 'en') {
  const others = shuffle(pool.filter(x => x[property] !== correct)).slice(0, 3).map(x => x[property]);
  return shuffle([correct, ...others]);
}

function pickByCategories(items, categories, count) {
  const pool = items.filter(item => categories.includes(item.category));
  return shuffle(pool).slice(0, count);
}

function pickNewItems(items, count) {
  const today = todayISO();
  const fresh = items.filter(item => {
    const p = state.progress.items[itemKey(item)];
    return !p || (p.correct + p.wrong) === 0;
  });
  return shuffle(fresh).slice(0, count);
}

function pickDueItems(items, count) {
  const today = todayISO();
  return items.filter(item => {
    const p = state.progress.items[itemKey(item)];
    return p && p.due <= today;
  }).sort(() => 0.5 - Math.random()).slice(0, count);
}

function buildDailySet() {
  const wordPriority = pickByCategories(state.words, [
    'mechanic',
    'work_office',
    'transport',
    'food',
    'people_abstract'
  ], 12);
  const verbPriority = pickByCategories(state.verbs, [
    'mechanic',
    'work_admin',
    'daily',
    'communication'
  ], 12);

  const due = [
    ...pickDueItems(state.words, 8),
    ...pickDueItems(state.verbs, 8)
  ];

  const newItems = [
    ...pickNewItems(wordPriority.length ? wordPriority : state.words, 6),
    ...pickNewItems(verbPriority.length ? verbPriority : state.verbs, 6)
  ];

  const combined = shuffle([
    ...due,
    ...wordPriority,
    ...verbPriority,
    ...newItems
  ]);

  const seen = new Set();
  return combined.filter(item => {
    const key = itemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function buildEvaluationSet() {
  const words = shuffle(state.words).slice(0, 10);
  const verbs = shuffle(state.verbs).slice(0, 10);
  return shuffle([...words, ...verbs]);
}

function makeSession(type, items, mode) {
  state.session = {
    type,
    items,
    mode,
    index: 0,
    score: 0,
    answers: [],
    current: null,
    optionPool: type === 'mixed' ? [...state.words, ...state.verbs] : items,
    voice: null,
    revealed: false
  };
  prepareCurrentQuestion();
  setScreen(mode === 'evaluation' ? 'evaluation' : 'practice');
}

function prepareCurrentQuestion() {
  const s = state.session;
  if (!s) return;
  s.revealed = false;
  s.current = s.items[s.index] || null;
}

function advanceSession() {
  const s = state.session;
  if (!s) return;
  s.index += 1;
  if (s.index >= s.items.length) {
    s.current = null;
  } else {
    prepareCurrentQuestion();
  }
  render();
}

function scorePercent(session = state.session) {
  if (!session || !session.items.length) return 0;
  return Math.round((session.score / session.items.length) * 100);
}

function answerSession(choice, meta = {}) {
  const s = state.session;
  if (!s || !s.current) return;

  const item = s.current;
  const correctValue = item.type === 'verb' ? item.en : item.en;
  const isCorrect = normalize(choice) === normalize(correctValue);

  if (s.mode === 'evaluation') {
    s.answers.push({ item, choice, correct: isCorrect });
    if (isCorrect) s.score += 1;
    updateItemProgress(item, isCorrect);
    advanceSession();
    return;
  }

  if (isCorrect) s.score += 1;
  updateItemProgress(item, isCorrect);
  s.answers.push({ item, choice, correct: isCorrect });
  s.revealed = true;
  s.lastFeedback = {
    correct: isCorrect,
    choice,
    correctValue,
    explanation: buildExplanation(item)
  };
  render();
}

function buildExplanation(item) {
  if (item.type === 'verb') {
    const usage = usageHint(item);
    return {
      title: item.bg,
      lines: [
        `${item.bg} = ${item.en}`,
        ...usage
      ]
    };
  }

  const usage = usageHint(item);
  return {
    title: item.bg,
    lines: [
      `${item.bg} = ${item.en}`,
      ...usage
    ]
  };
}

function speak(text, lang = 'bg-BG') {
  if (!('speechSynthesis' in window)) {
    alert('Your browser does not support speech synthesis.');
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.95;
  window.speechSynthesis.speak(utter);
}

function startRecognition(onResult, onError) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    onError?.('Speech recognition is not supported in this browser.');
    return null;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'bg-BG';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = event => {
    const transcript = event.results[0][0].transcript;
    onResult(transcript);
  };
  recognition.onerror = event => {
    onError?.(event.error || 'Speech recognition error.');
  };
  recognition.start();
  return recognition;
}

function renderDashboard() {
  const stats = summarizeStats();
  const due = stats.dueToday;
  const daily = buildDailySet();
  const byType = {
    words: state.words.length,
    verbs: state.verbs.length
  };
  const focusWords = state.words.filter(w => ['mechanic', 'work_office', 'transport'].includes(w.category)).length;
  const focusVerbs = state.verbs.filter(v => ['mechanic', 'work_admin', 'daily'].includes(v.category)).length;

  app.innerHTML = `
    <section class="grid cols-2">
      <div class="card">
        <h2>Your Bulgarian plan</h2>
        <p class="muted">This app is built for practical Bulgarian: daily life, work, travel, and mechanic language you can actually use.</p>
        <div class="grid cols-3" style="margin-top:16px;">
          <div class="stat"><span>Total items</span><strong>${stats.total}</strong></div>
          <div class="stat"><span>Due today</span><strong>${due}</strong></div>
          <div class="stat"><span>Accuracy</span><strong>${stats.accuracy}%</strong></div>
        </div>
        <div class="grid cols-3" style="margin-top:12px;">
          <div class="stat"><span>Streak</span><strong>${stats.streak}</strong></div>
          <div class="stat"><span>Studied</span><strong>${stats.studied}</strong></div>
          <div class="stat"><span>Sessions done</span><strong>${state.progress.history.length}</strong></div>
        </div>
      </div>

      <div class="card alt">
        <h2>Today’s focus</h2>
        <p class="muted">Priority is work + real-life use, not literature.</p>
        <div class="grid cols-2" style="margin-top:16px;">
          <div class="stat"><span>Useful words</span><strong>${focusWords}</strong></div>
          <div class="stat"><span>Useful verbs</span><strong>${focusVerbs}</strong></div>
        </div>
        <div class="progress-bar" aria-label="Progress"><div style="width:${Math.min(stats.accuracy,100)}%"></div></div>
        <p class="tiny">Goal progress is based on what you have answered correctly, not just what you have seen.</p>
      </div>
    </section>

    <section class="grid cols-2" style="margin-top:16px;">
      <div class="card">
        <h3>Start now</h3>
        <div class="group" style="margin-top:12px; display:flex; flex-wrap:wrap; gap:10px;">
          <button class="btn" onclick="startDailySession()">Start daily session</button>
          <button class="btn" onclick="startPracticeQuiz()">Practice quiz</button>
          <button class="btn" onclick="startEvaluation()">Run evaluation</button>
        </div>
        <p class="tiny" style="margin-top:12px;">Daily session mixes due items, new items, and work-focused vocabulary.</p>
      </div>

      <div class="card">
        <h3>Daily lesson preview</h3>
        <div class="review-list">
          ${daily.slice(0, 4).map(item => `
            <div class="review-item">
              <strong>${esc(item.bg)}</strong> <span class="muted">— ${esc(item.en)}</span><br/>
              <span class="tiny">${esc(item.type === 'verb' ? buildExplanation(item).lines[1] : buildExplanation(item).lines[1])}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderBrowser(type) {
  const items = type === 'words' ? state.words : state.verbs;
  const categories = [...new Set(items.map(i => i.category))].sort();
  const filtered = items.filter(item => {
    const matchesSearch = !state.filter.search || normalize(item.bg).includes(normalize(state.filter.search)) || normalize(item.en).includes(normalize(state.filter.search));
    const matchesCategory = state.filter.category === 'all' || item.category === state.filter.category;
    return matchesSearch && matchesCategory;
  });

  app.innerHTML = `
    <section class="card">
      <div class="toolbar">
        <div class="group">
          <h2 style="margin:0;">${type === 'words' ? 'Words' : 'Verbs'}</h2>
          <span class="chip">${items.length} items</span>
          <span class="chip">${filtered.length} visible</span>
        </div>
        <div class="group">
          <input type="text" id="search" placeholder="Search Bulgarian or English" value="${esc(state.filter.search)}" />
          <select id="category">
            <option value="all">All categories</option>
            ${categories.map(cat => `<option value="${esc(cat)}" ${state.filter.category === cat ? 'selected' : ''}>${esc(cat.replace(/_/g,' '))}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="card-grid">
        ${filtered.slice(0, 80).map(item => `
          <article class="item-card">
            <div class="item-top">
              <div>
                <div class="item-bg">${esc(item.bg)}</div>
                <div class="item-en">${esc(item.en)}</div>
              </div>
              <button class="tiny-btn" onclick="playItem('${item.id}','${type}')">🔊</button>
            </div>
            <div class="item-meta">
              <span class="badge">${esc(categoryLabel(item))}</span>
              <span class="badge">${esc(kindLabel(item))}</span>
            </div>
            <p class="tiny" style="margin-bottom:0; margin-top:10px;">${esc(renderUsagePreview(item))}</p>
          </article>
        `).join('')}
      </div>

      ${filtered.length > 80 ? '<p class="tiny" style="margin-top:14px;">Showing first 80 items. Use search to narrow it down.</p>' : ''}
    </section>
  `;

  const search = document.getElementById('search');
  const category = document.getElementById('category');
  if (search) {
    search.addEventListener('input', e => {
      state.filter.search = e.target.value;
      renderBrowser(type);
    });
  }
  if (category) {
    category.addEventListener('change', e => {
      state.filter.category = e.target.value;
      renderBrowser(type);
    });
  }
}

function renderUsagePreview(item) {
  const usage = usageHint(item);
  return Array.isArray(usage) ? usage[0] : usage;
}

function playItem(id, type) {
  const item = (type === 'words' ? state.words : state.verbs).find(x => x.id === id);
  if (!item) return;
  speak(item.bg);
}

function startDailySession() {
  const items = buildDailySet();
  makeSession('mixed', items, 'practice');
}

function startPracticeQuiz() {
  const items = shuffle([...state.words, ...state.verbs]).slice(0, 20);
  makeSession('mixed', items, 'practice');
}

function startEvaluation() {
  const items = buildEvaluationSet();
  makeSession('mixed', items, 'evaluation');
}

function startListening() {
  const pool = shuffle([...state.words, ...state.verbs]).slice(0, 15);
  makeSession('listening', pool, 'practice');
}

function startSpeaking() {
  const pool = shuffle([...state.words, ...state.verbs]).slice(0, 12);
  makeSession('speaking', pool, 'practice');
}

function startReading() {
  const pool = shuffle([...state.words, ...state.verbs]).slice(0, 12);
  makeSession('reading', pool, 'practice');
}

function renderSessionScreen(kind) {
  const s = state.session;
  if (!s) {
    app.innerHTML = `<div class="card"><p>No session loaded.</p></div>`;
    return;
  }
  if (!s.current) {
    return renderSummaryScreen();
  }

  const item = s.current;
  const quizType = s.type;
  const question = makeQuestion(item, kind);

  app.innerHTML = `
    <section class="card">
      <div class="toolbar">
        <div class="group">
          <h2 style="margin:0;">${esc(question.title)}</h2>
          <span class="chip">${s.index + 1} / ${s.items.length}</span>
          <span class="chip">${s.mode === 'evaluation' ? 'Evaluation' : 'Practice'}</span>
        </div>
        <div class="group">
          <button class="btn" onclick="skipItem()">Skip</button>
        </div>
      </div>

      <div class="question">${esc(question.prompt)}</div>
      <div class="prompt">${esc(question.helper)}</div>

      ${question.voice ? `<button class="btn" onclick="speak('${escForJs(question.voice)}')">🔊 Play audio</button>` : ''}

      ${question.speaking ? `
        <div style="margin-top:14px;">
          <button class="btn" onclick="startSpeechCheck()">🎤 Start speaking</button>
          <div id="speechResult" class="feedback" style="display:none;"></div>
        </div>
      ` : `
        <div class="answer-grid">
          ${question.options.map(opt => `<button class="btn answer-btn" onclick="submitAnswer('${escForJs(opt)}')">${esc(opt)}</button>`).join('')}
        </div>
      `}

      ${s.revealed && s.lastFeedback ? `
        <div class="feedback ${s.lastFeedback.correct ? 'good' : 'bad'}">
          <strong>${s.lastFeedback.correct ? 'Correct' : 'Wrong'}</strong><br/>
          <div style="margin-top:8px;">${s.lastFeedback.explanation.lines.map(line => `<div>${esc(line)}</div>`).join('')}</div>
        </div>
        <div style="margin-top:12px;"><button class="btn" onclick="nextQuestion()">Next</button></div>
      ` : ''}
    </section>
  `;
}

function makeQuestion(item, kind) {
  const pool = state.session?.optionPool || [...state.words, ...state.verbs];
  const commonOptions = buildOptions(item.en, pool, 'en');

  if (kind === 'listening') {
    return {
      title: 'Listening practice',
      prompt: item.type === 'verb' ? `Listen and choose the English meaning of “${item.bg}”.` : `Listen and choose the English meaning of “${item.bg}”.`,
      helper: `Play the Bulgarian audio, then pick the correct meaning.`,
      voice: item.bg,
      options: commonOptions,
      speaking: false
    };
  }

  if (kind === 'speaking') {
    return {
      title: 'Speaking practice',
      prompt: `Say this in Bulgarian: “${item.en}”.`,
      helper: item.type === 'verb'
        ? `Try: ${usageHint(item)[0]}`
        : `Try a simple sentence: ${usageHint(item)[0]}`,
      voice: null,
      options: [],
      speaking: true,
      expected: item.bg
    };
  }

  if (kind === 'reading') {
    return {
      title: 'Reading practice',
      prompt: readingPromptFor(item),
      helper: `Read the Bulgarian sentence and choose the closest English meaning.`,
      voice: null,
      options: commonOptions,
      speaking: false
    };
  }

  return {
    title: item.type === 'verb' ? 'Verb practice' : 'Word practice',
    prompt: questionTextFor(item),
    helper: item.type === 'verb'
      ? `Think about use: ${usageHint(item).join(' | ')}`
      : `How it is used: ${usageHint(item).join(' | ')}`,
    voice: item.bg,
    options: commonOptions,
    speaking: false
  };
}

function escForJs(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function submitAnswer(choice) {
  const s = state.session;
  if (!s || !s.current) return;
  const item = s.current;
  const correct = item.en;
  const isCorrect = normalize(choice) === normalize(correct);
  if (s.mode === 'evaluation') {
    s.answers.push({ item, choice, correct: isCorrect });
    if (isCorrect) s.score += 1;
    updateItemProgress(item, isCorrect);
    advanceSession();
    return;
  }
  if (isCorrect) s.score += 1;
  updateItemProgress(item, isCorrect);
  s.answers.push({ item, choice, correct: isCorrect });
  s.lastFeedback = {
    correct: isCorrect,
    choice,
    correctValue: correct,
    explanation: buildExplanation(item)
  };
  s.revealed = true;
  render();
}

function startSpeechCheck() {
  const s = state.session;
  if (!s || !s.current) return;
  const item = s.current;
  const resultBox = document.getElementById('speechResult');
  if (!resultBox) return;

  startRecognition(
    transcript => {
      const nTranscript = normalize(transcript);
      const nExpected = normalize(item.bg);
      const accepted = nTranscript === nExpected || nTranscript.includes(nExpected) || nExpected.includes(nTranscript);
      updateItemProgress(item, accepted);
      resultBox.style.display = 'block';
      resultBox.className = `feedback ${accepted ? 'good' : 'bad'}`;
      resultBox.innerHTML = `
        <strong>${accepted ? 'Good job' : 'Not quite'}</strong><br/>
        <div style="margin-top:8px;">You said: ${esc(transcript)}</div>
        <div>Expected: ${esc(item.bg)}</div>
        <div class="tiny" style="margin-top:8px;">${esc(renderUsagePreview(item))}</div>
      `;
      if (accepted) s.score += 1;
      s.answers.push({ item, choice: transcript, correct: accepted });
      s.revealed = true;
      s.lastFeedback = {
        correct: accepted,
        choice: transcript,
        correctValue: item.bg,
        explanation: buildExplanation(item)
      };
      render();
    },
    err => {
      resultBox.style.display = 'block';
      resultBox.className = 'feedback bad';
      resultBox.innerHTML = `<strong>Voice input unavailable</strong><br/><div style="margin-top:8px;">${esc(err || 'Speech recognition is not supported.')}</div>`;
    }
  );
}

function skipItem() {
  const s = state.session;
  if (!s || !s.current) return;
  updateItemProgress(s.current, false);
  s.answers.push({ item: s.current, choice: null, correct: false, skipped: true });
  advanceSession();
}

function nextQuestion() {
  const s = state.session;
  if (!s) return;
  s.index += 1;
  if (s.index >= s.items.length) {
    renderSummaryScreen();
    return;
  }
  prepareCurrentQuestion();
  render();
}

function renderSummaryScreen() {
  const s = state.session;
  if (!s) return;
  const percent = scorePercent(s);
  const level = percent >= 75 ? 'B1' : (percent >= 55 ? 'A2' : 'A1');

  const weakCategories = {};
  for (const answer of s.answers) {
    const cat = answer.item.category;
    if (!answer.correct) weakCategories[cat] = (weakCategories[cat] || 0) + 1;
  }
  const weak = Object.entries(weakCategories).sort((a, b) => b[1] - a[1]).slice(0, 5);

  app.innerHTML = `
    <section class="card">
      <h2>Session finished</h2>
      <p class="muted">This result is just for your training; the app focuses on practical Bulgarian and keeps improving your review queue automatically.</p>
      <div class="grid cols-3" style="margin-top:16px;">
        <div class="stat"><span>Score</span><strong>${s.score} / ${s.items.length}</strong></div>
        <div class="stat"><span>Percent</span><strong>${percent}%</strong></div>
        <div class="stat"><span>Estimated level</span><strong>${level}</strong></div>
      </div>
      <div class="progress-bar" aria-label="Score"><div style="width:${percent}%"></div></div>
      <div class="group" style="margin-top:16px; display:flex; flex-wrap:wrap; gap:10px;">
        <button class="btn" onclick="startDailySession()">Daily session</button>
        <button class="btn" onclick="startPracticeQuiz()">Practice quiz</button>
        <button class="btn" onclick="startEvaluation()">Evaluation</button>
        <button class="btn" onclick="setScreen('progress')">View progress</button>
        <button class="btn" onclick="clearSession()">Exit session</button>
      </div>

      <h3 style="margin-top:22px;">Review what you missed</h3>
      <div class="review-list">
        ${s.answers.filter(x => !x.correct).map(ans => `
          <div class="review-item">
            <strong>${esc(ans.item.bg)}</strong> <span class="muted">— ${esc(ans.item.en)}</span><br/>
            <div class="tiny" style="margin-top:6px;">Use: ${esc(renderUsagePreview(ans.item))}</div>
            ${ans.choice ? `<div class="tiny" style="margin-top:6px;">Your answer: ${esc(ans.choice)}</div>` : '<div class="tiny" style="margin-top:6px;">Skipped</div>'}
          </div>
        `).join('') || '<p class="muted">Nothing missed. Nice work.</p>'}
      </div>

      <h3 style="margin-top:22px;">Weakest categories</h3>
      <div class="group" style="display:flex; flex-wrap:wrap; gap:8px;">
        ${weak.length ? weak.map(([cat, count]) => `<span class="chip">${esc(cat.replace(/_/g,' '))}: ${count}</span>`).join('') : '<span class="chip">No weak area yet</span>'}
      </div>
    </section>
  `;
}

function renderProgress() {
  const stats = summarizeStats();
  const today = todayISO();
  const dueWords = pickDueItems(state.words, 999).length;
  const dueVerbs = pickDueItems(state.verbs, 999).length;

  const topMisses = Object.entries(state.progress.items)
    .map(([key, p]) => ({ key, p }))
    .sort((a, b) => (b.p.wrong || 0) - (a.p.wrong || 0))
    .slice(0, 12);

  const lookup = new Map([...state.words, ...state.verbs].map(item => [itemKey(item), item]));

  app.innerHTML = `
    <section class="grid cols-2">
      <div class="card">
        <h2>Progress</h2>
        <div class="grid cols-2" style="margin-top:16px;">
          <div class="stat"><span>Accuracy</span><strong>${stats.accuracy}%</strong></div>
          <div class="stat"><span>Streak</span><strong>${stats.streak}</strong></div>
          <div class="stat"><span>Due words</span><strong>${dueWords}</strong></div>
          <div class="stat"><span>Due verbs</span><strong>${dueVerbs}</strong></div>
        </div>
        <p class="tiny" style="margin-top:10px;">The review queue follows a simple spaced repetition pattern, so items come back after you answer them.</p>
        <div class="progress-bar"><div style="width:${Math.min(stats.accuracy,100)}%"></div></div>
      </div>

      <div class="card alt">
        <h2>Focus areas</h2>
        <p class="muted">If your target is B1 for work, spend more time on mechanics, work, transport, food, and daily verbs.</p>
        <div class="group" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:14px;">
          <span class="chip">Mechanic</span>
          <span class="chip">Work</span>
          <span class="chip">Travel</span>
          <span class="chip">Shopping</span>
          <span class="chip">Speaking</span>
          <span class="chip">Listening</span>
        </div>
      </div>
    </section>

    <section class="card" style="margin-top:16px;">
      <h3>Most missed items</h3>
      <div class="review-list">
        ${topMisses.length ? topMisses.map(({ key, p }) => {
          const item = lookup.get(key);
          if (!item) return '';
          return `
            <div class="review-item">
              <strong>${esc(item.bg)}</strong> <span class="muted">— ${esc(item.en)}</span><br/>
              <span class="tiny">Wrong: ${p.wrong || 0} | Correct: ${p.correct || 0} | Due: ${p.due || today}</span>
            </div>
          `;
        }).join('') : '<p class="muted">No misses yet.</p>'}
      </div>
    </section>
  `;
}

function renderEvaluationIntro() {
  app.innerHTML = `
    <section class="card">
      <h2>Evaluation test</h2>
      <p class="muted">This test mixes words and verbs from your daily-use Bulgarian set. You get the score and corrections at the end.</p>
      <div class="group" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:14px;">
        <button class="btn" onclick="startEvaluation()">Start evaluation now</button>
        <button class="btn" onclick="startPracticeQuiz()">Practice first</button>
      </div>
      <div class="review-list" style="margin-top:18px;">
        <div class="review-item">
          <strong>Target:</strong> A2 → B1
        </div>
        <div class="review-item">
          <strong>Focus:</strong> daily use, work, travel, mechanic vocabulary
        </div>
      </div>
    </section>
  `;
}

function renderSessionEntry(kind) {
  if (kind === 'practice') {
    app.innerHTML = `
      <section class="card">
        <h2>Practice quiz</h2>
        <p class="muted">You will get immediate feedback after each answer, with the correct answer and a usage example.</p>
        <div class="group" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:14px;">
          <button class="btn" onclick="startPracticeQuiz()">Start practice quiz</button>
          <button class="btn" onclick="startDailySession()">Use today's session</button>
        </div>
      </section>
    `;
    return;
  }

  if (kind === 'listening') {
    app.innerHTML = `
      <section class="card">
        <h2>Listening practice</h2>
        <p class="muted">The app will speak Bulgarian, then you pick the meaning.</p>
        <div class="group" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:14px;">
          <button class="btn" onclick="startListening()">Start listening</button>
        </div>
      </section>
    `;
    return;
  }

  if (kind === 'speaking') {
    app.innerHTML = `
      <section class="card">
        <h2>Speaking practice</h2>
        <p class="muted">Say the Bulgarian word or phrase aloud. Chrome works best.</p>
        <div class="group" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:14px;">
          <button class="btn" onclick="startSpeaking()">Start speaking</button>
        </div>
      </section>
    `;
    return;
  }

  if (kind === 'reading') {
    app.innerHTML = `
      <section class="card">
        <h2>Reading practice</h2>
        <p class="muted">Read a short Bulgarian sentence and choose the meaning.</p>
        <div class="group" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:14px;">
          <button class="btn" onclick="startReading()">Start reading</button>
        </div>
      </section>
    `;
    return;
  }
}

function renderCurrentSession() {
  const s = state.session;
  if (!s) return;
  if (!s.current) {
    return renderSummaryScreen();
  }
  if (state.screen === 'evaluation') {
    // Evaluation still uses the same UI but with summary at the end.
    const item = s.current;
    const question = makeQuestion(item, 'practice');
    app.innerHTML = `
      <section class="card">
        <div class="toolbar">
          <div class="group">
            <h2 style="margin:0;">${esc(question.title)}</h2>
            <span class="chip">${s.index + 1} / ${s.items.length}</span>
            <span class="chip">Evaluation</span>
          </div>
          <div class="group">
            <button class="btn" onclick="skipItem()">Skip</button>
          </div>
        </div>

        <div class="question">${esc(question.prompt)}</div>
        <div class="prompt">${esc(question.helper)}</div>
        <button class="btn" onclick="speak('${escForJs(item.bg)}')">🔊 Play audio</button>

        <div class="answer-grid">
          ${question.options.map(opt => `<button class="btn answer-btn" onclick="submitAnswer('${escForJs(opt)}')">${esc(opt)}</button>`).join('')}
        </div>
        <p class="tiny">Your score will be shown at the end, with corrections for each missed item.</p>
      </section>
    `;
    return;
  }

  if (s.type === 'listening') {
    const item = s.current;
    const question = makeQuestion(item, 'listening');
    app.innerHTML = `
      <section class="card">
        <div class="toolbar">
          <div class="group">
            <h2 style="margin:0;">${esc(question.title)}</h2>
            <span class="chip">${s.index + 1} / ${s.items.length}</span>
          </div>
          <div class="group">
            <button class="btn" onclick="skipItem()">Skip</button>
          </div>
        </div>

        <div class="question">${esc(question.prompt)}</div>
        <div class="prompt">${esc(question.helper)}</div>
        <button class="btn" onclick="speak('${escForJs(item.bg)}')">🔊 Play audio</button>

        <div class="answer-grid">
          ${question.options.map(opt => `<button class="btn answer-btn" onclick="submitAnswer('${escForJs(opt)}')">${esc(opt)}</button>`).join('')}
        </div>

        ${s.revealed && s.lastFeedback ? `
          <div class="feedback ${s.lastFeedback.correct ? 'good' : 'bad'}">
            <strong>${s.lastFeedback.correct ? 'Correct' : 'Wrong'}</strong><br/>
            <div style="margin-top:8px;">${s.lastFeedback.explanation.lines.map(line => `<div>${esc(line)}</div>`).join('')}</div>
          </div>
          <div style="margin-top:12px;"><button class="btn" onclick="nextQuestion()">Next</button></div>
        ` : ''}
      </section>
    `;
    return;
  }

  if (s.type === 'speaking') {
    const item = s.current;
    const question = makeQuestion(item, 'speaking');
    app.innerHTML = `
      <section class="card">
        <div class="toolbar">
          <div class="group">
            <h2 style="margin:0;">${esc(question.title)}</h2>
            <span class="chip">${s.index + 1} / ${s.items.length}</span>
          </div>
          <div class="group">
            <button class="btn" onclick="skipItem()">Skip</button>
          </div>
        </div>

        <div class="question">${esc(question.prompt)}</div>
        <div class="prompt">${esc(question.helper)}</div>
        <div class="group" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:12px;">
          <button class="btn" onclick="startSpeechCheck()">🎤 Start speaking</button>
        </div>
        ${s.revealed && s.lastFeedback ? `
          <div class="feedback ${s.lastFeedback.correct ? 'good' : 'bad'}" style="margin-top:14px;">
            <strong>${s.lastFeedback.correct ? 'Correct' : 'Needs work'}</strong><br/>
            <div style="margin-top:8px;">${s.lastFeedback.explanation.lines.map(line => `<div>${esc(line)}</div>`).join('')}</div>
          </div>
          <div style="margin-top:12px;"><button class="btn" onclick="nextQuestion()">Next</button></div>
        ` : ''}
      </section>
    `;
    return;
  }

  if (s.type === 'reading') {
    const item = s.current;
    const question = makeQuestion(item, 'reading');
    app.innerHTML = `
      <section class="card">
        <div class="toolbar">
          <div class="group">
            <h2 style="margin:0;">${esc(question.title)}</h2>
            <span class="chip">${s.index + 1} / ${s.items.length}</span>
          </div>
          <div class="group">
            <button class="btn" onclick="skipItem()">Skip</button>
          </div>
        </div>

        <div class="question">${esc(question.prompt)}</div>
        <div class="prompt">${esc(question.helper)}</div>

        <div class="answer-grid">
          ${question.options.map(opt => `<button class="btn answer-btn" onclick="submitAnswer('${escForJs(opt)}')">${esc(opt)}</button>`).join('')}
        </div>

        ${s.revealed && s.lastFeedback ? `
          <div class="feedback ${s.lastFeedback.correct ? 'good' : 'bad'}">
            <strong>${s.lastFeedback.correct ? 'Correct' : 'Wrong'}</strong><br/>
            <div style="margin-top:8px;">${s.lastFeedback.explanation.lines.map(line => `<div>${esc(line)}</div>`).join('')}</div>
          </div>
          <div style="margin-top:12px;"><button class="btn" onclick="nextQuestion()">Next</button></div>
        ` : ''}
      </section>
    `;
    return;
  }

  const item = s.current;
  const question = makeQuestion(item, 'practice');
  app.innerHTML = `
    <section class="card">
      <div class="toolbar">
        <div class="group">
          <h2 style="margin:0;">${esc(question.title)}</h2>
          <span class="chip">${s.index + 1} / ${s.items.length}</span>
          <span class="chip">Practice</span>
        </div>
        <div class="group">
          <button class="btn" onclick="skipItem()">Skip</button>
        </div>
      </div>

      <div class="question">${esc(question.prompt)}</div>
      <div class="prompt">${esc(question.helper)}</div>
      <button class="btn" onclick="speak('${escForJs(item.bg)}')">🔊 Play audio</button>

      <div class="answer-grid">
        ${question.options.map(opt => `<button class="btn answer-btn" onclick="submitAnswer('${escForJs(opt)}')">${esc(opt)}</button>`).join('')}
      </div>

      ${s.revealed && s.lastFeedback ? `
        <div class="feedback ${s.lastFeedback.correct ? 'good' : 'bad'}">
          <strong>${s.lastFeedback.correct ? 'Correct' : 'Wrong'}</strong><br/>
          <div style="margin-top:8px;">${s.lastFeedback.explanation.lines.map(line => `<div>${esc(line)}</div>`).join('')}</div>
        </div>
        <div style="margin-top:12px;"><button class="btn" onclick="nextQuestion()">Next</button></div>
      ` : ''}
    </section>
  `;
}

function render() {
  if (!state.loaded) {
    app.innerHTML = `<section class="card"><h2>Loading...</h2><p class="muted">Preparing your Bulgarian trainer.</p></section>`;
    return;
  }

  if (state.session) {
    return renderCurrentSession();
  }

  switch (state.screen) {
    case 'dashboard':
      return renderDashboard();
    case 'words':
      return renderBrowser('words');
    case 'verbs':
      return renderBrowser('verbs');
    case 'daily':
      return renderSessionEntry('practice');
    case 'practice':
      return renderSessionEntry('practice');
    case 'listening':
      return renderSessionEntry('listening');
    case 'speaking':
      return renderSessionEntry('speaking');
    case 'reading':
      return renderSessionEntry('reading');
    case 'evaluation':
      return renderEvaluationIntro();
    case 'progress':
      return renderProgress();
    default:
      return renderDashboard();
  }
}

window.startDailySession = startDailySession;
window.startPracticeQuiz = startPracticeQuiz;
window.startEvaluation = startEvaluation;
window.startListening = startListening;
window.startSpeaking = startSpeaking;
window.startReading = startReading;
window.playItem = playItem;
window.submitAnswer = submitAnswer;
window.skipItem = skipItem;
window.nextQuestion = nextQuestion;
window.setScreen = setScreen;
window.clearSession = clearSession;
window.startSpeechCheck = startSpeechCheck;
window.speak = speak;

async function init() {
  try {
    const [words, verbs] = await Promise.all([
      fetch('data/words.json').then(r => r.json()),
      fetch('data/verbs.json').then(r => r.json())
    ]);

    const cleanWords = uniqueByExact(words)
      .filter(item => item && item.bg && item.en)
      .map((item, idx) => ({ ...item, type: 'word', id: item.id || `w${String(idx + 1).padStart(3, '0')}` }));

    const cleanVerbs = uniqueByExact(verbs)
      .filter(item => item && item.bg && item.en)
      .map((item, idx) => ({ ...item, type: 'verb', id: item.id || `v${String(idx + 1).padStart(3, '0')}` }));

    state.words = cleanWords;
    state.verbs = cleanVerbs;
    state.loaded = true;
    render();
  } catch (err) {
    state.loaded = false;
    app.innerHTML = `
      <section class="card">
        <h2>Could not load data</h2>
        <p class="muted">Check that you uploaded the <code>data/</code> folder and are running this on GitHub Pages or another web server.</p>
        <pre class="tiny">${esc(err?.message || String(err))}</pre>
      </section>
    `;
    console.error(err);
  }
}

init();
