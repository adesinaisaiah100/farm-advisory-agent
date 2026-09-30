import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types.js';
import { sendChatMessage } from '../api.js';

interface ChatViewProps {
  readonly initialPhone?: string;
}

export function ChatView({ initialPhone = '+2348000000001' }: ChatViewProps) {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([
    {
      id: 'msg-0',
      sender: 'agent',
      text: 'Hello! Welcome to BirdVet. What signs or symptoms are you noticing in your poultry flock today?',
      timestamp: 'Just now'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'farmer',
      text,
      timestamp: 'Just now'
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const reply = await sendChatMessage(initialPhone, text);
      const agentMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'agent',
        text: reply,
        timestamp: 'Just now'
      };
      setMessages(prev => [...prev, agentMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'agent',
        text: 'Ehya, network slow small. Please tell me your birds flock size and how many days this sign don start.',
        timestamp: 'Just now'
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="tab-panel">
      <div className="page-header">
        <div className="page-title">
          <h1>Clinical Web Chat</h1>
          <p>Direct clinician consultation channel with BirdVet Poultry Advisory Core.</p>
        </div>
      </div>

      <div className="chat-sandbox-wrapper">
        <div className="chat-sandbox-messages">
          {messages.map(m => (
            <div key={m.id} className={`chat-msg ${m.sender}`}>
              <div className="chat-sender">
                {m.sender === 'farmer' ? 'You (Farmer / Clinician)' : 'BirdVet Clinical AI'}
              </div>
              <div>{m.text}</div>
            </div>
          ))}

          {isLoading && (
            <div className="chat-msg agent" style={{ opacity: 0.85 }}>
              <div className="chat-sender">BirdVet Clinical AI</div>
              <div style={{ fontStyle: 'italic', fontSize: '12px' }}>Consulting clinical knowledge base...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className="chat-sandbox-footer">
          <input
            type="text"
            className="chat-sandbox-input"
            placeholder="Type symptoms (e.g. 'My 500 layers have bloody droppings and ruffled feathers in Ibadan')..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            className="btn-send-chat"
            disabled={isLoading}
          >
            {isLoading ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      </div>
    </section>
  );
}
