import AWS from 'aws-sdk';

// Configure AWS SDK
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const ec2 = new AWS.EC2();
const ssm = new AWS.SSM();

export type EC2InstanceConfig = {
  instanceId: string;
  amiId: string;
  instanceType: string;
  keyName: string;
  securityGroupIds: string[];
  subnetId: string;
  userData?: string;
};

export type EC2Status = {
  instanceId: string;
  state: string;
  publicIp?: string;
  privateIp?: string;
  isReady: boolean;
};

export type EC2ManagerState = {
  isLoading: boolean;
  currentPhase: EC2Phase;
  message: string;
  progress: number;
  instanceStatus?: EC2Status;
  error?: string;
};

export enum EC2Phase {
  IDLE = 'idle',
  STARTING = 'starting',
  WAITING_FOR_READY = 'waiting_for_ready',
  EXECUTING_COMMANDS = 'executing_commands',
  READY = 'ready',
  ERROR = 'error',
}

export class EC2Manager {
  private config: EC2InstanceConfig;
  private state: EC2ManagerState;
  private stateListeners: ((state: EC2ManagerState) => void)[] = [];

  constructor(config: EC2InstanceConfig) {
    this.config = config;
    this.state = {
      isLoading: false,
      currentPhase: EC2Phase.IDLE,
      message: '',
      progress: 0,
    };
  }

  // Subscribe to state changes
  onStateChange(callback: (state: EC2ManagerState) => void): () => void {
    this.stateListeners.push(callback);
    return () => {
      const index = this.stateListeners.indexOf(callback);
      if (index > -1) {
        this.stateListeners.splice(index, 1);
      }
    };
  }

  private updateState(updates: Partial<EC2ManagerState>): void {
    this.state = { ...this.state, ...updates };
    this.stateListeners.forEach(listener => listener(this.state));
  }

  // Get current instance status
  async getInstanceStatus(): Promise<EC2Status | null> {
    try {
      const params = {
        InstanceIds: [this.config.instanceId],
      };

      const result = await ec2.describeInstances(params).promise();
      const reservation = result.Reservations?.[0];
      const instance = reservation?.Instances?.[0];

      if (!instance) {
        return null;
      }

      return {
        instanceId: instance.InstanceId!,
        state: instance.State?.Name || 'unknown',
        publicIp: instance.PublicIpAddress,
        privateIp: instance.PrivateIpAddress,
        isReady: instance.State?.Name === 'running' && 
                 instance.PublicIpAddress !== undefined &&
                 instance.PublicIpAddress !== null,
      };
    } catch (error) {
      console.error('Error getting instance status:', error);
      return null;
    }
  }

  // Start EC2 instance
  async startInstance(): Promise<void> {
    try {
      this.updateState({
        isLoading: true,
        currentPhase: EC2Phase.STARTING,
        message: 'Starting EC2 instance...',
        progress: 10,
        error: undefined,
      });

      const params = {
        InstanceIds: [this.config.instanceId],
      };

      await ec2.startInstances(params).promise();

      this.updateState({
        message: 'Instance starting, waiting for ready state...',
        currentPhase: EC2Phase.WAITING_FOR_READY,
        progress: 30,
      });

      // Wait for instance to be running
      await this.waitForInstanceReady();

    } catch (error) {
      this.updateState({
        isLoading: false,
        currentPhase: EC2Phase.ERROR,
        message: 'Failed to start instance',
        error: error instanceof Error ? error.message : 'Unknown error',
        progress: 0,
      });
      throw error;
    }
  }

  // Wait for instance to be ready
  private async waitForInstanceReady(): Promise<void> {
    const maxAttempts = 30; // 5 minutes max
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await this.getInstanceStatus();
      
      if (status?.isReady) {
        this.updateState({
          message: 'Instance is ready!',
          currentPhase: EC2Phase.READY,
          progress: 60,
          instanceStatus: status,
        });
        return;
      }

      if (status?.state === 'stopped' || status?.state === 'stopping') {
        throw new Error('Instance is in stopped state');
      }

      attempts++;
      this.updateState({
        message: `Waiting for instance to be ready... (${attempts}/${maxAttempts})`,
        progress: 30 + (attempts / maxAttempts) * 30,
      });

      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    }

