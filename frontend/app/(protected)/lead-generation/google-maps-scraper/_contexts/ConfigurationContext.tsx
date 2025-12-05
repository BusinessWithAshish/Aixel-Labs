"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type ConfigurationState = {
  backendUrl: string;
  isConfigValid: boolean;
  validationError?: string;
};

type ConfigurationContextType = {
  config: ConfigurationState;
  setBackendUrl: (url: string) => void;
  validateConfig: () => void;
  resetConfig: () => void;
};

const ConfigurationContext = createContext<ConfigurationContextType | undefined>(undefined);

const initialConfig: ConfigurationState = {
  backendUrl: "",
  isConfigValid: false,
};

export const ConfigurationProvider = ({ children }: { children: ReactNode }) => {
  const [config, setConfig] = useState<ConfigurationState>(initialConfig);

  const setBackendUrl = (backendUrl: string) => {
    setConfig(prev => ({
      ...prev,
      backendUrl,
      isConfigValid: false,
      validationError: undefined,
    }));
  };

  const validateConfig = () => {
    let isValid = false;
    let error: string | undefined;

    if (!config.backendUrl.trim()) {
      error = "Backend URL is required";
    } else {
      try {
        new URL(config.backendUrl);
        isValid = true;
      } catch {
        error = "Please enter a valid URL";
      }
    }

    setConfig(prev => ({
      ...prev,
      isConfigValid: isValid,
      validationError: error,
    }));
  };

  const resetConfig = () => {
    setConfig(initialConfig);
  };

  return (
    <ConfigurationContext.Provider
      value={{
        config,
        setBackendUrl,
        validateConfig,
        resetConfig,
      }}
    >
      {children}
    </ConfigurationContext.Provider>
  );
};

export const useConfiguration = () => {
  const context = useContext(ConfigurationContext);
  if (!context) {
    throw new Error("useConfiguration must be used within ConfigurationProvider");
  }
  return context;
};
