/* ============================================================
   script.js – AI Tools & Emerging Technologies Quiz Platform
   Handles: index page (quiz grid) + quiz page (all question types)
   Question types: mcq | truefalse | fill | matching
   ============================================================ */

'use strict';

const PAGE   = document.body.classList.contains('quiz-layout') ? 'quiz' : 'index';
const params = new URLSearchParams(window.location.search);

/* ═══════════════════════════════════════════════════════════
   INDEX PAGE
═══════════════════════════════════════════════════════════ */

if (PAGE === 'index') {

  const QUIZ_COUNT = 5;

  const QUIZ_META = [
    { icon: '🖼️', desc: 'Digital Image Processing fundamentals, sensors, histograms & color models.' },
    { icon: '🔍', desc: 'Spatial filtering, edge detection, frequency domain & image restoration.' },
    { icon: '🤖', desc: 'Machine Learning basics, feature extraction & classical classifiers.' },
    { icon: '🧠', desc: 'Convolutional Neural Networks, deep learning architectures & training.' },
    { icon: '💬', desc: 'Natural Language Processing, transformers, LLMs & prompt engineering.' },
  ];

  async function loadQuizCards() {
    const grid = document.getElementById('quizGrid');
    if (!grid) return;

    const promises = Array.from({ length: QUIZ_COUNT }, (_, i) =>
      fetch(`data/quiz${i + 1}.json`)
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .catch(() => null)
    );

    const quizzes = await Promise.all(promises);

    const totalQuestions = quizzes.reduce((sum, q) => sum + (q?.questions?.length ?? 0), 0);
    const $totalDisplay = document.getElementById('totalQuestionsDisplay');
    if ($totalDisplay) $totalDisplay.textContent = totalQuestions;

    quizzes.forEach((quiz, i) => {
      if (!quiz) return;
      const meta   = QUIZ_META[i] || { icon: '📝', desc: '' };
      const qCount = quiz.questions?.length ?? 0;

      const card = document.createElement('div');
      card.className = 'week-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Start ${quiz.title}`);

      card.innerHTML = `
        <div class="card-top">
          <span class="week-number">${meta.icon} Quiz ${quiz.id}</span>
          <span class="question-count">${qCount} Qs</span>
        </div>
        <h3>${quiz.title}</h3>
        <p class="card-subtitle">${quiz.topic ?? meta.desc}</p>
        <div class="card-footer">
          <span class="type-tag mcq">MCQ · T/F · Fill</span>
          <span class="start-arrow">Start →</span>
        </div>
      `;

      const go = () => { window.location.href = `quiz.html?id=${quiz.id}`; };
      card.addEventListener('click', go);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(); });
      grid.appendChild(card);
    });
  }

  loadQuizCards();
}

/* ═══════════════════════════════════════════════════════════
   QUIZ PAGE
═══════════════════════════════════════════════════════════ */

