/* ============================================================
   script.js – AI Tools & Emerging Technologies Quiz Platform
   Handles: index page (quiz grid) + quiz page (all question types)
   Question types: mcq | truefalse | fill
   Behaviour: no timer, manual nav, Get Final Score at end
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

  /* ── State ── */
  let quizData       = null;
  let questions      = [];
  let current        = 0;
  let userAnswers    = [];   // null = unanswered, otherwise the stored answer
  let quizCompleted  = false;
  let isReviewMode   = false;
  let isSubmitting   = false;

  /* ── DOM refs ── */
  const $quizTitle      = document.getElementById('quizTitle');
  const $quizSubtitle   = document.getElementById('quizSubtitle');
  const $scoreDisplay   = document.getElementById('scoreDisplay');
  const $answeredDisplay= document.getElementById('answeredDisplay');
  const $totalDisplay   = document.getElementById('totalDisplay');
  const $progressLabel  = document.getElementById('progressLabel');
  const $progressPct    = document.getElementById('progressPercent');
  const $progressFill   = document.getElementById('progressFill');
  const $qNumber        = document.getElementById('qNumber');
  const $qStatus        = document.getElementById('qStatus');
  const $questionText   = document.getElementById('questionText');
  const $optionsContainer = document.getElementById('optionsContainer');
  const $explanationBox = document.getElementById('explanationBox');
  const $expTitle       = document.getElementById('expTitle');
  const $expBody        = document.getElementById('expBody');
  const $prevBtn        = document.getElementById('prevBtn');
  const $nextBtn        = document.getElementById('nextBtn');
  const $navCounter     = document.getElementById('navCounter');
  const $submitBtn      = document.getElementById('submitBtn');
  const $resetBtn       = document.getElementById('resetBtn');
  const $resultsContainer = document.getElementById('resultsContainer');
  const $finalScoreNum  = document.getElementById('finalScoreNum');
  const $finalScoreTotal= document.getElementById('finalScoreTotal');
  const $finalScorePct  = document.getElementById('finalScorePercent');
  const $finalCorrect   = document.getElementById('finalCorrect');
  const $finalWrong     = document.getElementById('finalWrong');
  const $finalUnanswered= document.getElementById('finalUnanswered');
  const $reviewBtn      = document.getElementById('reviewBtn');
  const $resultsResetBtn= document.getElementById('resultsResetBtn');
  const $quizContainer  = document.querySelector('.quiz-container');

  /* ── Type labels ── */
  const TYPE_LABELS = {
    mcq:       'Multiple Choice',
    truefalse: 'True / False',
    fill:      'Fill in the Blank',
  };

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

    /* Header */
    if ($quizTitle)    $quizTitle.textContent    = quizData.title ?? 'Quiz';
    if ($quizSubtitle) $quizSubtitle.textContent = `${questions.length} questions`;
    if ($totalDisplay) $totalDisplay.textContent = questions.length;

    /* Wire buttons */
    $prevBtn?.addEventListener('click', () => goTo(current - 1));
    $nextBtn?.addEventListener('click', () => goTo(current + 1));
    $resetBtn?.addEventListener('click', resetQuiz);
    $reviewBtn?.addEventListener('click', startReview);
    $resultsResetBtn?.addEventListener('click', resetQuiz);
    resetSubmitBtn();

    /* Build jump panel */
    buildJumpPanel();
    buildKbdHint();
    setupKeyboard();

    renderQuestion();
    updateHeroStats();
  }

  /* ════════════════════════════════════════
     HERO STATS
  ════════════════════════════════════════ */

  function countAnswered() {
    return userAnswers.filter(a => a !== null).length;
  }

  function countCorrect() {
    return userAnswers.reduce((acc, ans, i) => {
      if (ans === null) return acc;
      const q = questions[i];
      return acc + (checkAnswer(q, ans) ? 1 : 0);
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
    const answered = countAnswered();
    const correct  = countCorrect();
    if ($scoreDisplay)    $scoreDisplay.textContent    = correct;
    if ($answeredDisplay) $answeredDisplay.textContent = answered;
    if ($totalDisplay)    $totalDisplay.textContent    = questions.length;
  }

  /* ════════════════════════════════════════
     PROGRESS
  ════════════════════════════════════════ */

  function updateProgress() {
    const answered = countAnswered();
    const pct = questions.length > 0
      ? Math.round((answered / questions.length) * 100) : 0;
    if ($progressFill)  $progressFill.style.width = pct + '%';
    if ($progressPct)   $progressPct.textContent  = pct + '%';
    if ($progressLabel) $progressLabel.textContent = `Question ${current + 1} of ${questions.length}`;
    if ($navCounter)    $navCounter.textContent    = `${current + 1} / ${questions.length}`;
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
      if (i === current) {
        dot.classList.add('current');
      } else if ((quizCompleted || isReviewMode) && ans !== null) {
        dot.classList.add(checkAnswer(q, ans) ? 'correct' : 'wrong');
      } else if (ans !== null) {
        dot.classList.add('done');
      }

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
    const q       = questions[current];
    const ans     = userAnswers[current];
    const isAnswered = ans !== null;
    const isCorrect  = isAnswered && checkAnswer(q, ans);
    const isCompleted = quizCompleted || isReviewMode;

    /* Q number tag */
    if ($qNumber) $qNumber.textContent = `Q${q.id ?? current + 1}`;

    /* Status badge */
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

    /* Question text */
    if ($questionText) $questionText.textContent = q.text;

    /* Answer area */
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

    /* Explanation (only after quiz completed) */
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

      /* Letter badge */
      const letter = document.createElement('span');
      letter.className   = 'letter';
      letter.textContent = letters[i];
      btn.appendChild(letter);

      /* Text */
      const text = document.createElement('span');
      text.textContent = opt;
      btn.appendChild(text);

      if (isSelected) btn.classList.add('selected');

      if (isCompleted) {
        btn.classList.add('disabled');
        btn.disabled = true;
        if (opt === q.answer) {
          btn.classList.add('correct');
          btn.classList.remove('selected');
          appendMark(btn, '✓', 'correct');
        } else if (isSelected) {
          btn.classList.add('wrong');
          btn.classList.remove('selected');
          appendMark(btn, '✗', 'wrong');
        }
      } else {
        if (isSelected) appendMark(btn, '✓', 'correct');
        btn.addEventListener('click', () => {
          userAnswers[current] = opt;
          renderQuestion();
        });
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
      letter.className   = 'letter';
      letter.textContent = val ? 'T' : 'F';
      btn.appendChild(letter);

      const text = document.createElement('span');
      text.textContent = val ? '✓ True' : '✗ False';
      btn.appendChild(text);

      if (isSelected) btn.classList.add('selected');

      if (isCompleted) {
        btn.classList.add('disabled');
        btn.disabled = true;
        if (val === q.answer) {
          btn.classList.add('correct');
          btn.classList.remove('selected');
          appendMark(btn, '✓', 'correct');
        } else if (isSelected) {
          btn.classList.add('wrong');
          btn.classList.remove('selected');
          appendMark(btn, '✗', 'wrong');
        }
      } else {
        if (isSelected) appendMark(btn, '✓', 'correct');
        btn.addEventListener('click', () => {
          userAnswers[current] = val;
          renderQuestion();
        });
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
    input.type        = 'text';
    input.className   = 'fill-input';
    input.placeholder = 'Type your answer…';
    input.style.flex  = '1';
    input.autocomplete = 'off';

    if (savedAns !== null) {
      input.value = savedAns;
    }

    if (isCompleted) {
      input.readOnly = true;
      const isCorrect = checkAnswer(q, savedAns);
      input.classList.add(isCorrect ? 'correct' : 'wrong');
      if (!isCorrect && savedAns !== null) {
        const hint = document.createElement('p');
        hint.style.cssText = 'margin-top:8px;font-size:.85rem;color:var(--text-muted);width:100%;';
        hint.textContent   = `Correct answer: ${q.answer}`;
        wrap.appendChild(input);
        wrap.appendChild(hint);
        $optionsContainer.appendChild(wrap);
        return;
      }
    } else {
      const checkBtn = document.createElement('button');
      checkBtn.className   = 'nav-btn primary';
      checkBtn.textContent = 'Save Answer';
      checkBtn.style.whiteSpace = 'nowrap';

      const save = () => {
        const val = input.value.trim();
        if (!val) return;
        userAnswers[current] = val;
        renderQuestion();
      };

      checkBtn.addEventListener('click', save);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
      wrap.appendChild(input);
      wrap.appendChild(checkBtn);
      $optionsContainer.appendChild(wrap);
      return;
    }

    wrap.appendChild(input);
    $optionsContainer.appendChild(wrap);
  }

  /* ════════════════════════════════════════
     MATCHING  –  dropdown style
  ════════════════════════════════════════ */

  function renderMatching(q, savedAns, isCompleted) {
    const defs = shuffle(q.pairs.map(p => p.definition));

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; gap:12px;';

    const rows = q.pairs.map(pair => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; gap:12px;';

      /* Term label */
      const label = document.createElement('div');
      label.className = 'option-btn disabled';
      label.style.cssText = 'min-width:100px; flex-shrink:0; cursor:default; font-weight:700;';
      label.textContent = pair.term;

      /* Dropdown */
      const select = document.createElement('select');
      select.className = 'fill-input';
      select.style.cssText = 'flex:1; cursor:pointer;';
      select.dataset.term  = pair.term;

      const placeholder = document.createElement('option');
      placeholder.value       = '';
      placeholder.textContent = '— Select a definition —';
      placeholder.disabled    = true;
      placeholder.selected    = true;
      select.appendChild(placeholder);

      defs.forEach(def => {
        const opt = document.createElement('option');
        opt.value = def; opt.textContent = def;
        select.appendChild(opt);
      });

      /* Restore saved value */
      if (savedAns && savedAns[pair.term] != null) {
        select.value = savedAns[pair.term];
      }

      /* Status icon */
      const icon = document.createElement('span');
      icon.style.cssText = 'font-size:1.2rem; min-width:24px; text-align:center;';

      if (isCompleted) {
        select.disabled = true;
        const chosen  = savedAns ? savedAns[pair.term] : null;
        const isRowOk = chosen === pair.definition;
        select.classList.add(isRowOk ? 'correct' : 'wrong');
        icon.textContent = isRowOk ? '✅' : '❌';
        if (!isRowOk) label.classList.add('wrong');
      }

      row.appendChild(label);
      row.appendChild(select);
      row.appendChild(icon);
      wrap.appendChild(row);

      return { pair, select, icon, label };
    });

    /* Show correct answers if wrong after completion */
    if (isCompleted && savedAns) {
      const allOk = q.pairs.every(p => savedAns[p.term] === p.definition);
      if (!allOk) {
        const hint = document.createElement('div');
        hint.style.cssText = 'margin-top:10px; font-size:.82rem; color:var(--text-muted); line-height:1.8;';
        hint.innerHTML = '<strong style="color:var(--text-primary)">Correct answers:</strong><br>' +
          q.pairs.map(p => `<span style="color:var(--accent)">${p.term}</span> → ${p.definition}`).join('<br>');
        wrap.appendChild(hint);
      }
    }

    /* Check button (only before completion) */
    if (!isCompleted) {
      const checkBtn = document.createElement('button');
      checkBtn.className   = 'nav-btn primary';
      checkBtn.textContent = 'Save Answers';
      checkBtn.style.cssText = 'align-self:flex-start; margin-top:8px;';

      checkBtn.addEventListener('click', () => {
        const allSelected = rows.every(r => r.select.value !== '');
        if (!allSelected) { showToast('Please select a definition for every term.'); return; }

        const userAnswer = {};
        rows.forEach(({ pair, select }) => { userAnswer[pair.term] = select.value; });

        const allCorrect = q.pairs.every(p => userAnswer[p.term] === p.definition);
        userAnswers[current] = userAnswer;

        renderQuestion(); // re-render to show saved state
      });

      wrap.appendChild(checkBtn);
    }

    $optionsContainer.appendChild(wrap);
  }

  /** Fisher-Yates shuffle */
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ════════════════════════════════════════
     EXPLANATION (shown only after submit)
  ════════════════════════════════════════ */

  function renderExplanation(q, ans, isAnswered, isCorrect, isCompleted) {
    if (!$explanationBox || !$expTitle || !$expBody) return;

    if (!isCompleted) {
      $explanationBox.className = 'explanation-box';
      return;
    }

    $explanationBox.className = 'explanation-box visible';

    if (!isAnswered) {
      $expTitle.className = 'exp-title unanswered';
      $expTitle.innerHTML = '⚠️ No answer selected';
      $expBody.innerHTML  = `
        <p><strong>Correct answer:</strong> ${formatAnswer(q, q.answer)}</p>
        <p><strong>Explanation:</strong> ${q.feedback ?? 'No explanation provided.'}</p>
      `;
    } else if (isCorrect) {
      $expTitle.className = 'exp-title correct';
      $expTitle.innerHTML = '✅ Correct!';
      $expBody.innerHTML  = `
        <p><strong>Your answer:</strong> ${formatAnswer(q, ans)}</p>
        <p><strong>Explanation:</strong> ${q.feedback ?? 'Great job!'}</p>
      `;
    } else {
      $expTitle.className = 'exp-title wrong';
      $expTitle.innerHTML = '❌ Incorrect';
      $expBody.innerHTML  = `
        <p><strong>Your answer:</strong> ${formatAnswer(q, ans)}</p>
        <p><strong>Correct answer:</strong> ${formatAnswer(q, q.answer)}</p>
        <p><strong>Explanation:</strong> ${q.feedback ?? 'Review the material.'}</p>
      `;
    }
  }

  function formatAnswer(q, val) {
    if (q.type === 'truefalse') return val === true ? 'True' : 'False';
    return val ?? '—';
  }

  /* ════════════════════════════════════════
     HELPERS
  ════════════════════════════════════════ */

  function appendMark(btn, symbol, cls) {
    const mark = document.createElement('span');
    mark.className   = `check-mark ${cls}`;
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
      font-size:.88rem; z-index:999;
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
      if (ans === null)                            unanswered++;
      else if (checkAnswer(questions[i], ans))     correct++;
      else                                         wrong++;
    }

    quizCompleted = true;
    const pct = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;

    if ($finalScoreNum)  $finalScoreNum.textContent  = correct;
    if ($finalScoreTotal) $finalScoreTotal.textContent = questions.length;
    if ($finalScorePct)  $finalScorePct.textContent  = pct + '%';
    if ($finalCorrect)   $finalCorrect.textContent   = correct;
    if ($finalWrong)     $finalWrong.textContent     = wrong;
    if ($finalUnanswered) $finalUnanswered.textContent = unanswered;

    /* Hide quiz, show results */
    if ($quizContainer) $quizContainer.style.display = 'none';
    if ($resultsContainer) {
      $resultsContainer.className = 'results-container visible';
      $resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /* Hide jump panel & kbd hint */
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
    isReviewMode  = true;
    quizCompleted = true;

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
    userAnswers   = new Array(questions.length).fill(null);
    quizCompleted = false;
    isReviewMode  = false;
    current       = 0;

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
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goTo(current - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          goTo(current + 1);
          break;
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
          if (!quizCompleted && !isReviewMode) {
            e.preventDefault();
            showResults();
          }
          break;
      }
    });
  }

  /* ── Kick off ── */
  init();
}
