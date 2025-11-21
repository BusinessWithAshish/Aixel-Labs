"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useConfiguration } from "../_contexts";
import { CheckCircle, AlertCircle, Eye, EyeOff, Cloud, Server, Settings } from "lucide-react";

export const ConfigurationForm = () => {
  const { config, setUseAWS, setAWSConfig, setBackendUrl, validateConfig } = useConfiguration();
  const [showAccessKey, setShowAccessKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const handleValidate = async () => {
    setIsValidating(true);
    setTimeout(() => {
      validateConfig();
      setIsValidating(false);
    }, 300);
  };

  const hasRequiredFields = config.useAWS
    ? config.awsConfig.accessKeyId && config.awsConfig.secretAccessKey && config.awsConfig.region && config.awsConfig.instanceId
    : config.backendUrl;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Configuration Setup
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* AWS Toggle */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <Cloud className="w-5 h-5 text-blue-500" />
            <div>
              <Label htmlFor="aws-toggle" className="text-base font-medium">
                Use AWS EC2 Management
              </Label>
              <p className="text-sm text-gray-600">
                Automatically manage EC2 instance
              </p>
            </div>
          </div>
          <Switch
            id="aws-toggle"
            checked={config.useAWS}
            onCheckedChange={setUseAWS}
          />
        </div>

        {/* Configuration Form */}
        {config.useAWS ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Cloud className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">AWS Configuration</span>
            </div>

            {/* AWS Access Key ID */}
            <div className="space-y-2">
              <Label htmlFor="access-key">AWS Access Key ID</Label>
              <div className="relative">
                <Input
                  id="access-key"
                  type={showAccessKey ? "text" : "password"}
                  value={config.awsConfig.accessKeyId}
                  onChange={(e) => setAWSConfig({ accessKeyId: e.target.value })}
                  placeholder="Enter AWS Access Key ID"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowAccessKey(!showAccessKey)}
                >
                  {showAccessKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* AWS Secret Access Key */}
            <div className="space-y-2">
              <Label htmlFor="secret-key">AWS Secret Access Key</Label>
              <div className="relative">
                <Input
                  id="secret-key"
                  type={showSecretKey ? "text" : "password"}
                  value={config.awsConfig.secretAccessKey}
                  onChange={(e) => setAWSConfig({ secretAccessKey: e.target.value })}
                  placeholder="Enter AWS Secret Access Key"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                >
                  {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* AWS Region */}
            <div className="space-y-2">
              <Label htmlFor="region">AWS Region</Label>
              <Input
                id="region"
                type="text"
                value={config.awsConfig.region}
                onChange={(e) => setAWSConfig({ region: e.target.value })}
                placeholder="e.g., us-east-1"
              />
            </div>

            {/* AWS Instance ID */}
            <div className="space-y-2">
              <Label htmlFor="instance-id">AWS Instance ID</Label>
              <Input
                id="instance-id"
                type="text"
                value={config.awsConfig.instanceId}
                onChange={(e) => setAWSConfig({ instanceId: e.target.value })}
                placeholder="e.g., i-1234567890abcdef0"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Server className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">Backend Configuration</span>
            </div>

            {/* Backend URL */}
            <div className="space-y-2">
              <Label htmlFor="backend-url">Backend URL</Label>
              <Input
                id="backend-url"
                type="url"
                value={config.backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="http://localhost:8100 or http://your-server:8100"
              />
            </div>
          </div>
        )}

        {/* Validation Button */}
        <Button
          onClick={handleValidate}
          className="w-full"
          disabled={!hasRequiredFields || isValidating}
        >
          {isValidating ? "Validating..." : "Validate Configuration"}
        </Button>

        {/* Validation Status */}
        {config.isConfigValid ? (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Configuration is valid and ready to use
            </AlertDescription>
          </Alert>
        ) : config.validationError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {config.validationError}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
};