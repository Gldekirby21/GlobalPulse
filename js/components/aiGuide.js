/**
 * AI Geo & Travel Assistant Component
 * Provides cultural insights, travel recommendations, climate details, and geography facts.
 * Operates with built-in instant intelligence engine + optional Gemini API Key integration.
 */

import { countriesService } from '../services/countriesService.js';

class AIGuide {
  constructor() {
    this.chatBody = null;
    this.inputField = null;
    this.sendBtn = null;
    this.geminiApiKey = localStorage.getItem('globalpulse_gemini_key') || '';
    this.messages = [];
  }

  init(chatBodyId = 'aiChatBody', inputId = 'aiChatInput', sendBtnId = 'aiSendBtn') {
    this.chatBody = document.getElementById(chatBodyId);
    this.inputField = document.getElementById(inputId);
    this.sendBtn = document.getElementById(sendBtnId);

    if (this.sendBtn && this.inputField) {
      this.sendBtn.addEventListener('click', () => this.handleUserSend());
      this.inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.handleUserSend();
      });
    }

    // Setup suggestion chip clicks
    document.querySelectorAll('.ai-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.dataset.prompt || chip.textContent;
        if (this.inputField) {
          this.inputField.value = prompt;
          this.handleUserSend();
        }
      });
    });

    // Gemini API key settings modal/btn
    const keyBtn = document.getElementById('btnConfigGeminiKey');
    if (keyBtn) {
      keyBtn.addEventListener('click', () => this.promptForApiKey());
    }
  }

  promptForApiKey() {
    const key = prompt(
      'Optional: Enter your Google Gemini API Key to enable live dynamic AI reasoning. (Leave blank to use the built-in instant Geo-Intelligence engine):',
      this.geminiApiKey
    );
    if (key !== null) {
      this.geminiApiKey = key.trim();
      localStorage.setItem('globalpulse_gemini_key', this.geminiApiKey);
      this.appendMessage('bot', this.geminiApiKey 
        ? '✨ Gemini API Key connected successfully! I am ready to answer any custom travel or geography questions.'
        : ' Switched to GlobalPulse Built-in Instant Geo-Intelligence Engine.');
    }
  }

  appendMessage(role, text) {
    if (!this.chatBody) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-msg ${role}`;

    const formattedText = this.formatMarkdown(text);

    msgDiv.innerHTML = `
      <div class="ai-avatar" style="${role === 'user' ? 'background: linear-gradient(135deg, #3b82f6, #6366f1);' : ''}">
        <i class="fa-solid fa-${role === 'user' ? 'user' : 'robot'}"></i>
      </div>
      <div class="ai-bubble">
        ${formattedText}
      </div>
    `;

    this.chatBody.appendChild(msgDiv);
    this.chatBody.scrollTop = this.chatBody.scrollHeight;
  }

  formatMarkdown(text) {
    // Simple markdown formatting for bold, bullets, links, and linebreaks
    let res = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">$1</code>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n- /g, '<br>&bull; ')
      .replace(/\n/g, '<br>');
    return res;
  }

  async handleUserSend() {
    if (!this.inputField) return;
    const text = this.inputField.value.trim();
    if (!text) return;

    this.inputField.value = '';
    this.appendMessage('user', text);

    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    const typingDiv = document.createElement('div');
    typingDiv.className = 'ai-msg bot';
    typingDiv.id = typingId;
    typingDiv.innerHTML = `
      <div class="ai-avatar"><i class="fa-solid fa-robot"></i></div>
      <div class="ai-bubble" style="color:var(--text-muted);">
        <i class="fa-solid fa-spinner fa-spin"></i> Exploring global knowledge base...
      </div>
    `;
    this.chatBody.appendChild(typingDiv);
    this.chatBody.scrollTop = this.chatBody.scrollHeight;

    try {
      let botResponse = '';
      if (this.geminiApiKey) {
        botResponse = await this.queryGeminiAPI(text);
      } else {
        botResponse = await this.queryBuiltinIntelligence(text);
      }

      const typingElem = document.getElementById(typingId);
      if (typingElem) typingElem.remove();

      this.appendMessage('bot', botResponse);
    } catch (err) {
      console.error(err);
      const typingElem = document.getElementById(typingId);
      if (typingElem) typingElem.remove();

      this.appendMessage('bot', '⚠️ Sorry, I encountered an error answering that. Please try again!');
    }
  }

  /**
   * Gemini API integration (if user supplied their key)
   */
  async queryGeminiAPI(promptText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiApiKey}`;

    const systemPrompt = "You are GlobalPulse AI, an expert, enthusiastic, and friendly world travel guide, geographer, and cultural explorer. Provide well-structured, engaging, accurate answers with bullet points and emojis.";

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Question: ${promptText}` }] }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
  }

  /**
   * Built-in Instant Intelligence Engine
   */
  async queryBuiltinIntelligence(query) {
    // Artificial slight delay for realistic feel
    await new Promise(r => setTimeout(r, 600));

    const q = query.toLowerCase();

    // Check if query mentions a specific country
    const allCountries = countriesService.filterCountries();
    const matchedCountry = allCountries.find(c => 
      q.includes(c.name.common.toLowerCase()) || 
      (c.capital && c.capital.some(cap => q.includes(cap.toLowerCase())))
    );

    if (matchedCountry) {
      const c = matchedCountry;
      const capital = c.capital ? c.capital.join(', ') : 'N/A';
      const pop = countriesService.formatNumber(c.population);
      const area = countriesService.formatNumber(c.area);
      const langs = countriesService.getLanguagesString(c);
      const curr = countriesService.getCurrenciesString(c);

      if (q.includes('best time') || q.includes('season') || q.includes('weather') || q.includes('when to visit')) {
        return `🌦️ **Best Time to Visit ${c.name.common}:**\n\n` +
          `• **Region**: ${c.region} (${c.subregion || ''})\n` +
          `• **General Advice**: For ${c.region}, the shoulder seasons (Spring & Autumn) typically offer the best balance of pleasant weather and lighter tourist crowds.\n` +
          `• **Local Capital**: ${capital}\n` +
          `• **Timezone**: ${c.timezones?.[0] || 'Local'}\n\n` +
          `💡 *Tip: Remember that the official currency is **${curr}** and the official language is **${langs}**!*`;
      }

      if (q.includes('food') || q.includes('delicac') || q.includes('eat') || q.includes('cuisine')) {
        return `🍲 **Culinary & Food Highlights for ${c.name.common}:**\n\n` +
          `• Exploring ${c.name.common} gives you access to authentic local cuisine rooted in ${c.region} culinary traditions.\n` +
          `• **Capital Food Hub**: Head over to **${capital}** for the best street food markets and traditional dining.\n` +
          `• **Currency to Pay**: Use **${curr}** when buying from local markets.\n` +
          `• **Speaking with Locals**: Official language is **${langs}** — a few friendly phrases will delight local vendors!`;
      }

      return `🌏 **Deep-Dive Profile: ${c.name.common}** (${c.name.official})\n\n` +
        `• 🏛️ **Capital**: ${capital}\n` +
        `• 👥 **Population**: ~${pop} citizens\n` +
        `• 📐 **Land Area**: ${area} km² (${c.region})\n` +
        `• 🗣️ **Languages**: ${langs}\n` +
        `• 💳 **Currency**: ${curr}\n` +
        `• 🚗 **Driving**: Drives on the **${(c.car?.side || 'Right').toUpperCase()}** side\n` +
        `• 🇺🇳 **UN Status**: ${c.unMember ? 'Official United Nations Member' : 'Non-Member'}\n\n` +
        `💡 *You can view their flag and interactive borders in the Explore tab or check coordinates in the Map Geocoder tab!*`;
    }

    if (q.includes('cheapest') || q.includes('budget') || q.includes('affordable')) {
      return `✈️ **Top Budget-Friendly Travel Destinations:**\n\n` +
        `1. **Southeast Asia (Vietnam, Philippines, Thailand, Indonesia)**: Excellent street food, stunning beaches, and budget-friendly accommodations ($25-$45/day).\n` +
        `2. **Eastern Europe (Poland, Hungary, Romania, Albania)**: Rich history, medieval castles, and great public transit at a fraction of Western Europe prices.\n` +
        `3. **Latin America (Bolivia, Peru, Guatemala, Colombia)**: Incredible nature, Andes mountains, vibrant culture, and affordable living.\n\n` +
        `💡 *Use our **Distance & Route Calculator** tab to estimate flight times from your country!*`;
    }

    if (q.includes('largest') || q.includes('biggest')) {
      return `🌍 **The World's Largest Countries by Land Area:**\n\n` +
        `1. 🇷🇺 **Russia** - 17,098,242 km²\n` +
        `2. 🇨🇦 **Canada** - 9,984,670 km²\n` +
        `3. 🇨🇳 **China** - 9,706,961 km²\n` +
        `4. 🇺🇸 **United States** - 9,372,610 km²\n` +
        `5. 🇧🇷 **Brazil** - 8,515,767 km²\n\n` +
        `💡 *You can compare any two of these in the **Compare View** tab!*`;
    }

    return `👋 **Hello from GlobalPulse AI Guide!**\n\n` +
      `I am your intelligent geography & travel assistant. You can ask me about:\n` +
      `• 🔍 Facts about any specific country (e.g. *"Tell me about Japan"*, *"Capital of Iceland"*)\n` +
      `• 🌦️ Best seasons to visit and weather\n` +
      `• 🍲 Traditional cuisines & cultural tips\n` +
      `• ✈️ Budget travel recommendations and flight estimates\n\n` +
      `Try clicking one of the suggested question chips below or type any country name!`;
  }
}

export const aiGuide = new AIGuide();
