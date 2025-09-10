'use client';

import PageLayout from "@/components/common/PageLayout";
import {useState} from "react";
import axios from "axios";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card"
import {Input} from "@/components/ui/input"
import {Button} from "@/components/ui/button"
import {ScrollArea} from "@/components/ui/scroll-area"
import {Badge} from "@/components/ui/badge"
import {MessageType, TTwilioMessage} from "@/app/messaging/types";
import {TWILIO_FUNCTIONS_URL} from "@/app/messaging/constants";

export default function SMSPage() {

    const [smsTo, setSmsTo] = useState("")
    const [smsBody, setSmsBody] = useState("")
    const [logs, setLogs] = useState<TTwilioMessage[]>([])

    async function sendSMS() {
        if (!smsTo || !smsBody) return
        try {
            await axios.post(`${TWILIO_FUNCTIONS_URL}/send-sms`, {to: smsTo, body: smsBody})
            const newLog: TTwilioMessage = {
                sid: Date.now().toString(),
                from: process.env.TWILIO_NUMBER as string,
                to: smsTo,
                body: smsBody,
                dateCreated: new Date().toISOString(),
                direction: MessageType.OUTBOUND_API,
            }
            setLogs((prev) => [newLog, ...prev])
            setSmsBody("")
        } catch (err) {
            console.error("SMS send error", err)
        }
    }

    async function fetchLogs() {
        try {
            const res = await axios.get<TTwilioMessage[]>(`${TWILIO_FUNCTIONS_URL}/list-sms`)
            setLogs(res.data)
        } catch (err) {
            console.error("Fetch logs error", err)
        }
    }

    return (
        <PageLayout title='SMS'>
            <Card className='h-fit'>
                <CardHeader>
                    <CardTitle>📩 SMS Center</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                    {/* Form */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                            placeholder="Recipient number (+E.164)"
                            value={smsTo}
                            onChange={(e) => setSmsTo(e.target.value)}
                        />
                        <Input
                            placeholder="Message body..."
                            value={smsBody}
                            onChange={(e) => setSmsBody(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <Button onClick={sendSMS} disabled={!smsTo || !smsBody}>
                                Send SMS
                            </Button>
                            <Button variant="secondary" onClick={fetchLogs}>
                                Refresh Logs
                            </Button>
                        </div>
                    </div>

                    {/* Logs */}
                    {logs.length > 0 && (
                        <ScrollArea className="h-64 rounded p-2">
                            <div className="space-y-3">
                                {logs.map((log) => (
                                    <div
                                        key={log.sid}
                                        className="p-2 rounded-md border shadow-sm bg-white space-y-1"
                                    >
                                        <div className="flex justify-between text-xs text-gray-600">
                                            <Badge variant="secondary">{log.direction.toUpperCase()}</Badge>
                                            <span>{new Date(log.dateCreated).toLocaleString()}</span>
                                        </div>
                                        <div className="text-sm">
                                            <span className="font-medium">From:</span> {log.from} &nbsp;
                                            <span className="font-medium">To:</span> {log.to}
                                        </div>
                                        <p className="text-sm">{log.body}</p>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </CardContent>
            </Card>
        </PageLayout>
    )

}