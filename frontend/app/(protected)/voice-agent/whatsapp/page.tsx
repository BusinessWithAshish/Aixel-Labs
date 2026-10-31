import { redirect } from 'next/navigation';
import { WHATSAPP_URL } from '@/helpers/voice-routes';

/** The sidebar's WhatsApp entry opens the inbox (its numbers and agents are on Numbers and Agents). */
export default function WhatsAppPage() {
    redirect(WHATSAPP_URL);
}
