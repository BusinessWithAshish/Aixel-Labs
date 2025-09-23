"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useConnectionConfig } from "../_hooks/useConnectionConfig";
import { CheckCircle, AlertCircle, Server, Cloud } from "lucide-react";

export const ConnectionConfig = () => {
  const { config, setUseLocalDev, setUseAWS, setBeUrl } = useConnectionConfig();

  const getStatusIcon = () => {
    if (config.isConfigValid) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
    return <AlertCircle className="w-4 h-4 text-red-500" />;
  };

  const getStatusBadge = () => {
    if (config.isConfigValid) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Ready</Badge>;
    }
    return <Badge variant="destructive">Configuration Error</Badge>;
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="w-5 h-5" />
            Connection Configuration
          </CardTitle>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            {getStatusBadge()}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Local Development Toggle */}
        <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50 border-green-200">
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-green-500" />
            <div>
              <Label htmlFor="local-dev-toggle" className="text-base font-medium">
                Use Local Development
              </Label>
              <p className="text-sm text-gray-600">
                Connect to localhost backend
              </p>
            </div>
          </div>
          <Switch
            id="local-dev-toggle"
            checked={config.useLocalDev}
            onCheckedChange={setUseLocalDev}
          />
        </div>

        {/* Configuration Options */}
        {!config.useLocalDev && (
          <>
            {/* AWS Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Cloud className="w-5 h-5 text-blue-500" />
                <div>
                  <Label htmlFor="aws-toggle" className="text-base font-medium">
                    Use AWS EC2 Management
                  </Label>
                  <p className="text-sm text-gray-600">
                    Automatically start/stop EC2 instances and manage backend
                  </p>
                </div>
              </div>
              <Switch
                id="aws-toggle"
                checked={config.useAWS}
                onCheckedChange={setUseAWS}
              />
            </div>
          </>
        )}

        {/* Configuration Input */}
        {config.useLocalDev ? (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">Local Development Mode</span>
            </div>
            <p className="text-sm text-green-700">
              Connected to localhost backend.
            </p>
            <p className="text-xs text-green-600 mt-2">
              URL: {config.beUrl}
            </p>
          </div>
        ) : config.useAWS ? (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Cloud className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">AWS Mode</span>
            </div>
            <p className="text-sm text-blue-700">
              Using AWS EC2 management. The system will automatically start your EC2 instance, 
              execute startup commands, and make API calls to the instance.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-gray-600" />
              <Label htmlFor="be-url" className="text-sm font-medium">
                Backend URL
              </Label>
            </div>
            <Input
              id="be-url"
              type="url"
              placeholder="http://your-server:8100"
              value={config.beUrl}
              onChange={(e) => setBeUrl(e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-gray-600">
              Enter the full URL of your backend server (e.g., http://54.123.45.67:8100). 
              Localhost URLs are not allowed when local development is disabled.
            </p>
          </div>
        )}

        {/* Validation Error */}
        {config.validationError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {config.validationError}
            </AlertDescription>
          </Alert>
        )}

        {/* Configuration Summary */}
        {config.isConfigValid && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">
                Configuration Valid
              </span>
            </div>
            <p className="text-sm text-green-700 mt-1">
              {config.useLocalDev 
                ? "Local development mode is active and ready to use."
                : config.useAWS 
                  ? "AWS EC2 management is configured and ready to use."
                  : `Backend URL configured: ${config.beUrl}`
              }
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
