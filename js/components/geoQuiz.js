/**
 * Geo Quiz Arena — gamified geography quiz
 * Question types: capital→country, country→capital, flag→country
 * Guests can play (local score only); logged-in users submit to the global
 * leaderboard and earn XP/badges via gamificationService.
 */

import { countriesService } from '../services/countriesService.js';
import { gamificationService } from '../services/gamificationService.js';
import { supabaseService } from '../services/supabaseService.js';
import { isAuthenticated, bindAuthTriggers } from '../utils/access.js';

const QUESTIONS_PER_ROUND = 10;
const SECONDS_PER_QUESTION = 15;

class GeoQuiz {
    constructor() {
        this.container = null;
        this.leaderboardEl = null;
        this.round = null;
        this._timerId = null;
    }

    init() {
        this.container = document.getElementById('quizArena');
        this.leaderboardEl = document.getElementById('leaderboardPanel');
        if (!this.container) return;

        this.renderStart();
        gamificationService.subscribeToLeaderboard((users) => this.renderLeaderboard(users));
    }

    /* ------------------------- Question generation ------------------------- */

    _pickCountries(count) {
        const all = countriesService.countries.filter(
            (c) => c.name?.common && (c.capital?.length || c.flags?.png)
        );
        const pool = [...all].sort(() => Math.random() - 0.5);
        return pool.slice(0, count);
    }

    _makeQuestion(answerCountry, distractors) {
        const type = ['capital', 'flag', 'country'][Math.floor(Math.random() * 3)];
        const options = [answerCountry, ...distractors]
            .sort(() => Math.random() - 0.5)
            .map((c) => ({ cca3: c.cca3, label: c.name.common }));

        if (type === 'capital') {
            const capital = answerCountry.capital[0];
            return {
                type,
                prompt: `<i class="fa-solid fa-city"></i> <strong>${capital}</strong> is the capital of which country?`,
                image: null,
                answerCca3: answerCountry.cca3,
                options
            };
        }

        if (type === 'flag') {
            return {
                type,
                prompt: 'Which country does this flag belong to?',
                image: answerCountry.flags?.svg || answerCountry.flags?.png,
                answerCca3: answerCountry.cca3,
                options
            };
        }

        return {
            type,
            prompt: `What is the capital of <strong>${answerCountry.name.common}</strong>?`,
            image: null,
            answerCca3: answerCountry.cca3,
            options: [answerCountry, ...distractors]
                .sort(() => Math.random() - 0.5)
                .map((c) => ({
                    cca3: c.cca3,
                    label: c.capital[0] || 'No capital'
                }))
        };
    }

    _buildRound() {
        // 1 correct + 3 distractors per question; prefer same-region distractors
        const picked = this._pickCountries(QUESTIONS_PER_ROUND);
        const all = countriesService.countries;

        return {
            idx: 0,
            score: 0,
            correct: 0,
            questions: picked.map((answer) => {
                const sameRegion = all.filter(
                    (c) => c.region === answer.region && c.cca3 !== answer.cca3 && c.capital?.length
                );
                const fallback = all.filter((c) => c.cca3 !== answer.cca3 && c.capital?.length);
                const source = sameRegion.length >= 3 ? sameRegion : fallback;
                const distractors = [...source].sort(() => Math.random() - 0.5).slice(0, 3);
                return this._makeQuestion(answer, distractors);
            })
        };
    }

    /* ------------------------------ Rendering ------------------------------ */

    renderStart() {
        this._stopTimer();
        const guestNote = isAuthenticated()
            ? ''
            : `
      <div class="quiz-guest-note">
        <i class="fa-solid fa-circle-info"></i>
        You're playing as a guest — <button type="button" class="link-btn" data-open-auth>Sign in</button>
        to save scores & climb the leaderboard!
      </div>`;

        this.container.innerHTML = `
      <div class="quiz-start">
        <div class="quiz-hero-icon"><i class="fa-solid fa-brain"></i></div>
        <h2 class="quiz-title">Geo Quiz Arena</h2>
        <p class="quiz-subtitle">${QUESTIONS_PER_ROUND} questions • ${SECONDS_PER_QUESTION}s each • capitals, flags & countries</p>
        ${guestNote}
        <button class="quiz-start-btn" id="quizStartBtn">
          <i class="fa-solid fa-play"></i> Start Round
        </button>
      </div>
    `;
        document.getElementById('quizStartBtn')?.addEventListener('click', () => this.startRound());
        bindAuthTriggers(this.container);
    }

    startRound() {
        this.round = this._buildRound();
        this.renderQuestion();
    }

