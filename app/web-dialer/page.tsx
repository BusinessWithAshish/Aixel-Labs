"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Device, Call } from "@twilio/voice-sdk";
import PageLayout from "@/components/common/PageLayout";
import {Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";

const FUNCTIONS_URL1 = "https://api-aixellabs-5684.twil.io";

export default function WebDialerPage() {
    const [identity, setIdentity] = useState<string>("");
    const [status, setStatus] = useState<string>("offline");
    const [to, setTo] = useState<string>("");

    const deviceRef = useRef<Device | null>(null);
    const callRef = useRef<Call | null>(null);

    useEffect(() => {
        let mounted = true;

        async function init() {
            try {
                setStatus("fetching-token");
                const res = await axios.get(`${FUNCTIONS_URL1}/token?identity=agent1`);
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
                            `${FUNCTIONS_URL1}/token?identity=${encodeURIComponent(ident)}`
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

    async function makeCall() {
        if (!deviceRef.current) {
            setStatus("device-not-ready");
            return;
        }
        try {
            setStatus("calling");
            const call = await deviceRef.current.connect({ params: { To: to } });
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

    return (
        <PageLayout title='Web dialer'>
            <Card>

                <CardHeader>
                    <CardTitle>Web dialer</CardTitle>
                    <CardDescription>Identity: {identity}</CardDescription>
                    <CardAction>
                        <Badge>{status}</Badge>
                    </CardAction>
                </CardHeader>

                <CardContent>
                    <Input
                        type="text"
                        placeholder="Enter phone number"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                    />
                </CardContent>

                <CardFooter className='w-full flex flex-wrap justify-between items-center gap-2'>
                    <Button
                        onClick={makeCall}
                        disabled={status !== "registered"}
                        className="flex-1 cursor-pointer rounded-lg bg-green-500 text-white font-medium"
                    >
                        Call
                    </Button>
                    <Button
                        onClick={hangup}
                        className="flex-1 cursor-pointer rounded-lg bg-red-500 text-white font-medium"
                    >
                        Hangup
                    </Button>
                </CardFooter>

            </Card>
        </PageLayout>
    );
}
