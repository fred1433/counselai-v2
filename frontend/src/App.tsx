import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';
import { MOCK_CONTRACT_HTML } from './mockContract';
import { API_URL } from './config';
import { useDocumentVersions } from './useDocumentVersions';

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
  const [showContract, setShowContract] = useState(() => {
    // Restaurer l'état de navigation
    return localStorage.getItem('counselai_current_view') === 'contract';
  });
  
  // Initialize version system with saved contract or empty string
  const savedContract = localStorage.getItem('counselai_contract') || '';
  const {
    currentVersion: contractHtml,
    canUndo,
    canRedo,
    versionCount,
    undo,
    redo,
    saveVersion
  } = useDocumentVersions(savedContract);
  
  const [editMode, setEditMode] = useState(false);
  const [showModificationChat, setShowModificationChat] = useState(false);
  const [modificationMessages, setModificationMessages] = useState<Message[]>([]);
  const [modificationInput, setModificationInput] = useState('');
  // Removed unused state - was for generation progress
  const [showSettings, setShowSettings] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => {
    // En production, vérifier d'abord le paramètre URL
    if (!import.meta.env.DEV) {
      const urlParams = new URLSearchParams(window.location.search);
      const modelParam = urlParams.get('model');
      if (modelParam === 'flash-lite') {
        return 'gemini-2.5-flash-lite-preview-06-17';
      }
      return 'gemini-2.5-pro';
    }
    return localStorage.getItem('counselai_model') || 'gemini-2.5-pro';
  });
  const contractRef = useRef<HTMLDivElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);

  // Fait défiler la fenêtre de chat vers le bas
  useEffect(() => {
    chatWindowRef.current?.scrollTo({ top: chatWindowRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Sauvegarder l'état de navigation
  useEffect(() => {
    localStorage.setItem('counselai_current_view', showContract ? 'contract' : 'chat');
  }, [showContract]);

  // No longer needed - version system handles contract restoration

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
      progressText = '📝 Step 1/2: Generating legal content... ✓\n\n🎨 **Step 2/2**: Professional formatting...\n\n⏳ Applying HTML formatting and styles...';
      setMessages(prev => prev.map(msg => 
        msg.id === statusMessageId 
          ? { ...msg, text: progressText }
          : msg
      ));
    }, 40000);
    
    try {
      // Create AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 300 seconds (5 minutes) timeout for contract generation
      
      const response = await fetch(`${API_URL}/api/generate_contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          history,
          model_name: selectedModel 
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error("Error generating contract");
      }

      const data = await response.json();
      
      if (data.status === 'success') {
        clearTimeout(progressTimer);
        clearTimeout(timer1);
        clearTimeout(timer2);
        // Save the initial contract as a version
        saveVersion(data.contract_html, 'initial', 'Initial contract generation');
        setShowContract(true);
        
      } else {
        throw new Error("Generation failed");
      }
      
    } catch (error: any) {
      console.error("Error generating contract:", error);
      clearTimeout(progressTimer);
      clearTimeout(timer1);
      clearTimeout(timer2);
      
      let errorMessage = '❌ Error generating contract';
      if (error.name === 'AbortError') {
        errorMessage = '❌ Contract generation timed out. The request took too long. Please try again or simplify your requirements.';
      } else if (error.message) {
        errorMessage = `❌ Error: ${error.message}`;
      }
      
      setMessages(prev => prev.map(msg => 
        msg.id === statusMessageId 
          ? { ...msg, text: errorMessage }
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
        // Save the edited HTML as a new version
        const updatedHtml = contractRef.current.innerHTML;
        saveVersion(updatedHtml, 'manual', 'Manual edit');
        // Save to localStorage (version system also does this, but keep for compatibility)
        localStorage.setItem('counselai_contract', updatedHtml);
        localStorage.setItem('counselai_contract_timestamp', new Date().toISOString());
      }
    }
  };

  // Update contract ref when version changes (undo/redo)
  useEffect(() => {
    if (contractRef.current && contractHtml && !editMode) {
      contractRef.current.innerHTML = contractHtml;
    }
  }, [contractHtml, editMode]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when showing contract
      if (!showContract) return;
      
      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      }
      
      // Ctrl+Y or Cmd+Y for redo (or Ctrl+Shift+Z / Cmd+Shift+Z)
      if (((e.ctrlKey || e.metaKey) && e.key === 'y') || 
          ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        if (canRedo) redo();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showContract, canUndo, canRedo, undo, redo]);

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
      // Create AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 seconds timeout
      
      const response = await fetch(`${API_URL}/api/modify_contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          current_html: contractRef.current?.innerHTML || contractHtml,
          modification_request: userMessage.text,
          history: modificationMessages
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const data = await response.json();
      
      const aiMessage: Message = {
        id: Date.now() + 1,
        sender: 'ai',
        text: data.response
      };
      setModificationMessages(prev => [...prev, aiMessage]);
      
      if (data.modified_html) {
        console.log('🔄 Received modified HTML, updating document...');
        console.log('📄 HTML length:', data.modified_html.length);
        // Save as a new version with AI modification
        saveVersion(data.modified_html, 'ai', `AI modification: ${userMessage.text}`);
        // Si en mode édition, mettre à jour le ref aussi
        if (contractRef.current && !editMode) {
          contractRef.current.innerHTML = data.modified_html;
        }
        // Sauvegarder automatiquement
        localStorage.setItem('counselai_contract', data.modified_html);
        localStorage.setItem('counselai_contract_timestamp', new Date().toISOString());
      } else {
        console.log('⚠️ No modified HTML in response:', data);
      }
    } catch (error: any) {
      console.error("Error modifying contract:", error);
      let errorText = "Sorry, an error occurred during modification.";
      
      if (error.name === 'AbortError') {
        errorText = "The request took too long and was cancelled. Please try a simpler modification or break it down into smaller changes.";
      } else if (error.message) {
        errorText = `Error: ${error.message}`;
      }
      
      const errorMessage: Message = {
        id: Date.now() + 1,
        sender: 'ai',
        text: errorText
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
          <button className="back-to-chat" onClick={() => {
            if (window.confirm('Start a new document? This will reset the conversation.')) {
              setShowContract(false);
              setMessages([{ 
                id: 1, 
                sender: 'ai', 
                text: "For this new mandate, what is the primary strategic objective your client is seeking to achieve?" 
              }]);
              setInput('');
            }
          }}>
            ← New Document
          </button>
          <div className="edit-controls-group">
            {versionCount > 1 && (
              <>
                <button 
                  className="version-button"
                  onClick={undo}
                  disabled={!canUndo}
                  title="Undo (Ctrl+Z)"
                >
                  ↶
                </button>
                <button 
                  className="version-button"
                  onClick={redo}
                  disabled={!canRedo}
                  title="Redo (Ctrl+Y)"
                >
                  ↷
                </button>
              </>
            )}
            <button className="edit-button" onClick={toggleEditMode}>
              {editMode ? '💾 Save' : '✏️ Edit'}
            </button>
          </div>
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
          aria-label="Open modification chat"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM8 13.5C7.17 13.5 6.5 12.83 6.5 12C6.5 11.17 7.17 10.5 8 10.5C8.83 10.5 9.5 11.17 9.5 12C9.5 12.83 8.83 13.5 8 13.5ZM12 13.5C11.17 13.5 10.5 12.83 10.5 12C10.5 11.17 11.17 10.5 12 10.5C12.83 10.5 13.5 11.17 13.5 12C13.5 12.83 12.83 13.5 12 13.5ZM16 13.5C15.17 13.5 14.5 12.83 14.5 12C14.5 11.17 15.17 10.5 16 10.5C16.83 10.5 17.5 11.17 17.5 12C17.5 12.83 16.83 13.5 16 13.5Z" fill="currentColor"/>
          </svg>
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
      
      {import.meta.env.DEV && showSettings && (
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
            saveVersion(MOCK_CONTRACT_HTML, 'initial', 'Mock contract loaded');
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
