/* ============================================================
   script.js – AI Tools & Emerging Technologies Quiz Platform
   Handles: index page (quiz grid) + quiz page (all question types)
   Question types: mcq | truefalse | fill | matching
   ============================================================ */

'use strict';

/* ─────────────────────────────────────────
   SHARED UTILITIES
───────────────────────────────────────── */

/** Detect which page we're on */
const PAGE = document.body.classList.contains('quiz-layout') ? 'quiz' : 'index';

/** Parse URL search params */
const params = new URLSearchParams(window.location.search);

/* ─────────────────────────────────────────
   INDEX PAGE – Quiz Grid
───────────────────────────────────────── */

if (PAGE === 'index') {

  const QUIZ_COUNT = 5;

  /** Icon & description per quiz slot (purely presentational) */
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
      if (!quiz) return;                       // skip missing files
      const meta = QUIZ_META[i] || { icon: '📝', desc: '' };
      const qCount = quiz.questions?.length ?? 0;
      const mins   = quiz.duration ?? 30;

      const card = document.createElement('div');
      card.className = 'quiz-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Start ${quiz.title}`);

      card.innerHTML = `
        <div class="quiz-card-badge">${meta.icon} Quiz ${quiz.id}</div>
        <h3>${quiz.title}</h3>
        <p>${quiz.topic ?? meta.desc}</p>
        <div class="quiz-card-meta">
          <span>📋 ${qCount} Questions</span>
          <span>⏱️ ${mins} min</span>
        </div>
        <div class="quiz-card-arrow">→</div>
      `;

      const go = () => { window.location.href = `quiz.html?id=${quiz.id}`; };
      card.addEventListener('click', go);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(); });

      grid.appendChild(card);
    });
  }

  loadQuizCards();
}

/* ─────────────────────────────────────────
   QUIZ PAGE
───────────────────────────────────────── */

