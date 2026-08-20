/**
 * Production-Ready AI Chatbot Frontend
 * Vanilla JavaScript (ES6+), Zero Heavy Frameworks, Fully Optimized
 */

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // State & Constants
  // -------------------------------------------------------------------------
  const STORAGE_KEY = 'openrouter_chatbot_sessions_v1';
  const CUSTOM_KEY_STORAGE = 'openrouter_custom_client_key';

  let state = {
    chats: [],
    activeChatId: null,
    isLoading: false,
    config: {
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      maxMessageLength: 4000,
      maxHistoryMessages: 12,
      rateLimitRequests: 20,
      rateLimitWindow: 60,
      hasApiKey: true
    }
  };

  // -------------------------------------------------------------------------
  // DOM Element Selectors
  // -------------------------------------------------------------------------
  const elements = {
    // Sidebar
    sidebar: document.getElementById('sidebar'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    openSidebarBtn: document.getElementById('openSidebarBtn'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),
    newChatBtn: document.getElementById('newChatBtn'),
    chatHistoryList: document.getElementById('chatHistoryList'),
    chatCountPill: document.getElementById('chatCountPill'),
    modelBadge: document.getElementById('modelBadge'),
    clearAllChatsBtn: document.getElementById('clearAllChatsBtn'),
    settingsBtn: document.getElementById('settingsBtn'),

    // Top Nav
    activeChatTitle: document.getElementById('activeChatTitle'),
    serverStatusText: document.getElementById('serverStatusText'),
    serverStatusIndicator: document.getElementById('serverStatusIndicator'),
    exportChatBtn: document.getElementById('exportChatBtn'),
    clearActiveChatBtn: document.getElementById('clearActiveChatBtn'),

    // Chat Area
    messagesContainer: document.getElementById('messagesContainer'),
    emptyState: document.getElementById('emptyState'),
    messagesStream: document.getElementById('messagesStream'),
    typingIndicator: document.getElementById('typingIndicator'),
    promptChipsGrid: document.getElementById('promptChipsGrid'),

    // Input Form
    chatForm: document.getElementById('chatForm'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    charCounter: document.getElementById('charCounter'),

    // Settings Modal
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    settingsModelName: document.getElementById('settingsModelName'),
    settingsMaxMsg: document.getElementById('settingsMaxMsg'),
    settingsMaxHist: document.getElementById('settingsMaxHist'),
    settingsRateLimit: document.getElementById('settingsRateLimit'),
    settingsRateWindow: document.getElementById('settingsRateWindow'),
    customApiKeyInput: document.getElementById('customApiKeyInput'),

    // Toast Container
    toastContainer: document.getElementById('toastContainer')
  };

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------
  async function init() {
    loadSessionsFromStorage();
    setupEventListeners();
    await fetchServerConfig();
    await checkServerHealth();

    // Ensure at least one active chat session exists
    if (!state.activeChatId || !getChatById(state.activeChatId)) {
      createNewChatSession();
    } else {
      renderChatHistorySidebar();
      renderActiveChatMessages();
    }

    // Adjust initial input height
    autoResizeTextarea();
  }

  // -------------------------------------------------------------------------
  // Server Config & Health API
  // -------------------------------------------------------------------------
  async function fetchServerConfig() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          state.config = { ...state.config, ...data };
          updateConfigUI();
        }
      }
    } catch (err) {
      console.warn('Could not fetch /api/config, using default parameters.');
    }
  }

  async function checkServerHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          setHealthStatus(true, data.model || state.config.model);
          return;
        }
      }
      setHealthStatus(false, 'Service Degraded');
    } catch (err) {
      setHealthStatus(false, 'Offline');
    }
  }

  function setHealthStatus(isHealthy, modelName) {
    if (!elements.serverStatusText || !elements.serverStatusIndicator) return;
    const dot = elements.serverStatusIndicator.querySelector('.status-dot');
    
    if (isHealthy) {
      elements.serverStatusText.textContent = 'Online';
      if (dot) dot.style.backgroundColor = 'var(--status-online)';
      if (elements.modelBadge) {
        const shortModel = modelName.split('/').pop().replace(':free', ' (free)');
        elements.modelBadge.textContent = shortModel;
        elements.modelBadge.title = modelName;
      }
    } else {
      elements.serverStatusText.textContent = 'Unavailable';
      if (dot) dot.style.backgroundColor = 'var(--status-danger)';
      if (elements.modelBadge) elements.modelBadge.textContent = 'Offline';
    }
  }

  function updateConfigUI() {
    if (elements.settingsModelName) elements.settingsModelName.textContent = state.config.model;
    if (elements.settingsMaxMsg) elements.settingsMaxMsg.textContent = state.config.maxMessageLength.toLocaleString();
    if (elements.settingsMaxHist) elements.settingsMaxHist.textContent = state.config.maxHistoryMessages;
    if (elements.settingsRateLimit) elements.settingsRateLimit.textContent = state.config.rateLimitRequests;
    if (elements.settingsRateWindow) elements.settingsRateWindow.textContent = state.config.rateLimitWindow;

    // Update input char limit
    if (elements.messageInput) {
      elements.messageInput.setAttribute('maxlength', state.config.maxMessageLength);
    }
    updateCharCounter();
  }

  // -------------------------------------------------------------------------
  // Session & LocalStorage Management
  // -------------------------------------------------------------------------
  function loadSessionsFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state.chats = JSON.parse(raw);
        if (state.chats.length > 0) {
          state.activeChatId = state.chats[0].id;
        }
      }
      const savedKey = localStorage.getItem(CUSTOM_KEY_STORAGE);
      if (savedKey && elements.customApiKeyInput) {
        elements.customApiKeyInput.value = savedKey;
      }
    } catch (err) {
      console.error('Error loading chats from storage', err);
      state.chats = [];
    }
  }

  function saveSessionsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.chats));
    } catch (err) {
      console.warn('Storage limit exceeded or unavailable', err);
    }
  }

  function getChatById(id) {
    return state.chats.find(c => c.id === id);
  }

  function getActiveChat() {
    return getChatById(state.activeChatId);
  }

  function createNewChatSession(initialMessage = null) {
    const newChat = {
      id: 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: initialMessage ? truncateText(initialMessage, 28) : 'New Conversation',
      createdAt: new Date().toISOString(),
      messages: []
    };

    state.chats.unshift(newChat);
    state.activeChatId = newChat.id;
    saveSessionsToStorage();
    renderChatHistorySidebar();
    renderActiveChatMessages();
    closeMobileSidebar();

    if (elements.messageInput) {
      elements.messageInput.focus();
    }
    return newChat;
  }

  function deleteChatSession(chatId, e) {
    if (e) e.stopPropagation();
    state.chats = state.chats.filter(c => c.id !== chatId);
    if (state.activeChatId === chatId) {
      state.activeChatId = state.chats.length > 0 ? state.chats[0].id : null;
      if (!state.activeChatId) {
        createNewChatSession();
        return;
      }
    }
    saveSessionsToStorage();
    renderChatHistorySidebar();
    renderActiveChatMessages();
    showToast('Chat deleted', 'info');
  }

  function clearAllChatHistory() {
    if (!confirm('Are you sure you want to delete all chat history?')) return;
    state.chats = [];
    state.activeChatId = null;
    localStorage.removeItem(STORAGE_KEY);
    createNewChatSession();
    showToast('All chat history cleared', 'info');
  }

  function resetCurrentChat() {
    const active = getActiveChat();
    if (!active || active.messages.length === 0) return;
    active.messages = [];
    active.title = 'New Conversation';
    saveSessionsToStorage();
    renderChatHistorySidebar();
    renderActiveChatMessages();
    showToast('Conversation reset', 'info');
  }

  // -------------------------------------------------------------------------
  // Rendering Functions (Optimized DOM updates)
  // -------------------------------------------------------------------------
  function renderChatHistorySidebar() {
    if (!elements.chatHistoryList) return;
    elements.chatHistoryList.innerHTML = '';
    if (elements.chatCountPill) {
      elements.chatCountPill.textContent = state.chats.length;
    }

    state.chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'chat-history-item' + (chat.id === state.activeChatId ? ' active' : '');
      item.setAttribute('data-id', chat.id);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'chat-item-title';
      titleSpan.textContent = chat.title || 'Untitled Chat';

      const delBtn = document.createElement('button');
      delBtn.className = 'chat-item-del-btn';
      delBtn.title = 'Delete chat';
      delBtn.setAttribute('aria-label', 'Delete ' + chat.title);
      delBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;

      delBtn.addEventListener('click', (e) => deleteChatSession(chat.id, e));

      item.appendChild(titleSpan);
      item.appendChild(delBtn);

      item.addEventListener('click', () => {
        if (state.activeChatId !== chat.id) {
          state.activeChatId = chat.id;
          renderChatHistorySidebar();
          renderActiveChatMessages();
          closeMobileSidebar();
        }
      });

      elements.chatHistoryList.appendChild(item);
    });
  }

  function renderActiveChatMessages() {
    const active = getActiveChat();
    if (!active) return;

    if (elements.activeChatTitle) {
      elements.activeChatTitle.textContent = active.title || 'New Conversation';
    }

    if (!elements.messagesStream || !elements.emptyState) return;

    if (active.messages.length === 0) {
      elements.emptyState.classList.remove('hidden');
      elements.messagesStream.innerHTML = '';
      return;
    }

    elements.emptyState.classList.add('hidden');
    elements.messagesStream.innerHTML = '';

    active.messages.forEach((msg, idx) => {
      appendMessageToDOM(msg.role, msg.content, idx);
    });

    scrollToBottom();
  }

  function appendMessageToDOM(role, content, messageIndex) {
    if (!elements.messagesStream) return;
    elements.emptyState.classList.add('hidden');

    const row = document.createElement('div');
    row.className = `message-row ${role === 'user' ? 'user-row' : 'ai-row'}`;

    const avatar = document.createElement('div');
    avatar.className = `message-avatar ${role === 'user' ? 'user-avatar' : 'ai-avatar'}`;
    avatar.textContent = role === 'user' ? 'U' : '✦';

    const wrapper = document.createElement('div');
    wrapper.className = 'message-content-wrapper';

    const card = document.createElement('div');
    card.className = `message-card ${role === 'user' ? 'user-card' : 'ai-card'}`;

    if (role === 'user') {
      card.textContent = content; // Safely treated as text
    } else {
      card.innerHTML = parseMarkdownToSafeHTML(content);
    }

    wrapper.appendChild(card);

    // If AI message, append action controls (Copy & Regenerate)
    if (role === 'assistant') {
      const actions = document.createElement('div');
      actions.className = 'message-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'action-pill-btn';
      copyBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>Copy</span>
      `;
      copyBtn.addEventListener('click', () => copyToClipboard(content, copyBtn));

      const regenBtn = document.createElement('button');
      regenBtn.className = 'action-pill-btn';
      regenBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        <span>Regenerate</span>
      `;
      regenBtn.addEventListener('click', () => handleRegenerate());

      actions.appendChild(copyBtn);
      actions.appendChild(regenBtn);
      wrapper.appendChild(actions);
    }

    row.appendChild(avatar);
    row.appendChild(wrapper);

    elements.messagesStream.appendChild(row);
  }

  // -------------------------------------------------------------------------
  // Chat Completion Handler (POST /api/chat)
  // -------------------------------------------------------------------------
  async function sendMessage(textToSend = null) {
    if (state.isLoading) return;

    const activeChat = getActiveChat();
    if (!activeChat) return;

    const inputVal = textToSend !== null ? textToSend : (elements.messageInput ? elements.messageInput.value : '');
    const userText = inputVal.trim();

    if (!userText) {
      showToast('Please enter a message.', 'error');
      return;
    }

    if (userText.length > state.config.maxMessageLength) {
      showToast(`Message exceeds maximum limit of ${state.config.maxMessageLength} characters.`, 'error');
      return;
    }

    // Set first title if this is the first message
    if (activeChat.messages.length === 0) {
      activeChat.title = truncateText(userText, 26);
      renderChatHistorySidebar();
      if (elements.activeChatTitle) {
        elements.activeChatTitle.textContent = activeChat.title;
      }
    }

    // 1. Add User Message to State & DOM
    activeChat.messages.push({
      role: 'user',
      content: userText,
      timestamp: Date.now()
    });
    saveSessionsToStorage();
    appendMessageToDOM('user', userText, activeChat.messages.length - 1);

    // 2. Clear Input & Reset Height
    if (elements.messageInput && textToSend === null) {
      elements.messageInput.value = '';
      autoResizeTextarea();
      updateCharCounter();
    }

    scrollToBottom();
    setLoadingState(true);

    // 3. Prepare Payload History
    // Send only up to allowed history, excluding system message
    const historySlice = activeChat.messages
      .slice(0, -1) // Exclude current user message just pushed
      .slice(-state.config.maxHistoryMessages)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const headers = { 'Content-Type': 'application/json' };
      const customKey = localStorage.getItem(CUSTOM_KEY_STORAGE);
      if (customKey) {
        headers['X-Custom-API-Key'] = customKey.trim();
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          message: userText,
          history: historySlice
        })
      });

      let data;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const rawText = await response.text();
        data = {
          success: false,
          error: response.ok ? 'Received non-JSON response from server.' : `Server error (${response.status})`
        };
      }

      if (!data || !data.success) {
        const errorMsg = data.error || 'The AI service encountered an error. Please try again.';
        showToast(errorMsg, 'error');
        appendMessageToDOM('assistant', `⚠️ **Error:** ${errorMsg}`, activeChat.messages.length);
        activeChat.messages.push({
          role: 'assistant',
          content: `⚠️ **Error:** ${errorMsg}`,
          timestamp: Date.now()
        });
        saveSessionsToStorage();
      } else {
        const aiResponse = data.response;
        activeChat.messages.push({
          role: 'assistant',
          content: aiResponse,
          timestamp: Date.now()
        });
        saveSessionsToStorage();
        appendMessageToDOM('assistant', aiResponse, activeChat.messages.length - 1);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      const networkError = 'Network error or connection timed out. Please check your connection and retry.';
      showToast(networkError, 'error');
      appendMessageToDOM('assistant', `⚠️ **Error:** ${networkError}`, activeChat.messages.length);
      activeChat.messages.push({
        role: 'assistant',
        content: `⚠️ **Error:** ${networkError}`,
        timestamp: Date.now()
      });
      saveSessionsToStorage();
    } finally {
      setLoadingState(false);
      scrollToBottom();
    }
  }

  function handleRegenerate() {
    const active = getActiveChat();
    if (!active || active.messages.length === 0 || state.isLoading) return;

    // Find the last user message
    let lastUserIndex = -1;
    for (let i = active.messages.length - 1; i >= 0; i--) {
      if (active.messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex === -1) return;

    const lastUserMessage = active.messages[lastUserIndex].content;

    // Remove any assistant responses after this user message
    active.messages = active.messages.slice(0, lastUserIndex);
    saveSessionsToStorage();
    renderActiveChatMessages();

    // Re-trigger send with this prompt
    sendMessage(lastUserMessage);
  }

  function setLoadingState(loading) {
    state.isLoading = loading;
    if (elements.sendBtn) elements.sendBtn.disabled = loading;
    if (elements.messageInput) elements.messageInput.disabled = loading;

    if (elements.typingIndicator) {
      if (loading) {
        elements.typingIndicator.classList.remove('hidden');
      } else {
        elements.typingIndicator.classList.add('hidden');
      }
    }
  }

  // -------------------------------------------------------------------------
  // Markdown Parser & XSS Sanitizer (Zero External Dependencies)
  // -------------------------------------------------------------------------
  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function parseMarkdownToSafeHTML(text) {
    if (!text) return '';

    // 1. Separate code blocks to protect them from inner markdown formatting
    const codeBlocks = [];
    let processed = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const id = `__CODE_BLOCK_${codeBlocks.length}__`;
      const cleanLang = (lang || 'code').toLowerCase().trim();
      const escapedCode = escapeHTML(code.trim());
      const blockHTML = `
        <div class="code-block-container">
          <div class="code-header">
            <span class="code-lang">${cleanLang}</span>
            <button class="code-copy-btn" onclick="window.copyCodeFromButton(this)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy code</span>
            </button>
          </div>
          <pre><code>${escapedCode}</code></pre>
        </div>
      `;
      codeBlocks.push(blockHTML);
      return id;
    });

    // 2. Escape non-code block text
    processed = escapeHTML(processed);

    // 3. Inline code
    processed = processed.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // 4. Headings
    processed = processed.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    processed = processed.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    processed = processed.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // 5. Bold & Italic
    processed = processed.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 6. Blockquotes
    processed = processed.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // 7. Unordered Lists
    processed = processed.replace(/^\s*[\-\*]\s+(.*$)/gim, '<li>$1</li>');
    processed = processed.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
    processed = processed.replace(/<\/ul>\s*<ul>/g, ''); // merge consecutive

    // 8. Ordered Lists
    processed = processed.replace(/^\s*\d+\.\s+(.*$)/gim, '<li>$1</li>');

    // 9. Paragraphs and Line Breaks
    const paragraphs = processed.split(/\n\n+/);
    processed = paragraphs.map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h') || p.startsWith('<ul>') || p.startsWith('<blockquote>') || p.startsWith('__CODE_BLOCK_')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    // 10. Restore protected Code Blocks
    codeBlocks.forEach((block, idx) => {
      processed = processed.replace(`__CODE_BLOCK_${idx}__`, block);
    });

    return processed;
  }

  // -------------------------------------------------------------------------
  // Event Listeners & UI Helpers
  // -------------------------------------------------------------------------
  function setupEventListeners() {
    // Form Submit
    if (elements.chatForm) {
      elements.chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage();
      });
    }

    // Input Keydown Handling (Enter vs Shift+Enter)
    if (elements.messageInput) {
      elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });

      elements.messageInput.addEventListener('input', () => {
        autoResizeTextarea();
        updateCharCounter();
      });
    }

    // Sidebar & Navigation
    if (elements.openSidebarBtn) {
      elements.openSidebarBtn.addEventListener('click', openMobileSidebar);
    }
    if (elements.closeSidebarBtn) {
      elements.closeSidebarBtn.addEventListener('click', closeMobileSidebar);
    }
    if (elements.sidebarOverlay) {
      elements.sidebarOverlay.addEventListener('click', closeMobileSidebar);
    }
    if (elements.newChatBtn) {
      elements.newChatBtn.addEventListener('click', () => createNewChatSession());
    }
    if (elements.clearAllChatsBtn) {
      elements.clearAllChatsBtn.addEventListener('click', clearAllChatHistory);
    }
    if (elements.clearActiveChatBtn) {
      elements.clearActiveChatBtn.addEventListener('click', resetCurrentChat);
    }
    if (elements.exportChatBtn) {
      elements.exportChatBtn.addEventListener('click', exportActiveChat);
    }

    // Prompt Chips (Event Delegation)
    if (elements.promptChipsGrid) {
      elements.promptChipsGrid.addEventListener('click', (e) => {
        const chip = e.target.closest('.prompt-chip');
        if (chip) {
          const prompt = chip.getAttribute('data-prompt');
          if (prompt) {
            sendMessage(prompt);
          }
        }
      });
    }

    // Settings Modal
    if (elements.settingsBtn) {
      elements.settingsBtn.addEventListener('click', openSettingsModal);
    }
    if (elements.closeSettingsBtn) {
      elements.closeSettingsBtn.addEventListener('click', closeSettingsModal);
    }
    if (elements.cancelSettingsBtn) {
      elements.cancelSettingsBtn.addEventListener('click', closeSettingsModal);
    }
    if (elements.saveSettingsBtn) {
      elements.saveSettingsBtn.addEventListener('click', saveSettingsPreferences);
    }
  }

  function autoResizeTextarea() {
    if (!elements.messageInput) return;
    elements.messageInput.style.height = 'auto';
    const newHeight = Math.min(elements.messageInput.scrollHeight, 180);
    elements.messageInput.style.height = `${newHeight}px`;

    const hasText = elements.messageInput.value.trim().length > 0;
    if (elements.sendBtn) {
      elements.sendBtn.disabled = !hasText || state.isLoading;
    }
  }

  function updateCharCounter() {
    if (!elements.charCounter || !elements.messageInput) return;
    const len = elements.messageInput.value.length;
    const max = state.config.maxMessageLength;
    elements.charCounter.textContent = `${len} / ${max}`;
    if (len >= max) {
      elements.charCounter.style.color = 'var(--status-danger)';
    } else {
      elements.charCounter.style.color = 'var(--text-muted)';
    }
  }

  function openMobileSidebar() {
    if (elements.sidebar) elements.sidebar.classList.add('open');
    if (elements.sidebarOverlay) elements.sidebarOverlay.classList.add('active');
  }

  function closeMobileSidebar() {
    if (elements.sidebar) elements.sidebar.classList.remove('open');
    if (elements.sidebarOverlay) elements.sidebarOverlay.classList.remove('active');
  }

  function openSettingsModal() {
    if (elements.settingsModal) elements.settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    if (elements.settingsModal) elements.settingsModal.classList.add('hidden');
  }

  function saveSettingsPreferences() {
    if (elements.customApiKeyInput) {
      const val = elements.customApiKeyInput.value.trim();
      if (val) {
        localStorage.setItem(CUSTOM_KEY_STORAGE, val);
        showToast('Client API key saved locally', 'success');
      } else {
        localStorage.removeItem(CUSTOM_KEY_STORAGE);
        showToast('Client API key removed (using server env)', 'info');
      }
    }
    closeSettingsModal();
  }

  function exportActiveChat() {
    const active = getActiveChat();
    if (!active || active.messages.length === 0) {
      showToast('No messages to export.', 'info');
      return;
    }

    let textContent = `# Conversation: ${active.title}\n`;
    textContent += `Date: ${new Date(active.createdAt).toLocaleString()}\n`;
    textContent += `Model: ${state.config.model}\n\n`;
    textContent += `---\n\n`;

    active.messages.forEach(m => {
      textContent += `### ${m.role === 'user' ? 'User' : 'AI'}\n\n${m.content}\n\n`;
    });

    const blob = new Blob([textContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Conversation exported (.md)', 'success');
  }

  function copyToClipboard(text, btnElement) {
    if (!navigator.clipboard) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Copied to clipboard!', 'success');
      return;
    }

    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard!', 'success');
      if (btnElement) {
        const span = btnElement.querySelector('span');
        if (span) {
          const original = span.textContent;
          span.textContent = 'Copied!';
          setTimeout(() => { span.textContent = original; }, 1800);
        }
      }
    }).catch(() => {
      showToast('Failed to copy', 'error');
    });
  }

  // Global Code Copy Handler attached to window for dynamically generated pre/code blocks
  window.copyCodeFromButton = function (btn) {
    const pre = btn.closest('.code-block-container').querySelector('pre code');
    if (!pre) return;
    const codeText = pre.textContent;
    copyToClipboard(codeText, btn);
  };

  function scrollToBottom() {
    if (!elements.messagesContainer) return;
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
  }

  function truncateText(str, max) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '...' : str;
  }

  function showToast(message, type = 'info') {
    if (!elements.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 250);
    }, 3200);
  }

  // DOM Content Loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
