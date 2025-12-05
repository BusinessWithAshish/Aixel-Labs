"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useConfiguration } from "../_contexts";
import { CheckCircle, AlertCircle, Server, Settings } from "lucide-react";

export const ConfigurationForm = () => {
  const { config, setBackendUrl, validateConfig } = useConfiguration();
  const [isValidating, setIsValidating] = useState(false);

  const handleValidate = async () => {
    setIsValidating(true);
    setTimeout(() => {
      validateConfig();
      setIsValidating(false);
    }, 300);
  };

  const hasRequiredFields = config.backendUrl;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Configuration Setup
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">Backend Configuration</span>
          </div>

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

        <Button
          onClick={handleValidate}
          className="w-full"
          disabled={!hasRequiredFields || isValidating}
        >
          {isValidating ? "Validating..." : "Validate Configuration"}
        </Button>

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