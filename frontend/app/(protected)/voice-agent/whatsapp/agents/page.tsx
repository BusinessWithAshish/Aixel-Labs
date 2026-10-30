import { redirect } from 'next/navigation';
import { VOICE_AGENTS_URL } from '@/helpers/voice-routes';

/** WhatsApp agents are on Agents, filtered to the ones on a WhatsApp number. */
export default function WhatsAppAgentsPage() {
    redirect(`${VOICE_AGENTS_URL}?show=whatsapp`);
}