if (PAGE === 'quiz') {

  let quizData      = null;
  let questions     = [];
  let current       = 0;
  let userAnswers   = [];
  let quizCompleted = false;
  let isReviewMode  = false;
  let isSubmitting  = false;

  const $quizTitle       = document.getElementById('quizTitle');
  const $quizSubtitle    = document.getElementById('quizSubtitle');
  const $scoreDisplay    = document.getElementById('scoreDisplay');
  const $answeredDisplay = document.getElementById('answeredDisplay');
  const $totalDisplay    = document.getElementById('totalDisplay');
  const $progressLabel   = document.getElementById('progressLabel');
  const $progressPct     = document.getElementById('progressPercent');
  const $progressFill    = document.getElementById('progressFill');
  const $qNumber         = document.getElementById('qNumber');
  const $qStatus         = document.getElementById('qStatus');
  const $questionText    = document.getElementById('questionText');
  const $optionsContainer  = document.getElementById('optionsContainer');
  const $explanationBox  = document.getElementById('explanationBox');
  const $expTitle        = document.getElementById('expTitle');
  const $expBody         = document.getElementById('expBody');
  const $prevBtn         = document.getElementById('prevBtn');
  const $nextBtn         = document.getElementById('nextBtn');
  const $navCounter      = document.getElementById('navCounter');
  const $submitBtn       = document.getElementById('submitBtn');
  const $resetBtn        = document.getElementById('resetBtn');
  const $resultsContainer  = document.getElementById('resultsContainer');
  const $finalScoreNum   = document.getElementById('finalScoreNum');
  const $finalScoreTotal = document.getElementById('finalScoreTotal');
  const $finalScorePct   = document.getElementById('finalScorePercent');
  const $finalCorrect    = document.getElementById('finalCorrect');
  const $finalWrong      = document.getElementById('finalWrong');
  const $finalUnanswered = document.getElementById('finalUnanswered');
  const $reviewBtn       = document.getElementById('reviewBtn');
  const $resultsResetBtn = document.getElementById('resultsResetBtn');
  const $quizContainer   = document.querySelector('.quiz-container');

  /* ════════════════════════════════════════
     CUSTOM DROPDOWN STYLES (injected once)
  ════════════════════════════════════════ */
  (function injectDropdownStyles() {
    if (document.getElementById('_customDropdownStyle')) return;
    const style = document.createElement('style');
    style.id = '_customDropdownStyle';
    style.textContent = `
      .cd-wrap { position: relative; width: 100%; user-select: none; }

      .cd-selected {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 14px;
        background: #1a2236;
        border: 1.5px solid rgba(255,255,255,0.1);
        border-radius: 14px;
        color: #94a3b8;
        font-size: .88rem; font-family: inherit;
        cursor: pointer;
        transition: border-color .2s, background .2s;
      }
      .cd-selected:hover { border-color: rgba(129,140,248,0.5); background: #1e2a40; }
      .cd-selected.open  { border-color: rgba(129,140,248,0.6); border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
      .cd-selected.has-value { color: #f1f5f9; }
      .cd-selected.correct-state { border-color: #22c55e; background: #162a1e; color: #4ade80; }
      .cd-selected.wrong-state   { border-color: #ef4444; background: #2a1616; color: #f87171; }
      .cd-selected.disabled-state { cursor: default; opacity: .85; }

      .cd-arrow { font-size: .7rem; transition: transform .2s; flex-shrink: 0; margin-left: 8px; }
      .cd-selected.open .cd-arrow { transform: rotate(180deg); }

      .cd-list {
        display: none;
        position: absolute; top: 100%; left: 0; right: 0; z-index: 500;
        background: #1a2236;
        border: 1.5px solid rgba(129,140,248,0.4);
        border-top: none;
        border-bottom-left-radius: 14px;
        border-bottom-right-radius: 14px;
        overflow: hidden;
        box-shadow: 0 12px 32px rgba(0,0,0,0.5);
        max-height: 240px;
        overflow-y: auto;
      }
      .cd-list.open { display: block; }

      .cd-option {
        padding: 10px 14px;
        color: #f1f5f9;
        font-size: .86rem;
        cursor: pointer;
        transition: background .15s;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        background: #1a2236;
      }
      .cd-option:last-child { border-bottom: none; }
      .cd-option:hover    { background: #273450; color: #fff; }
      .cd-option.selected { background: rgba(129,140,248,0.15); color: #818cf8; font-weight: 600; }
      .cd-option.placeholder { color: #64748b; font-style: italic; }

      .cd-list::-webkit-scrollbar { width: 4px; }
      .cd-list::-webkit-scrollbar-track { background: #1a2236; }
      .cd-list::-webkit-scrollbar-thumb { background: #334155; border-radius: 99px; }
    `;
    document.head.appendChild(style);
  })();

  /* ── Custom dropdown builder ── */
  function buildCustomDropdown(defs, savedValue, disabled, isCorrect) {
    const wrap = document.createElement('div');
    wrap.className = 'cd-wrap';

    const selected = document.createElement('div');
    selected.className = 'cd-selected' + (savedValue ? ' has-value' : '');
    if (disabled) selected.classList.add('disabled-state');
    if (disabled && isCorrect === true)  selected.classList.add('correct-state');
    if (disabled && isCorrect === false) selected.classList.add('wrong-state');

    const label = document.createElement('span');
    label.className = 'cd-label';
    label.textContent = savedValue || '— Select a definition —';

    const arrow = document.createElement('span');
    arrow.className = 'cd-arrow';
    arrow.textContent = '▼';

    selected.appendChild(label);
    selected.appendChild(arrow);

    const list = document.createElement('div');
    list.className = 'cd-list';

    const ph = document.createElement('div');
    ph.className = 'cd-option placeholder';
    ph.textContent = '— Select a definition —';
    ph.dataset.value = '';
    list.appendChild(ph);

    defs.forEach(def => {
      const opt = document.createElement('div');
      opt.className = 'cd-option' + (savedValue === def ? ' selected' : '');
      opt.textContent = def;
      opt.dataset.value = def;
      list.appendChild(opt);
    });

    wrap._value = savedValue || '';

    if (!disabled) {
      selected.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = list.classList.contains('open');
        document.querySelectorAll('.cd-list.open').forEach(l => {
          l.classList.remove('open');
          l.previousSibling?.classList?.remove('open');
        });
        if (!isOpen) {
          list.classList.add('open');
          selected.classList.add('open');
        }
      });

      list.addEventListener('click', e => {
        const opt = e.target.closest('.cd-option');
        if (!opt || opt.classList.contains('placeholder')) return;
        wrap._value = opt.dataset.value;
        label.textContent = opt.dataset.value;
        selected.classList.add('has-value');
        list.querySelectorAll('.cd-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        list.classList.remove('open');
        selected.classList.remove('open');
      });

      document.addEventListener('click', () => {
        list.classList.remove('open');
        selected.classList.remove('open');
      }, { capture: true });
    }

    wrap.appendChild(selected);
    wrap.appendChild(list);
    return wrap;
  }

  /* ════════════════════════════════════════
     INIT
  ════════════════════════════════════════ */

  async function init() {
    const id = params.get('id');
    if (!id) { window.location.href = 'index.html'; return; }

    try {
      const res = await fetch(`data/quiz${id}.json`);
      if (!res.ok) throw new Error('Not found');
      quizData = await res.json();
    } catch {
      alert('Quiz not found. Returning to home.');
      window.location.href = 'index.html';
      return;
    }

    questions   = [...(quizData.questions ?? [])];
    userAnswers = new Array(questions.length).fill(null);

    if ($quizTitle)    $quizTitle.textContent    = quizData.title ?? 'Quiz';
    if ($quizSubtitle) $quizSubtitle.textContent = `${questions.length} questions`;
    if ($totalDisplay) $totalDisplay.textContent = questions.length;

    $prevBtn?.addEventListener('click', () => goTo(current - 1));
    $nextBtn?.addEventListener('click', () => goTo(current + 1));
    $resetBtn?.addEventListener('click', resetQuiz);
    $reviewBtn?.addEventListener('click', startReview);
    $resultsResetBtn?.addEventListener('click', resetQuiz);
    resetSubmitBtn();

    buildJumpPanel();
    buildKbdHint();
    setupKeyboard();
    renderQuestion();
    updateHeroStats();
  }

  /* ════════════════════════════════════════
     HERO STATS
  ════════════════════════════════════════ */

  function countAnswered() { return userAnswers.filter(a => a !== null).length; }

  function countCorrect() {
    return userAnswers.reduce((acc, ans, i) => {
      if (ans === null) return acc;
      return acc + (checkAnswer(questions[i], ans) ? 1 : 0);
    }, 0);
  }

  function checkAnswer(q, ans) {
    if (q.type === 'mcq')       return ans === q.answer;
    if (q.type === 'truefalse') return ans === q.answer;
    if (q.type === 'fill')      return String(ans).toLowerCase().trim() === String(q.answer).toLowerCase().trim();
    if (q.type === 'matching')  return ans !== null && q.pairs.every(p => ans[p.term] === p.definition);
    return false;
  }

  function updateHeroStats() {
    if ($scoreDisplay)    $scoreDisplay.textContent    = countCorrect();
    if ($answeredDisplay) $answeredDisplay.textContent = countAnswered();
    if ($totalDisplay)    $totalDisplay.textContent    = questions.length;
  }

  /* ════════════════════════════════════════
     PROGRESS
  ════════════════════════════════════════ */

  function updateProgress() {
    const answered = countAnswered();
    const pct = questions.length > 0 ? Math.round((answered / questions.length) * 100) : 0;
    if ($progressFill)  $progressFill.style.width  = pct + '%';
    if ($progressPct)   $progressPct.textContent   = pct + '%';
    if ($progressLabel) $progressLabel.textContent = `Question ${current + 1} of ${questions.length}`;
    if ($navCounter)    $navCounter.textContent     = `${current + 1} / ${questions.length}`;
    if ($prevBtn) $prevBtn.disabled = current === 0;
    if ($nextBtn) $nextBtn.disabled = current === questions.length - 1;
  }

  /* ════════════════════════════════════════
     JUMP PANEL
  ════════════════════════════════════════ */

  function buildJumpPanel() {
    let panel = document.getElementById('jumpPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'jumpPanel';
      panel.className = 'jump-panel';
      $quizContainer?.before(panel);
    }
    renderJumpPanel(panel);
  }

  function renderJumpPanel(panel) {
    if (!panel) panel = document.getElementById('jumpPanel');
    if (!panel) return;
    panel.innerHTML = '';
    for (let i = 0; i < questions.length; i++) {
      const dot = document.createElement('button');
      dot.className   = 'jump-dot';
      dot.textContent = i + 1;
      dot.title       = `Question ${i + 1}`;
      const ans = userAnswers[i];
      const q   = questions[i];
      if (i === current) dot.classList.add('current');
      else if ((quizCompleted || isReviewMode) && ans !== null)
        dot.classList.add(checkAnswer(q, ans) ? 'correct' : 'wrong');
      else if (ans !== null) dot.classList.add('done');
      dot.addEventListener('click', () => goTo(i));
      panel.appendChild(dot);
    }
  }

  /* ════════════════════════════════════════
     KEYBOARD HINT
  ════════════════════════════════════════ */

  function buildKbdHint() {
    if (document.getElementById('kbdHint')) return;
    const hint = document.createElement('div');
    hint.id = 'kbdHint';
    hint.className = 'kbd-hint';
    hint.innerHTML = `
      <span class="kbd">←</span> Prev &nbsp;
      <span class="kbd">→</span> Next &nbsp;
      <span class="kbd">1</span><span class="kbd">2</span><span class="kbd">3</span><span class="kbd">4</span> Choose &nbsp;
      <span class="kbd">Enter</span> Submit
    `;
    $quizContainer?.after(hint);
  }

  /* ════════════════════════════════════════
     NAVIGATION
  ════════════════════════════════════════ */

  function goTo(index) {
    if (index < 0 || index >= questions.length) return;
    current = index;
    renderQuestion();
  }

  /* ════════════════════════════════════════
     RENDER QUESTION
  ════════════════════════════════════════ */

  function renderQuestion() {
    const q           = questions[current];
    const ans         = userAnswers[current];
    const isAnswered  = ans !== null;
    const isCorrect   = isAnswered && checkAnswer(q, ans);
    const isCompleted = quizCompleted || isReviewMode;

    if ($qNumber) $qNumber.textContent = `Q${q.id ?? current + 1}`;

    if ($qStatus) {
      if (isCompleted) {
        if (!isAnswered)    { $qStatus.textContent = '⚠️ Unanswered'; $qStatus.className = 'q-status'; }
        else if (isCorrect) { $qStatus.textContent = '✅ Correct';    $qStatus.className = 'q-status answered'; }
        else                { $qStatus.textContent = '❌ Incorrect';  $qStatus.className = 'q-status'; }
      } else {
        $qStatus.textContent = isAnswered ? '✅ Answered' : '⬜ Not answered';
        $qStatus.className   = isAnswered ? 'q-status answered' : 'q-status';
      }
    }

    if ($questionText) $questionText.textContent = q.text;

    if ($optionsContainer) {
      $optionsContainer.innerHTML = '';
      switch (q.type) {
        case 'mcq':       renderMCQ(q, ans, isCompleted);       break;
        case 'truefalse': renderTrueFalse(q, ans, isCompleted); break;
        case 'fill':      renderFill(q, ans, isCompleted);      break;
        case 'matching':  renderMatching(q, ans, isCompleted);  break;
        default:
          $optionsContainer.innerHTML = '<p style="color:var(--text-muted)">Unknown question type.</p>';
      }
    }

    renderExplanation(q, ans, isAnswered, isCorrect, isCompleted);
    updateProgress();
    updateHeroStats();
    renderJumpPanel();
    $quizContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ════════════════════════════════════════
     MCQ
  ════════════════════════════════════════ */

  function renderMCQ(q, savedAns, isCompleted) {
    const letters = ['A', 'B', 'C', 'D'];
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      const isSelected = savedAns === opt;

      const letter = document.createElement('span');
      letter.className = 'letter';
      letter.textContent = letters[i];
      btn.appendChild(letter);

      const text = document.createElement('span');
      text.textContent = opt;
      btn.appendChild(text);

      if (isSelected) btn.classList.add('selected');

      if (isCompleted) {
        btn.classList.add('disabled'); btn.disabled = true;
        if (opt === q.answer) {
          btn.classList.add('correct'); btn.classList.remove('selected');
          appendMark(btn, '✓', 'correct');
        } else if (isSelected) {
          btn.classList.add('wrong'); btn.classList.remove('selected');
          appendMark(btn, '✗', 'wrong');
        }
      } else {
        if (isSelected) appendMark(btn, '✓', 'correct');
        btn.addEventListener('click', () => { userAnswers[current] = opt; renderQuestion(); });
      }
      $optionsContainer.appendChild(btn);
    });
  }

  /* ════════════════════════════════════════
     TRUE / FALSE
  ════════════════════════════════════════ */

  function renderTrueFalse(q, savedAns, isCompleted) {
    [true, false].forEach(val => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      const isSelected = savedAns === val;

      const letter = document.createElement('span');
      letter.className = 'letter';
      letter.textContent = val ? 'T' : 'F';
      btn.appendChild(letter);

      const text = document.createElement('span');
      text.textContent = val ? '✓ True' : '✗ False';
      btn.appendChild(text);

      if (isSelected) btn.classList.add('selected');

      if (isCompleted) {
        btn.classList.add('disabled'); btn.disabled = true;
        if (val === q.answer) {
          btn.classList.add('correct'); btn.classList.remove('selected');
          appendMark(btn, '✓', 'correct');
        } else if (isSelected) {
          btn.classList.add('wrong'); btn.classList.remove('selected');
          appendMark(btn, '✗', 'wrong');
        }
      } else {
        if (isSelected) appendMark(btn, '✓', 'correct');
        btn.addEventListener('click', () => { userAnswers[current] = val; renderQuestion(); });
      }
      $optionsContainer.appendChild(btn);
    });
  }

  /* ════════════════════════════════════════
     FILL IN THE BLANK
  ════════════════════════════════════════ */

  function renderFill(q, savedAns, isCompleted) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap;';

    const input = document.createElement('input');
    input.type = 'text'; input.className = 'fill-input';
    input.placeholder = 'Type your answer…';
    input.style.flex = '1'; input.autocomplete = 'off';
    if (savedAns !== null) input.value = savedAns;

    if (isCompleted) {
      input.readOnly = true;
      const isCorrect = checkAnswer(q, savedAns);
      input.classList.add(isCorrect ? 'correct' : 'wrong');
      if (!isCorrect && savedAns !== null) {
        const hint = document.createElement('p');
        hint.style.cssText = 'margin-top:8px;font-size:.85rem;color:var(--text-muted);width:100%;';
        hint.textContent = `Correct answer: ${q.answer}`;
        wrap.appendChild(input); wrap.appendChild(hint);
        $optionsContainer.appendChild(wrap); return;
      }
    } else {
      const checkBtn = document.createElement('button');
      checkBtn.className = 'nav-btn primary';
      checkBtn.textContent = 'Save Answer';
      checkBtn.style.whiteSpace = 'nowrap';
      const save = () => {
        const val = input.value.trim();
        if (!val) return;
        userAnswers[current] = val; renderQuestion();
      };
      checkBtn.addEventListener('click', save);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
      wrap.appendChild(input); wrap.appendChild(checkBtn);
      $optionsContainer.appendChild(wrap); return;
    }

    wrap.appendChild(input);
    $optionsContainer.appendChild(wrap);
  }

  /* ════════════════════════════════════════
     MATCHING  –  custom dropdown (no <select>)
  ════════════════════════════════════════ */

  function renderMatching(q, savedAns, isCompleted) {
    const defs = shuffle(q.pairs.map(p => p.definition));

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; gap:16px;';

    const dropdowns = [];

    q.pairs.forEach(pair => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid; grid-template-columns:120px 1fr 32px; align-items:center; gap:10px;';

      const termLabel = document.createElement('div');
      termLabel.style.cssText = `
        padding:10px 14px;
        background:rgba(129,140,248,0.1);
        border:1.5px solid rgba(129,140,248,0.3);
        border-radius:14px;
        font-size:.85rem; font-weight:700;
        color:#818cf8; text-align:center;
      `;
      termLabel.textContent = pair.term;

      const savedVal = savedAns ? (savedAns[pair.term] || '') : '';
      const isRowOk  = isCompleted ? (savedVal === pair.definition) : null;

      const dd = buildCustomDropdown(defs, savedVal, isCompleted, isRowOk);
      dropdowns.push({ pair, dd });

      if (isCompleted) {
        termLabel.style.borderColor = isRowOk ? '#22c55e' : '#ef4444';
        termLabel.style.color       = isRowOk ? '#4ade80' : '#f87171';
      }

      const icon = document.createElement('span');
      icon.style.cssText = 'font-size:1.2rem; text-align:center;';
      if (isCompleted) icon.textContent = isRowOk ? '✅' : '❌';

      row.appendChild(termLabel);
      row.appendChild(dd);
      row.appendChild(icon);
      wrap.appendChild(row);
    });

    /* ── Correct answers hint (always show when completed, even if all correct) ── */
    if (isCompleted) {
      const hint = document.createElement('div');
      hint.style.cssText = `
        margin-top: 8px;
        padding: 12px 16px;
        background: rgba(129,140,248,0.06);
        border: 1px solid rgba(129,140,248,0.2);
        border-radius: 12px;
        font-size: .83rem;
        line-height: 2;
      `;
      hint.innerHTML = '<strong style="color:#f1f5f9; display:block; margin-bottom:4px;">✅ Correct matches:</strong>' +
        q.pairs.map(p =>
          `<span style="color:#818cf8;font-weight:700;">${p.term}</span>` +
          ` <span style="color:#64748b;">→</span> ` +
          `<span style="color:#94a3b8;">${p.definition}</span>`
        ).join('<br>');
      wrap.appendChild(hint);
    }

    /* Save button */
    if (!isCompleted) {
      const checkBtn = document.createElement('button');
      checkBtn.className   = 'nav-btn primary';
      checkBtn.textContent = 'Save Answers';
      checkBtn.style.cssText = 'align-self:flex-start; margin-top:4px;';

      checkBtn.addEventListener('click', () => {
        const allSelected = dropdowns.every(({ dd }) => dd._value !== '');
        if (!allSelected) { showToast('Please select a definition for every term.'); return; }
        const userAnswer = {};
        dropdowns.forEach(({ pair, dd }) => { userAnswer[pair.term] = dd._value; });
        userAnswers[current] = userAnswer;
        renderQuestion();
      });

      wrap.appendChild(checkBtn);
    }

    $optionsContainer.appendChild(wrap);
  }

  /* Fisher-Yates shuffle */
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ════════════════════════════════════════
     EXPLANATION
  ════════════════════════════════════════ */

  function renderExplanation(q, ans, isAnswered, isCorrect, isCompleted) {
    if (!$explanationBox || !$expTitle || !$expBody) return;
    if (!isCompleted) { $explanationBox.className = 'explanation-box'; return; }
    $explanationBox.className = 'explanation-box visible';

    if (!isAnswered) {
      $expTitle.className = 'exp-title unanswered';
      $expTitle.innerHTML = '⚠️ No answer selected';
      $expBody.innerHTML  = `<p><strong>Correct answer:</strong> ${formatAnswer(q, q.answer)}</p>
        <p><strong>Explanation:</strong> ${q.feedback ?? 'No explanation provided.'}</p>`;
    } else if (isCorrect) {
      $expTitle.className = 'exp-title correct';
      $expTitle.innerHTML = '✅ Correct!';
      $expBody.innerHTML  = `<p><strong>Explanation:</strong> ${q.feedback ?? 'Great job!'}</p>`;
    } else {
      $expTitle.className = 'exp-title wrong';
      $expTitle.innerHTML = '❌ Incorrect';
      $expBody.innerHTML  = `<p><strong>Your answer:</strong> ${formatAnswer(q, ans)}</p>
        <p><strong>Correct answer:</strong> ${formatAnswer(q, q.answer)}</p>
        <p><strong>Explanation:</strong> ${q.feedback ?? 'Review the material.'}</p>`;
    }
  }

  /* ── formatAnswer: handles all types including matching ── */
  function formatAnswer(q, val) {
    if (val === null || val === undefined) return '—';
    if (q.type === 'truefalse') return val === true ? 'True' : 'False';
    if (q.type === 'matching') {
      if (typeof val === 'object') {
        return Object.entries(val)
          .map(([term, def]) => `<span style="color:#818cf8;font-weight:700;">${term}</span> → ${def}`)
          .join('<br>');
      }
      /* fallback: show correct pairs from q.pairs */
      return q.pairs
        .map(p => `<span style="color:#818cf8;font-weight:700;">${p.term}</span> → ${p.definition}`)
        .join('<br>');
    }
    return String(val);
  }

  /* ════════════════════════════════════════
     HELPERS
  ════════════════════════════════════════ */

  function appendMark(btn, symbol, cls) {
    const mark = document.createElement('span');
    mark.className = `check-mark ${cls}`;
    mark.textContent = symbol;
    btn.appendChild(mark);
  }

  function showToast(msg) {
    const existing = document.getElementById('_toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = '_toast';
    toast.textContent = msg;
    toast.style.cssText = `
      position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
      background:rgba(129,140,248,0.15); color:#f1f5f9;
      border:1px solid rgba(129,140,248,0.3);
      padding:10px 20px; border-radius:999px;
      font-size:.88rem; z-index:9999;
      backdrop-filter:blur(12px);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  /* ════════════════════════════════════════
     RESULTS
  ════════════════════════════════════════ */

  function showResults() {
    if (isSubmitting) return;
    isSubmitting = true;

    let correct = 0, wrong = 0, unanswered = 0;
    for (let i = 0; i < questions.length; i++) {
      const ans = userAnswers[i];
      if (ans === null)                        unanswered++;
      else if (checkAnswer(questions[i], ans)) correct++;
      else                                     wrong++;
    }

    quizCompleted = true;
    const pct = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;

    if ($finalScoreNum)   $finalScoreNum.textContent   = correct;
    if ($finalScoreTotal) $finalScoreTotal.textContent = questions.length;
    if ($finalScorePct)   $finalScorePct.textContent   = pct + '%';
    if ($finalCorrect)    $finalCorrect.textContent    = correct;
    if ($finalWrong)      $finalWrong.textContent      = wrong;
    if ($finalUnanswered) $finalUnanswered.textContent = unanswered;

    if ($quizContainer) $quizContainer.style.display = 'none';
    if ($resultsContainer) {
      $resultsContainer.className = 'results-container visible';
      $resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const panel = document.getElementById('jumpPanel');
    const hint  = document.getElementById('kbdHint');
    if (panel) panel.style.display = 'none';
    if (hint)  hint.style.display  = 'none';

    updateHeroStats();
    isSubmitting = false;
  }

  /* ════════════════════════════════════════
     REVIEW
  ════════════════════════════════════════ */

  function startReview() {
    isReviewMode = true; quizCompleted = true;
    if ($resultsContainer) $resultsContainer.className = 'results-container';
    if ($quizContainer) $quizContainer.style.display = '';
    const panel = document.getElementById('jumpPanel');
    const hint  = document.getElementById('kbdHint');
    if (panel) panel.style.display = 'flex';
    if (hint)  hint.style.display  = 'flex';
    current = 0;
    renderQuestion();
    setSubmitToBackToResults();
  }

  function setSubmitToBackToResults() {
    if (!$submitBtn) return;
    $submitBtn.innerHTML = '← Back to Results';
    $submitBtn.className = 'nav-btn primary';
    $submitBtn.onclick   = () => {
      if ($quizContainer) $quizContainer.style.display = 'none';
      if ($resultsContainer) $resultsContainer.className = 'results-container visible';
      const panel = document.getElementById('jumpPanel');
      const hint  = document.getElementById('kbdHint');
      if (panel) panel.style.display = 'none';
      if (hint)  hint.style.display  = 'none';
    };
  }

  function resetSubmitBtn() {
    if (!$submitBtn) return;
    $submitBtn.innerHTML = '✅ Get Final Score & Feedback';
    $submitBtn.className = 'nav-btn success';
    $submitBtn.onclick   = showResults;
  }

  /* ════════════════════════════════════════
     RESET
  ════════════════════════════════════════ */

  function resetQuiz() {
    userAnswers = new Array(questions.length).fill(null);
    quizCompleted = false; isReviewMode = false; current = 0;
    if ($resultsContainer) $resultsContainer.className = 'results-container';
    if ($quizContainer) $quizContainer.style.display = '';
    const panel = document.getElementById('jumpPanel');
    const hint  = document.getElementById('kbdHint');
    if (panel) panel.style.display = 'flex';
    if (hint)  hint.style.display  = 'flex';
    resetSubmitBtn();
    renderQuestion();
    updateHeroStats();
  }

  /* ════════════════════════════════════════
     KEYBOARD SHORTCUTS
  ════════════════════════════════════════ */

  function setupKeyboard() {
    document.addEventListener('keydown', e => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if (e.target.closest('.cd-wrap')) return;
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); goTo(current - 1); break;
        case 'ArrowRight': e.preventDefault(); goTo(current + 1); break;
        case '1': case '2': case '3': case '4': {
          if (quizCompleted || isReviewMode) break;
          const q = questions[current];
          if (q.type === 'mcq') {
            const idx = parseInt(e.key) - 1;
            if (idx < q.options.length) {
              e.preventDefault();
              userAnswers[current] = q.options[idx];
              renderQuestion();
            }
          }
          break;
        }
        case 'Enter':
          if (!quizCompleted && !isReviewMode) { e.preventDefault(); showResults(); }
          break;
      }
    });
  }

  init();
}
