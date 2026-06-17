import React, { useState, useRef, useEffect } from 'react';
import { MessageSquareCode, Send, X, Bot, User, BrainCircuit } from 'lucide-react';
import { API_BASE_URL } from '../config';

const parseMarkdown = (text) => {
  if (!text) return '';
  
  // Escape HTML to prevent XSS
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Process line-by-line for headers and lists
  const lines = escaped.split('\n');
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    // Headers
    if (trimmed.startsWith('### ')) {
      return `<h4 class="markdown-h4">${trimmed.slice(4)}</h4>`;
    }
    if (trimmed.startsWith('## ')) {
      return `<h3 class="markdown-h3">${trimmed.slice(3)}</h3>`;
    }
    if (trimmed.startsWith('# ')) {
      return `<h2 class="markdown-h2">${trimmed.slice(2)}</h2>`;
    }
    // Bullet list items
    if (trimmed.startsWith('- ')) {
      return `<li class="markdown-li">${trimmed.slice(2)}</li>`;
    }
    if (trimmed.startsWith('* ')) {
      return `<li class="markdown-li">${trimmed.slice(2)}</li>`;
    }
    return line;
  });

  let html = processedLines.join('\n');

  // Bold tags: **bold**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Code tags: `code`
  html = html.replace(/`(.*?)`/g, '<code class="markdown-code">$1</code>');

  // Replace newlines with breaks
  html = html.replace(/\n/g, '<br />');

  return html;
};

export default function AIChat({ user }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'bot',
      text: 'Hello! I am PharmaBot, your intelligent pharmacy assistant. Ask me anything about your current inventory, stock levels, sales velocity, or expiry dates!'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputText
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      // Structure conversation history for backend prompt context
      const historyPayload = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ sender: m.sender, text: m.text }));

      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: historyPayload,
          message: userMessage.text,
          userId: user.uid
        })
      });

      if (!res.ok) throw new Error('API communication error');
      const data = await res.json();

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'bot',
        text: data.response
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'bot',
        text: `Error connecting to AI: ${err.message}. Please verify the server is running and the Gemini API key is valid.`
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action FAB Trigger */}
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="floating-chat-trigger"
        title="Open PharmaBot Assistant"
      >
        {isOpen ? <X size={24} /> : <BrainCircuit size={24} />}
      </button>

      {/* Floating Chat Panel */}
      {isOpen && (
        <div className="glass-card chat-panel" style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.5)', border: '1px solid rgba(14,165,233,0.25)' }}>
          {/* Header */}
          <div className="chat-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bot size={20} style={{ color: 'var(--primary)' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>PharmaBot AI</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--secondary)' }}></span> Online
                </div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="close-btn" style={{ color: 'var(--text-muted)' }}>
              <X size={18} />
            </button>
          </div>

          {/* Message History pane */}
          <div className="chat-messages">
            {messages.map(msg => (
              <div 
                key={msg.id} 
                className={`chat-bubble ${msg.sender}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem'
                }}
              >
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', fontSize: '0.7rem', color: msg.sender === 'user' ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)', marginBottom: '0.15rem' }}>
                  {msg.sender === 'user' ? <User size={10} /> : <Bot size={10} />}
                  <span>{msg.sender === 'user' ? 'You' : 'PharmaBot'}</span>
                </div>
                <div dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.text) }} />
              </div>
            ))}
            
            {loading && (
              <div className="chat-bubble bot" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                <span style={{ fontSize: '1.25rem', animation: 'bounce 1s infinite' }}>🤖</span>
                <span style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.8rem' }}>PharmaBot is thinking...</span>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Text Input area */}
          <form onSubmit={handleSendMessage} className="chat-input-area">
            <input
              type="text"
              className="form-input"
              style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.875rem' }}
              placeholder="Ask me: 'What needs reordering?'"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={loading}
            />
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ padding: '0.5rem', borderRadius: '8px' }}
              disabled={loading || !inputText.trim()}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
