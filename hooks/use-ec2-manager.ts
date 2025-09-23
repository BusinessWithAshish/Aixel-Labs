"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { EC2Manager, EC2ManagerState, EC2Phase, createEC2Manager } from '@/lib/aws-ec2-manager';

export type UseEC2ManagerReturn = {
  state: EC2ManagerState;
  startInstance: () => Promise<void>;
  stopInstance: () => Promise<void>;
  reset: () => void;
  isReadyForApiCalls: () => boolean;
  getPublicIp: () => string | null;
};

export const useEC2Manager = (): UseEC2ManagerReturn => {
  const [state, setState] = useState<EC2ManagerState>({
    isLoading: false,
    currentPhase: EC2Phase.IDLE,
    message: '',
    progress: 0,
  });

  const ec2ManagerRef = useRef<EC2Manager | null>(null);

  // Initialize EC2 manager
  useEffect(() => {
    if (!ec2ManagerRef.current) {
      ec2ManagerRef.current = createEC2Manager();
      
      // Subscribe to state changes
      const unsubscribe = ec2ManagerRef.current.onStateChange((newState) => {
        setState(newState);
      });

      return unsubscribe;
    }
  }, []);

  const startInstance = useCallback(async (): Promise<void> => {
    if (!ec2ManagerRef.current) {
      throw new Error('EC2 manager not initialized');
    }

    try {
      await ec2ManagerRef.current.startInstance();
      await ec2ManagerRef.current.executeStartupCommands();
    } catch (error) {
      console.error('Failed to start instance:', error);
      throw error;
    }
  }, []);

  const stopInstance = useCallback(async (): Promise<void> => {
    if (!ec2ManagerRef.current) {
      throw new Error('EC2 manager not initialized');
    }

    await ec2ManagerRef.current.stopInstance();
  }, []);

  const reset = useCallback((): void => {
    if (ec2ManagerRef.current) {
      ec2ManagerRef.current.reset();
    }
  }, []);

  const isReadyForApiCalls = useCallback((): boolean => {
    return ec2ManagerRef.current?.isReadyForApiCalls() || false;
  }, []);

  const getPublicIp = useCallback((): string | null => {
    return ec2ManagerRef.current?.getPublicIp() || null;
  }, []);

  return {
    state,
    startInstance,
    stopInstance,
    reset,
    isReadyForApiCalls,
    getPublicIp,
  };
};