    renderQuestion() {
        const r = this.round;
        const q = r.questions[r.idx];
        this._stopTimer();

        const progressPct = ((r.idx) / r.questions.length) * 100;
        this.container.innerHTML = `
      <div class="quiz-question-view">
        <div class="quiz-hud">
          <span class="quiz-progress-label">Q${r.idx + 1}/${r.questions.length}</span>
          <div class="quiz-progress-track"><div class="quiz-progress-fill" style="width:${progressPct}%"></div></div>
          <span class="quiz-score-chip"><i class="fa-solid fa-star"></i> ${r.score}</span>
        </div>

        <div class="quiz-timer-track"><div class="quiz-timer-fill" id="quizTimerFill"></div></div>

        <div class="quiz-prompt">
          ${q.image ? `<img src="${q.image}" alt="Flag hint" class="quiz-flag-img" />` : ''}
          <p>${q.prompt}</p>
        </div>

        <div class="quiz-options">
          ${q.options.map((o) => `
            <button class="quiz-option-btn" data-cca3="${o.cca3}">
              <span class="quiz-option-letter">${o.label.charAt(0)}</span>
              <span>${o.label}</span>
            </button>`).join('')}
        </div>
      </div>
    `;

        this.container.querySelectorAll('.quiz-option-btn').forEach((btn) => {
            btn.addEventListener('click', () => this.answer(btn.dataset.cca3));
        });

        this._startTimer();
    }

    _startTimer() {
        let timeLeft = SECONDS_PER_QUESTION;
        const fill = document.getElementById('quizTimerFill');
        fill.style.width = '100%';

        this._timerId = setInterval(() => {
            timeLeft -= 0.1;
            if (fill) fill.style.width = `${Math.max(0, (timeLeft / SECONDS_PER_QUESTION) * 100)}%`;
            if (timeLeft <= 0) {
                this._stopTimer();
                this.answer(null); // timeout
            }
        }, 100);
        this._timeLeft = timeLeft;
    }

    _stopTimer() {
        if (this._timerId) {
            clearInterval(this._timerId);
            this._timerId = null;
        }
    }

    async answer(cca3) {
        this._stopTimer();
        const r = this.round;
        const q = r.questions[r.idx];
        const isCorrect = cca3 !== null && cca3 === q.answerCca3;

        // Visual feedback
        this.container.querySelectorAll('.quiz-option-btn').forEach((btn) => {
            btn.disabled = true;
            if (btn.dataset.cca3 === q.answerCca3) btn.classList.add('correct');
            else if (btn.dataset.cca3 === cca3) btn.classList.add('wrong');
        });

        if (isCorrect) {
            const timeBonus = Math.round(50 * Math.max(0, this._timeLeft / SECONDS_PER_QUESTION));
            r.score += 100 + timeBonus;
            r.correct += 1;
        }

        await new Promise((res) => setTimeout(res, 900));

        r.idx += 1;
        if (r.idx >= r.questions.length) this.renderSummary();
        else this.renderQuestion();
    }

    renderSummary() {
        const r = this.round;
        const xpEarned = Math.round(r.score / 10);
        const authed = isAuthenticated();

        this.container.innerHTML = `
      <div class="quiz-summary">
        <div class="quiz-summary-ring">
          <span class="quiz-summary-score">${r.score}</span>
          <span class="quiz-summary-unit">points</span>
        </div>
        <h2 class="quiz-title">${r.correct}/${r.questions.length} correct!</h2>
        <p class="quiz-subtitle">
          <i class="fa-solid fa-bolt"></i> +${xpEarned} XP
          ${authed ? 'earned' : '(sign in to earn XP)'}
        </p>
        <div class="quiz-summary-actions">
          <button class="quiz-start-btn" id="quizAgainBtn"><i class="fa-solid fa-rotate-right"></i> Play Again</button>
          ${!authed ? `
            <button class="feature-unlock-btn" data-open-auth>
              <i class="fa-solid fa-right-to-bracket"></i> Sign in to save this score
            </button>` : ''}
        </div>
      </div>
    `;

        document.getElementById('quizAgainBtn')?.addEventListener('click', () => this.startRound());
        bindAuthTriggers(this.container);

        if (authed) {
            gamificationService.submitQuizScore(r.score, r.correct, r.questions.length)
                .catch(console.warn);
        } else {
            // Local best for guests
            try {
                const localBest = Number(localStorage.getItem('globalpulse_quiz_best') || 0);
                if (r.score > localBest) localStorage.setItem('globalpulse_quiz_best', String(r.score));
            } catch (e) { /* storage blocked */ }
        }
    }

    /* ----------------------------- Leaderboard ----------------------------- */

    renderLeaderboard(users) {
        if (!this.leaderboardEl) return;

        if (!users.length) {
            this.leaderboardEl.innerHTML = `
        <p class="community-empty">No rounds played yet — be the first champion!</p>`;
            return;
        }

        const medals = ['🥇', '🥈', '🥉'];
        const myId = supabaseService.user?.id;
        this.leaderboardEl.innerHTML = users.map((u, i) => `
      <div class="leaderboard-row ${u.user_id === myId ? 'me' : ''}">
        <span class="lb-rank">${medals[i] || `#${i + 1}`}</span>
        <span class="avatar-dot" style="--avatar:${u.avatar_color}; width:24px; height:24px; font-size:0.7rem;">
          ${(u.username || '?').charAt(0).toUpperCase()}
        </span>
        <span class="lb-name">${u.username}</span>
        <span class="lb-score">${u.best_score}</span>
      </div>
    `).join('');
    }
}

export const geoQuiz = new GeoQuiz();
