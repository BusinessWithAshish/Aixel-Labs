"use client";

import { useState, useCallback, useEffect } from "react";

export type ConnectionConfig = {
  useLocalDev: boolean;
  useAWS: boolean;
  beUrl: string;
  isConfigValid: boolean;
  validationError?: string;
};

export type UseConnectionConfigReturn = {
  config: ConnectionConfig;
  setUseLocalDev: (useLocalDev: boolean) => void;
  setUseAWS: (useAWS: boolean) => void;
  setBeUrl: (beUrl: string) => void;
  validateConfig: () => boolean;
  resetConfig: () => void;
};

const REQUIRED_AWS_ENV_VARS = [
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_EC2_INSTANCE_ID',
  'AWS_EC2_AMI_ID',
  'AWS_EC2_INSTANCE_TYPE',
  'AWS_EC2_KEY_NAME',
  'AWS_EC2_SECURITY_GROUP_IDS',
  'AWS_EC2_SUBNET_ID'
];

const validateAWSEnvironment = (): { isValid: boolean; missingVars: string[] } => {
  const missingVars: string[] = [];
  
  REQUIRED_AWS_ENV_VARS.forEach(varName => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });
  
  return {
    isValid: missingVars.length === 0,
    missingVars
  };
};

const validateBeUrl = (url: string, allowLocalhost: boolean = false): boolean => {
  if (!url.trim()) return false;
  
  try {
    const urlObj = new URL(url);
    
    // Check protocol
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return false;
    }
    
    // Check for localhost/127.0.0.1 if not allowed
    if (!allowLocalhost) {
      const hostname = urlObj.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
};

const initialConfig: ConnectionConfig = {
  useLocalDev: false,
  useAWS: false,
  beUrl: process.env.NEXT_PUBLIC_AIXELLABS_BE_URL || 'http://localhost:8100',
  isConfigValid: false,
};

export const useConnectionConfig = (): UseConnectionConfigReturn => {
  const [config, setConfig] = useState<ConnectionConfig>(initialConfig);

  const validateConfig = useCallback((): boolean => {
    // Local development mode - always valid
    if (config.useLocalDev) {
      setConfig(prev => ({
        ...prev,
        isConfigValid: true,
        validationError: undefined
      }));
      return true;
    }

    // Production mode - validate based on connection type
    if (config.useAWS) {
      const awsValidation = validateAWSEnvironment();
      if (!awsValidation.isValid) {
        setConfig(prev => ({
          ...prev,
          isConfigValid: false,
          validationError: `Missing AWS environment variables: ${awsValidation.missingVars.join(', ')}`
        }));
        return false;
      }
    } else {
      if (!validateBeUrl(config.beUrl, false)) {
        setConfig(prev => ({
          ...prev,
          isConfigValid: false,
          validationError: 'Please enter a valid BE URL (e.g., http://your-server:8100). Localhost URLs are not allowed when local development is disabled.'
        }));
        return false;
      }
    }

    setConfig(prev => ({
      ...prev,
      isConfigValid: true,
      validationError: undefined
    }));
    return true;
  }, [config.useLocalDev, config.useAWS, config.beUrl]);

  const setUseLocalDev = useCallback((useLocalDev: boolean) => {
    setConfig(prev => ({
      ...prev,
      useLocalDev,
      // Reset to default values when switching to local dev
      beUrl: useLocalDev ? 'http://localhost:8100' : prev.beUrl,
      useAWS: useLocalDev ? false : prev.useAWS,
      isConfigValid: false,
      validationError: undefined
    }));
  }, []);

  const setUseAWS = useCallback((useAWS: boolean) => {
    setConfig(prev => ({
      ...prev,
      useAWS,
      isConfigValid: false, // Reset validation when switching modes
      validationError: undefined
    }));
  }, []);

  const setBeUrl = useCallback((beUrl: string) => {
    setConfig(prev => ({
      ...prev,
      beUrl,
      isConfigValid: false, // Reset validation when URL changes
      validationError: undefined
    }));
  }, []);

  const resetConfig = useCallback(() => {
    setConfig(initialConfig);
  }, []);

  // Auto-validate when config changes
  useEffect(() => {
    validateConfig();
  }, [validateConfig]);

  return {
    config,
    setUseLocalDev,
    setUseAWS,
    setBeUrl,
    validateConfig,
    resetConfig,
  };
};
