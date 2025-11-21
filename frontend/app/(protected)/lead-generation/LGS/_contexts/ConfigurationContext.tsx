"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type AWSConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  instanceId: string;
};

type ConfigurationState = {
  useAWS: boolean;
  awsConfig: AWSConfig;
  backendUrl: string;
  isConfigValid: boolean;
  validationError?: string;
};

type ConfigurationContextType = {
  config: ConfigurationState;
  setUseAWS: (useAWS: boolean) => void;
  setAWSConfig: (config: Partial<AWSConfig>) => void;
  setBackendUrl: (url: string) => void;
  validateConfig: () => void;
  resetConfig: () => void;
};

const ConfigurationContext = createContext<ConfigurationContextType | undefined>(undefined);

const initialAWSConfig: AWSConfig = {
  accessKeyId: "",
  secretAccessKey: "",
  region: "",
  instanceId: "",
};

const initialConfig: ConfigurationState = {
  useAWS: false,
  awsConfig: initialAWSConfig,
  backendUrl: "",
  isConfigValid: false,
};

export const ConfigurationProvider = ({ children }: { children: ReactNode }) => {
  const [config, setConfig] = useState<ConfigurationState>(initialConfig);

  const setUseAWS = (useAWS: boolean) => {
    setConfig(prev => ({
      ...prev,
      useAWS,
      isConfigValid: false,
      validationError: undefined,
    }));
  };

  const setAWSConfig = (awsConfigUpdate: Partial<AWSConfig>) => {
    setConfig(prev => ({
      ...prev,
      awsConfig: { ...prev.awsConfig, ...awsConfigUpdate },
      isConfigValid: false,
      validationError: undefined,
    }));
  };

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

    if (config.useAWS) {
      const { accessKeyId, secretAccessKey, region, instanceId } = config.awsConfig;
      if (!accessKeyId.trim()) error = "AWS Access Key ID is required";
      else if (!secretAccessKey.trim()) error = "AWS Secret Access Key is required";
      else if (!region.trim()) error = "AWS Region is required";
      else if (!instanceId.trim()) error = "AWS Instance ID is required";
      else isValid = true;
    } else {
      if (!config.backendUrl.trim()) error = "Backend URL is required";
      else {
        try {
          new URL(config.backendUrl);
          isValid = true;
        } catch {
          error = "Please enter a valid URL";
        }
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
        setUseAWS,
        setAWSConfig,
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
