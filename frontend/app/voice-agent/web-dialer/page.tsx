"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Device, Call } from "@twilio/voice-sdk";
import PageLayout from "@/components/common/PageLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialpad } from "./_components/Dialpad";
import { PhoneDisplay } from "./_components/PhoneDisplay";
import { CallActions } from "./_components/CallActions";
import { FUNCTIONS_URL } from "./_utils/constants";
import { getRawPhoneNumber } from "./_utils/formatters";

export default function WebDialerPage() {
  const [identity, setIdentity] = useState<string>("");
  const [status, setStatus] = useState<string>("offline");
  const [phoneNumber, setPhoneNumber] = useState<string>("");

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setStatus("fetching-token");
        const res = await axios.get(`${FUNCTIONS_URL}/token?identity=agent1`);
        const token = res.data.token || res.data.accessToken;
        const ident = res.data.identity || "agent1";

        if (!mounted) return;
        setIdentity(ident);

        const device = new Device(token);
        deviceRef.current = device;

        device.on("registered", () => setStatus("registered"));
        device.on("unregistered", () => setStatus("unregistered"));
        device.on("error", (err) =>
          setStatus("error: " + (err.message || JSON.stringify(err)))
        );

        device.on("tokenWillExpire", async () => {
          try {
            const r = await axios.get(
              `${FUNCTIONS_URL}/token?identity=${encodeURIComponent(ident)}`
            );
            const newToken = r.data.token || r.data.accessToken;
            device.updateToken(newToken);
          } catch (e) {
            console.error("token refresh failed", e);
          }
        });

        device.on("incoming", (call: Call) => {
          call.accept();
          callRef.current = call;
          setStatus("in-call");
          call.on("disconnect", () => setStatus("registered"));
        });

        await device.register();
      } catch (err) {
        console.error(err);
        setStatus("init-error");
      }
    }

    init();
    return () => {
      mounted = false;
      if (deviceRef.current) {
        deviceRef.current.destroy();
      }
    };
  }, []);

  const handleDialpadClick = (value: string) => {
    setPhoneNumber((prev) => prev + value);
  };

  const handleBackspace = () => {
    setPhoneNumber((prev) => prev.slice(0, -1));
  };

  const handlePhoneNumberChange = (value: string) => {
    // Allow only digits, +, -, (, ), and spaces
    const sanitized = value.replace(/[^\d+\-() ]/g, "");
    setPhoneNumber(sanitized);
  };

  async function makeCall() {
    if (!deviceRef.current) {
      setStatus("device-not-ready");
      return;
    }

    const rawNumber = getRawPhoneNumber(phoneNumber);
    if (!rawNumber) {
      return;
    }

    try {
      setStatus("calling");
      const call = await deviceRef.current.connect({
        params: { To: rawNumber },
      });
      callRef.current = call;
      setStatus("in-call");
      call.on("disconnect", () => setStatus("registered"));
    } catch (e) {
      console.error(e);
      setStatus("call-error");
    }
  }

  function hangup() {
    if (callRef.current) {
      callRef.current.disconnect();
    } else if (deviceRef.current) {
      deviceRef.current.disconnectAll();
    }
  }

  const isInCall = status === "in-call" || status === "calling";
  const isCallDisabled = status !== "registered" || !phoneNumber.trim();

  return (
    <PageLayout className="space-y-3" title="Web dialer">
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <Card className="w-full max-w-md mx-auto shadow-xl">
          <CardContent className="p-6 sm:p-8 space-y-6">
            {/* Status Badge */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {identity && `Identity: ${identity}`}
              </span>
              <Badge
                variant={
                  status === "registered"
                    ? "default"
                    : status === "in-call"
                      ? "default"
                      : "secondary"
                }
                className="capitalize"
              >
                {status.replace("-", " ")}
              </Badge>
            </div>

            {/* Phone Display */}
            <PhoneDisplay
              value={phoneNumber}
              onChange={handlePhoneNumberChange}
              onBackspace={handleBackspace}
            />

            {/* Dialpad */}
            <Dialpad onButtonClick={handleDialpadClick} />

            {/* Call Actions */}
            <CallActions
              onCall={makeCall}
              onHangup={hangup}
              isCallDisabled={isCallDisabled}
              isInCall={isInCall}
              className="pt-4"
            />
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