    throw new Error('Instance did not become ready within timeout period');
  }

  // Execute commands on the instance
  async executeStartupCommands(): Promise<void> {
    try {
      const status = await this.getInstanceStatus();
      if (!status?.isReady) {
        throw new Error('Instance is not ready');
      }

      this.updateState({
        message: 'Executing startup commands...',
        currentPhase: EC2Phase.EXECUTING_COMMANDS,
        progress: 70,
      });

      // Execute pnpm run start command
      const command = 'cd /axiellabs-BE && pnpm run start';
      
      const params = {
        InstanceIds: [this.config.instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: [command],
        },
      };

      const result = await ssm.sendCommand(params).promise();
      const commandId = result.Command?.CommandId;

      if (!commandId) {
        throw new Error('Failed to execute command');
      }

      // Wait for command to complete
      await this.waitForCommandCompletion(commandId);

      this.updateState({
        message: 'Backend server is starting...',
        progress: 85,
      });

      // Wait a bit for the server to fully start
      await new Promise(resolve => setTimeout(resolve, 15000));

      this.updateState({
        message: 'Backend server is ready!',
        progress: 100,
        isLoading: false,
      });

    } catch (error) {
      this.updateState({
        isLoading: false,
        currentPhase: EC2Phase.ERROR,
        message: 'Failed to execute startup commands',
        error: error instanceof Error ? error.message : 'Unknown error',
        progress: 0,
      });
      throw error;
    }
  }

  // Wait for SSM command to complete
  private async waitForCommandCompletion(commandId: string): Promise<void> {
    const maxAttempts = 20; // 2 minutes max
    let attempts = 0;

    while (attempts < maxAttempts) {
      const params = {
        CommandId: commandId,
        InstanceId: this.config.instanceId,
      };

      const result = await ssm.getCommandInvocation(params).promise();
      
      if (result.Status === 'Success') {
        return;
      }

      if (result.Status === 'Failed' || result.Status === 'Cancelled') {
        throw new Error(`Command failed: ${result.StandardErrorContent}`);
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 6000)); // Wait 6 seconds
    }

    throw new Error('Command did not complete within timeout period');
  }

  // Stop EC2 instance
  async stopInstance(): Promise<void> {
    try {
      this.updateState({
        isLoading: true,
        message: 'Stopping EC2 instance...',
        progress: 0,
      });

      const params = {
        InstanceIds: [this.config.instanceId],
      };

      await ec2.stopInstances(params).promise();

      this.updateState({
        isLoading: false,
        message: 'Instance stopped',
        currentPhase: EC2Phase.IDLE,
        progress: 0,
        instanceStatus: undefined,
      });

    } catch (error) {
      this.updateState({
        isLoading: false,
        currentPhase: EC2Phase.ERROR,
        message: 'Failed to stop instance',
        error: error instanceof Error ? error.message : 'Unknown error',
        progress: 0,
      });
      throw error;
    }
  }

  // Get the public IP for API calls
  getPublicIp(): string | null {
    return this.state.instanceStatus?.publicIp || null;
  }

  // Check if instance is ready for API calls
  isReadyForApiCalls(): boolean {
    return this.state.currentPhase === EC2Phase.READY && 
           this.state.progress === 100 && 
           this.getPublicIp() !== null;
  }

  // Reset state
  reset(): void {
    this.updateState({
      isLoading: false,
      currentPhase: EC2Phase.IDLE,
      message: '',
      progress: 0,
      instanceStatus: undefined,
      error: undefined,
    });
  }
}

// Factory function to create EC2 manager with default config
export const createEC2Manager = (): EC2Manager => {
  const config: EC2InstanceConfig = {
    instanceId: process.env.AWS_EC2_INSTANCE_ID || '',
    amiId: process.env.AWS_EC2_AMI_ID || '',
    instanceType: process.env.AWS_EC2_INSTANCE_TYPE || 't3.micro',
    keyName: process.env.AWS_EC2_KEY_NAME || '',
    securityGroupIds: (process.env.AWS_EC2_SECURITY_GROUP_IDS || '').split(','),
    subnetId: process.env.AWS_EC2_SUBNET_ID || '',
    userData: process.env.AWS_EC2_USER_DATA,
  };

  return new EC2Manager(config);
};