if (PAGE === 'quiz') {

  /* ── State ── */
  let quizData      = null;   // full JSON
  let questions     = [];     // shuffled subset or all
  let current       = 0;      // current question index
  let answers       = [];     // { answered: bool, correct: bool, userAnswer: any }
  let timerInterval = null;
  let secondsLeft   = 0;
  let secondsUsed   = 0;
  let quizStarted   = false;

  /* ── DOM refs ── */
  const $progressBar    = document.getElementById('progressBar');
  const $quizTitle      = document.getElementById('quizTitle');
  const $quizTopic      = document.getElementById('quizTopic');
  const $questionCounter= document.getElementById('questionCounter');
  const $timer          = document.getElementById('timer');
  const $qNumber        = document.getElementById('qNumber');
  const $qTypeTag       = document.getElementById('qTypeTag');
  const $qText          = document.getElementById('qText');
  const $answerArea     = document.getElementById('answerArea');
  const $feedbackBox    = document.getElementById('feedbackBox');
  const $questionDots   = document.getElementById('questionDots');
  const $btnPrev        = document.getElementById('btnPrev');
  const $btnNext        = document.getElementById('btnNext');
  const $resultsOverlay = document.getElementById('resultsOverlay');
  const $btnRetry       = document.getElementById('btnRetry');

  /* ── Type label map ── */
  const TYPE_LABELS = {
    mcq:       'Multiple Choice',
    truefalse: 'True / False',
    fill:      'Fill in the Blank',
    matching:  'Matching',
  };

  /* ════════════════════════════════════════
     BOOTSTRAP
  ════════════════════════════════════════ */

  async function init() {
    const id = params.get('id');
    if (!id) { window.location.href = 'index.html'; return; }

    try {
      const res = await fetch(`data/quiz${id}.json`);
      if (!res.ok) throw new Error('Not found');
      quizData  = await res.json();
    } catch {
      alert('Quiz not found. Returning to home.');
      window.location.href = 'index.html';
      return;
    }

    questions = [...(quizData.questions ?? [])];
    answers   = questions.map(() => ({ answered: false, correct: false, userAnswer: null }));
    secondsLeft = (quizData.duration ?? 30) * 60;

    /* Header labels */
    $quizTitle.textContent  = quizData.title  ?? 'Quiz';
    $quizTopic.textContent  = quizData.topic  ?? '';

    /* Retry button */
    $btnRetry.addEventListener('click', () => {
      $resultsOverlay.style.display = 'none';
      resetQuiz();
    });

    /* Nav buttons */
    $btnPrev.addEventListener('click', () => navigate(-1));
    $btnNext.addEventListener('click', () => navigate(+1));

    buildDots();
    renderQuestion();
    startTimer();
  }

  /* ════════════════════════════════════════
     TIMER
  ════════════════════════════════════════ */

  function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      secondsLeft--;
      secondsUsed++;
      updateTimerDisplay();
      if (secondsLeft <= 0) {
        clearInterval(timerInterval);
        showResults();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
    const s = (secondsLeft % 60).toString().padStart(2, '0');
    $timer.textContent = `${m}:${s}`;

    $timer.classList.remove('warning', 'danger');
    if (secondsLeft <= 60)       $timer.classList.add('danger');
    else if (secondsLeft <= 180) $timer.classList.add('warning');
  }

  /* ════════════════════════════════════════
     DOTS
  ════════════════════════════════════════ */

  function buildDots() {
    $questionDots.innerHTML = '';
    questions.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'q-dot';
      dot.title = `Question ${i + 1}`;
      dot.addEventListener('click', () => jumpTo(i));
      $questionDots.appendChild(dot);
    });
    updateDots();
  }

  function updateDots() {
    const dots = $questionDots.querySelectorAll('.q-dot');
    dots.forEach((dot, i) => {
      dot.className = 'q-dot';
      if (i === current)               dot.classList.add('current');
      if (answers[i]?.answered) {
        dot.classList.add(answers[i].correct ? 'correct' : 'wrong');
      }
    });
  }

  /* ════════════════════════════════════════
     NAVIGATION
  ════════════════════════════════════════ */

  function navigate(dir) {
    const next = current + dir;
    if (next < 0 || next >= questions.length) return;
    jumpTo(next);
  }

  function jumpTo(index) {
    current = index;
    renderQuestion();
  }

  /* ════════════════════════════════════════
     PROGRESS BAR + COUNTER
  ════════════════════════════════════════ */

  function updateProgress() {
    const answered = answers.filter(a => a.answered).length;
    const pct = (answered / questions.length) * 100;
    $progressBar.style.width = `${pct}%`;
    $questionCounter.textContent = `${current + 1} / ${questions.length}`;
  }

  /* ════════════════════════════════════════
     RENDER QUESTION
  ════════════════════════════════════════ */

  function renderQuestion() {
    const q = questions[current];

    $qNumber.textContent  = `Question ${current + 1} of ${questions.length}`;
    $qTypeTag.textContent = TYPE_LABELS[q.type] ?? q.type;
    $qText.textContent    = q.text;

    /* Hide feedback */
    $feedbackBox.style.display = 'none';
    $feedbackBox.className     = 'feedback-box';
    $feedbackBox.innerHTML     = '';

    /* Render answer area */
    $answerArea.innerHTML = '';
    switch (q.type) {
      case 'mcq':       renderMCQ(q);       break;
      case 'truefalse': renderTrueFalse(q); break;
      case 'fill':      renderFill(q);      break;
      case 'matching':  renderMatching(q);  break;
      default:          $answerArea.innerHTML = '<p style="color:var(--gray-400)">Unknown question type.</p>';
    }

    /* Restore previous answer state if already answered */
    if (answers[current].answered) {
      restoreAnswerState(q);
    }

    /* Nav button states */
    $btnPrev.disabled = (current === 0);
    $btnNext.textContent = (current === questions.length - 1) ? 'Finish 🏁' : 'Next →';
    if (current === questions.length - 1) {
      $btnNext.removeEventListener('click', handleFinish);
      $btnNext.addEventListener('click', handleFinish);
    }

    updateProgress();
    updateDots();
  }

  function handleFinish() {
    // Only finish if all answered, else just go forward (navigate handles boundary)
    const allAnswered = answers.every(a => a.answered);
    if (allAnswered) {
      clearInterval(timerInterval);
      showResults();
    } else {
      // Find first unanswered and jump there
      const firstUnanswered = answers.findIndex(a => !a.answered);
      if (firstUnanswered !== -1) {
        jumpTo(firstUnanswered);
        showToast('Please answer all questions before finishing.');
      } else {
        clearInterval(timerInterval);
        showResults();
      }
    }
  }

  /* ════════════════════════════════════════
     MCQ
  ════════════════════════════════════════ */

  function renderMCQ(q) {
    const list = document.createElement('ul');
    list.className = 'options-list';

    q.options.forEach((opt, i) => {
      const li   = document.createElement('li');
      li.className = 'option-item';
      li.dataset.index = i;

      const letter = String.fromCharCode(65 + i); // A B C D
      li.innerHTML = `
        <div class="option-letter">${letter}</div>
        <div class="option-text">${opt}</div>
      `;

      li.addEventListener('click', () => {
        if (answers[current].answered) return;
        selectMCQ(q, opt, list);
      });

      list.appendChild(li);
    });

    $answerArea.appendChild(list);
  }

  function selectMCQ(q, chosen, list) {
    const isCorrect = chosen === q.answer;
    answers[current] = { answered: true, correct: isCorrect, userAnswer: chosen };

    list.querySelectorAll('.option-item').forEach(li => {
      const txt = li.querySelector('.option-text').textContent;
      if (txt === q.answer)  li.classList.add('correct');
      if (txt === chosen && !isCorrect) li.classList.add('wrong');
      if (txt === chosen)    li.classList.add('selected');
    });

    showFeedback(isCorrect, q.feedback);
    updateDots();
    updateProgress();
    autoAdvance();
  }

  /* ════════════════════════════════════════
     TRUE / FALSE
  ════════════════════════════════════════ */

  function renderTrueFalse(q) {
    const group = document.createElement('div');
    group.className = 'tf-group';

    [true, false].forEach(val => {
      const btn = document.createElement('button');
      btn.className   = 'tf-btn';
      btn.dataset.val = val;
      btn.innerHTML   = val ? '✓ True' : '✗ False';

      btn.addEventListener('click', () => {
        if (answers[current].answered) return;
        selectTF(q, val, group);
      });

      group.appendChild(btn);
    });

    $answerArea.appendChild(group);
  }

  function selectTF(q, chosen, group) {
    const isCorrect = chosen === q.answer;
    answers[current] = { answered: true, correct: isCorrect, userAnswer: chosen };

    group.querySelectorAll('.tf-btn').forEach(btn => {
      const bVal = btn.dataset.val === 'true';
      if (bVal === q.answer)  btn.classList.add('correct');
      if (bVal === chosen && !isCorrect) btn.classList.add('wrong');
      if (bVal === chosen)    btn.classList.add('selected');
    });

    showFeedback(isCorrect, q.feedback);
    updateDots();
    updateProgress();
    autoAdvance();
  }

  /* ════════════════════════════════════════
     FILL IN THE BLANK
  ════════════════════════════════════════ */

  function renderFill(q) {
    const wrap  = document.createElement('div');
    wrap.style.cssText = 'display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap;';

    const input = document.createElement('input');
    input.type        = 'text';
    input.className   = 'fill-input';
    input.placeholder = 'Type your answer…';
    input.style.flex  = '1';
    input.autocomplete = 'off';

    const submitBtn = document.createElement('button');
    submitBtn.className   = 'btn btn-primary';
    submitBtn.textContent = 'Check';
    submitBtn.style.whiteSpace = 'nowrap';

    const check = () => {
      if (answers[current].answered) return;
      const val = input.value.trim();
      if (!val) return;
      submitFill(q, val, input);
    };

    submitBtn.addEventListener('click', check);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });

    wrap.appendChild(input);
    wrap.appendChild(submitBtn);
    $answerArea.appendChild(wrap);
  }

  function submitFill(q, val, input) {
    const isCorrect = val.toLowerCase() === q.answer.toLowerCase();
    answers[current] = { answered: true, correct: isCorrect, userAnswer: val };

    input.classList.add(isCorrect ? 'correct' : 'wrong');
    input.readOnly = true;

    if (!isCorrect) {
      const hint = document.createElement('p');
      hint.style.cssText = 'margin-top:8px; font-size:.85rem; color:var(--gray-400);';
      hint.textContent   = `Correct answer: ${q.answer}`;
      $answerArea.appendChild(hint);
    }

    showFeedback(isCorrect, q.feedback);
    updateDots();
    updateProgress();
    autoAdvance();
  }

  /* ════════════════════════════════════════
     MATCHING
  ════════════════════════════════════════ */

  function renderMatching(q) {
    /*
      Strategy:
      - Left column: terms (fixed order)
      - Right column: definitions (shuffled)
      - Click a term → it becomes "active"
      - Click a definition → pair them
      - Matched pairs get .matched class
      - Wrong pairs flash .wrong-match then reset
    */

    const terms = q.pairs.map(p => p.term);
    const defs  = shuffle([...q.pairs.map(p => p.definition)]);

    /* Track state */
    let activeTerm   = null;    // currently selected term element
    let matched      = {};      // { term: definition }

    const grid = document.createElement('div');
    grid.className = 'matching-grid';

    const termCol = document.createElement('div');
    termCol.style.cssText = 'display:flex; flex-direction:column; gap:10px;';

    const defCol  = document.createElement('div');
    defCol.style.cssText  = 'display:flex; flex-direction:column; gap:10px;';

    /* Build term elements */
    const termEls = terms.map(term => {
      const el = document.createElement('div');
      el.className    = 'match-term';
      el.textContent  = term;
      el.dataset.term = term;

      el.addEventListener('click', () => {
        if (answers[current].answered) return;
        if (el.classList.contains('matched')) return;

        // Deselect if clicking same one
        if (activeTerm === el) {
          el.classList.remove('active');
          activeTerm = null;
          return;
        }

        // Deselect previous
        if (activeTerm) activeTerm.classList.remove('active');
        activeTerm = el;
        el.classList.add('active');
      });

      termCol.appendChild(el);
      return el;
    });

    /* Build definition elements */
    const defEls = defs.map(def => {
      const el = document.createElement('div');
      el.className   = 'match-def';
      el.textContent = def;
      el.dataset.def = def;

      el.addEventListener('click', () => {
        if (answers[current].answered) return;
        if (el.classList.contains('matched')) return;
        if (!activeTerm) return;

        const term       = activeTerm.dataset.term;
        const chosenDef  = def;
        const correctDef = q.pairs.find(p => p.term === term).definition;
        const isMatch    = chosenDef === correctDef;

        if (isMatch) {
          activeTerm.classList.remove('active');
          activeTerm.classList.add('matched');
          el.classList.add('matched');
          matched[term] = chosenDef;
          activeTerm = null;

          /* Check if all matched */
          if (Object.keys(matched).length === q.pairs.length) {
            /* All correct (wrong pairs were already rejected) */
            answers[current] = { answered: true, correct: true, userAnswer: matched };
            showFeedback(true, q.feedback);
            updateDots();
            updateProgress();
            autoAdvance();
          }
        } else {
          /* Flash wrong */
          activeTerm.classList.add('wrong-match');
          el.classList.add('wrong-match');
          setTimeout(() => {
            activeTerm?.classList.remove('wrong-match', 'active');
            el.classList.remove('wrong-match');
            activeTerm = null;
          }, 800);
        }
      });

      defCol.appendChild(el);
      return el;
    });

    grid.appendChild(termCol);
    grid.appendChild(defCol);
    $answerArea.appendChild(grid);

    /* Store refs for state restore */
    $answerArea.dataset.matchingTermEls = JSON.stringify(terms);
    $answerArea._termEls = termEls;
    $answerArea._defEls  = defEls;
    $answerArea._pairs   = q.pairs;
  }

  /* ════════════════════════════════════════
     RESTORE ANSWER STATE (when revisiting)
  ════════════════════════════════════════ */

  function restoreAnswerState(q) {
    const state = answers[current];
    if (!state.answered) return;

    switch (q.type) {
      case 'mcq': {
        const list = $answerArea.querySelector('.options-list');
        if (!list) return;
        list.querySelectorAll('.option-item').forEach(li => {
          const txt = li.querySelector('.option-text').textContent;
          if (txt === q.answer)            li.classList.add('correct');
          if (txt === state.userAnswer && txt !== q.answer) li.classList.add('wrong');
          if (txt === state.userAnswer)    li.classList.add('selected');
        });
        break;
      }
      case 'truefalse': {
        const group = $answerArea.querySelector('.tf-group');
        if (!group) return;
        group.querySelectorAll('.tf-btn').forEach(btn => {
          const bVal = btn.dataset.val === 'true';
          if (bVal === q.answer)                      btn.classList.add('correct');
          if (bVal === state.userAnswer && bVal !== q.answer) btn.classList.add('wrong');
          if (bVal === state.userAnswer)              btn.classList.add('selected');
        });
        break;
      }
      case 'fill': {
        const input = $answerArea.querySelector('.fill-input');
        if (!input) return;
        input.value    = state.userAnswer ?? '';
        input.readOnly = true;
        input.classList.add(state.correct ? 'correct' : 'wrong');
        if (!state.correct) {
          const hint = document.createElement('p');
          hint.style.cssText = 'margin-top:8px; font-size:.85rem; color:var(--gray-400);';
          hint.textContent   = `Correct answer: ${q.answer}`;
          $answerArea.appendChild(hint);
        }
        break;
      }
      case 'matching': {
        if (!state.userAnswer) return;
        const termEls = $answerArea._termEls ?? [];
        const defEls  = $answerArea._defEls  ?? [];
        const pairs   = $answerArea._pairs   ?? q.pairs;

        Object.entries(state.userAnswer).forEach(([term, def]) => {
          const tEl = termEls.find(el => el.dataset.term === term);
          const dEl = defEls.find(el => el.dataset.def === def);
          tEl?.classList.add('matched');
          dEl?.classList.add('matched');
        });
        break;
      }
    }

    showFeedback(state.correct, q.feedback);
  }

  /* ════════════════════════════════════════
     FEEDBACK
  ════════════════════════════════════════ */

  function showFeedback(isCorrect, text) {
    $feedbackBox.style.display = 'flex';
    $feedbackBox.className     = `feedback-box ${isCorrect ? 'correct' : 'wrong'}`;
    $feedbackBox.innerHTML     = `
      <span class="feedback-icon">${isCorrect ? '✅' : '❌'}</span>
      <span>${text ?? (isCorrect ? 'Correct!' : 'Incorrect.')}</span>
    `;
  }

  /* ════════════════════════════════════════
     AUTO ADVANCE
  ════════════════════════════════════════ */

  function autoAdvance() {
    if (current < questions.length - 1) {
      setTimeout(() => navigate(+1), 1000);
    }
  }

  /* ════════════════════════════════════════
     RESULTS
  ════════════════════════════════════════ */

  function showResults() {
    clearInterval(timerInterval);

    const correct = answers.filter(a => a.correct).length;
    const wrong   = answers.filter(a => a.answered && !a.correct).length;
    const total   = questions.length;
    const pct     = Math.round((correct / total) * 100);

    const used    = (quizData.duration * 60) - secondsLeft;
    const usedMin = Math.floor(used / 60);
    const usedSec = (used % 60).toString().padStart(2, '0');

    /* Score circle */
    document.getElementById('scoreCircle').style.setProperty('--pct', pct);
    document.getElementById('scorePct').textContent    = `${pct}%`;
    document.getElementById('statCorrect').textContent = correct;
    document.getElementById('statWrong').textContent   = wrong;
    document.getElementById('statTime').textContent    = `${usedMin}:${usedSec}`;

    /* Grade message */
    const grade = gradeMsg(pct);
    document.getElementById('resultsTitle').textContent = grade.title;
    const gradeBox = document.getElementById('gradeMsg');
    gradeBox.className   = `feedback-box ${pct >= 60 ? 'correct' : 'wrong'}`;
    gradeBox.style.display = 'flex';
    gradeBox.innerHTML   = `<span class="feedback-icon">${grade.icon}</span><span>${grade.msg}</span>`;

    $resultsOverlay.style.display = 'block';
    $resultsOverlay.scrollTop = 0;
  }

  function gradeMsg(pct) {
    if (pct === 100) return { title: 'Perfect Score! 🏆', icon: '🌟', msg: 'Outstanding! You answered every question correctly.' };
    if (pct >= 85)   return { title: 'Excellent! 🎉',     icon: '🥇', msg: 'Great performance. You have a strong grasp of the material.' };
    if (pct >= 70)   return { title: 'Good Job! 👍',      icon: '🥈', msg: 'Solid result. Review the questions you missed to strengthen your understanding.' };
    if (pct >= 60)   return { title: 'Keep Going! 📚',    icon: '🥉', msg: 'You passed, but there\'s room to improve. Try reviewing the material and retrying.' };
    return               { title: 'Keep Studying! 💪',    icon: '📖', msg: 'Don\'t give up! Review the lecture notes and try again.' };
  }

  /* ════════════════════════════════════════
     RESET (Retry)
  ════════════════════════════════════════ */

  function resetQuiz() {
    current     = 0;
    answers     = questions.map(() => ({ answered: false, correct: false, userAnswer: null }));
    secondsLeft = (quizData.duration ?? 30) * 60;
    secondsUsed = 0;

    buildDots();
    renderQuestion();
    startTimer();
  }

  /* ════════════════════════════════════════
     HELPERS
  ════════════════════════════════════════ */

  /** Fisher-Yates shuffle (returns new array) */
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Simple in-page toast for UX messages */
  function showToast(msg) {
    const existing = document.getElementById('_toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = '_toast';
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
      background: var(--navy-700); color: var(--white);
      padding: 10px 20px; border-radius: var(--r-full);
      font-size: .88rem; z-index: 999;
      box-shadow: var(--shadow-card);
      animation: fadeSlideIn .3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  /* ── Kick off ── */
  init();
}
