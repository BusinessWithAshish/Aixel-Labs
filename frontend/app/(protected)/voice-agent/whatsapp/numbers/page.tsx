import { redirect } from 'next/navigation';
import { VOICE_PHONE_NUMBERS_URL } from '@/helpers/voice-routes';

/** WhatsApp numbers live on Numbers, next to their phone lines. */
export default function WhatsAppNumbersPage() {
    redirect(VOICE_PHONE_NUMBERS_URL);
}
