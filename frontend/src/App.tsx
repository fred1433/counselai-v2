import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';
import { MOCK_CONTRACT_HTML } from './mockContract';
import { API_URL } from './config';

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
  const [editMode, setEditMode] = useState(false);
  const [showModificationChat, setShowModificationChat] = useState(false);
  const [modificationMessages, setModificationMessages] = useState<Message[]>([]);
  const [modificationInput, setModificationInput] = useState('');
  // Removed unused state - was for generation progress
  const [showSettings, setShowSettings] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('counselai_model') || 'gemini-2.5-pro';
  });
  const contractRef = useRef<HTMLDivElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);

  // Fait défiler la fenêtre de chat vers le bas
  useEffect(() => {
    chatWindowRef.current?.scrollTo({ top: chatWindowRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Charger le contrat sauvegardé au démarrage
  useEffect(() => {
    const savedContract = localStorage.getItem('counselai_contract');
    const savedTimestamp = localStorage.getItem('counselai_contract_timestamp');
    
    if (savedContract && savedTimestamp) {
      const timestamp = new Date(savedTimestamp);
      const now = new Date();
      const hoursSince = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
      
      // Si le contrat a moins de 24h, proposer de le restaurer
      if (hoursSince < 24) {
        const restore = window.confirm(
          `A contract was saved ${Math.round(hoursSince)} hours ago. Would you like to restore it?`
        );
        if (restore) {
          setContractHtml(savedContract);
          setShowContract(true);
        }
      }
    }
  }, []);

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
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: userMessage.text, 
          history: historyForApi,
          model_name: selectedModel 
        }),
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
        
        // Détection du tool call (ancienne méthode)
        if (fullResponseText.startsWith("TOOL_CALL:")) {
          done = true; // On arrête de lire le stream
          const toolName = fullResponseText.split(':')[1];
          
          // Supprimer le message temporaire de l'assistant et déclencher directement la génération
          setMessages(prev => prev.filter(msg => msg.id !== aiMessageId));
          
          // Déclencher la génération du contrat
          if (toolName === 'lancer_cascade_generation') {
            await generateContract(historyForApi);
          }
        } 
        // Nouvelle détection simplifiée
        else if (fullResponseText.includes('{"action": "generate_document"}') || fullResponseText.includes('{"action": "generate_contract"}')) {
          done = true;
          setMessages(prev => prev.filter(msg => msg.id !== aiMessageId));
          await generateContract(historyForApi);
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
      const response = await fetch(`${API_URL}/api/generate_lawyer_response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          history: historyForApi,
          model_name: selectedModel 
        }),
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
    console.log("📝 History length:", history.length);
    
    // Message initial avec progression
    const statusMessageId = Date.now() + 100;
    let progressText = '📝 **Step 1/2**: Generating legal content...\n\n⏳ Analyzing and drafting...';
    
    setMessages(prev => [...prev, {
      id: statusMessageId,
      sender: 'ai',
      text: progressText
    }]);
    
    // Déclaration des timers
    let timer1: ReturnType<typeof setTimeout>;
    let timer2: ReturnType<typeof setTimeout>;
    
    // Updates intermédiaires pour montrer l'activité
    timer1 = setTimeout(() => {
      progressText = '📝 **Step 1/2**: Generating legal content...\n\n⏳ Structuring clauses and legal terms...';
      setMessages(prev => prev.map(msg => 
        msg.id === statusMessageId 
        ? { ...msg, text: progressText }
        : msg
      ));
    }, 15000);
    
    timer2 = setTimeout(() => {
      progressText = '📝 **Step 1/2**: Generating legal content...\n\n⏳ Finalizing content and verifications...';
      setMessages(prev => prev.map(msg => 
        msg.id === statusMessageId 
        ? { ...msg, text: progressText }
        : msg
      ));
    }, 30000);
    
    // Passage à l'étape 2 après 40 secondes
    const progressTimer = setTimeout(() => {
      progressText = '📝 ~~Step 1/2: Generating legal content...~~ ✓\n\n🎨 **Step 2/2**: Professional formatting...\n\n⏳ Applying HTML formatting and styles...';
      setMessages(prev => prev.map(msg => 
        msg.id === statusMessageId 
          ? { ...msg, text: progressText }
          : msg
      ));
    }, 40000);
    
    try {
      const response = await fetch(`${API_URL}/api/generate_contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          history,
          model_name: selectedModel 
        }),
      });

      if (!response.ok) {
        throw new Error("Error generating contract");
      }

      const data = await response.json();
      
      if (data.status === 'success') {
        clearTimeout(progressTimer);
        clearTimeout(timer1);
        clearTimeout(timer2);
        // Afficher uniquement le contrat
        setContractHtml(data.contract_html);
        setShowContract(true);
        
      } else {
        throw new Error("Generation failed");
      }
      
    } catch (error) {
      console.error("Error generating contract:", error);
      clearTimeout(progressTimer);
      clearTimeout(timer1);
      clearTimeout(timer2);
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

  const toggleEditMode = () => {
    if (contractRef.current) {
      const newEditMode = !editMode;
      setEditMode(newEditMode);
      
      // Make the entire contract container editable
      contractRef.current.contentEditable = newEditMode ? 'true' : 'false';
      
      if (!newEditMode) {
        // Save the edited HTML
        const updatedHtml = contractRef.current.innerHTML;
        setContractHtml(updatedHtml);
        // Save to localStorage
        localStorage.setItem('counselai_contract', updatedHtml);
        localStorage.setItem('counselai_contract_timestamp', new Date().toISOString());
      }
    }
  };

  // Gestionnaire pour le copier-coller - DOIT être avant tous les returns
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      
      const range = selection.getRangeAt(0);
      const container = document.createElement('div');
      container.appendChild(range.cloneContents());
      
      // Parcourir tous les messages sélectionnés
      const messages = container.querySelectorAll('.message');
      let formattedText = '';
      
      messages.forEach((msg) => {
        const isUser = msg.classList.contains('user');
        const role = isUser ? 'User: ' : 'Assistant: ';
        const text = msg.textContent || '';
        formattedText += role + text + '\n\n';
      });
      
      if (formattedText) {
        e.clipboardData?.setData('text/plain', formattedText);
        e.preventDefault();
      }
    };
    
    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  }, []);

  const handleModificationSubmit = async () => {
    if (!modificationInput.trim() || isLoading) return;
    
    const userMessage: Message = { 
      id: Date.now(), 
      sender: 'user', 
      text: modificationInput 
    };
    setModificationMessages(prev => [...prev, userMessage]);
    setModificationInput('');
    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/api/modify_contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          current_html: contractRef.current?.innerHTML || contractHtml,
          modification_request: modificationInput,
          history: modificationMessages
        }),
      });
      
      const data = await response.json();
      
      const aiMessage: Message = {
        id: Date.now() + 1,
        sender: 'ai',
        text: data.response
      };
      setModificationMessages(prev => [...prev, aiMessage]);
      
      if (data.modified_html) {
        // Appliquer les modifications au document
        setContractHtml(data.modified_html);
        // Si en mode édition, mettre à jour le ref aussi
        if (contractRef.current) {
          contractRef.current.innerHTML = data.modified_html;
        }
        // Sauvegarder automatiquement
        localStorage.setItem('counselai_contract', data.modified_html);
        localStorage.setItem('counselai_contract_timestamp', new Date().toISOString());
      }
    } catch (error) {
      console.error("Error modifying contract:", error);
      const errorMessage: Message = {
        id: Date.now() + 1,
        sender: 'ai',
        text: "Sorry, an error occurred during modification."
      };
      setModificationMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  if (showContract) {
    return (
      <div className="contract-display-container">
        <div className="contract-controls">
          <button className="back-to-chat" onClick={() => setShowContract(false)}>
            ← Back to chat
          </button>
          <button className="edit-button" onClick={toggleEditMode}>
            {editMode ? '💾 Save' : '✏️ Edit'}
          </button>
        </div>
        
        {editMode && (
          <div className="edit-mode-banner">
            Edit mode activated - Click any text to modify
          </div>
        )}
        
        <div 
          ref={contractRef}
          className={`contract-html-content ${editMode ? 'edit-mode' : ''}`}
          dangerouslySetInnerHTML={{ __html: contractHtml }}
        />
        
        <button 
          className="modification-chat-button"
          onClick={() => setShowModificationChat(!showModificationChat)}
        >
          💬
        </button>
        
        {showModificationChat && (
          <div className="modification-chat-panel">
            <div className="modification-chat-header">
              <h3>Contract Modifications</h3>
              <button onClick={() => setShowModificationChat(false)}>✕</button>
            </div>
            <div className="modification-chat-messages">
              {modificationMessages.length === 0 && (
                <p className="modification-chat-welcome">
                  How can I help you modify this contract?
                </p>
              )}
              {modificationMessages.map((msg) => (
                <div key={msg.id} className={`message ${msg.sender}`}>
                  {msg.sender === 'ai' ? (
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  ) : (
                    <p>{msg.text}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="modification-chat-input">
              <textarea
                value={modificationInput}
                onChange={(e) => setModificationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
                    e.preventDefault();
                    handleModificationSubmit();
                  }
                }}
                placeholder="Describe the modification..."
                disabled={isLoading}
                rows={1}
              />
              <button onClick={handleModificationSubmit} disabled={isLoading}>
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <h1>CounselAI</h1>
        {import.meta.env.DEV && (
          <button 
            onClick={() => setShowSettings(!showSettings)}
            style={{
              position: 'absolute',
              right: '20px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: '1px solid white',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            ⚙️ Model: {selectedModel.split('-').slice(-1)[0]}
          </button>
        )}
      </header>
      
      {process.env.NODE_ENV === 'development' && showSettings && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '20px',
          background: 'white',
          border: '2px solid #000',
          borderRadius: '10px',
          padding: '20px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          zIndex: 1000,
          minWidth: '300px'
        }}>
          <h3 style={{ margin: '0 0 15px 0' }}>Select Gemini Model</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                value="gemini-2.5-pro"
                checked={selectedModel === 'gemini-2.5-pro'}
                onChange={(e) => {
                  setSelectedModel(e.target.value);
                  localStorage.setItem('counselai_model', e.target.value);
                }}
                style={{ marginRight: '10px' }}
              />
              <div>
                <strong>Gemini 2.5 Pro</strong>
                <div style={{ fontSize: '0.85rem', color: '#666' }}>Most powerful, for complex documents</div>
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                value="gemini-2.5-flash"
                checked={selectedModel === 'gemini-2.5-flash'}
                onChange={(e) => {
                  setSelectedModel(e.target.value);
                  localStorage.setItem('counselai_model', e.target.value);
                }}
                style={{ marginRight: '10px' }}
              />
              <div>
                <strong>Gemini 2.5 Flash</strong>
                <div style={{ fontSize: '0.85rem', color: '#666' }}>Fast and efficient</div>
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                value="gemini-2.5-flash-lite-preview-06-17"
                checked={selectedModel === 'gemini-2.5-flash-lite-preview-06-17'}
                onChange={(e) => {
                  setSelectedModel(e.target.value);
                  localStorage.setItem('counselai_model', e.target.value);
                }}
                style={{ marginRight: '10px' }}
              />
              <div>
                <strong>Gemini 2.5 Flash Lite</strong>
                <div style={{ fontSize: '0.85rem', color: '#666' }}>Ultra fast, for testing</div>
              </div>
            </label>
          </div>
          <button
            onClick={() => setShowSettings(false)}
            style={{
              marginTop: '15px',
              width: '100%',
              padding: '10px',
              backgroundColor: '#000',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      )}
      <div className="chat-window" ref={chatWindowRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.sender} ${msg.className || ''}`}>
            <ReactMarkdown>{msg.text}</ReactMarkdown>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.sender === 'user' && (
          <div className="message ai">
            <p>...</p>
          </div>
        )}
      </div>
      {/* Dev button to load mock contract */}
      {import.meta.env.DEV && (
        <button 
          onClick={() => {
            setContractHtml(MOCK_CONTRACT_HTML);
            setShowContract(true);
          }}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '10px 20px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            zIndex: 1000
          }}
        >
          🧪 Load Mock Contract
        </button>
      )}
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
