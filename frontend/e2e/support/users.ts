export type E2eUser = {
    firebaseUid: string;
    email: string;
    name: string;
    isAdmin: boolean;
};

export const DEFAULT_USER_CREDITS = 50;

export const E2E_USER: E2eUser = {
    firebaseUid: 'e2e-user',
    email: 'user@e2e.aixellabs.test',
    name: 'E2E User',
    isAdmin: false,
};

export const E2E_ADMIN: E2eUser = {
    firebaseUid: 'e2e-admin',
    email: 'admin@e2e.aixellabs.test',
    name: 'E2E Admin',
    isAdmin: true,
};
