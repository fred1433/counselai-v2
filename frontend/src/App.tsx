import React, { useState, useEffect, useRef } from 'react';
import './App.css';

interface Message {
  id: number;
  sender: 'user' | 'ai';
  text: string;
}

interface GeminiHistoryEntry {
  role: string;
  parts: { text: string }[];
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1, // ID fixe pour le premier message
      sender: 'ai',
      text: "Bonjour. Pour ce nouveau mandat, quel est l'objectif stratégique principal que votre client cherche à atteindre ?"
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatWindowRef = useRef<HTMLDivElement>(null);

  // Fait défiler la fenêtre de chat vers le bas
  useEffect(() => {
    chatWindowRef.current?.scrollTo({ top: chatWindowRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { id: Date.now(), sender: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Prépare le message de l'IA qui sera rempli par le stream
    const aiMessageId = Date.now() + 1;
    const aiMessage: Message = { id: aiMessageId, sender: 'ai', text: '' };
    setMessages(prev => [...prev, aiMessage]);

    // Conversion de notre historique de messages au format attendu par Gemini
    const historyForApi: GeminiHistoryEntry[] = messages.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

    try {
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input, history: historyForApi }), // On envoie l'historique
      });

      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullResponseText = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        const chunk = decoder.decode(value, { stream: true });
        fullResponseText += chunk;
        
        // Détection du tool call
        if (fullResponseText.startsWith("TOOL_CALL:")) {
          done = true; // On arrête de lire le stream
          const toolName = fullResponseText.split(':')[1];
          setMessages(prev => prev.map(msg => 
            msg.id === aiMessageId ? { ...msg, text: `Lancement de la génération via l'outil : ${toolName}...` } : msg
          ));
        } else {
          setMessages(prev => prev.map(msg => 
            msg.id === aiMessageId ? { ...msg, text: fullResponseText } : msg
          ));
        }
      }
    } catch (error) {
      console.error("Erreur lors de la réception du stream:", error);
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId ? { ...msg, text: "Désolé, une erreur est survenue." } : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      sendMessage();
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>CounselAI</h1>
      </header>
      <div className="chat-window" ref={chatWindowRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.sender}`}>
            <p>{msg.text}</p>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.sender === 'user' && (
          <div className="message ai">
            <p>...</p>
          </div>
        )}
      </div>
      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Posez votre question..."
          disabled={isLoading}
        />
        <button onClick={sendMessage} disabled={isLoading}>
          Envoyer
        </button>
      </div>
    </div>
  );
}

export default App;
