import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Device, Call } from "@twilio/voice-sdk";
import { FUNCTIONS_URL } from "../_utils/constants";
import { getRawPhoneNumber } from "../_utils/formatters";

/**
 * Return type for the useWebDialerPage hook
 */
export interface UseWebDialerPageReturn {
  // State
  identity: string;
  status: string;
  phoneNumber: string;
  isInCall: boolean;
  isCallDisabled: boolean;

  // Actions
  handleDialpadClick: (value: string) => void;
  handleBackspace: () => void;
  handlePhoneNumberChange: (value: string) => void;
  makeCall: () => Promise<void>;
  hangup: () => void;
}

/**
 * Custom hook that encapsulates all the business logic for the Web Dialer page
 * 
 * This hook manages:
 * - Twilio device initialization and registration
 * - Token management and refresh
 * - Call state management
 * - Phone number input handling
 * - Call actions (make call, hangup)
 * 
 * @returns {UseWebDialerPageReturn} All state and functions needed by the Web Dialer page
 */
export function useWebDialerPage(): UseWebDialerPageReturn {
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

  return {
    identity,
    status,
    phoneNumber,
    isInCall,
    isCallDisabled,
    handleDialpadClick,
    handleBackspace,
    handlePhoneNumberChange,
    makeCall,
    hangup,
  };
}
