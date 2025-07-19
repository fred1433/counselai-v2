import { useState, useCallback, useEffect } from 'react';

interface Version {
  id: string;
  html: string;
  timestamp: Date;
  source: 'manual' | 'ai' | 'initial';
  description?: string;
}

interface UseDocumentVersionsReturn {
  currentVersion: string;
  canUndo: boolean;
  canRedo: boolean;
  versionCount: number;
  currentVersionIndex: number;
  undo: () => void;
  redo: () => void;
  saveVersion: (html: string, source: 'manual' | 'ai' | 'initial', description?: string) => void;
  getVersionHistory: () => Version[];
}

const MAX_VERSIONS = 50; // Limite pour éviter trop de mémoire

export function useDocumentVersions(initialHtml: string = ''): UseDocumentVersionsReturn {
  const [versions, setVersions] = useState<Version[]>(() => {
    // Charger l'historique depuis localStorage
    const saved = localStorage.getItem('counselai_version_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((v: any) => ({
          ...v,
          timestamp: new Date(v.timestamp)
        }));
      } catch {
        // Si erreur, commencer avec une version vide
      }
    }
    
    // Version initiale
    return initialHtml ? [{
      id: Date.now().toString(),
      html: initialHtml,
      timestamp: new Date(),
      source: 'initial' as const
    }] : [];
  });
  
  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = localStorage.getItem('counselai_version_index');
    return saved ? parseInt(saved, 10) : versions.length - 1;
  });

  // Sauvegarder dans localStorage
  useEffect(() => {
    localStorage.setItem('counselai_version_history', JSON.stringify(versions));
    localStorage.setItem('counselai_version_index', currentIndex.toString());
  }, [versions, currentIndex]);

  const saveVersion = useCallback((html: string, source: 'manual' | 'ai' | 'initial', description?: string) => {
    // Ne pas sauvegarder si c'est identique à la version actuelle
    if (versions[currentIndex]?.html === html) return;

    const newVersion: Version = {
      id: Date.now().toString(),
      html,
      timestamp: new Date(),
      source,
      description
    };

    setVersions(prev => {
      // Si on n'est pas à la fin de l'historique, supprimer les versions futures
      const newVersions = prev.slice(0, currentIndex + 1);
      newVersions.push(newVersion);
      
      // Limiter le nombre de versions
      if (newVersions.length > MAX_VERSIONS) {
        const trimmedVersions = newVersions.slice(-MAX_VERSIONS);
        // Adjust index after trimming
        setCurrentIndex(trimmedVersions.length - 1);
        return trimmedVersions;
      }
      
      // Update index to point to the new version
      setCurrentIndex(newVersions.length - 1);
      return newVersions;
    });
  }, [currentIndex, versions]);

  const undo = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const redo = useCallback(() => {
    if (currentIndex < versions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, versions.length]);

  const getVersionHistory = useCallback(() => {
    return versions;
  }, [versions]);

  return {
    currentVersion: versions[currentIndex]?.html || '',
    canUndo: currentIndex > 0,
    canRedo: currentIndex < versions.length - 1,
    versionCount: versions.length,
    currentVersionIndex: currentIndex,
    undo,
    redo,
    saveVersion,
    getVersionHistory
  };
}