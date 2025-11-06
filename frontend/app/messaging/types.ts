export enum MessageType {
    OUTBOUND_API = 'outbound-api',
    OUTBOUND_REPLY = 'outbound-reply',
    INBOUND = 'inbound',
}

export type TTwilioMessage = {
    sid: string;
    from: string;
    to: string;
    body: string;
    dateCreated: string;
    direction: MessageType;
    isOptimistic?: boolean;
    status?: 'sending' | 'sent' | 'failed' | 'delivered' | 'read';
}

export enum ChatState {
    NEW = "new",
    ACTIVE = "active",
    EXPIRED = "expired",
}

export type TWhatsAppChat = {
    id: string;
    businessPhone?: string;
    customerPhone: string;
    messages: Array<TTwilioMessage & {
        isFromBusiness: boolean;
        isFromCustomer: boolean;
    }>;
    state?: ChatState;
};


export type TMessageTemplates = {
    sid: string,
    friendlyName: string,
    types: string,
    dateCreated: string,
}