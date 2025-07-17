import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';

interface Message {
  id: number;
  sender: 'user' | 'ai';
  text: string;
  className?: string;
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
      text: "For this new mandate, what is the primary strategic objective your client is seeking to achieve?"
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [contractHtml, setContractHtml] = useState('');
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
      const response = await fetch('http://localhost:8001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userMessage.text, history: historyForApi }), // On envoie l'historique
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
          
          // Supprimer le message temporaire de l'assistant et déclencher directement la génération
          setMessages(prev => prev.filter(msg => msg.id !== aiMessageId));
          
          // Déclencher la génération du contrat
          if (toolName === 'lancer_cascade_generation') {
            await generateContract(historyForApi);
          }
        } else {
          setMessages(prev => prev.map(msg => 
            msg.id === aiMessageId ? { ...msg, text: fullResponseText } : msg
          ));
        }
      }
    } catch (error) {
      console.error("Error receiving stream:", error);
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId ? { ...msg, text: "Sorry, an error occurred." } : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateResponse = async () => {
    if (isLoading) return;
    setIsLoading(true);

    const historyForApi: GeminiHistoryEntry[] = messages.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

    try {
      const response = await fetch('http://localhost:8001/api/generate_lawyer_response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: historyForApi }),
      });

      if (!response.ok) {
        throw new Error("La réponse du serveur n'est pas OK");
      }

      const data = await response.json();
      setInput(data.response); // Met à jour le champ de saisie avec la réponse

    } catch (error) {
      console.error("Error generating simulated response:", error);
      // Optionnel : afficher un message d'erreur à l'utilisateur
    } finally {
      setIsLoading(false);
    }
  };

  const generateContract = async (history: GeminiHistoryEntry[]) => {
    console.log("🚀 Triggering contract generation...");
    
    // Ajouter un message de statut professionnel
    const statusMessageId = Date.now() + 100;
    setMessages(prev => [...prev, {
      id: statusMessageId,
      sender: 'ai',
      text: '⚖️ Drafting your legal document...\n\nThis may take a moment as we ensure all terms are properly structured and legally sound.'
    }]);
    
    try {
      const response = await fetch('http://localhost:8001/api/generate_contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history }),
      });

      if (!response.ok) {
        throw new Error("Error generating contract");
      }

      const data = await response.json();
      
      if (data.status === 'success') {
        // Afficher uniquement le contrat
        setContractHtml(data.contract_html);
        setShowContract(true);
        
      } else {
        throw new Error("Generation failed");
      }
      
    } catch (error) {
      console.error("Error generating contract:", error);
      setMessages(prev => prev.map(msg => 
        msg.id === statusMessageId 
          ? { ...msg, text: '❌ Error generating contract' }
          : msg
      ));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
  };

  if (showContract) {
    return (
      <div className="contract-display-container">
        <button className="back-to-chat" onClick={() => setShowContract(false)}>
          ← Back to chat
        </button>
        <div 
          className="contract-html-content"
          dangerouslySetInnerHTML={{ __html: contractHtml }}
        />
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <h1>CounselAI</h1>
      </header>
      <div className="chat-window" ref={chatWindowRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.sender} ${msg.className || ''}`}>
            {msg.sender === 'ai' ? (
              <ReactMarkdown>{msg.text}</ReactMarkdown>
            ) : (
              <p>{msg.text}</p>
            )}
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.sender === 'user' && (
          <div className="message ai">
            <p>...</p>
          </div>
        )}
      </div>
      <div className="input-area">
        <div className="input-area-inner">
          <textarea
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyPress}
            placeholder="Type your response..."
            disabled={isLoading}
            rows={1}
          />
          <button onClick={handleGenerateResponse} disabled={isLoading} className="generate-btn">
            💡
          </button>
          <button onClick={sendMessage} disabled={isLoading}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
